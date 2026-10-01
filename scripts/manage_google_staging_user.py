#!/usr/bin/env python3
"""Check or create a dedicated Google Workspace staging user.

The script uses the existing service account with domain-wide delegation.  It
never assigns a license: licensing remains an explicit Google Admin Console
step.  New users receive a random password that is not printed or persisted,
because the migration accesses Gmail through delegated APIs instead of an
interactive user login.
"""

from __future__ import annotations

import argparse
import json
import re
import secrets
import sys
from pathlib import Path


DIRECTORY_USER_SCOPE = "https://www.googleapis.com/auth/admin.directory.user"
EMAIL_PATTERN = re.compile(
    r"^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$"
)


def normalize_email(value: str, field_name: str) -> str:
    email = value.strip().lower()
    if not EMAIL_PATTERN.fullmatch(email):
        raise ValueError(f"Invalid {field_name}: {value!r}")
    return email


def build_directory(service_account_file: Path, admin_user: str):
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as error:
        raise RuntimeError(
            "Google API libraries are unavailable. Use the project's Python "
            "virtual environment."
        ) from error

    credentials = service_account.Credentials.from_service_account_file(
        str(service_account_file), scopes=[DIRECTORY_USER_SCOPE]
    ).with_subject(admin_user)
    return build("admin", "directory_v1", credentials=credentials, cache_discovery=False)


def public_user(user: dict, status: str) -> dict:
    return {
        "status": status,
        "primary_email": str(user.get("primaryEmail", "")).lower(),
        "id": user.get("id", ""),
        "org_unit_path": user.get("orgUnitPath", ""),
        "suspended": bool(user.get("suspended", False)),
        "archived": bool(user.get("archived", False)),
        "is_admin": bool(user.get("isAdmin", False)),
        "is_mailbox_setup": bool(user.get("isMailboxSetup", False)),
    }


def get_user(directory, user_email: str) -> dict | None:
    from googleapiclient.errors import HttpError

    try:
        return directory.users().get(userKey=user_email).execute()
    except HttpError as error:
        if getattr(error.resp, "status", None) == 404:
            return None
        raise


def create_body(user_email: str, group_email: str, org_unit_path: str) -> dict:
    group_local = group_email.split("@", 1)[0]
    body = {
        "primaryEmail": user_email,
        "password": secrets.token_urlsafe(36),
        "changePasswordAtNextLogin": False,
        "name": {
            "givenName": "Migracao",
            "familyName": f"Google Group {group_local}",
        },
    }
    if org_unit_path:
        if not org_unit_path.startswith("/"):
            raise ValueError("The org unit path must start with '/'.")
        body["orgUnitPath"] = org_unit_path
    return body


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--action", choices=("check", "create"), required=True)
    parser.add_argument("--service-account-file", required=True)
    parser.add_argument("--admin-user", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--group", required=True)
    parser.add_argument("--org-unit-path", default="")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()

    service_account_file = Path(args.service_account_file).expanduser().resolve()
    if not service_account_file.is_file():
        raise FileNotFoundError(
            f"Service account key not found: {service_account_file}"
        )

    admin_user = normalize_email(args.admin_user, "admin user")
    user_email = normalize_email(args.user, "staging user")
    group_email = normalize_email(args.group, "group")
    if not user_email.startswith("migracao."):
        raise ValueError("The staging user must start with 'migracao.'.")
    if user_email.split("@", 1)[1] != group_email.split("@", 1)[1]:
        raise ValueError("The staging user and Google group must use the same domain.")

    directory = build_directory(service_account_file, admin_user)
    existing = get_user(directory, user_email)
    if existing is not None:
        print(json.dumps(public_user(existing, "EXISTS"), ensure_ascii=False, indent=2))
        return 0

    if args.action == "check":
        print(
            json.dumps(
                {"status": "NOT_FOUND", "primary_email": user_email},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    if not args.execute:
        print(
            json.dumps(
                {
                    "status": "WOULD_CREATE",
                    "primary_email": user_email,
                    "org_unit_path": args.org_unit_path,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    created = (
        directory.users()
        .insert(body=create_body(user_email, group_email, args.org_unit_path))
        .execute()
    )
    print(json.dumps(public_user(created, "CREATED"), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
