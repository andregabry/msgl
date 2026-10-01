#!/usr/bin/env python3
"""Import canonical Google Groups Takeout messages into a staging Gmail mailbox.

The importer never reads group-member mailboxes. It reads RFC 5322 messages from
the published-history MBOX selected by the canonical manifest and inserts them
with Gmail's messages.insert API. A SQLite audit journal makes normal reruns
resumable and stops the run when the destination count cannot be reconciled.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
import random
import re
import sqlite3
import sys
import threading
import time
import zipfile
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from contextlib import contextmanager
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses, parseaddr
from pathlib import Path
from typing import BinaryIO, Iterator


INSERT_SCOPE = "https://www.googleapis.com/auth/gmail.insert"
READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
FULL_MAIL_SCOPE = "https://mail.google.com/"
TRACKED_STATUSES = ("seeded_existing", "verified", "verification_failed")
WORKER_LOCAL = threading.local()
IDENTITY_HEADERS = (
    ("from", "From"),
    ("to", "To"),
    ("cc", "Cc"),
    ("subject", "Subject"),
)
GOOGLE_WELCOME_SUBJECTS = {
    "obtenha a aplicação oficial do gmail",
    "sugestões para utilizar a sua nova caixa de entrada",
    "get the official gmail app",
    "tips for using your new inbox",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_message_id(value: str) -> str:
    value = (value or "").strip().lower()
    return "".join(value.split())


def header_text(message, name: str) -> str:
    return " ".join(str(item) for item in message.get_all(name, [])).strip()


def normalize_header_for_compare(value: str) -> str:
    return " ".join((value or "").split()).casefold()


def content_sha256(message) -> str:
    """Hash decoded bodies and attachments, matching the canonical analyzer."""
    digest = hashlib.sha256()
    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        if part.is_multipart():
            continue
        payload = part.get_payload(decode=True)
        if payload is None:
            payload = str(part.get_payload()).encode("utf-8", errors="surrogateescape")
        metadata = "\0".join(
            [
                part.get_content_type() or "",
                part.get_content_disposition() or "",
                part.get_filename() or "",
                str(len(payload)),
            ]
        ).encode("utf-8", errors="surrogateescape")
        digest.update(metadata)
        digest.update(b"\0")
        digest.update(payload)
        digest.update(b"\0")
    return digest.hexdigest()


def iter_mbox_messages(stream: BinaryIO) -> Iterator[tuple[int, bytes]]:
    current = io.BytesIO()
    seen_separator = False
    message_number = 0
    for line in stream:
        if line.startswith(b"From "):
            if seen_separator and current.tell() > 0:
                message_number += 1
                yield message_number, current.getvalue()
                current = io.BytesIO()
            seen_separator = True
            continue
        if seen_separator:
            current.write(line)
    if seen_separator and current.tell() > 0:
        message_number += 1
        yield message_number, current.getvalue()


@contextmanager
def open_mbox(source_archive: Path, mbox_path: str):
    if source_archive.suffix.lower() == ".mbox":
        if source_archive.name != Path(mbox_path).name:
            raise ValueError(f"MBOX path mismatch: {source_archive} != {mbox_path}")
        with source_archive.open("rb") as handle:
            yield handle
        return

    with zipfile.ZipFile(source_archive) as archive:
        with archive.open(mbox_path, "r") as handle:
            yield handle


def load_manifest(path: Path) -> list[dict]:
    required = {
        "dedup_key",
        "message_id",
        "date_utc",
        "raw_sha256",
        "content_sha256",
        "source_archive",
        "mbox_path",
        "mbox_message_number",
    }
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError(f"Canonical manifest is empty: {path}")
    missing = required - set(rows[0])
    if missing:
        raise ValueError(f"Canonical manifest is missing fields: {sorted(missing)}")
    seen: set[str] = set()
    for row in rows:
        key = row["dedup_key"]
        if not key or key in seen:
            raise ValueError(f"Duplicate or empty dedup_key in manifest: {key!r}")
        seen.add(key)
        row["mbox_message_number"] = int(row["mbox_message_number"])
        source = Path(row["source_archive"]).expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Source archive not found: {source}")
        row["source_archive"] = str(source)
    return rows


def connect_state(path: Path, destination_user: str, manifest_path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.executescript(
        """
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS imports (
            dedup_key TEXT PRIMARY KEY,
            manifest_raw_sha256 TEXT NOT NULL,
            manifest_content_sha256 TEXT NOT NULL,
            source_archive TEXT NOT NULL,
            mbox_path TEXT NOT NULL,
            mbox_message_number INTEGER NOT NULL,
            gmail_message_id TEXT NOT NULL UNIQUE,
            gmail_thread_id TEXT,
            gmail_internal_date TEXT,
            gmail_label_ids TEXT NOT NULL,
            status TEXT NOT NULL,
            imported_at_utc TEXT NOT NULL,
            verification_error TEXT
        );
        """
    )
    existing_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(imports)")
    }
    state_columns = {
        "source_message_id": "TEXT NOT NULL DEFAULT ''",
        "destination_message_id": "TEXT NOT NULL DEFAULT ''",
        "verification_warnings": "TEXT NOT NULL DEFAULT '[]'",
    }
    for column_name, declaration in state_columns.items():
        if column_name not in existing_columns:
            connection.execute(
                f"ALTER TABLE imports ADD COLUMN {column_name} {declaration}"
            )
    expected_destination = destination_user.lower()
    expected_manifest_hash = sha256_file(manifest_path)
    expected_manifest_path = str(manifest_path.resolve())
    existing_metadata = {
        row["key"]: row["value"]
        for row in connection.execute("SELECT key, value FROM metadata")
    }

    existing_destination = existing_metadata.get("destination_user")
    if existing_destination and existing_destination != expected_destination:
        raise ValueError(
            "State database destination_user mismatch: "
            f"{existing_destination!r} != {expected_destination!r}"
        )
    existing_manifest_hash = existing_metadata.get("manifest_sha256")
    if existing_manifest_hash and existing_manifest_hash != expected_manifest_hash:
        raise ValueError(
            "State database manifest_sha256 mismatch: "
            f"{existing_manifest_hash!r} != {expected_manifest_hash!r}"
        )

    expected = {
        "destination_user": expected_destination,
        "manifest_path": expected_manifest_path,
        "manifest_sha256": expected_manifest_hash,
    }
    for key, value in expected.items():
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
    connection.commit()
    return connection


def build_gmail(service_account_file: Path, user: str, scope: str):
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as error:
        raise RuntimeError(
            "Google API libraries are unavailable. Use the project's Python virtual environment."
        ) from error
    credentials = service_account.Credentials.from_service_account_file(
        str(service_account_file), scopes=[scope]
    ).with_subject(user)
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def get_worker_gmail_clients(service_account_file: Path, user: str):
    cache_key = (str(service_account_file), user.lower())
    if getattr(WORKER_LOCAL, "cache_key", None) != cache_key:
        WORKER_LOCAL.gmail_read = build_gmail(service_account_file, user, READ_SCOPE)
        WORKER_LOCAL.gmail_insert = build_gmail(service_account_file, user, INSERT_SCOPE)
        WORKER_LOCAL.cache_key = cache_key
    return WORKER_LOCAL.gmail_read, WORKER_LOCAL.gmail_insert


def decode_raw(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def encode_raw(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def normalize_duplicate_date_headers(raw: bytes) -> tuple[bytes, list[dict]]:
    """Keep the first Date header and preserve extra values under audit headers."""
    separator = next(
        (candidate for candidate in (b"\r\n\r\n", b"\n\n", b"\r\r") if candidate in raw),
        None,
    )
    if separator is None:
        return raw, []
    header_block, body = raw.split(separator, 1)
    lines = header_block.splitlines(keepends=True)
    date_count = 0
    normalized_lines = []
    for line in lines:
        if line[:1] not in (b" ", b"\t") and re.match(br"(?i)^date\s*:", line):
            date_count += 1
            if date_count > 1:
                colon = line.index(b":")
                line = b"X-Migration-Original-Date" + line[colon:]
        normalized_lines.append(line)
    if date_count <= 1:
        return raw, []
    normalized = b"".join(normalized_lines) + separator + body
    return normalized, [
        {
            "code": "duplicate_date_headers_normalized",
            "original_date_header_count": date_count,
            "preserved_primary_date": True,
        }
    ]


def retry_read(operation, attempts: int):
    from googleapiclient.errors import HttpError

    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except HttpError as error:
            status = getattr(error.resp, "status", None)
            if status not in {429, 500, 502, 503, 504} or attempt == attempts:
                raise
        except (ConnectionError, TimeoutError):
            if attempt == attempts:
                raise
        delay = min(60.0, (2 ** (attempt - 1)) + random.random())
        time.sleep(delay)
    raise RuntimeError("Unreachable retry state")


def get_gmail_raw(gmail_read, gmail_id: str, attempts: int) -> dict:
    return retry_read(
        lambda: gmail_read.users()
        .messages()
        .get(userId="me", id=gmail_id, format="raw")
        .execute(),
        attempts,
    )


def verify_destination_message(
    gmail_read, gmail_id: str, row: dict, required_label_id: str, attempts: int
) -> dict:
    result = get_gmail_raw(gmail_read, gmail_id, attempts)
    return verify_destination_result(result, row, required_label_id)


def verify_destination_result(
    result: dict,
    row: dict,
    required_label_id: str,
    check_internal_date: bool = True,
) -> dict:
    raw = decode_raw(result["raw"])
    message = BytesParser(policy=policy.default).parsebytes(raw)
    actual_message_id = normalize_message_id(header_text(message, "Message-ID"))
    expected_message_id = normalize_message_id(row["message_id"])
    actual_content_sha = content_sha256(message)
    if actual_content_sha != row["content_sha256"]:
        raise ValueError(
            f"Content hash mismatch for {row['dedup_key']}: "
            f"{actual_content_sha} != {row['content_sha256']}"
        )
    labels = sorted(result.get("labelIds", []))
    if required_label_id and required_label_id not in labels:
        raise ValueError(
            f"Required label {required_label_id!r} is absent from Gmail message {result['id']}"
        )
    for manifest_field, header_name in IDENTITY_HEADERS:
        expected_value = normalize_header_for_compare(row.get(manifest_field, ""))
        actual_value = normalize_header_for_compare(header_text(message, header_name))
        if actual_value != expected_value:
            raise ValueError(
                f"{header_name} mismatch for {row['dedup_key']}: "
                f"{actual_value!r} != {expected_value!r}"
            )
    if check_internal_date and row["date_utc"]:
        expected_ms = int(
            datetime.fromisoformat(row["date_utc"].replace("Z", "+00:00")).timestamp()
            * 1000
        )
        actual_ms = int(result["internalDate"])
        if abs(actual_ms - expected_ms) >= 1000:
            raise ValueError(
                f"Internal date mismatch for {row['dedup_key']}: {actual_ms} != {expected_ms}"
            )
    warnings = []
    if actual_message_id != expected_message_id:
        warnings.append(
            {
                "code": "message_id_rewritten",
                "source_message_id": expected_message_id,
                "destination_message_id": actual_message_id,
            }
        )
    return {
        "gmail_message_id": result["id"],
        "gmail_thread_id": result.get("threadId", ""),
        "gmail_internal_date": result.get("internalDate", ""),
        "gmail_label_ids": labels,
        "destination_message_id": actual_message_id,
        "verification_warnings": warnings,
    }


def record_import(
    connection: sqlite3.Connection,
    row: dict,
    result: dict,
    status: str,
    verification_error: str = "",
) -> None:
    connection.execute(
        """
        INSERT OR REPLACE INTO imports(
            dedup_key, manifest_raw_sha256, manifest_content_sha256,
            source_archive, mbox_path, mbox_message_number,
            gmail_message_id, gmail_thread_id, gmail_internal_date,
            gmail_label_ids, status, imported_at_utc, verification_error,
            source_message_id, destination_message_id, verification_warnings
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            row["dedup_key"],
            row["raw_sha256"],
            row["content_sha256"],
            row["source_archive"],
            row["mbox_path"],
            row["mbox_message_number"],
            result["gmail_message_id"],
            result.get("gmail_thread_id", ""),
            result.get("gmail_internal_date", ""),
            json.dumps(sorted(result.get("gmail_label_ids", []))),
            status,
            utc_now(),
            verification_error,
            normalize_message_id(row.get("message_id", "")),
            result.get("destination_message_id", ""),
            json.dumps(result.get("verification_warnings", []), sort_keys=True),
        ),
    )
    connection.commit()


def seed_existing_import(
    connection: sqlite3.Connection,
    manifest_rows: list[dict],
    gmail_read,
    audit_path: Path,
    destination_user: str,
    attempts: int,
) -> None:
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    if audit.get("destination_user", "").lower() != destination_user.lower():
        raise ValueError(f"Existing audit destination mismatch: {audit_path}")
    gmail_id = audit.get("destination_gmail_id", "")
    message_id = normalize_message_id(audit.get("message_id", ""))
    if not gmail_id or not message_id:
        raise ValueError(f"Existing audit is missing destination ID or Message-ID: {audit_path}")
    candidates = [
        row for row in manifest_rows if normalize_message_id(row["message_id"]) == message_id
    ]
    if not candidates:
        raise ValueError(f"Existing audit Message-ID is absent from canonical manifest: {message_id}")
    result = get_gmail_raw(gmail_read, gmail_id, attempts)
    raw = decode_raw(result["raw"])
    parsed = BytesParser(policy=policy.default).parsebytes(raw)
    destination_content_sha = content_sha256(parsed)
    matches = [row for row in candidates if row["content_sha256"] == destination_content_sha]
    if len(matches) != 1:
        raise ValueError(
            f"Existing Gmail message maps to {len(matches)} canonical rows; expected exactly one"
        )
    row = matches[0]
    existing = connection.execute(
        "SELECT * FROM imports WHERE dedup_key = ?", (row["dedup_key"],)
    ).fetchone()
    if existing:
        if existing["gmail_message_id"] != gmail_id:
            raise ValueError(f"Existing audit conflicts with state for {row['dedup_key']}")
        return
    record_import(
        connection,
        row,
        {
            "gmail_message_id": result["id"],
            "gmail_thread_id": result.get("threadId", ""),
            "gmail_internal_date": result.get("internalDate", ""),
            "gmail_label_ids": sorted(result.get("labelIds", [])),
            "destination_message_id": normalize_message_id(
                header_text(parsed, "Message-ID")
            ),
            "verification_warnings": [],
        },
        "seeded_existing",
    )


def list_gmail_message_ids(gmail_read, query: str, attempts: int) -> list[str]:
    message_ids: list[str] = []
    page_token = None
    while True:
        response = retry_read(
            lambda: gmail_read.users()
            .messages()
            .list(
                userId="me",
                q=query,
                includeSpamTrash=True,
                maxResults=500,
                pageToken=page_token,
            )
            .execute(),
            attempts,
        )
        message_ids.extend(item["id"] for item in response.get("messages", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            return message_ids


def is_google_welcome_message(message, destination_user: str) -> bool:
    sender = parseaddr(header_text(message, "From"))[1].casefold()
    recipients = {
        address.casefold()
        for _, address in getaddresses(message.get_all("To", []))
        if address
    }
    subject = normalize_header_for_compare(header_text(message, "Subject"))
    message_id = normalize_message_id(header_text(message, "Message-ID"))
    return (
        sender == "mail-noreply@google.com"
        and destination_user.casefold() in recipients
        and subject in GOOGLE_WELCOME_SUBJECTS
        and message_id.endswith("@mail.gmail.com>")
    )


def reconcile_destination_inventory(
    connection: sqlite3.Connection,
    manifest_rows: list[dict],
    gmail_read,
    destination_user: str,
    required_label_id: str,
    attempts: int,
) -> dict:
    rows_by_content: dict[str, list[dict]] = {}
    for row in manifest_rows:
        rows_by_content.setdefault(row["content_sha256"], []).append(row)

    inventory = []
    seeded_count = 0
    for gmail_id in list_gmail_message_ids(gmail_read, "", attempts):
        result = get_gmail_raw(gmail_read, gmail_id, attempts)
        raw = decode_raw(result["raw"])
        message = BytesParser(policy=policy.default).parsebytes(raw)
        digest = content_sha256(message)
        exact_matches = []
        for row in rows_by_content.get(digest, []):
            try:
                verify_destination_result(
                    result,
                    row,
                    required_label_id,
                    check_internal_date=False,
                )
            except ValueError:
                continue
            exact_matches.append(row)

        classification = "untracked"
        dedup_key = ""
        if len(exact_matches) == 1:
            row = exact_matches[0]
            existing = connection.execute(
                "SELECT gmail_message_id FROM imports WHERE dedup_key = ?",
                (row["dedup_key"],),
            ).fetchone()
            if existing and existing["gmail_message_id"] != gmail_id:
                classification = "duplicate_canonical"
            else:
                if not existing:
                    verification = verify_destination_result(
                        result,
                        row,
                        required_label_id,
                        check_internal_date=False,
                    )
                    record_import(connection, row, verification, "seeded_existing")
                    seeded_count += 1
                classification = "canonical"
                dedup_key = row["dedup_key"]
        elif is_google_welcome_message(message, destination_user):
            classification = "google_welcome"

        inventory.append(
            {
                "gmail_id": gmail_id,
                "classification": classification,
                "dedup_key": dedup_key,
                "message_id": normalize_message_id(header_text(message, "Message-ID")),
                "from": header_text(message, "From"),
                "to": header_text(message, "To"),
                "date": header_text(message, "Date"),
                "subject": header_text(message, "Subject"),
                "labels": sorted(result.get("labelIds", [])),
                "content_sha256": digest,
            }
        )

    return {
        "generated_at_utc": utc_now(),
        "destination_user": destination_user,
        "destination_messages": len(inventory),
        "canonical_messages": sum(item["classification"] == "canonical" for item in inventory),
        "seeded_existing": seeded_count,
        "google_welcome_messages": sum(item["classification"] == "google_welcome" for item in inventory),
        "unknown_messages": sum(item["classification"] in {"untracked", "duplicate_canonical"} for item in inventory),
        "messages": inventory,
    }


def write_inventory_report(path: Path, inventory: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def matching_destination_results(
    gmail_read, candidate_ids: list[str], row: dict, attempts: int
) -> list[dict]:
    matches = []
    for candidate_id in dict.fromkeys(candidate_ids):
        result = get_gmail_raw(gmail_read, candidate_id, attempts)
        try:
            verify_destination_result(result, row, "")
        except ValueError:
            continue
        matches.append(result)
    return matches


def reconcile_after_insert_error(gmail_read, row: dict, attempts: int) -> dict | None:
    message_id = normalize_message_id(row["message_id"])
    candidate_ids = []
    if message_id:
        candidate_ids.extend(
            list_gmail_message_ids(
                gmail_read, f"rfc822msgid:{message_id}", attempts
            )
        )
    matches = matching_destination_results(gmail_read, candidate_ids, row, attempts)

    # Gmail can replace syntactically invalid Message-ID values during insert.
    # If the request outcome was lost, search a narrow date window and accept a
    # recovery only after body, attachment, identity-header, and date checks pass.
    if not matches and row.get("date_utc"):
        expected_seconds = int(
            datetime.fromisoformat(
                row["date_utc"].replace("Z", "+00:00")
            ).timestamp()
        )
        date_query = (
            f"after:{expected_seconds - 86400} before:{expected_seconds + 86400}"
        )
        candidate_ids.extend(
            list_gmail_message_ids(gmail_read, date_query, attempts)
        )
        matches = matching_destination_results(
            gmail_read, candidate_ids, row, attempts
        )
    if len(matches) > 1:
        raise RuntimeError(
            f"Duplicate destination messages already exist for {row['dedup_key']}; stopping"
        )
    return matches[0] if matches else None


def insert_with_reconciliation(
    gmail_insert,
    gmail_read,
    raw: bytes,
    row: dict,
    label_id: str,
    attempts: int,
) -> dict:
    from googleapiclient.errors import HttpError

    body = {"raw": encode_raw(raw)}
    if label_id:
        body["labelIds"] = [label_id]
    for attempt in range(1, attempts + 1):
        try:
            return (
                gmail_insert.users()
                .messages()
                .insert(userId="me", internalDateSource="dateHeader", body=body)
                .execute()
            )
        except (HttpError, ConnectionError, TimeoutError):
            recovered = reconcile_after_insert_error(gmail_read, row, attempts)
            if recovered:
                return recovered
            if attempt == attempts:
                raise
            time.sleep(min(60.0, (2 ** (attempt - 1)) + random.random()))
    raise RuntimeError("Unreachable insert retry state")


def import_and_verify_one(
    state_path: Path,
    service_account_file: Path,
    destination_user: str,
    raw: bytes,
    row: dict,
    label_id: str,
    attempts: int,
    sleep_seconds: float,
) -> tuple[dict, dict]:
    """Insert, verify, and durably journal one message in a worker thread."""
    gmail_read, gmail_insert = get_worker_gmail_clients(
        service_account_file, destination_user
    )
    upload_raw, migration_warnings = normalize_duplicate_date_headers(raw)
    inserted = insert_with_reconciliation(
        gmail_insert, gmail_read, upload_raw, row, label_id, attempts
    )
    worker_connection = sqlite3.connect(state_path)
    try:
        try:
            verified = verify_destination_message(
                gmail_read, inserted["id"], row, label_id, attempts
            )
            verified["verification_warnings"].extend(migration_warnings)
            record_import(worker_connection, row, verified, "verified")
        except Exception as error:
            record_import(
                worker_connection,
                row,
                {
                    "gmail_message_id": inserted["id"],
                    "gmail_thread_id": inserted.get("threadId", ""),
                    "gmail_internal_date": inserted.get("internalDate", ""),
                    "gmail_label_ids": inserted.get("labelIds", []),
                },
                "verification_failed",
                str(error),
            )
            raise
    finally:
        worker_connection.close()
    if sleep_seconds:
        time.sleep(sleep_seconds)
    return row, inserted


def reverify_failed_imports(
    connection: sqlite3.Connection,
    manifest_rows: list[dict],
    gmail_read,
    required_label_id: str,
    attempts: int,
) -> int:
    manifest_by_key = {row["dedup_key"]: row for row in manifest_rows}
    failed_rows = connection.execute(
        "SELECT * FROM imports WHERE status = 'verification_failed' "
        "ORDER BY imported_at_utc"
    ).fetchall()
    repaired = 0
    for state_row in failed_rows:
        row = manifest_by_key.get(state_row["dedup_key"])
        if row is None:
            raise ValueError(
                f"Failed state row is absent from the manifest: {state_row['dedup_key']}"
            )
        if (
            state_row["manifest_raw_sha256"] != row["raw_sha256"]
            or state_row["manifest_content_sha256"] != row["content_sha256"]
        ):
            raise ValueError(
                f"Manifest hashes changed for failed row: {row['dedup_key']}"
            )
        verified = verify_destination_message(
            gmail_read,
            state_row["gmail_message_id"],
            row,
            required_label_id,
            attempts,
        )
        record_import(connection, row, verified, "verified")
        repaired += 1
        warnings = verified.get("verification_warnings", [])
        if warnings:
            print(
                f"Reverified with warning {row['dedup_key']}: "
                f"{json.dumps(warnings, sort_keys=True)}"
            )
        else:
            print(f"Reverified {row['dedup_key']}")
    return repaired


def read_source_message(row: dict) -> bytes:
    source_archive = Path(row["source_archive"])
    target_number = int(row["mbox_message_number"])
    with open_mbox(source_archive, row["mbox_path"]) as stream:
        for message_number, raw in iter_mbox_messages(stream):
            if message_number != target_number:
                continue
            actual_hash = hashlib.sha256(raw).hexdigest()
            if actual_hash != row["raw_sha256"]:
                raise ValueError(
                    f"Source hash mismatch for {row['dedup_key']}: "
                    f"{actual_hash} != {row['raw_sha256']}"
                )
            return raw
    raise ValueError(
        f"MBOX ended before source message {target_number} was found for {row['dedup_key']}"
    )


def write_repair_journal(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def gmail_message_exists(gmail, message_id: str, attempts: int) -> bool:
    from googleapiclient.errors import HttpError

    try:
        get_gmail_raw(gmail, message_id, attempts)
        return True
    except HttpError as error:
        if getattr(error.resp, "status", None) == 404:
            return False
        raise


def find_correctly_dated_destination(
    gmail, row: dict, attempts: int
) -> dict | None:
    message_id = normalize_message_id(row.get("message_id", ""))
    if not message_id:
        return None
    candidate_ids = list_gmail_message_ids(
        gmail, f"rfc822msgid:{message_id}", attempts
    )
    matches = matching_destination_results(gmail, candidate_ids, row, attempts)
    if len(matches) > 1:
        raise RuntimeError(
            f"Multiple correctly dated replacements exist for {row['dedup_key']}; stopping"
        )
    return matches[0] if matches else None


def repair_internal_date_failures(
    connection: sqlite3.Connection,
    manifest_rows: list[dict],
    gmail_full,
    state_path: Path,
    required_label_id: str,
    attempts: int,
) -> int:
    """Replace only known duplicate-Date failures, then delete the invalid copy."""
    manifest_by_key = {row["dedup_key"]: row for row in manifest_rows}
    failed_rows = connection.execute(
        "SELECT * FROM imports WHERE status = 'verification_failed' "
        "ORDER BY imported_at_utc"
    ).fetchall()
    repaired_count = 0
    for state_row in failed_rows:
        if not state_row["verification_error"].startswith("Internal date mismatch"):
            continue
        row = manifest_by_key.get(state_row["dedup_key"])
        if row is None:
            raise ValueError(
                f"Failed state row is absent from the manifest: {state_row['dedup_key']}"
            )
        raw = read_source_message(row)
        normalized_raw, migration_warnings = normalize_duplicate_date_headers(raw)
        if not migration_warnings:
            raise RuntimeError(
                f"Internal-date repair is not safe for {row['dedup_key']}: "
                "the source does not contain duplicate Date headers"
            )

        old_id = state_row["gmail_message_id"]
        old_exists = gmail_message_exists(gmail_full, old_id, attempts)
        if old_exists:
            old_result = get_gmail_raw(gmail_full, old_id, attempts)
            verify_destination_result(
                old_result, row, required_label_id, check_internal_date=False
            )

        replacement = find_correctly_dated_destination(gmail_full, row, attempts)
        if replacement is None:
            replacement = insert_with_reconciliation(
                gmail_full,
                gmail_full,
                normalized_raw,
                row,
                required_label_id,
                attempts,
            )
        verified = verify_destination_message(
            gmail_full, replacement["id"], row, required_label_id, attempts
        )
        verified["verification_warnings"].extend(migration_warnings)

        journal_name = hashlib.sha256(row["dedup_key"].encode("utf-8")).hexdigest()
        journal_path = state_path.parent / "repairs" / f"internal-date-{journal_name}.json"
        journal = {
            "SchemaVersion": 1,
            "UpdatedAtUtc": utc_now(),
            "Status": "REPLACEMENT_VERIFIED",
            "DedupKey": row["dedup_key"],
            "SourceRawSha256": row["raw_sha256"],
            "OldGmailMessageId": old_id,
            "ReplacementGmailMessageId": replacement["id"],
            "ExpectedInternalDate": row["date_utc"],
            "ReplacementInternalDate": verified["gmail_internal_date"],
            "Normalization": migration_warnings,
        }
        write_repair_journal(journal_path, journal)

        if old_id != replacement["id"] and gmail_message_exists(
            gmail_full, old_id, attempts
        ):
            gmail_full.users().messages().delete(
                userId="me", id=old_id
            ).execute()
        if old_id != replacement["id"] and gmail_message_exists(
            gmail_full, old_id, attempts
        ):
            raise RuntimeError(
                f"The invalid Gmail copy still exists after deletion: {old_id}"
            )

        record_import(connection, row, verified, "verified")
        journal["UpdatedAtUtc"] = utc_now()
        journal["Status"] = "COMPLETED"
        write_repair_journal(journal_path, journal)
        repaired_count += 1
        print(
            f"Repaired internal date {row['dedup_key']}: "
            f"{old_id} -> {replacement['id']}"
        )
    return repaired_count


def select_pending_rows(
    connection: sqlite3.Connection, manifest_rows: list[dict], limit: int | None
) -> list[dict]:
    tracked = {
        row["dedup_key"]
        for row in connection.execute(
            "SELECT dedup_key FROM imports WHERE status IN (?, ?, ?)", TRACKED_STATUSES
        )
    }
    pending = [row for row in manifest_rows if row["dedup_key"] not in tracked]
    pending.sort(
        key=lambda row: (
            row["source_archive"],
            row["mbox_path"],
            row["mbox_message_number"],
        )
    )
    return pending[:limit] if limit is not None else pending


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--destination-user", required=True)
    parser.add_argument("--service-account", required=True)
    parser.add_argument("--state-db", required=True)
    parser.add_argument("--existing-import-json", action="append", default=[])
    parser.add_argument("--dedup-key", action="append", default=[])
    parser.add_argument("--label-id", default="INBOX")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--max-retries", type=int, default=5)
    parser.add_argument("--sleep-seconds", type=float, default=0.15)
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--reverify-failed", action="store_true")
    parser.add_argument("--repair-internal-date-failures", action="store_true")
    parser.add_argument("--repair-only", action="store_true")
    parser.add_argument("--check-destination", action="store_true")
    parser.add_argument("--inventory-report")
    parser.add_argument("--remove-google-welcome-messages", action="store_true")
    parser.add_argument("--cleanup-only", action="store_true")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()

    if args.limit is not None and args.limit <= 0:
        parser.error("--limit must be positive")
    if args.limit is not None and args.dedup_key:
        parser.error("--limit and --dedup-key cannot be used together")
    if args.max_retries <= 0:
        parser.error("--max-retries must be positive")
    if not 1 <= args.workers <= 8:
        parser.error("--workers must be between 1 and 8")
    if args.repair_only and not args.repair_internal_date_failures:
        parser.error("--repair-only requires --repair-internal-date-failures")
    if args.repair_internal_date_failures and not args.execute:
        parser.error("--repair-internal-date-failures requires --execute")
    if args.remove_google_welcome_messages and not args.execute:
        parser.error("--remove-google-welcome-messages requires --execute")
    if args.cleanup_only and not args.remove_google_welcome_messages:
        parser.error("--cleanup-only requires --remove-google-welcome-messages")

    manifest_path = Path(args.manifest).expanduser().resolve()
    service_account_file = Path(args.service_account).expanduser().resolve()
    state_path = Path(args.state_db).expanduser().resolve()
    if not service_account_file.is_file():
        raise FileNotFoundError(f"Service account file not found: {service_account_file}")

    manifest_rows = load_manifest(manifest_path)
    connection = connect_state(
        state_path, args.destination_user.lower(), manifest_path
    )
    gmail_read = None
    gmail_full = None
    try:
        if (
            args.existing_import_json
            or args.execute
            or args.reverify_failed
            or args.check_destination
        ):
            gmail_read = build_gmail(
                service_account_file, args.destination_user, READ_SCOPE
            )
        if args.repair_internal_date_failures or args.remove_google_welcome_messages:
            gmail_full = build_gmail(
                service_account_file, args.destination_user, FULL_MAIL_SCOPE
            )
        for value in args.existing_import_json:
            seed_existing_import(
                connection,
                manifest_rows,
                gmail_read,
                Path(value).expanduser().resolve(),
                args.destination_user,
                args.max_retries,
            )

        if args.repair_internal_date_failures:
            repaired_dates = repair_internal_date_failures(
                connection,
                manifest_rows,
                gmail_full,
                state_path,
                args.label_id,
                args.max_retries,
            )
            print(f"Repaired internal dates: {repaired_dates}")

        if args.reverify_failed:
            repaired_count = reverify_failed_imports(
                connection,
                manifest_rows,
                gmail_read,
                args.label_id,
                args.max_retries,
            )
            print(f"Reverified failures : {repaired_count}")

        tracked_count = connection.execute(
            "SELECT COUNT(*) FROM imports WHERE status IN (?, ?, ?)", TRACKED_STATUSES
        ).fetchone()[0]
        failed_count = connection.execute(
            "SELECT COUNT(*) FROM imports WHERE status = 'verification_failed'"
        ).fetchone()[0]
        warning_count = connection.execute(
            "SELECT COUNT(*) FROM imports "
            "WHERE verification_warnings IS NOT NULL "
            "AND verification_warnings != '' AND verification_warnings != '[]'"
        ).fetchone()[0]
        if args.repair_only:
            pending_rows = []
        elif args.dedup_key:
            requested_keys = set(args.dedup_key)
            manifest_keys = {row["dedup_key"] for row in manifest_rows}
            missing_keys = requested_keys - manifest_keys
            if missing_keys:
                raise ValueError(
                    f"Requested dedup keys are absent from the manifest: {sorted(missing_keys)}"
                )
            pending_rows = [
                row
                for row in select_pending_rows(connection, manifest_rows, None)
                if row["dedup_key"] in requested_keys
            ]
        else:
            pending_rows = select_pending_rows(connection, manifest_rows, args.limit)
        print(f"Canonical messages : {len(manifest_rows)}")
        print(f"Tracked messages   : {tracked_count}")
        print(f"Verification failed: {failed_count}")
        print(f"Verified warnings  : {warning_count}")
        print(f"Selected this run  : {len(pending_rows)}")
        print(f"Mode               : {'EXECUTE' if args.execute else 'DRY-RUN'}")
        print(f"Destination        : {args.destination_user}")
        print(f"Label ID           : {args.label_id or '(none)'}")
        print(f"Workers            : {args.workers}")
        print(f"State database     : {state_path}")

        if args.check_destination or args.execute:
            profile = retry_read(
                lambda: gmail_read.users().getProfile(userId="me").execute(),
                args.max_retries,
            )
            destination_count = int(profile.get("messagesTotal", 0))
            print(f"Destination messages: {destination_count}")
            if destination_count != tracked_count:
                inventory = reconcile_destination_inventory(
                    connection,
                    manifest_rows,
                    gmail_read,
                    args.destination_user,
                    args.label_id,
                    args.max_retries,
                )
                report_path = (
                    Path(args.inventory_report).expanduser().resolve()
                    if args.inventory_report
                    else state_path.with_name("gmail-destination-inventory.json")
                )
                write_inventory_report(report_path, inventory)
                tracked_count = connection.execute(
                    "SELECT COUNT(*) FROM imports WHERE status IN (?, ?, ?)",
                    TRACKED_STATUSES,
                ).fetchone()[0]
                print(f"Reconciled tracked messages: {tracked_count}")
                print(f"Google welcome messages   : {inventory['google_welcome_messages']}")
                print(f"Unknown Gmail messages    : {inventory['unknown_messages']}")
                print(f"Destination inventory     : {report_path}")

                if args.remove_google_welcome_messages:
                    if inventory["unknown_messages"]:
                        raise RuntimeError(
                            "Cleanup blocked: Gmail contains unknown or duplicate messages. "
                            f"Review {report_path}; no message was deleted."
                        )
                    welcome_ids = [
                        item["gmail_id"]
                        for item in inventory["messages"]
                        if item["classification"] == "google_welcome"
                    ]
                    for gmail_id in welcome_ids:
                        retry_read(
                            lambda gmail_id=gmail_id: gmail_full.users()
                            .messages()
                            .delete(userId="me", id=gmail_id)
                            .execute(),
                            args.max_retries,
                        )
                    inventory["destination_messages_before_cleanup"] = inventory[
                        "destination_messages"
                    ]
                    inventory["google_welcome_messages_before_cleanup"] = len(
                        welcome_ids
                    )
                    inventory["removed_google_welcome_messages"] = len(welcome_ids)
                    inventory["removed_at_utc"] = utc_now()
                    profile = retry_read(
                        lambda: gmail_read.users().getProfile(userId="me").execute(),
                        args.max_retries,
                    )
                    destination_count = int(profile.get("messagesTotal", 0))
                    inventory["destination_messages"] = destination_count
                    inventory["google_welcome_messages"] = 0
                    inventory["messages"] = [
                        item
                        for item in inventory["messages"]
                        if item["classification"] != "google_welcome"
                    ]
                    write_inventory_report(report_path, inventory)
                    print(f"Removed Google welcome messages: {len(welcome_ids)}")
                    print(f"Destination messages after cleanup: {destination_count}")
                    if destination_count != tracked_count:
                        raise RuntimeError(
                            "Cleanup verification failed: destination count still differs "
                            "from the reconciled audit. No import was attempted."
                        )
                    if args.cleanup_only:
                        print("Cleanup-only mode completed; no backup message was inserted.")
                        return 0
                elif destination_count != tracked_count:
                    if not args.execute:
                        print(
                            "Destination requires review; no insert or deletion was attempted."
                        )
                        return 0
                    raise RuntimeError(
                        "Destination contains messages outside the canonical backup. "
                        f"Review {report_path}; no insert was attempted."
                    )

                pending_rows = select_pending_rows(connection, manifest_rows, args.limit)

        if args.execute and failed_count:
            raise RuntimeError(
                "The audit contains verification_failed rows. "
                "Run with --reverify-failed and review the result before inserting more messages."
            )

        if args.repair_only:
            print("Repair-only mode completed; no pending message was inserted.")
            return 0

        if not pending_rows:
            print("Nothing to import.")
            return 0

        selected_by_source: dict[tuple[str, str], dict[int, dict]] = {}
        for row in pending_rows:
            source_key = (row["source_archive"], row["mbox_path"])
            selected_by_source.setdefault(source_key, {})[
                row["mbox_message_number"]
            ] = row

        processed = 0
        pending_futures: set[Future] = set()
        first_worker_error: Exception | None = None

        def collect_completed() -> None:
            nonlocal processed, first_worker_error, pending_futures
            if not pending_futures:
                return
            done, not_done = wait(pending_futures, return_when=FIRST_COMPLETED)
            pending_futures = set(not_done)
            for future in done:
                try:
                    completed_row, inserted = future.result()
                    processed += 1
                    print(
                        f"[{processed}/{len(pending_rows)}] verified "
                        f"{completed_row['dedup_key']} -> {inserted['id']}"
                    )
                except Exception as error:
                    if first_worker_error is None:
                        first_worker_error = error

        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            for (archive_name, mbox_path), by_number in selected_by_source.items():
                source_archive = Path(archive_name)
                remaining = set(by_number)
                with open_mbox(source_archive, mbox_path) as stream:
                    for message_number, raw in iter_mbox_messages(stream):
                        if message_number not in remaining:
                            continue
                        row = by_number[message_number]
                        actual_raw_sha = hashlib.sha256(raw).hexdigest()
                        if actual_raw_sha != row["raw_sha256"]:
                            raise ValueError(
                                f"Source hash mismatch for {row['dedup_key']}: "
                                f"{actual_raw_sha} != {row['raw_sha256']}"
                            )
                        remaining.remove(message_number)
                        if not args.execute:
                            processed += 1
                            continue
                        if first_worker_error is not None:
                            break

                        pending_futures.add(
                            executor.submit(
                                import_and_verify_one,
                                state_path,
                                service_account_file,
                                args.destination_user,
                                raw,
                                row,
                                args.label_id,
                                args.max_retries,
                                args.sleep_seconds,
                            )
                        )
                        if len(pending_futures) >= args.workers * 2:
                            collect_completed()
                    if remaining and first_worker_error is None:
                        raise ValueError(
                            "MBOX ended before selected messages were found: "
                            f"{sorted(remaining)[:10]}"
                        )
                if first_worker_error is not None:
                    break

            while pending_futures:
                collect_completed()

        if first_worker_error is not None:
            raise first_worker_error

        print(f"Validated/imported this run: {processed}")
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
