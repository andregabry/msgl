#!/usr/bin/env python3
"""Create a read-only Google Workspace Groups and members inventory."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


SCOPES = [
    "https://www.googleapis.com/auth/admin.directory.group.readonly",
    "https://www.googleapis.com/auth/admin.directory.group.member.readonly",
]

GROUP_FIELDS = [
    "email",
    "name",
    "description",
    "id",
    "admin_created",
    "direct_members_count",
    "aliases",
    "non_editable_aliases",
]

MEMBER_FIELDS = [
    "group_email",
    "member_email",
    "member_id",
    "role",
    "type",
    "status",
    "delivery_settings",
]


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def list_groups(directory, domain: str) -> list[dict]:
    groups: list[dict] = []
    page_token = None
    while True:
        response = (
            directory.groups()
            .list(
                customer="my_customer",
                domain=domain,
                maxResults=200,
                pageToken=page_token,
            )
            .execute()
        )
        groups.extend(response.get("groups", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return sorted(groups, key=lambda item: item.get("email", "").lower())


def list_members(directory, group_email: str) -> list[dict]:
    members: list[dict] = []
    page_token = None
    while True:
        response = (
            directory.members()
            .list(groupKey=group_email, maxResults=200, pageToken=page_token)
            .execute()
        )
        members.extend(response.get("members", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return members


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service-account-file", required=True)
    parser.add_argument("--admin-user", required=True)
    parser.add_argument("--domain", required=True)
    parser.add_argument("--groups-output", required=True)
    parser.add_argument("--members-output", required=True)
    args = parser.parse_args()

    service_account_file = Path(args.service_account_file).expanduser().resolve()
    if not service_account_file.is_file():
        raise FileNotFoundError(f"Service account key not found: {service_account_file}")

    credentials = service_account.Credentials.from_service_account_file(
        service_account_file, scopes=SCOPES
    ).with_subject(args.admin_user.strip().lower())
    directory = build(
        "admin", "directory_v1", credentials=credentials, cache_discovery=False
    )

    raw_groups = list_groups(directory, args.domain.strip().lower())
    group_rows: list[dict] = []
    member_rows: list[dict] = []
    member_errors: list[dict] = []

    for raw_group in raw_groups:
        group_email = raw_group.get("email", "").lower()
        group_rows.append(
            {
                "email": group_email,
                "name": raw_group.get("name", ""),
                "description": raw_group.get("description", ""),
                "id": raw_group.get("id", ""),
                "admin_created": raw_group.get("adminCreated", False),
                "direct_members_count": raw_group.get("directMembersCount", ""),
                "aliases": ";".join(raw_group.get("aliases", [])),
                "non_editable_aliases": ";".join(
                    raw_group.get("nonEditableAliases", [])
                ),
            }
        )
        try:
            raw_members = list_members(directory, group_email)
        except HttpError as error:
            member_errors.append(
                {
                    "group_email": group_email,
                    "status": getattr(error.resp, "status", None),
                    "error": str(error),
                }
            )
            continue
        for member in raw_members:
            member_rows.append(
                {
                    "group_email": group_email,
                    "member_email": member.get("email", "").lower(),
                    "member_id": member.get("id", ""),
                    "role": member.get("role", ""),
                    "type": member.get("type", ""),
                    "status": member.get("status", ""),
                    "delivery_settings": member.get("delivery_settings", ""),
                }
            )

    groups_output = Path(args.groups_output).expanduser().resolve()
    members_output = Path(args.members_output).expanduser().resolve()
    write_csv(groups_output, GROUP_FIELDS, group_rows)
    write_csv(members_output, MEMBER_FIELDS, member_rows)

    summary = {
        "generated_at_utc": datetime.now(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "domain": args.domain.strip().lower(),
        "admin_user": args.admin_user.strip().lower(),
        "groups": len(group_rows),
        "members": len(member_rows),
        "member_errors": member_errors,
        "groups_output": str(groups_output),
        "members_output": str(members_output),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not member_errors else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
