#!/usr/bin/env python3
"""Inventory and reconcile a Google Groups Takeout export.

The script is deliberately read-only with respect to the Takeout inputs. It reads
MBOX files directly from ZIP archives (including multi-part Takeout exports),
creates SHA-256 inventories, and compares the canonical Google Groups messages
with an optional CSV manifest reconstructed from member mailboxes.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Iterable, Iterator


CSV_FIELDS = [
    "dedup_key",
    "message_id",
    "date",
    "date_utc",
    "from",
    "to",
    "cc",
    "subject",
    "list_id",
    "x_beenthere",
    "mailing_list",
    "raw_sha256",
    "content_sha256",
    "raw_bytes",
    "source_archive",
    "mbox_path",
    "mbox_message_number",
    "match_basis",
    "parse_defect_count",
]


@dataclass(frozen=True)
class MboxSource:
    source_archive: str
    mbox_path: str
    direct_path: Path | None = None
    zip_path: Path | None = None
    zip_member: str | None = None
    uncompressed_bytes: int | None = None


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_message_id(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    bracketed = re.search(r"<[^<>]+>", value)
    if bracketed:
        value = bracketed.group(0)
    return re.sub(r"\s+", "", value).lower()


def header_text(message, name: str) -> str:
    return " ".join(str(item) for item in message.get_all(name, [])).strip()


def parse_date_utc(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        return ""
    if parsed is None:
        return ""
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_cutoff(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("The cutoff must include a timezone, preferably Z/UTC.")
    return parsed.astimezone(timezone.utc)


def content_sha256(message) -> str:
    """Hash decoded bodies and attachments while ignoring transport headers."""
    digest = hashlib.sha256()
    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        if part.is_multipart():
            continue
        payload = part.get_payload(decode=True)
        if payload is None:
            payload_text = part.get_payload()
            payload = str(payload_text).encode("utf-8", errors="surrogateescape")
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


def iter_mbox_messages(stream: BinaryIO) -> Iterator[bytes]:
    """Yield RFC 5322 messages from an mbox stream without loading the file."""
    current = io.BytesIO()
    seen_separator = False

    for line in stream:
        if line.startswith(b"From "):
            if seen_separator and current.tell() > 0:
                yield current.getvalue()
                current = io.BytesIO()
            seen_separator = True
            continue
        if seen_separator:
            current.write(line)

    if seen_separator and current.tell() > 0:
        yield current.getvalue()


@contextmanager
def open_mbox(source: MboxSource):
    if source.direct_path is not None:
        with source.direct_path.open("rb") as handle:
            yield handle
        return

    if source.zip_path is None or source.zip_member is None:
        raise RuntimeError(f"Invalid MBOX source: {source}")

    with zipfile.ZipFile(source.zip_path) as archive:
        with archive.open(source.zip_member, "r") as handle:
            yield handle


def path_matches_group(mbox_path: str, group: str) -> bool:
    normalized_path = mbox_path.replace("\\", "/").lower()
    local, domain = group.lower().split("@", 1)
    stem = PurePosixPath(normalized_path).stem
    variants = {
        group.lower(),
        group.lower().replace("@", "_at_"),
        group.lower().replace("@", "."),
    }
    return any(value in normalized_path for value in variants) or stem == local


def is_pending_mbox(mbox_path: str) -> bool:
    """Return True for moderation queues, which are not published group history."""
    normalized_path = mbox_path.replace("\\", "/").lower()
    return "mensagens pendentes" in normalized_path or "pending messages" in normalized_path


def message_matches_group(message, group: str) -> tuple[bool, str]:
    group = group.lower()
    local, domain = group.split("@", 1)
    list_token = f"{local}.{domain}"

    strong_headers = ["List-Id", "X-BeenThere", "Mailing-List", "List-Post"]
    for name in strong_headers:
        value = header_text(message, name).lower()
        if group in value or list_token in value:
            return True, name.lower()

    address_headers = [
        "From",
        "Sender",
        "Reply-To",
        "To",
        "Cc",
        "Delivered-To",
        "X-Original-To",
    ]
    for name in address_headers:
        values = message.get_all(name, [])
        parsed_addresses = {address.lower() for _, address in getaddresses(values)}
        if group in parsed_addresses:
            return True, name.lower()

    return False, ""


def discover_sources(input_paths: list[Path]) -> tuple[list[dict], list[MboxSource]]:
    file_inventory: list[dict] = []
    mbox_sources: list[MboxSource] = []
    seen_files: set[Path] = set()

    candidates: list[Path] = []
    for input_path in input_paths:
        resolved = input_path.expanduser().resolve()
        if not resolved.exists():
            raise FileNotFoundError(f"Input not found: {resolved}")
        if resolved.is_dir():
            candidates.extend(path for path in resolved.rglob("*") if path.is_file())
        else:
            candidates.append(resolved)

    for path in sorted(candidates):
        path = path.resolve()
        if path in seen_files:
            continue
        seen_files.add(path)
        suffix = path.suffix.lower()
        if suffix not in {".zip", ".mbox"}:
            continue

        stat = path.stat()
        file_inventory.append(
            {
                "path": str(path),
                "bytes": stat.st_size,
                "sha256": sha256_file(path),
                "type": suffix.removeprefix("."),
            }
        )

        if suffix == ".mbox":
            mbox_sources.append(
                MboxSource(
                    source_archive=str(path),
                    mbox_path=path.name,
                    direct_path=path,
                    uncompressed_bytes=stat.st_size,
                )
            )
            continue

        if not zipfile.is_zipfile(path):
            raise ValueError(f"Invalid ZIP archive: {path}")
        with zipfile.ZipFile(path) as archive:
            bad_member = archive.testzip()
            if bad_member:
                raise ValueError(f"ZIP integrity test failed in {path}: {bad_member}")
            for info in archive.infolist():
                if not info.is_dir() and info.filename.lower().endswith(".mbox"):
                    mbox_sources.append(
                        MboxSource(
                            source_archive=str(path),
                            mbox_path=info.filename,
                            zip_path=path,
                            zip_member=info.filename,
                            uncompressed_bytes=info.file_size,
                        )
                    )

    if not file_inventory:
        raise ValueError("No .zip or .mbox files were found in the supplied inputs.")
    if not mbox_sources:
        raise ValueError("No MBOX files were found in the supplied Takeout inputs.")
    return file_inventory, mbox_sources


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_existing_manifest(path: Path) -> dict[str, dict]:
    existing: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            message_id = normalize_message_id(row.get("message_id", ""))
            dedup_key = (row.get("dedup_key") or "").strip().lower()
            if message_id:
                key = f"MID:{message_id}"
            elif dedup_key:
                key = dedup_key
            else:
                continue
            existing.setdefault(key, row)
    return existing


def reconcile(
    canonical: dict[str, dict], existing: dict[str, dict], cutoff: datetime | None
) -> tuple[list[dict], dict]:
    rows: list[dict] = []
    counts = {
        "canonical_unique": len(canonical),
        "existing_unique": len(existing),
        "common": 0,
        "canonical_missing_from_existing": 0,
        "existing_not_in_canonical": 0,
        "canonical_before_cutoff": 0,
        "canonical_on_or_after_cutoff": 0,
    }

    for key in sorted(set(canonical) | set(existing)):
        canonical_row = canonical.get(key)
        existing_row = existing.get(key)
        if canonical_row and existing_row:
            status = "COMMON"
            counts["common"] += 1
        elif canonical_row:
            status = "CANONICAL_MISSING_FROM_MEMBER_RECONSTRUCTION"
            counts["canonical_missing_from_existing"] += 1
        else:
            status = "MEMBER_RECONSTRUCTION_NOT_IN_CANONICAL"
            counts["existing_not_in_canonical"] += 1

        cutoff_bucket = ""
        if canonical_row and cutoff:
            date_utc = canonical_row.get("date_utc", "")
            if date_utc:
                parsed_date = datetime.fromisoformat(date_utc.replace("Z", "+00:00"))
                if parsed_date < cutoff:
                    cutoff_bucket = "BEFORE_CUTOFF"
                    counts["canonical_before_cutoff"] += 1
                else:
                    cutoff_bucket = "ON_OR_AFTER_CUTOFF"
                    counts["canonical_on_or_after_cutoff"] += 1
            else:
                cutoff_bucket = "DATE_UNPARSEABLE"

        rows.append(
            {
                "dedup_key": key,
                "status": status,
                "cutoff_bucket": cutoff_bucket,
                "canonical_date_utc": (canonical_row or {}).get("date_utc", ""),
                "canonical_from": (canonical_row or {}).get("from", ""),
                "canonical_to": (canonical_row or {}).get("to", ""),
                "canonical_subject": (canonical_row or {}).get("subject", ""),
                "canonical_raw_sha256": (canonical_row or {}).get("raw_sha256", ""),
                "canonical_content_sha256": (canonical_row or {}).get("content_sha256", ""),
                "existing_date": (existing_row or {}).get("date", ""),
                "existing_source_user": (existing_row or {}).get("source_user", ""),
                "existing_found_in": (existing_row or {}).get("found_in", ""),
                "existing_classification": (existing_row or {}).get("classification", ""),
            }
        )
    return rows, counts


def build_manifest(
    mbox_sources: list[MboxSource], group: str
) -> tuple[list[dict], dict[str, dict], list[dict], list[dict], dict]:
    path_matches = [source for source in mbox_sources if path_matches_group(source.mbox_path, group)]
    selected_sources = path_matches or mbox_sources
    filter_by_header = not bool(path_matches)

    occurrences: list[dict] = []
    canonical: dict[str, dict] = {}
    attachments: list[dict] = []
    raw_hashes_by_message_id: dict[str, set[str]] = {}
    content_hashes_by_message_id: dict[str, set[str]] = {}
    missing_message_id = 0
    parsed_messages = 0
    rejected_by_header = 0

    parser = BytesParser(policy=policy.default)
    for source in selected_sources:
        with open_mbox(source) as stream:
            for message_number, raw_message in enumerate(iter_mbox_messages(stream), start=1):
                parsed_messages += 1
                raw_sha = hashlib.sha256(raw_message).hexdigest()
                message = parser.parsebytes(raw_message)
                message_content_sha = content_sha256(message)

                if filter_by_header:
                    matched, match_basis = message_matches_group(message, group)
                    if not matched:
                        rejected_by_header += 1
                        continue
                else:
                    match_basis = "mbox-path"

                message_id_original = header_text(message, "Message-ID")
                message_id = normalize_message_id(message_id_original)
                if message_id:
                    message_id_key = f"MID:{message_id}"
                    raw_hashes_by_message_id.setdefault(message_id_key, set()).add(raw_sha)
                    content_hashes_by_message_id.setdefault(message_id_key, set()).add(
                        message_content_sha
                    )
                    if message_id_key not in canonical:
                        dedup_key = message_id_key
                    elif canonical[message_id_key]["content_sha256"] == message_content_sha:
                        dedup_key = message_id_key
                    else:
                        dedup_key = f"{message_id_key}|CONTENT:{message_content_sha}"
                else:
                    missing_message_id += 1
                    dedup_key = f"RAW:{raw_sha}"

                row = {
                    "dedup_key": dedup_key,
                    "message_id": message_id_original,
                    "date": header_text(message, "Date"),
                    "date_utc": parse_date_utc(header_text(message, "Date")),
                    "from": header_text(message, "From"),
                    "to": header_text(message, "To"),
                    "cc": header_text(message, "Cc"),
                    "subject": header_text(message, "Subject"),
                    "list_id": header_text(message, "List-Id"),
                    "x_beenthere": header_text(message, "X-BeenThere"),
                    "mailing_list": header_text(message, "Mailing-List"),
                    "raw_sha256": raw_sha,
                    "content_sha256": message_content_sha,
                    "raw_bytes": len(raw_message),
                    "source_archive": source.source_archive,
                    "mbox_path": source.mbox_path,
                    "mbox_message_number": message_number,
                    "match_basis": match_basis,
                    "parse_defect_count": len(message.defects),
                }
                occurrences.append(row)
                is_new_canonical_message = dedup_key not in canonical
                canonical.setdefault(dedup_key, row)

                if is_new_canonical_message:
                    part_number = 0
                    for part in message.walk() if message.is_multipart() else [message]:
                        if part.is_multipart():
                            continue
                        filename = part.get_filename() or ""
                        disposition = part.get_content_disposition() or ""
                        content_id = header_text(part, "Content-ID")
                        if not filename and disposition != "attachment" and not content_id:
                            continue
                        part_number += 1
                        payload = part.get_payload(decode=True)
                        if payload is None:
                            payload = str(part.get_payload()).encode(
                                "utf-8", errors="surrogateescape"
                            )
                        attachments.append(
                            {
                                "dedup_key": dedup_key,
                                "part_number": part_number,
                                "filename": filename,
                                "content_type": part.get_content_type() or "",
                                "content_disposition": disposition,
                                "content_id": content_id,
                                "bytes": len(payload),
                                "sha256": hashlib.sha256(payload).hexdigest(),
                            }
                        )

    conflicts = [
        {
            "message_id_key": key,
            "distinct_raw_sha256_count": len(raw_hashes),
            "distinct_content_sha256_count": len(content_hashes_by_message_id[key]),
        }
        for key, raw_hashes in raw_hashes_by_message_id.items()
        if len(raw_hashes) > 1
    ]
    stats = {
        "mbox_candidates": len(mbox_sources),
        "mbox_selected": len(selected_sources),
        "mbox_selection_mode": "path" if path_matches else "header",
        "parsed_messages_in_selected_mboxes": parsed_messages,
        "rejected_by_header_filter": rejected_by_header,
        "matching_occurrences": len(occurrences),
        "canonical_unique_messages": len(canonical),
        "duplicate_occurrences": len(occurrences) - len(canonical),
        "messages_without_message_id": missing_message_id,
        "message_id_raw_hash_conflicts": len(conflicts),
        "message_id_content_hash_conflicts": sum(
            1 for row in conflicts if int(row["distinct_content_sha256_count"]) > 1
        ),
        "messages_with_parse_defects": sum(
            1 for row in canonical.values() if int(row["parse_defect_count"]) > 0
        ),
        "messages_with_attachments_or_inline_content": len(
            {row["dedup_key"] for row in attachments}
        ),
        "attachment_or_inline_part_count": len(attachments),
        "attachment_or_inline_bytes": sum(int(row["bytes"]) for row in attachments),
        "maximum_raw_message_bytes": max(
            (int(row["raw_bytes"]) for row in canonical.values()), default=0
        ),
        "messages_above_150_mib": sum(
            1 for row in canonical.values() if int(row["raw_bytes"]) > 150 * 1024 * 1024
        ),
        "messages_with_unparseable_date": sum(
            1 for row in canonical.values() if not row["date_utc"]
        ),
    }
    return occurrences, canonical, conflicts, attachments, stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", action="append", required=True, help="Takeout ZIP, MBOX, or directory")
    parser.add_argument("--group", required=True, help="Google Group primary email address")
    parser.add_argument("--output-dir", required=True, help="Directory for generated reports")
    parser.add_argument("--existing-manifest", help="Optional member-mailbox CSV manifest")
    parser.add_argument("--cutoff", help="Optional ISO 8601 cutoff, for example 2026-08-25T00:00:00Z")
    parser.add_argument(
        "--include-pending-messages",
        action="store_true",
        help="Include moderation-queue MBOX files. Excluded by default.",
    )
    args = parser.parse_args()

    group = args.group.strip().lower()
    if group.count("@") != 1:
        parser.error("--group must be an email address")

    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    cutoff = parse_cutoff(args.cutoff)

    file_inventory, mbox_sources = discover_sources([Path(value) for value in args.input])
    pending_sources = [source for source in mbox_sources if is_pending_mbox(source.mbox_path)]
    manifest_sources = (
        mbox_sources
        if args.include_pending_messages
        else [source for source in mbox_sources if not is_pending_mbox(source.mbox_path)]
    )
    if not manifest_sources:
        raise ValueError("No published-history MBOX files remain after excluding pending messages.")
    occurrences, canonical, conflicts, attachments, takeout_stats = build_manifest(manifest_sources, group)
    takeout_stats["pending_mboxes_found"] = len(pending_sources)
    takeout_stats["pending_mboxes_included"] = (
        len(pending_sources) if args.include_pending_messages else 0
    )
    if not canonical:
        raise ValueError(f"No messages matching {group} were found in the Takeout inputs.")

    canonical_rows = list(canonical.values())
    write_csv(output_dir / "takeout-files.csv", ["path", "bytes", "sha256", "type"], file_inventory)
    write_csv(
        output_dir / "takeout-mboxes.csv",
        [
            "source_archive",
            "mbox_path",
            "uncompressed_bytes",
            "path_matches_group",
            "pending_messages",
            "included_in_manifest",
        ],
        [
            {
                "source_archive": source.source_archive,
                "mbox_path": source.mbox_path,
                "uncompressed_bytes": source.uncompressed_bytes,
                "path_matches_group": path_matches_group(source.mbox_path, group),
                "pending_messages": is_pending_mbox(source.mbox_path),
                "included_in_manifest": source in manifest_sources,
            }
            for source in mbox_sources
        ],
    )
    write_csv(output_dir / "takeout-message-occurrences.csv", CSV_FIELDS, occurrences)
    write_csv(output_dir / "takeout-canonical-manifest.csv", CSV_FIELDS, canonical_rows)
    write_csv(
        output_dir / "takeout-message-id-conflicts.csv",
        [
            "message_id_key",
            "distinct_raw_sha256_count",
            "distinct_content_sha256_count",
        ],
        conflicts,
    )
    conflict_keys = {row["message_id_key"] for row in conflicts}
    conflict_details = []
    for occurrence in occurrences:
        message_id = normalize_message_id(occurrence.get("message_id", ""))
        message_id_key = f"MID:{message_id}" if message_id else ""
        if message_id_key in conflict_keys:
            conflict_details.append(
                {
                    "message_id_key": message_id_key,
                    **occurrence,
                }
            )
    write_csv(
        output_dir / "takeout-message-id-conflict-details.csv",
        ["message_id_key", *CSV_FIELDS],
        conflict_details,
    )
    write_csv(
        output_dir / "takeout-parse-defects.csv",
        CSV_FIELDS,
        [row for row in canonical_rows if int(row["parse_defect_count"]) > 0],
    )
    write_csv(
        output_dir / "takeout-attachments.csv",
        [
            "dedup_key",
            "part_number",
            "filename",
            "content_type",
            "content_disposition",
            "content_id",
            "bytes",
            "sha256",
        ],
        attachments,
    )

    dates = sorted(row["date_utc"] for row in canonical_rows if row["date_utc"])
    summary = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "group": group,
        "cutoff_utc": cutoff.isoformat().replace("+00:00", "Z") if cutoff else None,
        "input_files": file_inventory,
        "takeout": takeout_stats,
        "earliest_message_utc": dates[0] if dates else None,
        "latest_message_utc": dates[-1] if dates else None,
    }
    if cutoff:
        summary["canonical_cutoff"] = {
            "before": sum(
                1
                for row in canonical_rows
                if row["date_utc"]
                and datetime.fromisoformat(row["date_utc"].replace("Z", "+00:00")) < cutoff
            ),
            "on_or_after": sum(
                1
                for row in canonical_rows
                if row["date_utc"]
                and datetime.fromisoformat(row["date_utc"].replace("Z", "+00:00")) >= cutoff
            ),
            "unparseable_date": sum(1 for row in canonical_rows if not row["date_utc"]),
        }

    if args.existing_manifest:
        existing_path = Path(args.existing_manifest).expanduser().resolve()
        if not existing_path.is_file():
            raise FileNotFoundError(f"Existing manifest not found: {existing_path}")
        existing = load_existing_manifest(existing_path)
        reconciliation_rows, reconciliation_counts = reconcile(canonical, existing, cutoff)
        write_csv(
            output_dir / "takeout-reconciliation.csv",
            [
                "dedup_key",
                "status",
                "cutoff_bucket",
                "canonical_date_utc",
                "canonical_from",
                "canonical_to",
                "canonical_subject",
                "canonical_raw_sha256",
                "canonical_content_sha256",
                "existing_date",
                "existing_source_user",
                "existing_found_in",
                "existing_classification",
            ],
            reconciliation_rows,
        )
        summary["existing_manifest"] = str(existing_path)
        summary["reconciliation"] = reconciliation_counts

    summary_path = output_dir / "takeout-summary.json"
    with summary_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nReports: {output_dir}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
