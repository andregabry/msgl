#!/usr/bin/env python3
"""Local-only web interface for the Google Groups migration system."""

from __future__ import annotations

import argparse
import csv
import ctypes
import hashlib
import json
import mimetypes
import os
import re
import secrets
import shutil
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from collections import deque
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote, parse_qs


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def to_short_path(path_obj: Path | str) -> str:
    p_str = str(path_obj)
    if sys.platform == "win32" and os.path.exists(p_str):
        try:
            buf = ctypes.create_unicode_buffer(500)
            if ctypes.windll.kernel32.GetShortPathNameW(p_str, buf, 500):
                return buf.value
        except Exception:
            pass
    return p_str


def script_path(filename: str) -> str:
    return to_short_path(PROJECT_ROOT / "scripts" / filename)



# ─── SQLite central database ─────────────────────────────────────────────────

def _db_path(config: dict) -> Path:
    workspace = Path(config.get("WorkspaceRoot", "")).expanduser().resolve()
    return workspace / "migration.sqlite3"


def open_db(config: dict) -> sqlite3.Connection:
    conn = sqlite3.connect(str(_db_path(config)), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(config: dict) -> None:
    """Create tables and migrate existing JSON/log files into the database."""
    conn = open_db(config)
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS job_receipts (
                id TEXT PRIMARY KEY,
                group_email TEXT NOT NULL,
                action TEXT NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                started_at TEXT DEFAULT '',
                finished_at TEXT DEFAULT '',
                duration_seconds REAL DEFAULT 0,
                exit_code INTEGER,
                error TEXT DEFAULT '',
                error_code TEXT DEFAULT '',
                log_path TEXT DEFAULT '',
                log_sha256 TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_receipts_group ON job_receipts(group_email);
            CREATE INDEX IF NOT EXISTS idx_receipts_created ON job_receipts(created_at DESC);

            CREATE TABLE IF NOT EXISTS job_logs (
                job_id TEXT PRIMARY KEY REFERENCES job_receipts(id),
                content TEXT NOT NULL,
                stored_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS group_runtime_v2 (
                group_email TEXT NOT NULL,
                service TEXT NOT NULL,
                checked_at TEXT NOT NULL,
                data_json TEXT NOT NULL,
                PRIMARY KEY (group_email, service)
            );

            CREATE TABLE IF NOT EXISTS db_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS m365_mailboxes (
                primary_smtp TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                recipient_type TEXT NOT NULL,
                user_principal_name TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS group_target_mappings (
                group_email TEXT PRIMARY KEY,
                target_mailbox TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
    _migrate_existing_files(config, conn)
    conn.close()



def db_get_m365_mailboxes(config: dict) -> list[dict]:
    try:
        conn = open_db(config)
        rows = conn.execute(
            "SELECT primary_smtp, display_name, recipient_type, user_principal_name, updated_at "
            "FROM m365_mailboxes ORDER BY display_name COLLATE NOCASE ASC"
        ).fetchall()
        conn.close()
        return [
            {
                "primary_smtp": r[0],
                "display_name": r[1],
                "recipient_type": r[2],
                "user_principal_name": r[3],
                "updated_at": r[4],
            }
            for r in rows
        ]
    except Exception:
        return []


def db_upsert_m365_mailboxes(config: dict, mailboxes: list[dict]) -> int:
    now = utc_now()
    count = 0
    try:
        conn = open_db(config)
        with conn:
            for m in mailboxes:
                smtp = (m.get("PrimarySmtpAddress") or m.get("primary_smtp") or "").strip().lower()
                if not smtp:
                    continue
                name = (m.get("DisplayName") or m.get("display_name") or smtp).strip()
                rtype = (m.get("RecipientType") or m.get("recipient_type") or "").strip()
                upn = (m.get("UserPrincipalName") or m.get("user_principal_name") or smtp).strip().lower()
                conn.execute(
                    """
                    INSERT INTO m365_mailboxes (primary_smtp, display_name, recipient_type, user_principal_name, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(primary_smtp) DO UPDATE SET
                        display_name=excluded.display_name,
                        recipient_type=excluded.recipient_type,
                        user_principal_name=excluded.user_principal_name,
                        updated_at=excluded.updated_at
                    """,
                    (smtp, name, rtype, upn, now),
                )
                count += 1
        conn.close()
    except Exception:
        pass
    return count


def db_get_group_target_mailbox(config: dict, group_email: str) -> str | None:
    try:
        conn = open_db(config)
        row = conn.execute(
            "SELECT target_mailbox FROM group_target_mappings WHERE group_email=?",
            (group_email.strip().lower(),),
        ).fetchone()
        conn.close()
        if row and row[0]:
            return row[0].strip().lower()
    except Exception:
        pass
    return None


def db_set_group_target_mailbox(config: dict, group_email: str, target_mailbox: str) -> None:
    now = utc_now()
    email = group_email.strip().lower()
    target = target_mailbox.strip().lower()
    conn = open_db(config)
    with conn:
        conn.execute(
            """
            INSERT INTO group_target_mappings (group_email, target_mailbox, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(group_email) DO UPDATE SET
                target_mailbox=excluded.target_mailbox,
                updated_at=excluded.updated_at
            """,
            (email, target, now),
        )
    conn.close()


def get_or_create_session_token(config: dict) -> str:
    try:
        conn = open_db(config)
        row = conn.execute("SELECT value FROM db_meta WHERE key='session_token'").fetchone()
        if row and row[0]:
            token = row[0]
        else:
            token = secrets.token_urlsafe(32)
            conn.execute("INSERT OR REPLACE INTO db_meta (key, value) VALUES ('session_token', ?)", (token,))
            conn.commit()
        conn.close()
        return token
    except Exception:
        return secrets.token_urlsafe(32)

def update_group_preparation_target_mailbox(config: dict, group_email: str, new_target: str) -> bool:
    workspace = Path(config["WorkspaceRoot"]).expanduser().resolve()
    record_path = workspace / "groups" / safe_group_name(group_email) / "preparation.json"
    if record_path.is_file():
        try:
            data = json.loads(record_path.read_text(encoding="utf-8-sig"))
            data["TargetSharedMailbox"] = new_target.strip().lower()
            data["UpdatedAtUtc"] = utc_now()
            record_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            return True
        except Exception:
            pass
    return False

def _migrate_existing_files(config: dict, conn: sqlite3.Connection) -> None:
    """One-time migration of existing JSON receipts and log files into the DB."""
    already = conn.execute("SELECT value FROM db_meta WHERE key='migrated_v1'").fetchone()
    if already:
        return
    workspace = Path(config.get("WorkspaceRoot", "")).expanduser().resolve()
    inserted = 0
    # Migrate group job receipts
    groups_dir = workspace / "groups"
    if groups_dir.is_dir():
        for group_dir in groups_dir.iterdir():
            jobs_dir = group_dir / "jobs"
            if not jobs_dir.is_dir():
                continue
            for jfile in jobs_dir.glob("*.json"):
                try:
                    receipt = json.loads(jfile.read_text(encoding="utf-8-sig"))
                except (OSError, ValueError):
                    continue
                job_id = receipt.get("id", "")
                if not job_id:
                    continue
                try:
                    started = datetime.fromisoformat(receipt.get("started_at", "").replace("Z", "+00:00"))
                    finished = datetime.fromisoformat(receipt.get("finished_at", "").replace("Z", "+00:00"))
                    dur = round((finished - started).total_seconds(), 3)
                except (AttributeError, TypeError, ValueError):
                    dur = receipt.get("duration_seconds", 0)
                try:
                    conn.execute(
                        "INSERT OR IGNORE INTO job_receipts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (
                            job_id,
                            receipt.get("group", ""),
                            receipt.get("action", ""),
                            receipt.get("title", receipt.get("action", "")),
                            receipt.get("status", ""),
                            receipt.get("created_at", ""),
                            receipt.get("started_at", ""),
                            receipt.get("finished_at", ""),
                            dur,
                            receipt.get("exit_code"),
                            receipt.get("error", ""),
                            receipt.get("error_code", ""),
                            receipt.get("log_path", ""),
                            receipt.get("log_sha256", ""),
                        ),
                    )
                    # Ingest log file content
                    log_path = receipt.get("log_path", "")
                    if log_path:
                        lp = Path(log_path)
                        if lp.is_file():
                            try:
                                log_content = lp.read_text(encoding="utf-8-sig", errors="replace")
                                conn.execute(
                                    "INSERT OR IGNORE INTO job_logs VALUES (?,?,?)",
                                    (job_id, log_content, receipt.get("finished_at", "")),
                                )
                            except OSError:
                                pass
                    inserted += 1
                except sqlite3.Error:
                    pass
    # Migrate global jobs
    global_dir = workspace / "global-jobs"
    if global_dir.is_dir():
        for jfile in global_dir.glob("*.json"):
            try:
                receipt = json.loads(jfile.read_text(encoding="utf-8-sig"))
            except (OSError, ValueError):
                continue
            job_id = receipt.get("id", "")
            if not job_id:
                continue
            try:
                started = datetime.fromisoformat(receipt.get("started_at", "").replace("Z", "+00:00"))
                finished = datetime.fromisoformat(receipt.get("finished_at", "").replace("Z", "+00:00"))
                dur = round((finished - started).total_seconds(), 3)
            except (AttributeError, TypeError, ValueError):
                dur = receipt.get("duration_seconds", 0)
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO job_receipts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        job_id,
                        receipt.get("group", ""),
                        receipt.get("action", ""),
                        receipt.get("title", receipt.get("action", "")),
                        receipt.get("status", ""),
                        receipt.get("created_at", ""),
                        receipt.get("started_at", ""),
                        receipt.get("finished_at", ""),
                        dur,
                        receipt.get("exit_code"),
                        receipt.get("error", ""),
                        receipt.get("error_code", ""),
                        receipt.get("log_path", ""),
                        receipt.get("log_sha256", ""),
                    ),
                )
                log_path = receipt.get("log_path", "")
                if log_path:
                    lp = Path(log_path)
                    if lp.is_file():
                        try:
                            log_content = lp.read_text(encoding="utf-8-sig", errors="replace")
                            conn.execute(
                                "INSERT OR IGNORE INTO job_logs VALUES (?,?,?)",
                                (job_id, log_content, receipt.get("finished_at", "")),
                            )
                        except OSError:
                            pass
                inserted += 1
            except sqlite3.Error:
                pass
    conn.execute("INSERT OR REPLACE INTO db_meta VALUES ('migrated_v1', ?)", (str(inserted),))
    conn.commit()


def db_upsert_receipt(config: dict, receipt: dict, log_content: str = "") -> None:
    """Write/update a job receipt and optionally its log into the database."""
    try:
        conn = open_db(config)
        with conn:
            conn.execute(
                """INSERT OR REPLACE INTO job_receipts
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    receipt["id"],
                    receipt.get("group", ""),
                    receipt.get("action", ""),
                    receipt.get("title", ""),
                    receipt.get("status", ""),
                    receipt.get("created_at", ""),
                    receipt.get("started_at", ""),
                    receipt.get("finished_at", ""),
                    receipt.get("duration_seconds", 0),
                    receipt.get("exit_code"),
                    receipt.get("error", ""),
                    receipt.get("error_code", ""),
                    receipt.get("log_path", ""),
                    receipt.get("log_sha256", ""),
                ),
            )
            if log_content:
                conn.execute(
                    "INSERT OR REPLACE INTO job_logs VALUES (?,?,?)",
                    (receipt["id"], log_content, receipt.get("finished_at", "")),
                )
        conn.close()
    except Exception:
        pass  # Never let DB errors break the main flow


def db_read_job_log(config: dict, job_id: str) -> str | None:
    """Return the log content for a job_id, or None if not found."""
    try:
        conn = open_db(config)
        row = conn.execute(
            "SELECT content FROM job_logs WHERE job_id=?", (job_id,)
        ).fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


def db_read_receipts_for_group(config: dict, group_email: str, limit: int = 50) -> list[dict]:
    """Return job receipts from DB for a group, newest first."""
    try:
        conn = open_db(config)
        rows = conn.execute(
            """SELECT id, group_email, action, title, status, created_at,
                      started_at, finished_at, duration_seconds, exit_code,
                      error, error_code, log_path, log_sha256
               FROM job_receipts
               WHERE group_email=?
               ORDER BY created_at DESC
               LIMIT ?""",
            (group_email, limit),
        ).fetchall()
        conn.close()
        cols = ["id", "group_email", "action", "title", "status", "created_at",
                "started_at", "finished_at", "duration_seconds", "exit_code",
                "error", "error_code", "log_path", "log_sha256"]
        return [dict(zip(cols, r)) for r in rows]
    except Exception:
        return []


def db_upsert_runtime(config: dict, group_email: str, service: str, data: dict) -> None:
    """Write/update group runtime state into the database."""
    try:
        conn = open_db(config)
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO group_runtime_v2 VALUES (?,?,?,?)",
                (group_email, service, data.get("CheckedAtUtc", ""), json.dumps(data, ensure_ascii=False)),
            )
        conn.close()
    except Exception:
        pass


def db_read_runtime(config: dict, group_email: str, service: str) -> dict:
    """Read group runtime state from the database."""
    try:
        conn = open_db(config)
        row = conn.execute(
            "SELECT data_json FROM group_runtime_v2 WHERE group_email=? AND service=?",
            (group_email, service),
        ).fetchone()
        conn.close()
        return json.loads(row[0]) if row else {}
    except Exception:
        return {}

STATIC_ROOT = Path(__file__).resolve().parent / "static"
CONFIG_PATH = Path(
    os.environ.get(
        "MIGRATION_CONFIG_PATH",
        str(PROJECT_ROOT / "config" / "google-groups-system.local.psd1"),
    )
).expanduser().resolve()
EMAIL_PATTERN = re.compile(
    r"^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$"
)
ANSI_ESCAPE_PATTERN = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_config(path: Path = CONFIG_PATH) -> dict:
    """Read the simple string-valued PSD1 used by this project."""
    values = {}
    if path.is_file():
        pattern = re.compile(r"^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*'((?:[^']|'')*)'")
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            match = pattern.match(line)
            if match:
                values[match.group(1)] = match.group(2).replace("''", "'")
    default_documents = Path.home() / "Documents" / "M365"
    values.setdefault("WorkspaceRoot", str(default_documents / "Google Groups" / "_migration-system"))
    values.setdefault("GoogleDomain", "enging.pt")
    values.setdefault("M365TargetDomain", "dynamox.net")
    values.setdefault("GoogleAdmin", "andre.gabry@enging.pt")
    values.setdefault("ExchangeAdmin", "andre.gabry@dynamox.net")
    values.setdefault("ServiceAccountFile", str(default_documents / "service-account.json"))
    values.setdefault("PythonPath", sys.executable)
    values.setdefault("GoogleTakeoutBucketRoot", "")
    values.setdefault("GoogleGroupsBackupRoot", str(default_documents / "Google Groups"))
    for key in ("WorkspaceRoot", "ServiceAccountFile", "PythonPath", "MboxToPstPath", "GoogleGroupsBackupRoot"):
        if key in values and values[key]:
            values[key] = os.path.expandvars(os.path.expanduser(values[key]))
    values["_ConfigPath"] = to_short_path(path)
    return values


def read_csv(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def int_value(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_group_name(group_email: str) -> str:
    return re.sub(r"[^a-z0-9._-]", "_", group_email.lower())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                return digest.hexdigest()
            digest.update(chunk)


def classify_job_failure(action: str, lines: list[str], exit_code: int | None) -> tuple[str, str]:
    """Turn expected command failures into stable UI recovery states."""
    output = "\n".join(lines)
    if re.search(
        r"sessão do Google Cloud expirou|reauthentication failed|refreshing your current auth tokens|gcloud auth login|invalid_grant|invalid_credentials|401 Unauthorized|403 Forbidden.*(?:permission|credentials)|Your credentials have expired",
        output,
        re.IGNORECASE,
    ):
        return (
            "GOOGLE_AUTH_EXPIRED",
            "A sessão do Google Cloud expirou ou não possui permissão ativa. Clique em 'Autenticar Google' para renovar e repita a operação.",
        )
    if re.search(
        r"Connect-ExchangeOnline|AADSTS|The refresh token has expired|device authentication required|Continuous access evaluation|InteractionRequired|A window handle must be configured|Falha na autenticação do Exchange|Conecte-se primeiro com Connect-ExchangeOnline",
        output,
        re.IGNORECASE,
    ):
        return (
            "M365_AUTH_EXPIRED",
            "A sessão do Microsoft 365 expirou ou exige autenticação. Clique em 'Autenticar Microsoft 365' para renovar a sessão e continuar.",
        )
    if action == "gcloud_login":
        return (
            "GOOGLE_AUTH_FAILED",
            "A autenticação Google não foi concluída. Feche logins antigos no navegador e tente novamente.",
        )
    if action == "m365_login":
        return (
            "M365_AUTH_FAILED",
            "A autenticação Microsoft 365 não foi concluída. Confirme a conta administrativa e tente novamente.",
        )

    # Check for target mailbox issues (e.g. distribution groups, not found, or isolation mismatch):
    if re.search(
        r"MailUniversalDistributionGroup|existe no Exchange Online, mas é do tipo|não foi encontrada no Exchange Online|não possui o endereço selecionado|Caixa de destino M365 inválida|Isolamento bloqueou a operação: .* foi preparado para",
        output,
        re.IGNORECASE,
    ):
        target_err = ""
        for line in reversed(lines):
            clean_l = line.strip()
            if "Erro na execução:" in clean_l:
                target_err = clean_l.split("Erro na execução:", 1)[1].strip()
                break
            if any(term in clean_l for term in ("MailUniversalDistributionGroup", "não foi encontrada no Exchange Online", "não possui o endereço selecionado", "mas é do tipo")):
                target_err = clean_l
                break
        if not target_err:
            target_err = "O endereço de destino no Microsoft 365 precisa ser alterado. Escolha uma caixa de correio válida na lista de contas do M365."
        return ("TARGET_MAILBOX_INVALID", target_err)

    error_msg = f"O comando terminou com código {exit_code}."
    for idx, line in enumerate(lines):
        clean_l = line.strip()
        if "Exception:" in clean_l or "Write-Error:" in clean_l or clean_l.startswith("ERRO INTERNO:") or "Erro na execução:" in clean_l:
            if "Erro na execução:" in clean_l:
                error_msg = clean_l.split("Erro na execução:", 1)[1].strip()
            else:
                error_msg = clean_l
            for ahead in lines[idx+1:idx+15]:
                if " | " in ahead and "~" not in ahead:
                    candidate = ahead.split(" | ", 1)[-1].strip()
                    if candidate and not candidate.startswith("throw "):
                        error_msg = candidate
            break

    return ("COMMAND_FAILED", error_msg)


_DEP_STATUS_CACHE = {"timestamp": 0.0, "data": None}

def invalidate_dependency_cache():
    global _DEP_STATUS_CACHE
    _DEP_STATUS_CACHE["timestamp"] = 0.0
    _DEP_STATUS_CACHE["data"] = None

def get_cached_dependency_status(config: dict, max_age: float = 30.0) -> dict:
    global _DEP_STATUS_CACHE
    now = time.time()
    if _DEP_STATUS_CACHE["data"] is not None and (now - _DEP_STATUS_CACHE["timestamp"]) < max_age:
        return _DEP_STATUS_CACHE["data"]
    data = dependency_and_connection_status(config)
    _DEP_STATUS_CACHE["timestamp"] = now
    _DEP_STATUS_CACHE["data"] = data
    return data


def dependency_and_connection_status(config: dict) -> dict:
    """Report packaged tools and real active authentications safely."""
    workspace = Path(config["WorkspaceRoot"]).expanduser().resolve()
    connection_path = workspace / "connections.json"
    connections = {}
    if connection_path.is_file():
        try:
            connections = json.loads(connection_path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError, TypeError):
            connections = {}

    service_path = Path(config.get("ServiceAccountFile", "")).expanduser()
    service_valid = False
    service_identity = ""
    if service_path.is_file():
        try:
            service_data = json.loads(service_path.read_text(encoding="utf-8-sig"))
            service_identity = str(service_data.get("client_email", ""))
            service_valid = (
                service_data.get("type") == "service_account"
                and bool(service_identity)
                and bool(service_data.get("private_key"))
            )
        except (OSError, ValueError, TypeError):
            pass

    module_ready = False
    for module_root in os.environ.get("PSModulePath", "").split(os.pathsep):
        if module_root and (Path(module_root) / "ExchangeOnlineManagement").is_dir():
            module_ready = True
            break

    google_account = ""
    google_authenticated = False
    gcloud_path = shutil.which("gcloud")
    if gcloud_path:
        try:
            kwargs = {"capture_output": True, "text": True, "timeout": 4, "check": False}
            if sys.platform == "win32":
                kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
                kwargs["shell"] = True
                cmd = f'"{gcloud_path}" config get-value account'
            else:
                cmd = [gcloud_path, "config", "get-value", "account"]
            result = subprocess.run(cmd, **kwargs)
            candidate = result.stdout.strip()
            if result.returncode == 0 and candidate and candidate != "(unset)":
                google_account = candidate
                # Actively verify OAuth2 token validity
                if sys.platform == "win32":
                    token_cmd = f'"{gcloud_path}" auth print-access-token'
                else:
                    token_cmd = [gcloud_path, "auth", "print-access-token"]
                token_res = subprocess.run(token_cmd, **kwargs)
                if token_res.returncode == 0 and token_res.stdout.strip().startswith("ya29."):
                    google_authenticated = True
        except (OSError, subprocess.TimeoutExpired):
            pass

    m365_account = connections.get("Microsoft365", {}).get("Account", "")
    m365_checked_at = connections.get("Microsoft365", {}).get("CheckedAtUtc", "")
    m365_authenticated = False
    if m365_checked_at:
        try:
            checked_dt = datetime.fromisoformat(m365_checked_at.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - checked_dt).total_seconds()
            # Active session lifetime within 90 minutes
            if age_seconds < 90 * 60:
                m365_authenticated = True
        except (ValueError, TypeError):
            pass

    return {
        "dependencies": {
            "python": {"ready": Path(config.get("PythonPath", "")).is_file()},
            "powershell": {"ready": bool(shutil.which("pwsh"))},
            "gcloud": {"ready": bool(gcloud_path)},
            "exchange_module": {"ready": module_ready},
            "service_account": {
                "ready": service_valid,
                "identity": service_identity,
                "path": str(service_path),
            },
        },
        "google": {
            "authenticated": google_authenticated,
            "account": google_account,
            "checked_at": connections.get("Google", {}).get("CheckedAtUtc", ""),
        },
        "microsoft365": {
            "authenticated": m365_authenticated,
            "account": m365_account,
            "checked_at": m365_checked_at,
        },
    }


def update_connection_status(config: dict, provider: str, account: str, checked_at: str):
    workspace = Path(config["WorkspaceRoot"]).expanduser().resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    path = workspace / "connections.json"
    payload = {}
    if path.is_file():
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError, TypeError):
            payload = {}
    payload[provider] = {"Account": account, "CheckedAtUtc": checked_at}
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def latest_mapping_row(workspace: Path, group_email: str) -> dict | None:
    candidates = sorted(
        workspace.glob("runs/prepare-*/mailbox-mapping.csv"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    for path in candidates:
        for row in read_csv(path):
            if row.get("GroupEmail", "").lower() == group_email:
                row["_mapping_path"] = str(path)
                return row
    return None


def isolated_preparation_record(
    workspace: Path,
    group_email: str,
    expected_staging_user: str = "",
    expected_target_mailbox: str = "",
) -> dict | None:
    """Return only a preparation record whose identity and files still validate."""
    record_path = (
        workspace / "groups" / safe_group_name(group_email) / "preparation.json"
    )
    if not record_path.is_file():
        return None
    try:
        record = json.loads(record_path.read_text(encoding="utf-8-sig"))
        if record.get("GroupEmail", "").strip().lower() != group_email:
            return None
        if expected_staging_user and (
            record.get("StagingUser", "").strip().lower() != expected_staging_user
        ):
            return None
        if expected_target_mailbox and (
            record.get("TargetSharedMailbox", "").strip().lower()
            != expected_target_mailbox
        ):
            return None
        manifest = Path(record.get("Manifest", "")).resolve()
        summary_path = Path(record.get("Summary", "")).resolve()
        backup_directory = Path(record.get("BackupDirectory", "")).resolve()
        if not manifest.is_file() or not summary_path.is_file() or not backup_directory.is_dir():
            return None
        if sha256_file(manifest).lower() != record.get("ManifestSha256", "").lower():
            return None
        summary = json.loads(summary_path.read_text(encoding="utf-8-sig"))
        if summary.get("group", "").strip().lower() != group_email:
            return None
        record["_record_path"] = str(record_path)
        record["_isolated"] = True
        return record
    except (OSError, ValueError, TypeError):
        return None


def preparation_for_group(
    workspace: Path,
    group_email: str,
    expected_staging_user: str,
    expected_target_mailbox: str,
) -> dict | None:
    record = isolated_preparation_record(
        workspace, group_email, expected_staging_user, expected_target_mailbox
    )
    if record:
        return record
    # Compatibility for old preparations. Any operation through the central
    # PowerShell entry point converts this row into the isolated record first.
    legacy = latest_mapping_row(workspace, group_email)
    if not legacy:
        return None
    if legacy.get("StagingUser", "").strip().lower() != expected_staging_user:
        return None
    if legacy.get("TargetSharedMailbox", "").strip().lower() != expected_target_mailbox:
        return None
    try:
        manifest = Path(legacy.get("Manifest", "")).resolve()
        summary_path = Path(legacy.get("Summary", "")).resolve()
        backup_directory = Path(legacy.get("BackupDirectory", "")).resolve()
        summary = json.loads(summary_path.read_text(encoding="utf-8-sig"))
        if (
            not manifest.is_file()
            or not backup_directory.is_dir()
            or summary.get("group", "").strip().lower() != group_email
        ):
            return None
        legacy["_isolated"] = False
        return legacy
    except (OSError, ValueError, TypeError):
        return None


def group_runtime_path(workspace: Path, group_email: str) -> Path:
    return workspace / "groups" / safe_group_name(group_email) / "runtime.json"


def read_group_runtime(workspace: Path, group_email: str) -> dict:
    path = group_runtime_path(workspace, group_email)
    if not path.is_file():
        return {}
    try:
        runtime = json.loads(path.read_text(encoding="utf-8-sig"))
        if runtime.get("GroupEmail", "").strip().lower() != group_email:
            return {}
        return runtime
    except (OSError, ValueError, TypeError):
        return {}


def update_group_runtime(
    workspace: Path, group_email: str, section: str, evidence: dict,
    config: dict | None = None
) -> None:
    # Keep writing to JSON for backward compatibility
    path = group_runtime_path(workspace, group_email)
    path.parent.mkdir(parents=True, exist_ok=True)
    runtime = read_group_runtime(workspace, group_email)
    runtime.update({"SchemaVersion": 1, "GroupEmail": group_email})
    runtime[section] = evidence
    runtime["UpdatedAtUtc"] = utc_now()
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(runtime, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)
    # Also persist to SQLite
    if config:
        db_upsert_runtime(config, group_email, section, evidence)


def parse_bool(value) -> bool | None:
    normalized = str(value).strip().lower()
    if normalized in ("true", "1", "yes"):
        return True
    if normalized in ("false", "0", "no"):
        return False
    return None


def google_evidence_from_lines(
    lines: list[str], group_email: str, staging_user: str, checked_at: str
) -> dict:
    fields = {}
    for raw_line in lines:
        line = ANSI_ESCAPE_PATTERN.sub("", raw_line)
        match = re.match(r"^\s*([a-z_]+)\s*:\s*(.*?)\s*$", line, re.IGNORECASE)
        if match:
            fields[match.group(1).lower()] = match.group(2)
    if not fields.get("status"):
        clean_lines = [ANSI_ESCAPE_PATTERN.sub("", line).strip() for line in lines]
        for index, line in enumerate(clean_lines):
            if not re.fullmatch(r"status\s+primary_email", line, re.IGNORECASE):
                continue
            for value_line in clean_lines[index + 1 :]:
                if not value_line or re.fullmatch(r"[-\s]+", value_line):
                    continue
                columns = value_line.split(None, 1)
                if columns:
                    fields["status"] = columns[0]
                if len(columns) == 2:
                    fields["primary_email"] = columns[1]
                break
            break
    primary = fields.get("primary_email", "").lower()
    if primary and primary != staging_user:
        return {}
    status = fields.get("status", "").upper()
    if status not in ("EXISTS", "NOT_FOUND", "CREATED"):
        return {}
    return {
        "CheckedAtUtc": checked_at,
        "GroupEmail": group_email,
        "StagingUser": staging_user,
        "Status": status,
        "PrimaryEmail": primary,
        "Suspended": parse_bool(fields.get("suspended")),
        "Archived": parse_bool(fields.get("archived")),
        "IsMailboxSetup": parse_bool(fields.get("is_mailbox_setup")),
    }


def latest_google_evidence(
    workspace: Path, group_email: str, staging_user: str,
    config: dict | None = None
) -> dict:
    # Try DB first (fastest)
    if config:
        db_runtime = db_read_runtime(config, group_email, "Google")
        if db_runtime.get("StagingUser", "").lower() == staging_user:
            return db_runtime
    # Fall back to JSON file
    runtime = read_group_runtime(workspace, group_email).get("Google", {})
    if runtime.get("StagingUser", "").lower() != staging_user:
        runtime = {}
    safe_name = safe_group_name(group_email)
    candidates = []
    for action in ("check_staging", "create_staging"):
        candidates.extend((workspace / "ui-logs").glob(f"*-{action}-{safe_name}.log"))
    for path in sorted(candidates, key=lambda item: item.stat().st_mtime, reverse=True):
        try:
            lines = path.read_text(encoding="utf-8-sig").splitlines()
        except OSError:
            continue
        checked_at = lines[0].split(" | ", 1)[0] if lines else ""
        evidence = google_evidence_from_lines(
            lines, group_email, staging_user, checked_at
        )
        if evidence:
            if evidence.get("CheckedAtUtc", "") > runtime.get("CheckedAtUtc", ""):
                return evidence
            break
    return runtime


def state_statistics(path: Path) -> dict:
    result = {"verified": 0, "failed": 0, "warnings": 0, "tracked": 0}
    if not path.is_file():
        return result
    with sqlite3.connect(str(path)) as connection:
        statuses = dict(
            connection.execute("SELECT status, COUNT(*) FROM imports GROUP BY status")
        )
        result["verified"] = int(statuses.get("seeded_existing", 0)) + int(
            statuses.get("verified", 0)
        )
        result["failed"] = int(statuses.get("verification_failed", 0))
        result["tracked"] = result["verified"] + result["failed"]
        try:
            result["warnings"] = int(
                connection.execute(
                    "SELECT COUNT(*) FROM imports "
                    "WHERE verification_warnings IS NOT NULL "
                    "AND verification_warnings NOT IN ('', '[]')"
                ).fetchone()[0]
            )
        except sqlite3.OperationalError:
            result["warnings"] = 0
    return result


def conflict_approval(mapping: dict, group_email: str) -> bool:
    manifest_value = mapping.get("Manifest", "")
    state_directory = mapping.get("StateDirectory", "")
    if not manifest_value or not state_directory:
        return False
    manifest = Path(manifest_value).resolve()
    receipt = Path(state_directory).resolve() / "message-id-conflict-approval.json"
    if not manifest.is_file() or not receipt.is_file():
        return False
    try:
        approval = json.loads(receipt.read_text(encoding="utf-8-sig"))
        return (
            approval.get("Group", "").lower() == group_email
            and approval.get("ManifestSha256", "").lower() == sha256_file(manifest)
            and approval.get("KeepAllDistinctContentVariants") is True
        )
    except (OSError, ValueError, TypeError):
        return False


def latest_restore_plan(
    workspace: Path,
    group_email: str,
    phases: tuple[str, ...] = (),
    staging_user: str = "",
    target_mailbox: str = "",
) -> dict:
    pattern = f"runs/restore/restore-{safe_group_name(group_email)}-*/restore-plan.json"
    candidates = sorted(
        workspace.glob(pattern), key=lambda item: item.stat().st_mtime, reverse=True
    )
    for path in candidates:
        try:
            result = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            continue
        if result.get("Group", "").strip().lower() != group_email:
            continue
        if phases and result.get("Phase") not in phases:
            continue
        if staging_user and result.get("StagingUser", "").strip().lower() != staging_user:
            continue
        if target_mailbox and (
            result.get("TargetSharedMailbox", "").strip().lower() != target_mailbox
        ):
            continue
        result["_path"] = str(path)
        return result
    return {}


def backup_exports_for_group(backup_rows: list[dict], group_email: str) -> list[dict]:
    exports: dict[str, list[dict]] = {}
    for row in backup_rows:
        if row.get("GroupEmail", "").strip().lower() != group_email:
            continue
        exports.setdefault(row.get("ExportId", ""), []).append(row)
    result = []
    for export_id, rows in exports.items():
        files = []
        for row in sorted(rows, key=lambda item: item.get("RelativePath", "")):
            path = Path(row.get("ManagedPath") or row.get("SourcePath", "")).expanduser()
            if not path.is_file():
                export_id = row.get("ExportId", "")
                rel_path = row.get("RelativePath", "")
                candidates = [
                    PROJECT_ROOT.parent / export_id / group_email / rel_path,
                    Path(r"C:\Users\andre.gabry\Projects\m365\Google Groups") / export_id / group_email / rel_path,
                ]
                for cand in candidates:
                    if cand.is_file():
                        path = cand
                        break
            exists = path.is_file()
            expected_bytes = int_value(row.get("Bytes"))
            actual_bytes = path.stat().st_size if exists else None
            files.append(
                {
                    "name": row.get("FileName", path.name),
                    "relative_path": row.get("RelativePath", ""),
                    "path": str(path),
                    "expected_bytes": expected_bytes,
                    "actual_bytes": actual_bytes,
                    "sha256": row.get("SHA256", ""),
                    "registered_at": row.get("RegisteredAtUtc", ""),
                    "storage_mode": row.get("StorageMode", ""),
                    "state": "verified_size"
                    if exists and actual_bytes == expected_bytes
                    else ("size_mismatch" if exists else "missing"),
                }
            )
        result.append(
            {
                "export_id": export_id,
                "files": files,
                "file_count": len(files),
                "bytes": sum(item["expected_bytes"] for item in files),
                "available_files": sum(item["state"] == "verified_size" for item in files),
                "registered_at": max(
                    (item["registered_at"] for item in files), default=""
                ),
            }
        )
    return sorted(result, key=lambda item: item["export_id"], reverse=True)


def read_remote_backup_state(workspace: Path, group_email: str) -> dict:
    path = workspace / "groups" / safe_group_name(group_email) / "remote-backup.json"
    if not path.is_file():
        return {}
    try:
        result = json.loads(path.read_text(encoding="utf-8-sig"))
        if result.get("GroupEmail", "").strip().lower() != group_email:
            return {}
        result["_path"] = str(path)
        return result
    except (OSError, ValueError, TypeError):
        return {}


def read_remote_groups_state(workspace: Path) -> dict:
    """Read the last global Google Groups discovery without trusting malformed state."""
    path = workspace / "remote-groups.json"
    if not path.is_file():
        return {}
    try:
        result = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(result.get("Groups"), list):
            return {}
        result["_path"] = str(path)
        return result
    except (OSError, ValueError, TypeError):
        return {}


def group_activity(
    workspace: Path,
    group_email: str,
    backup_exports: list[dict],
    preparation: dict | None,
) -> list[dict]:
    events = []
    for export in backup_exports:
        events.append(
            {
                "timestamp": export.get("registered_at", ""),
                "category": "backup",
                "title": f"Backup {export.get('export_id', '')} registado",
                "status": "OK"
                if export.get("available_files") == export.get("file_count")
                else "ATTENTION",
                "detail": f"{export.get('file_count', 0)} arquivo(s) · {export.get('bytes', 0)} bytes",
                "artifact": "",
            }
        )
    if preparation:
        events.append(
            {
                "timestamp": preparation.get("UpdatedAtUtc", ""),
                "category": "preparation",
                "title": "Backup preparado e isolado",
                "status": "OK" if preparation.get("_isolated") else "LEGACY",
                "detail": preparation.get("Manifest", ""),
                "artifact": preparation.get("_record_path", ""),
            }
        )
    pattern = f"runs/restore/restore-{safe_group_name(group_email)}-*/restore-plan.json"
    for path in workspace.glob(pattern):
        try:
            plan = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError, TypeError):
            continue
        if plan.get("Group", "").strip().lower() != group_email:
            continue
        events.append(
            {
                "timestamp": plan.get("GeneratedAtUtc", ""),
                "category": "migration",
                "title": f"Etapa {plan.get('Phase', 'desconhecida')}",
                "status": plan.get("Readiness", ""),
                "detail": (
                    f"{int_value(plan.get('VerifiedMessages'))}/{int_value(plan.get('CanonicalMessages'))} verificadas"
                    + (f" · lote {plan.get('BatchName')}" if plan.get("BatchName") else "")
                ),
                "artifact": str(path),
            }
        )
    receipts_directory = workspace / "groups" / safe_group_name(group_email) / "jobs"
    seen_ids: set[str] = set()
    if receipts_directory.is_dir():
        for path in receipts_directory.glob("*.json"):
            try:
                receipt = json.loads(path.read_text(encoding="utf-8-sig"))
            except (OSError, ValueError, TypeError):
                continue
            jid = receipt.get("id", "")
            if jid:
                seen_ids.add(jid)
            events.append(
                {
                    "timestamp": receipt.get("finished_at") or receipt.get("created_at", ""),
                    "category": "job",
                    "title": receipt.get("title", receipt.get("action", "Operação")),
                    "status": receipt.get("status", ""),
                    "detail": f"código {receipt.get('exit_code')} · {receipt.get('duration_seconds', 0)} s",
                    "artifact": receipt.get("log_path", ""),
                    "job_id": jid,
                }
            )
    direct_receipt_path = workspace / "groups" / safe_group_name(group_email) / "direct-import-receipt.json"
    if direct_receipt_path.is_file():
        try:
            drec = json.loads(direct_receipt_path.read_text(encoding="utf-8-sig"))
            events.append(
                {
                    "timestamp": drec.get("generated_at_utc", ""),
                    "category": "migration",
                    "title": "Migração Direta M365 (Graph API)",
                    "status": "COMPLETED" if drec.get("completed") else "IN_PROGRESS",
                    "detail": f"{drec.get('total_verified', 0)}/{drec.get('total_canonical', 0)} mensagens verificadas na caixa",
                    "artifact": str(direct_receipt_path),
                }
            )
        except (OSError, ValueError, TypeError):
            pass
    events.sort(key=lambda item: item.get("timestamp", ""), reverse=True)
    return events[:30]


def build_group_overview(config: dict, detailed_email: str = "") -> dict:
    workspace = Path(config["WorkspaceRoot"]).expanduser().resolve()
    catalog_path = workspace / "catalog" / "groups.csv"
    catalog = read_csv(catalog_path)
    remote_catalog = read_remote_groups_state(workspace)
    remote_by_group = {
        str(row.get("GroupEmail", "")).strip().lower(): row
        for row in remote_catalog.get("Groups", [])
        if EMAIL_PATTERN.fullmatch(str(row.get("GroupEmail", "")).strip().lower())
    }
    local_emails = {
        row.get("GroupEmail", "").strip().lower()
        for row in catalog
        if EMAIL_PATTERN.fullmatch(row.get("GroupEmail", "").strip().lower())
    }
    latest_export = max(
        [row.get("ExportId", "") for row in catalog]
        + [str(remote_catalog.get("ExportId", ""))],
        default="",
    )
    backup_rows = read_csv(workspace / "catalog" / "backups.csv")
    latest_by_group = {}
    for row in catalog:
        email = row.get("GroupEmail", "").strip().lower()
        current = latest_by_group.get(email)
        if current is None or row.get("ExportId", "") > current.get("ExportId", ""):
            latest_by_group[email] = row
    for email, remote in remote_by_group.items():
        if email not in latest_by_group:
            latest_by_group[email] = {
                "GroupEmail": email,
                "ExportId": remote_catalog.get("ExportId", ""),
                "ArchiveFiles": remote.get("RemoteObjects", 0),
                "ArchiveBytes": remote.get("RemoteBytes", 0),
            }
    rows = sorted(latest_by_group.values(), key=lambda row: row.get("GroupEmail", "").lower())
    groups = []
    for row in rows:
        group_email = row.get("GroupEmail", "").strip().lower()
        if not EMAIL_PATTERN.fullmatch(group_email):
            continue
        local_part = group_email.split("@", 1)[0]
        staging_user = f"migracao.{local_part}@{config['GoogleDomain']}"
        custom_target = db_get_group_target_mailbox(config, group_email)
        if custom_target:
            target_mailbox = custom_target
        else:
            prep_p = workspace / "groups" / safe_group_name(group_email) / "preparation.json"
            prep_target = ""
            if prep_p.is_file():
                try:
                    prep_target = json.loads(prep_p.read_text(encoding="utf-8-sig")).get("TargetSharedMailbox", "").strip().lower()
                except Exception:
                    pass
            target_mailbox = prep_target if prep_target else f"{local_part}@{config['M365TargetDomain']}"
        mapping = preparation_for_group(
            workspace, group_email, staging_user, target_mailbox
        )
        summary = {}
        state = {"verified": 0, "failed": 0, "warnings": 0, "tracked": 0}
        reports_dir = Path(__file__).resolve().parent.parent / "reports"
        if mapping:
            summary_path = Path(mapping.get("Summary", ""))
            if not summary_path.is_file():
                cand_name = summary_path.parent.name
                cand_file = reports_dir / cand_name / summary_path.name
                if cand_file.is_file():
                    summary_path = cand_file
                else:
                    matches = sorted(reports_dir.glob(f"takeout-{safe_group_name(group_email)}-*/takeout-summary.json"), key=lambda p: p.stat().st_mtime, reverse=True)
                    if matches:
                        summary_path = matches[0]
            if summary_path.is_file():
                try:
                    summary = json.loads(summary_path.read_text(encoding="utf-8-sig"))
                except ValueError:
                    summary = {}
            state_dir = Path(mapping.get("StateDirectory", ""))
            state_path = state_dir / "import-state.sqlite3"
            if not state_path.is_file():
                cand_state = reports_dir / f"{local_part}-staging" / "import-state.sqlite3"
                if cand_state.is_file():
                    state_path = cand_state
            state = state_statistics(state_path.resolve())

        if not summary:
            matches = sorted(reports_dir.glob(f"takeout-{safe_group_name(group_email)}-*/takeout-summary.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            if matches:
                try:
                    summary = json.loads(matches[0].read_text(encoding="utf-8-sig"))
                except ValueError:
                    summary = {}

        canonical = int_value(summary.get("takeout", {}).get("canonical_unique_messages"))
        google = latest_google_evidence(workspace, group_email, staging_user)
        gmail = latest_restore_plan(
            workspace,
            group_email,
            phases=("Prepare", "Stage", "CleanStaging"),
            staging_user=staging_user,
            target_mailbox=target_mailbox,
        )
        exchange = latest_restore_plan(
            workspace,
            group_email,
            phases=("Status", "CreateBatch"),
            staging_user=staging_user,
            target_mailbox=target_mailbox,
        )
        google_exists = google.get("Status") in ("EXISTS", "CREATED")
        google_ready = (
            google_exists
            and google.get("Suspended") is False
            and google.get("Archived") is False
            and google.get("IsMailboxSetup") is True
        )
        google_license_pending = (
            google_exists
            and google.get("Suspended") is False
            and google.get("Archived") is False
            and google.get("IsMailboxSetup") is not True
        )
        gmail_checked = bool(gmail)
        gmail_verified = (
            gmail_checked
            and int_value(gmail.get("CanonicalMessages")) == canonical
            and int_value(gmail.get("VerifiedMessages")) == state["verified"]
            and int_value(gmail.get("VerificationFailed")) == state["failed"]
        )
        exchange_checked = bool(exchange)
        safe_group = safe_group_name(group_email)
        direct_receipt = {}
        direct_receipt_path = workspace / "groups" / safe_group / "direct-import-receipt.json"
        if direct_receipt_path.is_file():
            try:
                direct_receipt = json.loads(direct_receipt_path.read_text(encoding="utf-8-sig"))
            except (OSError, ValueError, TypeError):
                direct_receipt = {}

        target_items = exchange.get("TargetCurrentItems")
        if target_items is None and direct_receipt:
            target_items = direct_receipt.get("total_verified")
        if target_items is None and mapping:
            target_items = mapping.get("TargetCurrentItems")

        readiness = exchange.get("Readiness", gmail.get("Readiness", "NOT_AUDITED"))
        exchange_migration_status = exchange.get("ExchangeMigrationStatus", "")
        exchange_batch_status = exchange.get("ExchangeBatchStatus", "")
        exchange_percentage = exchange.get("ExchangePercentageComplete")
        exchange_items_synced = exchange.get("ExchangeItemsSynced")

        # Reconcile completion: if items in target M365 >= canonical, or direct import completed
        direct_completed = bool(direct_receipt.get("completed"))
        if not direct_completed and target_items is not None and canonical > 0 and int_value(target_items) >= canonical:
            direct_completed = True

        if direct_completed:
            readiness = "EXCHANGE_BATCH_COMPLETED"
            exchange_migration_status = "Completed"
            if not exchange_batch_status:
                exchange_batch_status = "Completed (Direto M365)"
            exchange_percentage = 100
            if exchange_items_synced is None or int_value(exchange_items_synced) < int_value(target_items or canonical):
                exchange_items_synced = target_items if target_items is not None else canonical

        is_detailed = bool(detailed_email and group_email == detailed_email.strip().lower())
        if is_detailed:
            backup_exports = backup_exports_for_group(backup_rows, group_email)
            has_local_files = any(
                f.get("state") != "missing"
                for export in backup_exports
                for f in export.get("files", [])
            )
            remote_backup = read_remote_backup_state(workspace, group_email)
            activity = group_activity(workspace, group_email, backup_exports, mapping)
        else:
            has_local_files = any(
                r.get("GroupEmail", "").strip().lower() == group_email
                for r in backup_rows
            )
            backup_exports = []
            remote_backup = {}
            activity = []
        remote_entry = remote_by_group.get(group_email, {})
        groups.append(
            {
                "email": group_email,
                "display_name": remote_entry.get("DisplayName", ""),
                "remote_only": not has_local_files and bool(remote_entry),
                "remote_discovered": bool(remote_entry),
                "remote_object_count": int_value(remote_entry.get("RemoteObjects")),
                "remote_bytes": int_value(remote_entry.get("RemoteBytes")),
                "remote_updated_at": remote_entry.get("LastUpdatedUtc", ""),
                "remote_bucket_prefix": remote_entry.get("BucketPrefix", ""),
                "export_id": row.get("ExportId", ""),
                "archive_files": int_value(row.get("ArchiveFiles")),
                "archive_bytes": int_value(row.get("ArchiveBytes")),
                "backup_exports": backup_exports,
                "remote_backup": remote_backup,
                "activity": activity,
                "has_details": is_detailed,
                "staging_user": staging_user,
                "target_mailbox": target_mailbox,
                "prepared": bool(mapping),
                "preparation_isolated": bool(mapping and mapping.get("_isolated")),
                "preparation_checked_at": mapping.get("UpdatedAtUtc", "") if mapping else "",
                "canonical_messages": canonical,
                "verified_messages": state["verified"],
                "remaining_messages": max(0, canonical - state["verified"]),
                "verification_failed": state["failed"],
                "verification_warnings": state["warnings"],
                "content_conflicts": int_value(
                    summary.get("takeout", {}).get("message_id_content_hash_conflicts")
                ),
                "parse_defects": int_value(
                    summary.get("takeout", {}).get("messages_with_parse_defects")
                ),
                "conflicts_approved": conflict_approval(mapping, group_email)
                if mapping
                else False,
                "google_account_checked": bool(google),
                "google_account_checked_at": google.get("CheckedAtUtc", ""),
                "google_account_status": google.get("Status", "NOT_CHECKED"),
                "google_account_exists": google_exists,
                "google_account_ready": google_ready,
                "google_license_pending": google_license_pending,
                "google_mailbox_setup": google.get("IsMailboxSetup"),
                "google_suspended": google.get("Suspended"),
                "gmail_checked": gmail_checked,
                "gmail_checked_at": gmail.get("GeneratedAtUtc", ""),
                "gmail_verified": gmail_verified,
                "gmail_destination_messages": gmail.get("GmailDestinationMessages"),
                "gmail_google_welcome_messages": int_value(gmail.get("GmailGoogleWelcomeMessages")),
                "gmail_unknown_messages": int_value(gmail.get("GmailUnknownMessages")),
                "gmail_removed_welcome_messages": int_value(gmail.get("GmailRemovedWelcomeMessages")),
                "gmail_destination_inventory": gmail.get("GmailDestinationInventory", ""),
                "exchange_checked": exchange_checked or bool(direct_receipt),
                "exchange_checked_at": exchange.get("GeneratedAtUtc", "") or direct_receipt.get("generated_at_utc", ""),
                "readiness": readiness,
                "target_current_items": target_items,
                "target_total_item_size": exchange.get("TargetTotalItemSize", ""),
                "exchange_recipient_type": exchange.get("ExchangeRecipientType", ""),
                "exchange_primary_smtp": exchange.get("ExchangePrimarySmtp", ""),
                "exchange_migration_found": exchange.get("ExchangeMigrationFound") or direct_completed,
                "exchange_migration_status": exchange_migration_status,
                "exchange_batch_status": exchange_batch_status,
                "exchange_status_detail": exchange.get("ExchangeStatusDetail", ""),
                "exchange_percentage_complete": exchange_percentage,
                "exchange_workflow_step": exchange.get("ExchangeWorkflowStep", ""),
                "exchange_source_items": exchange.get("ExchangeSourceItems") or canonical,
                "exchange_last_successful_sync_time": exchange.get("ExchangeLastSuccessfulSyncTime", "") or direct_receipt.get("generated_at_utc", ""),
                "exchange_items_synced": exchange_items_synced,
                "exchange_items_skipped": exchange.get("ExchangeItemsSkipped") or 0,
                "exchange_batch_total_count": exchange.get("ExchangeBatchTotalCount"),
                "exchange_batch_synced_count": exchange.get("ExchangeBatchSyncedCount"),
                "exchange_batch_failed_count": exchange.get("ExchangeBatchFailedCount"),
                "exchange_bytes_transferred": exchange.get("ExchangeBytesTransferred", ""),
                "exchange_error_summary": exchange.get("ExchangeErrorSummary", ""),
                "target_delivery_domain": exchange.get("TargetDeliveryDomain", ""),
                "batch_name": exchange.get("BatchName", ""),
                "direct_import_receipt": direct_receipt,
                "direct_import_completed": direct_completed,
                "earliest_message_utc": summary.get("earliest_message_utc", ""),
                "latest_message_utc": summary.get("latest_message_utc", ""),
            }
        )
    return {
        "generated_at": utc_now(),
        "latest_export": latest_export,
        "catalog": str(catalog_path),
        "google_domain": config["GoogleDomain"],
        "google_admin": config["GoogleAdmin"],
        "exchange_admin": config["ExchangeAdmin"],
        "m365_domain": config["M365TargetDomain"],
        "google_takeout_bucket_root": config.get("GoogleTakeoutBucketRoot", ""),
        "google_groups_backup_root": config.get("GoogleGroupsBackupRoot", ""),
        "remote_discovery": {
            "generated_at": remote_catalog.get("GeneratedAtUtc", ""),
            "active_account": remote_catalog.get("ActiveAccount", ""),
            "directory_groups": int_value(remote_catalog.get("DirectoryGroups")),
            "groups_with_backups": int_value(remote_catalog.get("GroupsWithBackups")),
            "state_path": remote_catalog.get("_path", ""),
        },
        "setup": get_cached_dependency_status(config),
        "groups": groups,
    }


def build_group_details(config: dict, group_email: str) -> dict:
    """Load on-demand heavy details for a single group."""
    workspace = Path(config["WorkspaceRoot"]).expanduser().resolve()
    normalized = (group_email or "").strip().lower()
    local_part = normalized.split("@", 1)[0]
    staging_user = f"migracao.{local_part}@{config['GoogleDomain']}"
    custom_target = db_get_group_target_mailbox(config, normalized)
    if custom_target:
        target_mailbox = custom_target
    else:
        prep_p = workspace / "groups" / safe_group_name(normalized) / "preparation.json"
        prep_target = ""
        if prep_p.is_file():
            try:
                prep_target = json.loads(prep_p.read_text(encoding="utf-8-sig")).get("TargetSharedMailbox", "").strip().lower()
            except Exception:
                pass
        target_mailbox = prep_target if prep_target else f"{local_part}@{config['M365TargetDomain']}"
    mapping = preparation_for_group(workspace, normalized, staging_user, target_mailbox)
    backup_rows = read_csv(workspace / "catalog" / "backups.csv")
    backup_exports = backup_exports_for_group(backup_rows, normalized)
    remote_backup = read_remote_backup_state(workspace, normalized)
    activity = group_activity(workspace, normalized, backup_exports, mapping)
    return {
        "group": normalized,
        "backup_exports": backup_exports,
        "remote_backup": remote_backup,
        "activity": activity,
    }


def group_from_overview(config: dict, group_email: str) -> dict:
    normalized = (group_email or "").strip().lower()
    if not EMAIL_PATTERN.fullmatch(normalized):
        raise ValueError("Grupo inválido.")
    for group in build_group_overview(config, detailed_email=normalized)["groups"]:
        if group["email"] == normalized:
            return group
    raise ValueError("O grupo não pertence à exportação registada.")


def get_artifact_content(config: dict, group_email: str, requested_path: str) -> dict:
    group = group_from_overview(config, group_email)
    allowed = set()
    for export in group.get("backup_exports", []):
        for item in export.get("files", []):
            if item.get("path"):
                allowed.add(str(Path(item["path"]).expanduser().resolve()))
    for event in group.get("activity", []):
        if event.get("artifact"):
            allowed.add(str(Path(event["artifact"]).expanduser().resolve()))
    remote = group.get("remote_backup", {})
    if remote.get("_path"):
        allowed.add(str(Path(remote["_path"]).expanduser().resolve()))
    for item in remote.get("Objects", []):
        if item.get("LocalPath"):
            allowed.add(str(Path(item["LocalPath"]).expanduser().resolve()))
    drec = Path(config["WorkspaceRoot"]).expanduser().resolve() / "groups" / safe_group_name(group_email) / "direct-import-receipt.json"
    if drec.is_file():
        allowed.add(str(drec.resolve()))
    resolved = str(Path(requested_path).expanduser().resolve())
    if resolved not in allowed:
        raise ValueError("O arquivo não pertence aos registros deste grupo.")
    path = Path(resolved)
    if not path.exists():
        raise ValueError("O arquivo registado não existe mais.")
    try:
        content = path.read_text(encoding="utf-8-sig", errors="replace")
    except Exception as e:
        content = f"Não foi possível ler o arquivo: {e}"
    return {"content": content, "path": str(path), "name": path.name}


def reveal_group_artifact(config: dict, group_email: str, requested_path: str) -> dict:
    group = group_from_overview(config, group_email)
    allowed = set()
    for export in group.get("backup_exports", []):
        for item in export.get("files", []):
            if item.get("path"):
                allowed.add(str(Path(item["path"]).expanduser().resolve()))
    for event in group.get("activity", []):
        if event.get("artifact"):
            allowed.add(str(Path(event["artifact"]).expanduser().resolve()))
    remote = group.get("remote_backup", {})
    if remote.get("_path"):
        allowed.add(str(Path(remote["_path"]).expanduser().resolve()))
    for item in remote.get("Objects", []):
        if item.get("LocalPath"):
            allowed.add(str(Path(item["LocalPath"]).expanduser().resolve()))
    resolved = str(Path(requested_path).expanduser().resolve())
    if resolved not in allowed:
        raise ValueError("O arquivo não pertence aos registros deste grupo.")
    path = Path(resolved)
    if not path.exists():
        raise ValueError("O arquivo registado não existe mais no Mac.")
    if sys.platform == "win32":
        subprocess.Popen(["explorer.exe", "/select,", str(path)])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path.parent)])
    return {"status": "OPENED", "path": str(path)}


def create_conflict_approval(config: dict, group_email: str) -> dict:
    group = group_from_overview(config, group_email)
    if not group["prepared"]:
        raise ValueError("Prepare o grupo antes de aprovar as variantes.")
    if group["content_conflicts"] == 0:
        return {"status": "NOT_REQUIRED", "group": group_email}

    workspace = Path(config["WorkspaceRoot"]).expanduser().resolve()
    mapping = preparation_for_group(
        workspace,
        group_email,
        group["staging_user"],
        group["target_mailbox"],
    )
    if not mapping:
        raise ValueError("O mapeamento preparado não foi encontrado.")
    manifest = Path(mapping["Manifest"]).resolve()
    state_directory = Path(mapping["StateDirectory"]).resolve()
    review_rows = [
        row
        for row in read_csv(Path(mapping.get("ConflictReview", "")))
        if row.get("RequiresApproval", "").lower() == "true"
    ]
    defect_rows = read_csv(Path(mapping.get("ParseDefectReview", "")))
    state_directory.mkdir(parents=True, exist_ok=True)
    receipt = state_directory / "message-id-conflict-approval.json"
    payload = {
        "ApprovedAtUtc": utc_now(),
        "ApprovedFrom": "local-web-interface",
        "Group": group_email,
        "Manifest": str(manifest),
        "ManifestSha256": sha256_file(manifest),
        "ContentConflictMessageIds": group["content_conflicts"],
        "DistinctVariantMessages": len(review_rows),
        "ParseDefectMessages": len(defect_rows),
        "KeepAllDistinctContentVariants": True,
    }
    temporary = receipt.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(receipt)
    return {"status": "APPROVED", "group": group_email, "receipt": str(receipt)}


ACTION_DEFINITIONS = {
    "discover_remote_groups": {
        "title": "Descobrir Google Groups com backup",
        "mutating": False,
    },
    "prepare": {"title": "Preparar backup", "mutating": False},
    "remote_backup_inventory": {
        "title": "Consultar backup no Google",
        "mutating": False,
    },
    "gcloud_login": {
        "title": "Autenticar Google Cloud",
        "mutating": False,
    },
    "m365_login": {
        "title": "Autenticar Microsoft 365",
        "mutating": False,
    },
    "download_backup": {
        "title": "Baixar e registar backup do Google",
        "mutating": True,
    },
    "check_staging": {"title": "Verificar conta Google", "mutating": False},
    "create_staging": {"title": "Criar conta Google temporária", "mutating": True},
    "audit_staging": {"title": "Validar Gmail temporário", "mutating": False},
    "clean_google_welcome": {
        "title": "Remover mensagens automáticas do Gmail",
        "mutating": True,
    },
    "load_test": {"title": "Carregar 10 mensagens", "mutating": True},
    "load_all": {"title": "Carregar mensagens restantes", "mutating": True},
    "repair_dates": {"title": "Corrigir datas internas rejeitadas", "mutating": True},
    "sync_m365_mailboxes": {
        "title": "Sincronizar contas do Microsoft 365",
        "mutating": False,
    },
    "m365_status": {"title": "Consultar Microsoft 365", "mutating": False},
    "create_batch": {"title": "Criar lote Microsoft 365", "mutating": True},
    "create_start_batch": {
        "title": "Criar e iniciar lote Microsoft 365",
        "mutating": True,
    },
    "m365_direct_import": {
        "title": "Inserir E-mails Diretamente no M365",
        "message": "Insere os e-mails canónicos do backup diretamente na caixa de destino do Microsoft 365 via Microsoft Graph API, sem necessidade de conta Google temporária, sem licença Gmail e sem lote de migração.",
        "mutating": True,
    },
    "m365_direct_test": {
        "title": "Teste: Inserir 10 E-mails no M365",
        "message": "Executa uma inserção de teste de 10 mensagens diretamente na caixa de destino do M365 para validação.",
        "mutating": True,
    },
}


class MigrationJob:
    def __init__(self, action: str, group: dict, command: list[str], log_path: Path):
        self.id = uuid.uuid4().hex[:12]
        self.action = action
        self.title = ACTION_DEFINITIONS[action]["title"]
        self.group = group.get("email", "")
        self.staging_user = group.get("staging_user", "")
        self.target_mailbox = group.get("target_mailbox", "")
        self.command = command
        self.log_path = log_path
        self.status = "QUEUED"
        self.created_at = utc_now()
        self.started_at = ""
        self.finished_at = ""
        self.exit_code = None
        self.cancel_requested = False
        self.process = None
        self.lines = deque(maxlen=1800)
        self.progress_current = None
        self.progress_total = None
        self.error = ""
        self.error_code = ""
        self.device_url = ""
        self.device_code = ""
        self.lock = threading.Lock()

    def append(self, line: str):
        clean = ANSI_ESCAPE_PATTERN.sub("", line).rstrip("\r\n")
        if not clean:
            return
        with self.lock:
            self.lines.append(clean)
            # Both the Gmail importer and the Takeout downloader emit the same
            # [current/total] prefix. Keeping the parser generic gives every
            # long-running, group-isolated operation consistent progress.
            progress = re.search(r"\[(\d+)/(\d+)\]", clean)
            if progress:
                self.progress_current = int(progress.group(1))
                self.progress_total = int(progress.group(2))

    def public(self) -> dict:
        with self.lock:
            return {
                "id": self.id,
                "action": self.action,
                "title": self.title,
                "group": self.group,
                "status": self.status,
                "created_at": self.created_at,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
                "exit_code": self.exit_code,
                "cancel_requested": self.cancel_requested,
                "progress_current": self.progress_current,
                "progress_total": self.progress_total,
                "log": list(self.lines),
                "log_path": str(self.log_path),
                "error": self.error,
                "error_code": self.error_code,
                "device_url": getattr(self, "device_url", ""),
                "device_code": getattr(self, "device_code", ""),
            }


def command_to_ps_line(cmd: list[str]) -> str:
    args = list(cmd)
    if args and args[0].lower().startswith("pwsh"):
        args = args[1:]
    while args and args[0] in ("-NoLogo", "-NoProfile", "-NonInteractive"):
        args = args[1:]
    if args and args[0] == "-File":
        args = args[1:]
    if not args:
        return ""
    script = to_short_path(args[0])
    rest = args[1:]
    parts = [f"& '{script}'"]
    for arg in rest:
        if arg.startswith("-") and " " not in arg:
            parts.append(arg)
        else:
            val = to_short_path(arg) if (sys.platform == "win32" and (":\\" in arg or ":/" in arg)) else arg
            escaped = val.replace("'", "''")
            parts.append(f"'{escaped}'")
    return " ".join(parts)


class JobManager:
    def __init__(self, config: dict):
        self.config = config
        self.lock = threading.Lock()
        self.jobs = {}
        self.active_job_id = None
        self.exchange_worker_proc = None
        self.exchange_worker_lock = threading.Lock()

    def get_exchange_worker(self):
        with self.exchange_worker_lock:
            if self.exchange_worker_proc and self.exchange_worker_proc.poll() is None:
                return self.exchange_worker_proc
            cmd = [
                "pwsh",
                "-NoLogo",
                "-NoProfile",
                "-File",
                script_path("ExchangeWorker.ps1"),
            ]
            self.exchange_worker_proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                bufsize=1,
                cwd=str(PROJECT_ROOT),
            )
            try:
                handshake = self.exchange_worker_proc.stdout.readline().strip()
            except Exception:
                pass
            return self.exchange_worker_proc

    def stop_exchange_worker(self):
        with self.exchange_worker_lock:
            proc = self.exchange_worker_proc
            self.exchange_worker_proc = None
            if proc and proc.poll() is None:
                try:
                    proc.stdin.write("EXIT\n")
                    proc.stdin.flush()
                    proc.wait(timeout=1)
                except Exception:
                    pass
                if proc.poll() is None:
                    if sys.platform == "win32":
                        try:
                            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
                        except Exception:
                            pass
                    else:
                        try:
                            proc.kill()
                        except Exception:
                            pass

    def common_migration_command(self, phase: str, group: dict) -> list[str]:
        return [
            "pwsh",
            "-NoLogo",
            "-NoProfile",
            "-File",
            script_path("Invoke-GoogleGroupsMigrationSystem.ps1"),
            phase,
            "-ConfigPath",
            self.config.get("_ConfigPath", to_short_path(CONFIG_PATH)),
            "-Group",
            group["email"],
            "-StagingUser",
            group["staging_user"],
            "-TargetMailbox",
            group["target_mailbox"],
            "-PythonPath",
            sys.executable,
        ]

    def selected_remote_files(self, group: dict, options: dict) -> list[str]:
        if "selected_remote_files" not in options:
            return []
        requested = options.get("selected_remote_files")
        if not isinstance(requested, list) or not requested:
            raise ValueError("Selecione pelo menos um arquivo do backup do Google.")
        selected = []
        for value in requested:
            if not isinstance(value, str):
                raise ValueError("A seleção de arquivos do Google é inválida.")
            relative_path = value.strip()
            if (
                not relative_path
                or Path(relative_path).is_absolute()
                or ".." in Path(relative_path).parts
            ):
                raise ValueError("A seleção contém um caminho de arquivo inseguro.")
            if relative_path not in selected:
                selected.append(relative_path)
        allowed = {
            str(item.get("RelativePath", ""))
            for item in group.get("remote_backup", {}).get("Objects", [])
        }
        unknown = [item for item in selected if item not in allowed]
        if unknown:
            raise ValueError(
                "Consulte novamente o Google; a seleção contém arquivo que não pertence ao inventário atual."
            )
        return selected

    def build_command(self, action: str, group: dict, options: dict) -> list[str]:
        if action == "discover_remote_groups":
            return [
                "pwsh",
                "-NoLogo",
                "-NoProfile",
                "-File",
                script_path("Discover-GoogleGroupsTakeoutBackups.ps1"),
                "-BucketRoot",
                self.config.get("GoogleTakeoutBucketRoot", ""),
                "-GoogleDomain",
                self.config["GoogleDomain"],
                "-GoogleAdmin",
                self.config["GoogleAdmin"],
                "-ServiceAccountFile",
                self.config["ServiceAccountFile"],
                "-PythonPath",
                self.config["PythonPath"],
                "-WorkspaceRoot",
                self.config["WorkspaceRoot"],
            ]
        if action == "gcloud_login":
            return [
                "pwsh",
                "-NoLogo",
                "-NoProfile",
                "-File",
                script_path("Connect-GoogleCloudInteractive.ps1"),
                "-GoogleAdmin",
                self.config["GoogleAdmin"],
            ]
        if action == "m365_login":
            return [
                "pwsh",
                "-NoLogo",
                "-NoProfile",
                "-File",
                script_path("Connect-M365Interactive.ps1"),
                "-AdminUser",
                self.config["ExchangeAdmin"],
            ]
        if action == "sync_m365_mailboxes":
            return [
                "pwsh",
                "-NoLogo",
                "-NoProfile",
                "-File",
                script_path("Sync-M365Mailboxes.ps1"),
                "-AdminUser",
                self.config["ExchangeAdmin"],
                "-WorkspaceRoot",
                self.config["WorkspaceRoot"],
            ]

        if action in ("remote_backup_inventory", "download_backup"):
            bucket_root = self.config.get("GoogleTakeoutBucketRoot", "").strip()
            if not re.fullmatch(r"gs://[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/?", bucket_root):
                raise ValueError(
                    "Configure GoogleTakeoutBucketRoot com o endereço gs:// do Data Export."
                )
            export_id = bucket_root.rstrip("/").rsplit("/", 1)[-1]
            destination_root = (
                Path(self.config["GoogleGroupsBackupRoot"]).expanduser().resolve()
                / export_id
            )
            command = [
                "pwsh",
                "-NoLogo",
                "-NoProfile",
                "-File",
                script_path("Sync-AllGoogleGroupsTakeoutBackup.ps1"),
                "-Phase",
                "Download" if action == "download_backup" else "Inventory",
                "-GroupEmail",
                group["email"],
                "-BucketRoot",
                bucket_root,
                "-DestinationRoot",
                str(destination_root),
                "-ReportRoot",
                str(Path(self.config["WorkspaceRoot"]).expanduser().resolve() / "runs" / "download"),
                "-WorkspaceRoot",
                self.config["WorkspaceRoot"],
                "-ExportId",
                export_id,
            ]
            if action == "download_backup":
                selected_files = self.selected_remote_files(group, options)
                if selected_files:
                    command.extend(
                        [
                            "-ObjectSelectionJson",
                            json.dumps(selected_files, ensure_ascii=False),
                        ]
                    )
                command.extend(["-Execute", "-RegisterAfterDownload"])
            if group.get("remote_bucket_prefix"):
                command.extend(["-GroupBucketPrefix", group["remote_bucket_prefix"]])
            return command

        if action in ("check_staging", "create_staging"):
            command = [
                "pwsh",
                "-NoLogo",
                "-NoProfile",
                "-File",
                script_path("Manage-GoogleStagingUser.ps1"),
                "-Action",
                "Create" if action == "create_staging" else "Check",
                "-Group",
                group["email"],
                "-StagingUser",
                group["staging_user"],
                "-GoogleAdmin",
                self.config["GoogleAdmin"],
                "-ServiceAccountFile",
                self.config["ServiceAccountFile"],
                "-PythonPath",
                self.config["PythonPath"],
            ]
            if action == "create_staging":
                command.extend(["-Execute", "-Confirm:$false"])
            org_unit = self.config.get("GoogleStagingOrgUnit", "")
            if org_unit:
                command.extend(["-OrgUnitPath", org_unit])
            return command

        if action in ("m365_direct_import", "m365_direct_test"):
            script = script_path("import_mbox_to_m365_direct.py")
            command = [
                sys.executable,
                str(script),
                "--group",
                group["email"],
                "--target-mailbox",
                group["target_mailbox"],
                "--workspace",
                str(self.config["WorkspaceRoot"]),
                "--config",
                self.config.get("_ConfigPath", to_short_path(CONFIG_PATH)),
            ]
            if action == "m365_direct_test":
                command.extend(["--limit", "10"])
            return command

        phase_by_action = {
            "prepare": "Prepare",
            "audit_staging": "AuditStage",
            "clean_google_welcome": "CleanStaging",
            "load_test": "Stage",
            "load_all": "Stage",
            "repair_dates": "Stage",
            "m365_status": "Status",
            "create_batch": "CreateBatch",
            "create_start_batch": "CreateBatch",
        }
        command = self.common_migration_command(phase_by_action[action], group)
        if action == "prepare":
            # Prepare does not accept staging or target overrides.
            command = command[: command.index("-StagingUser")]
        if action in ("clean_google_welcome", "load_test", "load_all", "repair_dates", "create_batch", "create_start_batch"):
            command.extend(["-Execute", "-Confirm:$false"])
        if action == "clean_google_welcome":
            command.append("-ApproveGoogleWelcomeRemoval")
        if action == "load_test":
            command.extend(["-Limit", "10"])
        if action == "repair_dates":
            command.extend(["-RepairInternalDateFailures", "-RepairOnly"])
        if action == "create_start_batch":
            command.append("-StartBatch")
        if group["content_conflicts"] and group["conflicts_approved"]:
            command.append("-ApproveMessageIdConflicts")
        if action in ("create_batch", "create_start_batch") and options.get(
            "approve_nonempty_target"
        ):
            command.append("-ApproveNonEmptyTarget")
        return command

    def validate_action(self, action: str, group: dict, options: dict):
        definition = ACTION_DEFINITIONS.get(action)
        if not definition:
            raise ValueError("Ação desconhecida.")
        if definition["mutating"] and options.get("confirmed") is not True:
            raise ValueError("A confirmação explícita é obrigatória.")
        if action == "discover_remote_groups":
            if not self.config.get("GoogleTakeoutBucketRoot", "").strip():
                raise ValueError("A origem Google Takeout ainda não foi configurada.")
            return
        if action in ("gcloud_login", "m365_login"):
            return
        has_local_files = any(
            f.get("state") != "missing"
            for export in group.get("backup_exports", [])
            for f in export.get("files", [])
        )
        if action == "prepare" and not has_local_files:
            raise ValueError("Baixe e registe primeiro o backup deste grupo.")
        if action in ("check_staging", "create_staging") and not group.get("prepared"):
            raise ValueError("Prepare primeiro o backup isolado deste grupo.")
        if action in ("remote_backup_inventory", "download_backup"):
            if not self.config.get("GoogleTakeoutBucketRoot", "").strip():
                raise ValueError("A origem Google Takeout ainda não foi configurada.")
            if action == "download_backup":
                selected_files = self.selected_remote_files(group, options)
                remote_objects = group.get("remote_backup", {}).get("Objects", [])
                if (
                    selected_files
                    and len(selected_files) < len(remote_objects)
                    and options.get("confirm_partial_export") is not True
                ):
                    raise ValueError(
                        "Confirme explicitamente que deseja baixar somente parte desta exportação."
                    )
            return
        if action in ("audit_staging", "clean_google_welcome", "load_test", "load_all", "m365_status", "create_batch", "create_start_batch", "m365_direct_import", "m365_direct_test") and not group["prepared"]:
            raise ValueError("Prepare o backup antes desta operação.")
        if action in ("load_test", "load_all", "repair_dates", "create_batch", "create_start_batch"):
            if group["content_conflicts"] and not group["conflicts_approved"]:
                raise ValueError("Aprove primeiro as variantes de Message-ID do manifesto.")
        if action in ("audit_staging", "clean_google_welcome", "load_test", "load_all", "repair_dates"):
            if not group.get("google_account_ready"):
                raise ValueError(
                    f"Verifique primeiro a conta exata {group['staging_user']} e confirme que o Gmail está ativo."
                )
        if action == "repair_dates" and group["verification_failed"] <= 0:
            raise ValueError("Este grupo não possui falhas de data para corrigir.")
        if action in ("load_test", "load_all") and group["verification_failed"] > 0:
            raise ValueError(
                "Corrija primeiro as mensagens que falharam na verificação."
            )
        if action == "clean_google_welcome":
            if group.get("gmail_google_welcome_messages", 0) <= 0:
                raise ValueError(
                    "Não há mensagens automáticas conhecidas do Gmail para remover."
                )
            if group.get("gmail_unknown_messages", 0) > 0:
                raise ValueError(
                    "Existem mensagens desconhecidas no Gmail temporário. A limpeza automática foi bloqueada."
                )
        if action in ("create_batch", "create_start_batch"):
            if not group.get("gmail_verified"):
                raise ValueError(
                    "Audite primeiro o Gmail temporário deste grupo; as contagens atuais ainda não foram reconciliadas."
                )
            if not group.get("exchange_checked"):
                raise ValueError(
                    f"Consulte primeiro a caixa M365 exata {group['target_mailbox']}."
                )
            if group["remaining_messages"] != 0 or group["verification_failed"] != 0:
                raise ValueError(
                    f"A carga ainda não terminou: {group['remaining_messages']} mensagem(ns) restante(s)."
                )
            target_items = group.get("target_current_items")
            if target_items not in (None, "", 0) and int(target_items) > 0:
                if options.get("approve_nonempty_target") is not True:
                    raise ValueError(
                        "A caixa M365 não está vazia. Confirme a revisão de sobreposição antes de continuar."
                    )

    def record_success(self, job: MigrationJob):
        """Persist evidence only for the exact group and endpoints just checked."""
        if job.action == "discover_remote_groups":
            return
        if job.action == "gcloud_login":
            update_connection_status(
                self.config, "Google", self.config["GoogleAdmin"], job.finished_at or utc_now()
            )
            return
        if job.action in ("m365_login", "m365_status", "sync_m365_mailboxes", "create_batch", "create_start_batch", "m365_direct_import", "m365_direct_test"):
            update_connection_status(
                self.config,
                "Microsoft365",
                self.config["ExchangeAdmin"],
                job.finished_at or utc_now(),
            )
            if job.action == "m365_login":
                return
        workspace = Path(self.config["WorkspaceRoot"]).expanduser().resolve()
        local_part = job.group.split("@", 1)[0]
        staging_user = (
            getattr(job, "staging_user", "")
            or f"migracao.{local_part}@{self.config['GoogleDomain']}"
        )
        target_mailbox = (
            getattr(job, "target_mailbox", "")
            or db_get_group_target_mailbox(self.config, job.group)
        )
        if not target_mailbox:
            prep_p = workspace / "groups" / safe_group_name(job.group) / "preparation.json"
            if prep_p.is_file():
                try:
                    target_mailbox = json.loads(prep_p.read_text(encoding="utf-8-sig")).get("TargetSharedMailbox", "").strip().lower()
                except Exception:
                    pass
        if not target_mailbox:
            target_mailbox = f"{local_part}@{self.config['M365TargetDomain']}"
        if job.action in ("check_staging", "create_staging"):
            with job.lock:
                lines = list(job.lines)
            evidence = google_evidence_from_lines(
                lines, job.group, staging_user, job.finished_at or utc_now()
            )
            if evidence:
                update_group_runtime(workspace, job.group, "Google", evidence)
            return

        if job.action in ("audit_staging", "clean_google_welcome", "load_test", "load_all", "repair_dates"):
            plan = latest_restore_plan(
                workspace,
                job.group,
                phases=("Prepare", "Stage", "CleanStaging"),
                staging_user=staging_user,
                target_mailbox=target_mailbox,
            )
            if plan:
                update_group_runtime(
                    workspace,
                    job.group,
                    "Gmail",
                    {
                        "CheckedAtUtc": plan.get("GeneratedAtUtc", ""),
                        "GroupEmail": job.group,
                        "StagingUser": staging_user,
                        "TargetMailbox": target_mailbox,
                        "CanonicalMessages": int_value(plan.get("CanonicalMessages")),
                        "VerifiedMessages": int_value(plan.get("VerifiedMessages")),
                        "RemainingMessages": int_value(plan.get("RemainingMessages")),
                        "VerificationFailed": int_value(plan.get("VerificationFailed")),
                        "Readiness": plan.get("Readiness", ""),
                        "PlanPath": plan.get("_path", ""),
                    },
                )
            return

        if job.action in ("m365_status", "create_batch", "create_start_batch"):
            plan = latest_restore_plan(
                workspace,
                job.group,
                phases=("Status", "CreateBatch"),
                staging_user=staging_user,
                target_mailbox=target_mailbox,
            )
            if plan:
                update_group_runtime(
                    workspace,
                    job.group,
                    "Exchange",
                    {
                        "CheckedAtUtc": plan.get("GeneratedAtUtc", ""),
                        "GroupEmail": job.group,
                        "StagingUser": staging_user,
                        "TargetMailbox": target_mailbox,
                        "RecipientType": plan.get("ExchangeRecipientType", ""),
                        "TargetCurrentItems": plan.get("TargetCurrentItems"),
                        "MigrationFound": plan.get("ExchangeMigrationFound"),
                        "MigrationStatus": plan.get("ExchangeMigrationStatus", ""),
                        "BatchStatus": plan.get("ExchangeBatchStatus", ""),
                        "StatusDetail": plan.get("ExchangeStatusDetail", ""),
                        "PercentageComplete": plan.get("ExchangePercentageComplete"),
                        "WorkflowStep": plan.get("ExchangeWorkflowStep", ""),
                        "SourceItems": plan.get("ExchangeSourceItems"),
                        "LastSuccessfulSyncTime": plan.get("ExchangeLastSuccessfulSyncTime", ""),
                        "ItemsSynced": plan.get("ExchangeItemsSynced"),
                        "ItemsSkipped": plan.get("ExchangeItemsSkipped"),
                        "BatchTotalCount": plan.get("ExchangeBatchTotalCount"),
                        "BatchSyncedCount": plan.get("ExchangeBatchSyncedCount"),
                        "BatchFailedCount": plan.get("ExchangeBatchFailedCount"),
                        "BytesTransferred": plan.get("ExchangeBytesTransferred", ""),
                        "ErrorSummary": plan.get("ExchangeErrorSummary", ""),
                        "BatchName": plan.get("BatchName", ""),
                        "PlanPath": plan.get("_path", ""),
                    },
                )

    def persist_receipt(self, job: MigrationJob):
        workspace = Path(self.config["WorkspaceRoot"]).expanduser().resolve()
        directory = (
            workspace / "global-jobs"
            if job.action in ("discover_remote_groups", "gcloud_login", "m365_login", "sync_m365_mailboxes")
            else workspace / "groups" / safe_group_name(job.group) / "jobs"
        )
        directory.mkdir(parents=True, exist_ok=True)
        try:
            started = datetime.fromisoformat(job.started_at.replace("Z", "+00:00"))
            finished = datetime.fromisoformat(job.finished_at.replace("Z", "+00:00"))
            duration_seconds = round((finished - started).total_seconds(), 3)
        except (AttributeError, TypeError, ValueError):
            duration_seconds = 0
        log_sha = sha256_file(job.log_path) if job.log_path.is_file() else ""
        receipt = {
            "schema_version": 1,
            "id": job.id,
            "group": job.group,
            "action": job.action,
            "title": job.title,
            "status": job.status,
            "created_at": job.created_at,
            "started_at": job.started_at,
            "finished_at": job.finished_at,
            "duration_seconds": duration_seconds,
            "exit_code": job.exit_code,
            "log_path": str(job.log_path),
            "log_sha256": log_sha,
            "error": job.error,
            "error_code": job.error_code,
        }
        filename = f"{job.created_at.replace(':', '').replace('-', '')}-{job.id}.json"
        path = directory / filename
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(path)
        # Write to SQLite — read log content for inline display
        log_content = ""
        if job.log_path.is_file():
            try:
                log_content = job.log_path.read_text(encoding="utf-8-sig", errors="replace")
            except OSError:
                pass
        db_upsert_receipt(self.config, receipt, log_content)
        if job.action == "sync_m365_mailboxes" and job.exit_code == 0:
            catalog_m365 = Path(self.config["WorkspaceRoot"]).expanduser().resolve() / "catalog" / "m365-mailboxes.json"
            if catalog_m365.is_file():
                try:
                    m_list = json.loads(catalog_m365.read_text(encoding="utf-8-sig"))
                    if isinstance(m_list, list):
                        db_upsert_m365_mailboxes(self.config, m_list)
                except Exception:
                    pass
        if job.action in ("gcloud_login", "m365_login", "check_staging", "sync_m365_mailboxes"):
            invalidate_dependency_cache()

    def start(self, action: str, group_email: str, options: dict) -> dict:
        if action in ("discover_remote_groups", "gcloud_login", "m365_login", "sync_m365_mailboxes"):
            global_labels = {
                "discover_remote_groups": "Catálogo Google",
                "gcloud_login": "Google Cloud",
                "m365_login": "Microsoft 365",
                "sync_m365_mailboxes": "Microsoft 365",
            }
            group = {"email": global_labels[action]}
        else:
            group = group_from_overview(self.config, group_email)
        self.validate_action(action, group, options)
        with self.lock:
            if self.active_job_id:
                active = self.jobs.get(self.active_job_id)
                if active and active.status in ("QUEUED", "RUNNING"):
                    raise RuntimeError(
                        f"Já existe um trabalho em curso: {active.title} para {active.group}."
                    )
            log_directory = (
                Path(self.config["WorkspaceRoot"]).expanduser().resolve() / "ui-logs"
            )
            log_directory.mkdir(parents=True, exist_ok=True)
            command = self.build_command(action, group, options)
            log_suffix = (
                safe_group_name(group["email"])
                if action in ("discover_remote_groups", "gcloud_login", "m365_login", "sync_m365_mailboxes")
                else safe_group_name(group_email)
            )
            log_path = log_directory / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{action}-{log_suffix}.log"
            job = MigrationJob(action, group, command, log_path)
            self.jobs[job.id] = job
            self.active_job_id = job.id
        threading.Thread(target=self.run, args=(job,), daemon=True).start()
        return job.public()

    def run(self, job: MigrationJob):
        job.status = "RUNNING"
        job.started_at = utc_now()
        is_exchange = job.action in (
            "m365_login",
            "m365_status",
            "sync_m365_mailboxes",
            "create_batch",
            "create_start_batch",
        )
        try:
            with job.log_path.open("w", encoding="utf-8", errors="replace") as log_handle:
                log_handle.write(
                    f"{job.started_at} | {job.title} | {job.group}\n"
                )
                log_handle.flush()

                if is_exchange:
                    worker = self.get_exchange_worker()
                    job.process = worker
                    ps_cmd = command_to_ps_line(job.command)
                    try:
                        worker.stdin.write(ps_cmd + "\n")
                        worker.stdin.flush()
                    except Exception:
                        self.stop_exchange_worker()
                        worker = self.get_exchange_worker()
                        job.process = worker
                        worker.stdin.write(ps_cmd + "\n")
                        worker.stdin.flush()

                    for line in iter(worker.stdout.readline, ""):
                        stripped = line.rstrip("\r\n")
                        if stripped.startswith("__CMD_FINISHED__:"):
                            try:
                                job.exit_code = int(stripped.split(":", 1)[1])
                            except ValueError:
                                job.exit_code = 1
                            break
                        log_handle.write(line)
                        log_handle.flush()
                        job.append(stripped)
                        if not getattr(job, "device_code", ""):
                            m = re.search(r"open the page\s+(https?://[^\s]+)\s+and enter the code\s+([A-Z0-9]+)", stripped, re.IGNORECASE)
                            if m:
                                job.device_url = m.group(1)
                                job.device_code = m.group(2)
                                try:
                                    webbrowser.open(job.device_url)
                                except Exception:
                                    pass

                    if job.exit_code is None and not job.cancel_requested:
                        job.exit_code = 1
                else:
                    interactive = sys.platform == "win32" and job.action == "gcloud_login"
                    creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0x00000010) if interactive else 0
                    stdout_target = None if interactive else subprocess.PIPE
                    stderr_target = None if interactive else subprocess.STDOUT
                    start_new_session = sys.platform != "win32"

                    process = subprocess.Popen(
                        job.command,
                        cwd=str(PROJECT_ROOT),
                        stdout=stdout_target,
                        stderr=stderr_target,
                        text=not interactive,
                        encoding="utf-8" if not interactive else None,
                        errors="replace" if not interactive else None,
                        bufsize=1 if not interactive else -1,
                        start_new_session=start_new_session,
                        creationflags=creationflags,
                    )
                    job.process = process

                    if interactive:
                        job.append("Janela interativa de autenticação aberta.")
                        job.append("Por favor, conclua o login no navegador ou na nova janela.")
                        process.wait()
                    else:
                        for line in iter(process.stdout.readline, ""):
                            log_handle.write(line)
                            log_handle.flush()
                            job.append(line)
                            if not getattr(job, "device_code", ""):
                                m = re.search(r"open the page\s+(https?://[^\s]+)\s+and enter the code\s+([A-Z0-9]+)", line, re.IGNORECASE)
                                if m:
                                    job.device_url = m.group(1)
                                    job.device_code = m.group(2)
                                    try:
                                        webbrowser.open(job.device_url)
                                    except Exception:
                                        pass
                        process.stdout.close()

                    job.exit_code = process.wait()

            if job.cancel_requested:
                job.status = "CANCELLED"
            elif job.exit_code == 0 or (
                job.action == "m365_login"
                and any("concluída com sucesso" in l.lower() for l in job.lines)
            ):
                job.exit_code = 0
                job.finished_at = utc_now()
                try:
                    self.record_success(job)
                except Exception as evidence_error:
                    job.append(
                        "AVISO: a operação terminou, mas o comprovativo local "
                        f"não pôde ser atualizado: {evidence_error}"
                    )
                job.status = "COMPLETED"
            else:
                job.status = "FAILED"
                with job.lock:
                    failure_lines = list(job.lines)
                job.error_code, job.error = classify_job_failure(
                    job.action, failure_lines, job.exit_code
                )
        except Exception as error:
            import traceback
            tb = traceback.format_exc()
            job.status = "FAILED"
            job.error_code = "INTERNAL_ERROR"
            job.error = str(error)
            job.append(f"ERRO INTERNO: {error}\n{tb}")
            try:
                with open(job.log_path, "a", encoding="utf-8") as lf:
                    lf.write(f"\nERRO INTERNO DETALHADO:\n{tb}\n")
            except Exception:
                pass
        finally:
            if not job.finished_at:
                job.finished_at = utc_now()
            job.process = None
            with self.lock:
                if self.active_job_id == job.id:
                    self.active_job_id = None
            try:
                self.persist_receipt(job)
            except Exception as receipt_error:
                job.append(
                    f"AVISO: comprovativo do trabalho não foi guardado: {receipt_error}"
                )

    def get(self, job_id: str) -> dict:
        with self.lock:
            job = self.jobs.get(job_id)
        if not job:
            raise ValueError("Trabalho não encontrado.")
        return job.public()

    def list(self) -> list[dict]:
        with self.lock:
            jobs = list(self.jobs.values())
        jobs.sort(key=lambda item: item.created_at, reverse=True)
        return [job.public() for job in jobs[:20]]

    def cancel(self, job_id: str) -> dict:
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                raise ValueError("Trabalho não encontrado.")
            if job.status not in ("QUEUED", "RUNNING"):
                return job.public()
            job.cancel_requested = True
            job.status = "CANCELLED"
            job.finished_at = utc_now()
            job.error = "Operação cancelada pelo utilizador."
            job.error_code = "CANCELLED"
            if self.active_job_id == job.id:
                self.active_job_id = None

        is_exchange = job.action in (
            "m365_login",
            "m365_status",
            "sync_m365_mailboxes",
            "create_batch",
            "create_start_batch",
        )
        if is_exchange:
            self.stop_exchange_worker()
        else:
            process = job.process
            if process and process.poll() is None:
                if sys.platform == "win32":
                    try:
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                            capture_output=True,
                            check=False,
                        )
                    except Exception:
                        pass
                else:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except Exception:
                        pass
                try:
                    process.terminate()
                except Exception:
                    pass

        try:
            self.persist_receipt(job)
        except Exception:
            pass
        return job.public()

    def shutdown(self):
        with self.lock:
            active_id = self.active_job_id
        if not active_id:
            return
        self.cancel(active_id)
        with self.lock:
            job = self.jobs.get(active_id)
        process = job.process if job else None
        if process and process.poll() is None:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass


class MigrationServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, handler, session_token: str, config: dict):
        super().__init__(address, handler)
        self.session_token = session_token
        self.config = config
        self.jobs = JobManager(config)


class Handler(BaseHTTPRequestHandler):
    server: MigrationServer

    def log_message(self, format, *args):
        return

    def security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' data: https://fonts.gstatic.com; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'",
        )

    def json_response(self, payload, status=HTTPStatus.OK):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.security_headers()
        self.end_headers()
        self.wfile.write(encoded)

    def authorized(self) -> bool:
        return secrets.compare_digest(
            self.headers.get("X-Migration-Token", ""), self.server.session_token
        )

    def request_origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        expected = f"http://127.0.0.1:{self.server.server_address[1]}"
        return origin == expected

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 65536:
            raise ValueError("Corpo da solicitação inválido.")
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0]
        if content_type != "application/json":
            raise ValueError("O painel aceita apenas solicitações JSON.")
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Solicitação JSON inválida.")
        return payload

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            return self.json_response({"status": "ok", "local_only": True})
        if parsed.path == "/api/overview":
            if not self.authorized():
                return self.json_response(
                    {"error": "Sessão local inválida."}, HTTPStatus.UNAUTHORIZED
                )
            query_params = parse_qs(parsed.query)
            req_group = query_params.get("group", [""])[0]
            return self.json_response(build_group_overview(self.server.config, detailed_email=req_group))
        if parsed.path == "/api/jobs":
            if not self.authorized():
                return self.json_response(
                    {"error": "Sessão local inválida."}, HTTPStatus.UNAUTHORIZED
                )
            return self.json_response({"jobs": self.server.jobs.list()})
        if parsed.path == "/api/m365/mailboxes":
            if not self.authorized():
                return self.json_response(
                    {"error": "Sessão local inválida."}, HTTPStatus.UNAUTHORIZED
                )
            return self.json_response({"mailboxes": db_get_m365_mailboxes(self.server.config)})
        group_details_match = re.fullmatch(r"/api/groups/([^/]+)/details", parsed.path)
        if group_details_match:
            if not self.authorized():
                return self.json_response(
                    {"error": "Sessão local inválida."}, HTTPStatus.UNAUTHORIZED
                )
            email = unquote(group_details_match.group(1)).strip().lower()
            return self.json_response(build_group_details(self.server.config, email))
        log_match = re.fullmatch(r"/api/jobs/([a-f0-9]{12})/log", parsed.path)
        if log_match:
            if not self.authorized():
                return self.json_response(
                    {"error": "Sessão local inválida."}, HTTPStatus.UNAUTHORIZED
                )
            jid = log_match.group(1)
            content = db_read_job_log(self.server.config, jid)
            if content is None:
                try:
                    conn = open_db(self.server.config)
                    row = conn.execute(
                        "SELECT log_path FROM job_receipts WHERE id=?",
                        (jid,)
                    ).fetchone()
                    conn.close()
                    if row and row[0]:
                        lp = Path(row[0])
                        if lp.is_file():
                            content = lp.read_text(encoding="utf-8-sig", errors="replace")
                except Exception:
                    pass
            if content is None:
                with self.server.jobs.lock:
                    active = self.server.jobs.jobs.get(jid)
                    if active:
                        with active.lock:
                            content = "\n".join(active.lines)
            if content is None:
                return self.json_response({"error": "Log não disponível."}, HTTPStatus.NOT_FOUND)
            meta = {}
            try:
                conn = open_db(self.server.config)
                row = conn.execute(
                    "SELECT title, status, action, group_email, created_at, finished_at, duration_seconds, exit_code, error FROM job_receipts WHERE id=?",
                    (jid,)
                ).fetchone()
                conn.close()
                if row:
                    meta = {
                        "id": jid,
                        "title": row[0], "status": row[1], "action": row[2],
                        "group": row[3], "created_at": row[4], "finished_at": row[5],
                        "duration_seconds": row[6], "exit_code": row[7], "error": row[8],
                        "content": content,
                    }
                else:
                    meta = {"id": jid, "content": content}
            except Exception:
                meta = {"id": jid, "content": content}
            return self.json_response(meta)
        job_match = re.fullmatch(r"/api/jobs/([a-f0-9]{12})", parsed.path)
        if job_match:
            if not self.authorized():
                return self.json_response(
                    {"error": "Sessão local inválida."}, HTTPStatus.UNAUTHORIZED
                )
            try:
                return self.json_response(self.server.jobs.get(job_match.group(1)))
            except ValueError as error:
                return self.json_response({"error": str(error)}, HTTPStatus.NOT_FOUND)
        return self.serve_static(parsed.path)

    def do_POST(self):
        if not self.authorized() or not self.request_origin_allowed():
            return self.json_response(
                {"error": "Solicitação local não autorizada."}, HTTPStatus.UNAUTHORIZED
            )
        parsed = urlparse(self.path)
        try:
            payload = self.read_json_body()
            if parsed.path == "/api/jobs":
                job = self.server.jobs.start(
                    str(payload.get("action", "")),
                    str(payload.get("group", "")),
                    payload.get("options", {})
                    if isinstance(payload.get("options", {}), dict)
                    else {},
                )
                return self.json_response(job, HTTPStatus.ACCEPTED)
            log_match = re.fullmatch(
                r"/api/jobs/([a-f0-9]{12})/log", parsed.path
            )
            if log_match:
                jid = log_match.group(1)
                # Try DB first
                content = db_read_job_log(self.server.config, jid)
                if content is None:
                    # Fall back to log file on disk (for old receipts)
                    try:
                        conn = open_db(self.server.config)
                        row = conn.execute(
                            "SELECT log_path, title, status, action, group_email, created_at, finished_at, duration_seconds, exit_code, error FROM job_receipts WHERE id=?",
                            (jid,)
                        ).fetchone()
                        conn.close()
                        if row and row[0]:
                            lp = Path(row[0])
                            if lp.is_file():
                                content = lp.read_text(encoding="utf-8-sig", errors="replace")
                    except Exception:
                        pass
                if content is None:
                    return self.json_response({"error": "Log não disponível."}, HTTPStatus.NOT_FOUND)
                # Fetch metadata
                meta = {}
                try:
                    conn = open_db(self.server.config)
                    row = conn.execute(
                        "SELECT title, status, action, group_email, created_at, finished_at, duration_seconds, exit_code, error FROM job_receipts WHERE id=?",
                        (jid,)
                    ).fetchone()
                    conn.close()
                    if row:
                        meta = {
                            "id": jid,
                            "title": row[0], "status": row[1], "action": row[2],
                            "group": row[3], "created_at": row[4], "finished_at": row[5],
                            "duration_seconds": row[6], "exit_code": row[7], "error": row[8],
                            "content": content,
                        }
                    else:
                        meta = {"id": jid, "content": content}
                except Exception:
                    meta = {"id": jid, "content": content}
                return self.json_response(meta)
            cancel_match = re.fullmatch(
                r"/api/jobs/([a-f0-9]{12})/cancel", parsed.path
            )
            if cancel_match:
                if payload.get("confirmed") is not True:
                    raise ValueError("Confirme o cancelamento do trabalho.")
                return self.json_response(
                    self.server.jobs.cancel(cancel_match.group(1))
                )
            target_match = re.fullmatch(r"/api/groups/([^/]+)/target-mailbox", parsed.path)
            if target_match:
                group_email = unquote(target_match.group(1)).strip().lower()
                new_target = str(payload.get("target_mailbox", "")).strip().lower()
                if not EMAIL_PATTERN.fullmatch(new_target):
                    return self.json_response(
                        {"error": f"Endereço de destino inválido: '{new_target}'"},
                        HTTPStatus.BAD_REQUEST,
                    )
                db_set_group_target_mailbox(self.server.config, group_email, new_target)
                update_group_preparation_target_mailbox(self.server.config, group_email, new_target)
                overview = build_group_overview(self.server.config)
                return self.json_response({
                    "status": "OK",
                    "group": group_email,
                    "target_mailbox": new_target,
                    "overview": overview,
                })
            if parsed.path == "/api/conflicts/approve":
                if payload.get("confirmed") is not True:
                    raise ValueError("Confirme a conservação das variantes.")
                result = create_conflict_approval(
                    self.server.config, str(payload.get("group", "")).lower()
                )
                return self.json_response(result)
            if parsed.path == "/api/artifacts/content":
                result = get_artifact_content(
                    self.server.config,
                    str(payload.get("group", "")).lower(),
                    str(payload.get("path", "")),
                )
                return self.json_response(result)
            if parsed.path == "/api/artifacts/reveal":
                result = reveal_group_artifact(
                    self.server.config,
                    str(payload.get("group", "")).lower(),
                    str(payload.get("path", "")),
                )
                return self.json_response(result)
            return self.json_response(
                {"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND
            )
        except RuntimeError as error:
            return self.json_response({"error": str(error)}, HTTPStatus.CONFLICT)
        except (ValueError, json.JSONDecodeError) as error:
            return self.json_response({"error": str(error)}, HTTPStatus.BAD_REQUEST)

    def serve_static(self, request_path: str):
        relative = "index.html" if request_path in ("", "/") else request_path.lstrip("/")
        candidate = (STATIC_ROOT / relative).resolve()
        if STATIC_ROOT.resolve() not in candidate.parents and candidate != STATIC_ROOT.resolve():
            return self.send_error(HTTPStatus.NOT_FOUND)
        if not candidate.is_file():
            candidate = STATIC_ROOT / "index.html"
        content = candidate.read_bytes()
        if candidate.name == "index.html":
            html_text = content.decode("utf-8", errors="replace")
            script_tag = f'<script>window.__MIGRATION_TOKEN__ = "{self.server.session_token}";</script>'
            if "</head>" in html_text:
                html_text = html_text.replace("</head>", f"    {script_tag}\n  </head>", 1)
            elif "<head>" in html_text:
                html_text = html_text.replace("<head>", f"<head>\n    {script_tag}", 1)
            content = html_text.encode("utf-8")
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.security_headers()
        self.end_headers()
        self.wfile.write(content)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    config = load_config()
    try:
        init_db(config)
    except Exception as db_err:
        print(f"[AVISO] Não foi possível inicializar a base de dados: {db_err}", flush=True)
    token = get_or_create_session_token(config)
    try:
        init_db(config)
    except Exception as db_err:
        print(f"[AVISO] Não foi possível inicializar a base de dados: {db_err}", flush=True)
    try:
        server = MigrationServer(("127.0.0.1", args.port), Handler, token, config)
    except OSError:
        server = MigrationServer(("127.0.0.1", 0), Handler, token, config)
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/?token={token}"
    print("Painel local de migração iniciado.", flush=True)
    print(f"Endereço: {url}", flush=True)
    print("Pressione Control+C nesta janela para encerrar.", flush=True)
    if args.open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.jobs.shutdown()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
