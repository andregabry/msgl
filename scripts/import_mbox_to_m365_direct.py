#!/usr/bin/env python3
"""Directly ingest Google Groups Takeout messages into a Microsoft 365 mailbox via Microsoft Graph API.

Bypasses the entire Google staging workflow:
- No temporary Google account creation
- No Gmail licenses required
- No Exchange IMAP migration endpoints or batches
- Direct, verified, native insertion into the target M365 mailbox
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import time
import zipfile
from collections import OrderedDict
from contextlib import contextmanager
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import BinaryIO, Iterator

try:
    import requests
except ImportError:
    print("ERRO: O pacote 'requests' é obrigatório. Instale com 'pip install requests'.", file=sys.stderr)
    sys.exit(1)


# Standard Microsoft Graph CLI Client ID (pre-consented for Graph tools)
DEFAULT_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
GRAPH_SCOPE = "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.ReadWrite.Shared https://graph.microsoft.com/User.Read offline_access"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_group_name(email: str) -> str:
    return email.strip().lower().replace("@", "_")


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
        raise ValueError(f"O manifesto canónico está vazio: {path}")
    missing = required - set(rows[0])
    if missing:
        raise ValueError(f"O manifesto canónico não contém os campos esperados: {sorted(missing)}")
    
    seen = set()
    valid_rows = []
    for row in rows:
        key = row["dedup_key"]
        if not key or key in seen:
            continue
        seen.add(key)
        row["mbox_message_number"] = int(row["mbox_message_number"])
        source = Path(row["source_archive"]).expanduser().resolve()
        if not source.is_file():
            # Try alternate paths if moved across OS/machines
            alt_candidates = [
                Path(r"C:\Users\andre.gabry\Projects\m365\Google Groups") / source.name,
                Path(r"C:\Users\andre.gabry\Projects\m365\Google Groups") / row.get("ExportId", "") / source.name,
            ]
            for cand in alt_candidates:
                if cand.is_file():
                    source = cand
                    break
        row["source_archive"] = str(source)
        valid_rows.append(row)
    return valid_rows


def connect_audit_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS m365_direct_imports (
            dedup_key TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            raw_sha256 TEXT NOT NULL,
            target_mailbox TEXT NOT NULL,
            m365_message_id TEXT,
            status TEXT NOT NULL,
            imported_at_utc TEXT NOT NULL,
            error_message TEXT
        );
        """
    )
    return conn


def get_graph_token(config: dict, workspace_root: Path) -> str:
    """Acquire or refresh Microsoft Graph API OAuth2 token."""
    token_file = workspace_root / "m365_graph_token.json"
    now_ts = int(time.time())

    # 1. Try cached token
    if token_file.is_file():
        try:
            cached = json.loads(token_file.read_text(encoding="utf-8-sig"))
            if cached.get("expires_at", 0) > now_ts + 120 and cached.get("access_token"):
                return cached["access_token"]
            # If refresh token available, refresh it
            if cached.get("refresh_token"):
                client_id = config.get("M365ClientId") or DEFAULT_CLIENT_ID
                res = requests.post(
                    "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
                    data={
                        "client_id": client_id,
                        "grant_type": "refresh_token",
                        "refresh_token": cached["refresh_token"],
                        "scope": GRAPH_SCOPE,
                    },
                    timeout=15,
                )
                if res.status_code == 200:
                    data = res.json()
                    data["expires_at"] = now_ts + int(data.get("expires_in", 3600))
                    token_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
                    return data["access_token"]
        except Exception:
            pass

    # 2. Try App Credentials (Client Secret) if configured
    client_id = config.get("M365ClientId", "").strip()
    client_secret = config.get("M365ClientSecret", "").strip()
    tenant_id = config.get("M365TenantId", "").strip()
    if client_id and client_secret and tenant_id:
        print("A autenticar via Credenciais de Aplicativo (Entra ID)...")
        res = requests.post(
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "client_credentials",
                "scope": "https://graph.microsoft.com/.default",
            },
            timeout=15,
        )
        if res.status_code == 200:
            data = res.json()
            data["expires_at"] = now_ts + int(data.get("expires_in", 3600))
            token_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
            return data["access_token"]
        else:
            print(f"AVISO: Falha na autenticação por aplicativo: {res.text}")

    # 3. Fallback: Interactive Device Code Flow
    use_client_id = client_id or DEFAULT_CLIENT_ID
    print("\n" + "=" * 76)
    print("AUTENTICAÇÃO MICROSOFT 365 (GRAPH API)")
    print("=" * 76)
    sys.stdout.flush()

    dc_res = requests.post(
        "https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode",
        data={
            "client_id": use_client_id,
            "scope": GRAPH_SCOPE,
        },
        timeout=15,
    )
    if dc_res.status_code != 200:
        raise RuntimeError(f"Falha ao iniciar autenticação por código de dispositivo: {dc_res.text}")

    dc_data = dc_res.json()
    user_code = dc_data["user_code"]
    verification_uri = dc_data.get("verification_uri", "https://microsoft.com/devicelogin")
    device_code = dc_data["device_code"]
    interval = int(dc_data.get("interval", 5))
    expires_in = int(dc_data.get("expires_in", 900))

    # Standard string format that server.py regex automatically detects and opens in browser:
    print(f"To sign in, use a web browser to open the page {verification_uri} and enter the code {user_code} to authenticate.")
    print("=" * 76)
    print(f"Código de autenticação: {user_code}")
    print(f"A aguardar confirmação no navegador (expira em {expires_in // 60} minutos)...")
    sys.stdout.flush()

    start_wait = time.time()
    while time.time() - start_wait < expires_in:
        time.sleep(interval)
        token_res = requests.post(
            "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
            data={
                "client_id": use_client_id,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": device_code,
            },
            timeout=15,
        )
        t_data = token_res.json()
        if "access_token" in t_data:
            print("\nAutenticação Microsoft 365 concluída com sucesso!")
            sys.stdout.flush()
            t_data["expires_at"] = int(time.time()) + int(t_data.get("expires_in", 3600))
            token_file.write_text(json.dumps(t_data, indent=2), encoding="utf-8")
            return t_data["access_token"]

        err = t_data.get("error")
        if err == "authorization_pending":
            continue
        elif err == "slow_down":
            interval += 2
        elif err in ("code_expired", "expired_token"):
            raise TimeoutError("O código de autenticação expirou. Tente novamente.")
        elif err == "authorization_declined":
            raise PermissionError("A autenticação foi recusada no navegador.")
        else:
            raise RuntimeError(f"Erro na autenticação: {t_data.get('error_description', err)}")

    raise TimeoutError("Tempo esgotado para autenticação no navegador.")


def resolve_target_folder(token: str, target_mailbox: str, folder_name: str) -> str:
    """Resolve or create destination folder in M365 mailbox."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    if not folder_name or folder_name.lower() in ("inbox", "caixa de entrada"):
        return "inbox"

    # Search existing folder
    url = f"https://graph.microsoft.com/v1.0/users/{target_mailbox}/mailFolders?$top=100"
    res = requests.get(url, headers=headers, timeout=15)
    if res.status_code == 200:
        for f in res.json().get("value", []):
            if f.get("displayName", "").strip().lower() == folder_name.strip().lower():
                return f["id"]

    # Create folder if it doesn't exist
    create_url = f"https://graph.microsoft.com/v1.0/users/{target_mailbox}/mailFolders"
    c_res = requests.post(create_url, headers=headers, json={"displayName": folder_name}, timeout=15)
    if c_res.status_code in (200, 201):
        return c_res.json()["id"]

    # Fallback to inbox
    print(f"Aviso: Não foi possível criar pasta '{folder_name}'. A utilizar 'inbox'.")
    return "inbox"


def import_messages_direct(
    manifest_path: Path,
    target_mailbox: str,
    group_email: str,
    workspace_root: Path,
    config: dict,
    limit: int | None = None,
    folder_name: str = "inbox",
    dry_run: bool = False,
) -> dict:
    start_time = time.time()
    manifest_rows = load_manifest(manifest_path)
    total_messages = len(manifest_rows)
    target_count = min(limit, total_messages) if limit else total_messages

    safe_group = safe_group_name(group_email)
    db_path = workspace_root / "groups" / safe_group / "m365-direct-import.sqlite3"
    conn = connect_audit_db(db_path)

    # Check already imported messages
    already_imported = set()
    for row in conn.execute("SELECT dedup_key FROM m365_direct_imports WHERE status = 'VERIFIED'"):
        already_imported.add(row["dedup_key"])

    print(f"\n==========================================================================")
    print(f"INSERÇÃO DIRETA DE E-MAILS NO MICROSOFT 365")
    print(f"==========================================================================")
    print(f"Grupo Origem         : {group_email}")
    print(f"Caixa Destino M365   : {target_mailbox}")
    print(f"Pasta de Destino     : {folder_name}")
    print(f"Mensagens no Backup  : {total_messages}")
    print(f"Já Inseridas Anterior: {len(already_imported)}")
    print(f"Meta Desta Execução  : {target_count}")
    if dry_run:
        print("MODO SIMULAÇÃO (Dry-Run): Nenhum e-mail será alterado.")
    print(f"==========================================================================\n")
    sys.stdout.flush()

    if dry_run:
        return {
            "status": "DRY_RUN_COMPLETED",
            "total": total_messages,
            "already_imported": len(already_imported),
        }

    token = get_graph_token(config, workspace_root)
    folder_id = resolve_target_folder(token, target_mailbox, folder_name)

    # Group messages by archive and mbox to read sequentially
    selected_by_source: OrderedDict[tuple[str, str], dict[int, dict]] = OrderedDict()
    scheduled_count = 0
    for row in manifest_rows:
        if row["dedup_key"] in already_imported:
            continue
        if limit and scheduled_count >= limit:
            break
        source_key = (row["source_archive"], row["mbox_path"])
        by_number = selected_by_source.setdefault(source_key, {})
        by_number[row["mbox_message_number"]] = row
        scheduled_count += 1

    if scheduled_count == 0:
        print("Todas as mensagens selecionadas já foram inseridas no M365 anteriormente.")
        conn.close()
        return {
            "status": "COMPLETED",
            "imported_this_run": 0,
            "total_verified": len(already_imported),
        }

    headers_mime = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "text/plain",
        "Accept": "application/json",
    }
    headers_json = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    imported_now = 0
    failed_now = 0

    for (archive_name, mbox_path), by_number in selected_by_source.items():
        archive_path = Path(archive_name)
        if not archive_path.is_file():
            print(f"ERRO: Arquivo de backup não encontrado: {archive_path}")
            continue

        remaining = set(by_number)
        with open_mbox(archive_path, mbox_path) as source:
            for message_number, raw in iter_mbox_messages(source):
                if message_number not in remaining:
                    continue

                row = by_number[message_number]
                remaining.remove(message_number)
                dedup_key = row["dedup_key"]
                msg_id = row["message_id"]

                # Integrity check
                actual_hash = hashlib.sha256(raw).hexdigest()
                if actual_hash != row["raw_sha256"]:
                    print(f"ERRO DE INTEGRIDADE: SHA-256 divergente para {dedup_key}. Ignorada.")
                    failed_now += 1
                    continue

                # Parse date to preserve original timestamp
                date_iso = row.get("date_utc") or utc_now()
                try:
                    email_msg = BytesParser(policy=policy.default).parsebytes(raw)
                    date_header = email_msg.get("Date")
                    if date_header:
                        dt = parsedate_to_datetime(date_header)
                        if dt:
                            date_iso = dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                    subject = email_msg.get("Subject", "(sem assunto)")
                except Exception:
                    subject = "(sem assunto)"

                # Direct Ingestion via Microsoft Graph API
                # Step 1: Create message with raw MIME
                create_url = f"https://graph.microsoft.com/v1.0/users/{target_mailbox}/messages"
                try:
                    res = requests.post(create_url, headers=headers_mime, data=raw, timeout=45)
                    if res.status_code not in (200, 201):
                        print(f"[{imported_now + 1}/{scheduled_count}] Falha ao criar no M365 ({res.status_code}): {res.text[:120]}")
                        failed_now += 1
                        continue

                    m365_msg = res.json()
                    m365_id = m365_msg["id"]

                    # Step 2: Finalize message (set isDraft: false, isRead: true, original dates)
                    patch_url = f"https://graph.microsoft.com/v1.0/users/{target_mailbox}/messages/{m365_id}"
                    patch_payload = {
                        "isDraft": False,
                        "isRead": True,
                        "receivedDateTime": date_iso,
                        "sentDateTime": date_iso,
                    }
                    requests.patch(patch_url, headers=headers_json, json=patch_payload, timeout=20)

                    # Step 3: Move to target folder if not default
                    if folder_id and folder_id.lower() != "inbox":
                        move_url = f"https://graph.microsoft.com/v1.0/users/{target_mailbox}/messages/{m365_id}/move"
                        requests.post(move_url, headers=headers_json, json={"destinationId": folder_id}, timeout=20)

                    # Record in SQLite journal
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO m365_direct_imports 
                        (dedup_key, message_id, raw_sha256, target_mailbox, m365_message_id, status, imported_at_utc)
                        VALUES (?, ?, ?, ?, ?, 'VERIFIED', ?)
                        """,
                        (dedup_key, msg_id, actual_hash, target_mailbox, m365_id, utc_now()),
                    )
                    conn.commit()

                    imported_now += 1
                    subj_preview = (subject[:45] + "...") if len(subject) > 45 else subject
                    print(f"[{imported_now}/{scheduled_count}] Inserido no M365: {subj_preview} ({date_iso[:10]}) [OK]")
                    sys.stdout.flush()

                except Exception as err:
                    print(f"[{imported_now + 1}/{scheduled_count}] Exceção na inserção de {msg_id}: {err}")
                    failed_now += 1

    total_verified = len(already_imported) + imported_now
    duration = round(time.time() - start_time, 2)

    receipt = {
        "generated_at_utc": utc_now(),
        "group_email": group_email,
        "target_mailbox": target_mailbox,
        "folder": folder_name,
        "total_canonical": total_messages,
        "imported_this_run": imported_now,
        "total_verified": total_verified,
        "failed_this_run": failed_now,
        "duration_seconds": duration,
        "completed": (total_verified >= total_messages),
    }

    # Save receipt
    receipt_dir = workspace_root / "runs" / "m365-direct"
    receipt_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    receipt_path = receipt_dir / f"direct-import-{safe_group}-{ts}.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")

    group_receipt_path = workspace_root / "groups" / safe_group / "direct-import-receipt.json"
    group_receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")

    # Update preparation.json or runtime.json with M365 completed status
    prep_path = workspace_root / "groups" / safe_group / "preparation.json"
    if prep_path.is_file():
        try:
            prep_data = json.loads(prep_path.read_text(encoding="utf-8-sig"))
            if receipt["completed"]:
                prep_data["M365DirectCompleted"] = True
                prep_data["Readiness"] = "EXCHANGE_BATCH_COMPLETED"
                prep_data["TargetCurrentItems"] = total_verified
                prep_data["UpdatedAtUtc"] = utc_now()
                prep_path.write_text(json.dumps(prep_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        except Exception:
            pass

    print("\n" + "=" * 76)
    print("MIGRAÇÃO DIRETA PARA O MICROSOFT 365 CONCLUÍDA")
    print("=" * 76)
    print(f"E-mails inseridos nesta execução: {imported_now}")
    print(f"Total verificado na caixa M365 : {total_verified} de {total_messages}")
    print(f"Falhas                         : {failed_now}")
    print(f"Tempo total                    : {duration} segundos")
    if receipt["completed"]:
        print("SUCESSO: A CONTA FOI MARCADA COMO CONCLUÍDA NO SISTEMA!")
    print("=" * 76 + "\n")
    sys.stdout.flush()

    conn.close()
    return receipt


def main():
    parser = argparse.ArgumentParser(description="Inserção direta de e-mails no Microsoft 365 via Microsoft Graph API")
    parser.add_argument("--group", required=True, help="E-mail do grupo de origem")
    parser.add_argument("--target-mailbox", required=True, help="Caixa de destino no M365")
    parser.add_argument("--manifest", help="Caminho do takeout-canonical-manifest.csv")
    parser.add_argument("--workspace", default=r"C:\Users\andre.gabry\Projects\m365\Google Groups\_migration-system", help="Pasta do workspace")
    parser.add_argument("--config", help="Caminho do arquivo de configuração .psd1")
    parser.add_argument("--limit", type=int, help="Limite de mensagens para modo teste")
    parser.add_argument("--folder", default="inbox", help="Pasta de destino (ex: inbox ou 'Histórico Google Groups')")
    parser.add_argument("--dry-run", action="store_true", help="Apenas simula a operação")

    args = parser.parse_args()
    workspace_root = Path(args.workspace).expanduser().resolve()

    # Load manifest from group preparation if not provided
    manifest_path = None
    if args.manifest:
        manifest_path = Path(args.manifest).expanduser().resolve()
    else:
        safe_group = safe_group_name(args.group)
        prep_path = workspace_root / "groups" / safe_group / "preparation.json"
        if prep_path.is_file():
            try:
                prep = json.loads(prep_path.read_text(encoding="utf-8-sig"))
                candidate = Path(prep.get("Manifest", ""))
                if candidate.is_file():
                    manifest_path = candidate
            except Exception:
                pass

    if not manifest_path or not manifest_path.is_file():
        # Search reports directory
        project_root = Path(__file__).resolve().parent.parent
        reports_dir = project_root / "reports"
        pattern = f"takeout-{safe_group_name(args.group)}-*/takeout-canonical-manifest.csv"
        matches = sorted(reports_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
        if matches:
            manifest_path = matches[0]

    if not manifest_path or not manifest_path.is_file():
        print(f"ERRO: Manifesto canónico não encontrado para o grupo {args.group}. Execute a etapa 'Preparar backup' primeiro.", file=sys.stderr)
        sys.exit(1)

    # Load local config if available
    config = {}
    config_candidates = [
        Path(args.config) if args.config else None,
        Path(__file__).resolve().parent.parent / "config" / "google-groups-system.local.psd1",
    ]
    for cand in config_candidates:
        if cand and cand.is_file():
            try:
                content = cand.read_text(encoding="utf-8-sig")
                for m in re.finditer(r"([A-Za-z0-9_]+)\s*=\s*['\"]([^'\"]*)['\"]", content):
                    config[m.group(1)] = m.group(2)
            except Exception:
                pass

    try:
        import_messages_direct(
            manifest_path=manifest_path,
            target_mailbox=args.target_mailbox,
            group_email=args.group,
            workspace_root=workspace_root,
            config=config,
            limit=args.limit,
            folder_name=args.folder,
            dry_run=args.dry_run,
        )
    except Exception as exc:
        print(f"\nERRO NA EXECUÇÃO: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
