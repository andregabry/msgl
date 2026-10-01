import importlib.util
import sqlite3
import tempfile
import unittest
from unittest import mock
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "import_google_groups_takeout_to_staging.py"
SPEC = importlib.util.spec_from_file_location("takeout_importer", SCRIPT)
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


def message_bytes(message_id: str, subject: str = "Status") -> bytes:
    return (
        f"Message-ID: {message_id}\n"
        "Date: Tue, 17 Dec 2024 09:01:13 +0000\n"
        "From: UE Systems <info@uesystems.es>\n"
        "To: soraia.pinto@enging.pt\n"
        f"Subject: {subject}\n"
        "Content-Type: text/plain; charset=utf-8\n"
        "\n"
        "Historical group message\n"
    ).encode()


def manifest_row(raw: bytes, message_id: str, subject: str = "Status") -> dict:
    parsed = BytesParser(policy=policy.default).parsebytes(raw)
    return {
        "dedup_key": f"MID:{message_id.lower()}",
        "message_id": message_id,
        "date_utc": "2024-12-17T09:01:13Z",
        "from": "UE Systems <info@uesystems.es>",
        "to": "soraia.pinto@enging.pt",
        "cc": "",
        "subject": subject,
        "content_sha256": IMPORTER.content_sha256(parsed),
    }


def gmail_result(raw: bytes) -> dict:
    timestamp = int(
        datetime(2024, 12, 17, 9, 1, 13, tzinfo=timezone.utc).timestamp() * 1000
    )
    return {
        "id": "gmail-id-1",
        "threadId": "gmail-id-1",
        "internalDate": str(timestamp),
        "labelIds": ["INBOX"],
        "raw": IMPORTER.encode_raw(raw),
    }


class DestinationVerificationTests(unittest.TestCase):
    def test_google_welcome_message_requires_exact_sender_recipient_and_subject(self):
        raw = (
            "Message-ID: <welcome@mail.gmail.com>\n"
            "Date: Tue, 01 Sep 2026 09:30:16 -0700\n"
            "From: Equipa do Gmail <mail-noreply@google.com>\n"
            "To: Migracao <migracao.engenharia@enging.pt>\n"
            "Subject: Sugestões para utilizar a sua nova caixa de entrada\n\n"
            "Welcome\n"
        ).encode()
        message = BytesParser(policy=policy.default).parsebytes(raw)

        self.assertTrue(
            IMPORTER.is_google_welcome_message(
                message, "migracao.engenharia@enging.pt"
            )
        )
        self.assertFalse(
            IMPORTER.is_google_welcome_message(
                message, "migracao.outro@enging.pt"
            )
        )

    def test_duplicate_date_headers_are_preserved_as_auditable_metadata(self):
        raw = message_bytes("<duplicate-date@example.com>").replace(
            b"Date: Tue, 17 Dec 2024 09:01:13 +0000\n",
            b"Date: Tue, 17 Dec 2024 09:01:13 +0000\n"
            b"Date: Tue, 17 Dec 2024 10:01:13 +0000\n",
        )

        normalized, warnings = IMPORTER.normalize_duplicate_date_headers(raw)
        parsed_original = BytesParser(policy=policy.default).parsebytes(raw)
        parsed_normalized = BytesParser(policy=policy.default).parsebytes(normalized)

        self.assertEqual(len(parsed_normalized.get_all("Date", [])), 1)
        self.assertEqual(
            len(parsed_normalized.get_all("X-Migration-Original-Date", [])), 1
        )
        self.assertEqual(
            IMPORTER.content_sha256(parsed_original),
            IMPORTER.content_sha256(parsed_normalized),
        )
        self.assertEqual(warnings[0]["code"], "duplicate_date_headers_normalized")

    def test_exact_message_id_is_verified_without_warning(self):
        message_id = "<valid@example.com>"
        raw = message_bytes(message_id)
        verified = IMPORTER.verify_destination_result(
            gmail_result(raw), manifest_row(raw, message_id), "INBOX"
        )

        self.assertEqual(verified["destination_message_id"], message_id)
        self.assertEqual(verified["verification_warnings"], [])

    def test_rewritten_message_id_is_accepted_after_full_identity_check(self):
        source_id = "<244911549.289380268.1734426073241@[34.245.210.2]>"
        destination_id = "<generated@mail.gmail.com>"
        source_raw = message_bytes(source_id)
        destination_raw = message_bytes(destination_id)

        verified = IMPORTER.verify_destination_result(
            gmail_result(destination_raw), manifest_row(source_raw, source_id), "INBOX"
        )

        self.assertEqual(verified["destination_message_id"], destination_id)
        self.assertEqual(
            verified["verification_warnings"][0]["code"], "message_id_rewritten"
        )

    def test_rewritten_message_id_does_not_hide_header_mismatch(self):
        source_id = "<source@example.com>"
        source_raw = message_bytes(source_id, "Expected")
        destination_raw = message_bytes("<generated@mail.gmail.com>", "Different")

        with self.assertRaisesRegex(ValueError, "Subject mismatch"):
            IMPORTER.verify_destination_result(
                gmail_result(destination_raw),
                manifest_row(source_raw, source_id, "Expected"),
                "INBOX",
            )

    def test_content_mismatch_is_rejected(self):
        message_id = "<valid@example.com>"
        source_raw = message_bytes(message_id)
        destination_raw = source_raw.replace(
            b"Historical group message", b"Different message content"
        )

        with self.assertRaisesRegex(ValueError, "Content hash mismatch"):
            IMPORTER.verify_destination_result(
                gmail_result(destination_raw),
                manifest_row(source_raw, message_id),
                "INBOX",
            )


class StateDatabaseTests(unittest.TestCase):
    def test_manifest_can_move_when_its_hash_is_unchanged(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            original = root / "original.csv"
            moved = root / "moved.csv"
            state = root / "state.sqlite3"
            original.write_text("same manifest\n", encoding="utf-8")
            first = IMPORTER.connect_state(state, "stage@example.com", original)
            first.close()
            moved.write_bytes(original.read_bytes())

            second = IMPORTER.connect_state(state, "stage@example.com", moved)
            second.close()

            with sqlite3.connect(state) as connection:
                stored_path = connection.execute(
                    "SELECT value FROM metadata WHERE key='manifest_path'"
                ).fetchone()[0]
            self.assertEqual(stored_path, str(moved.resolve()))

    def test_manifest_move_is_rejected_when_content_changes(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            original = root / "original.csv"
            changed = root / "changed.csv"
            state = root / "state.sqlite3"
            original.write_text("original manifest\n", encoding="utf-8")
            first = IMPORTER.connect_state(state, "stage@example.com", original)
            first.close()
            changed.write_text("different manifest\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "manifest_sha256 mismatch"):
                IMPORTER.connect_state(state, "stage@example.com", changed)

    def test_date_repair_verifies_replacement_before_deleting_old_copy(self):
        source_id = "<duplicate-date@example.com>"
        raw = message_bytes(source_id).replace(
            b"Date: Tue, 17 Dec 2024 09:01:13 +0000\n",
            b"Date: Tue, 17 Dec 2024 09:01:13 +0000\n"
            b"Date: Tue, 17 Dec 2024 10:01:13 +0000\n",
        )
        row = manifest_row(raw, source_id)
        row.update(
            {
                "raw_sha256": __import__("hashlib").sha256(raw).hexdigest(),
                "source_archive": "/unused/source.zip",
                "mbox_path": "topics.mbox",
                "mbox_message_number": 1,
            }
        )

        class Request:
            def __init__(self, callback):
                self.callback = callback

            def execute(self):
                return self.callback()

        class FakeGmail:
            def __init__(self):
                wrong = gmail_result(raw)
                wrong["id"] = "old-id"
                wrong["internalDate"] = "1788276299000"
                self.store = {"old-id": wrong}
                self.events = []

            def users(self):
                return self

            def messages(self):
                return self

            def get(self, userId, id, format):
                return Request(lambda: self.store[id])

            def list(self, **kwargs):
                return Request(
                    lambda: {"messages": [{"id": key} for key in self.store]}
                )

            def insert(self, userId, internalDateSource, body):
                def execute():
                    self.events.append("insert")
                    replacement_raw = IMPORTER.decode_raw(body["raw"])
                    replacement = gmail_result(replacement_raw)
                    replacement["id"] = "new-id"
                    replacement["threadId"] = "new-id"
                    self.store["new-id"] = replacement
                    return replacement

                return Request(execute)

            def delete(self, userId, id):
                def execute():
                    self.events.append("delete")
                    del self.store[id]
                    return {}

                return Request(execute)

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = root / "manifest.csv"
            manifest.write_text("test manifest\n", encoding="utf-8")
            state = root / "state.sqlite3"
            connection = IMPORTER.connect_state(state, "stage@example.com", manifest)
            IMPORTER.record_import(
                connection,
                row,
                {
                    "gmail_message_id": "old-id",
                    "gmail_thread_id": "old-id",
                    "gmail_internal_date": "1788276299000",
                    "gmail_label_ids": ["INBOX"],
                },
                "verification_failed",
                "Internal date mismatch for test",
            )
            gmail = FakeGmail()

            with mock.patch.object(
                IMPORTER, "read_source_message", return_value=raw
            ), mock.patch.object(
                IMPORTER,
                "gmail_message_exists",
                side_effect=lambda client, message_id, attempts: message_id in client.store,
            ), mock.patch.object(
                IMPORTER,
                "get_gmail_raw",
                side_effect=lambda client, message_id, attempts: client.store[message_id],
            ), mock.patch.object(
                IMPORTER,
                "list_gmail_message_ids",
                side_effect=lambda client, query, attempts: list(client.store),
            ), mock.patch.object(
                IMPORTER,
                "insert_with_reconciliation",
                side_effect=lambda client, reader, upload_raw, item, label, attempts: client.insert(
                    userId="me",
                    internalDateSource="dateHeader",
                    body={"raw": IMPORTER.encode_raw(upload_raw), "labelIds": [label]},
                ).execute(),
            ):
                repaired = IMPORTER.repair_internal_date_failures(
                    connection, [row], gmail, state, "INBOX", 1
                )

            stored = connection.execute(
                "SELECT status, gmail_message_id, verification_warnings "
                "FROM imports WHERE dedup_key = ?",
                (row["dedup_key"],),
            ).fetchone()
            connection.close()

            self.assertEqual(repaired, 1)
            self.assertEqual(gmail.events, ["insert", "delete"])
            self.assertNotIn("old-id", gmail.store)
            self.assertIn("new-id", gmail.store)
            self.assertEqual(stored["status"], "verified")
            self.assertEqual(stored["gmail_message_id"], "new-id")
            self.assertIn("duplicate_date_headers_normalized", stored["verification_warnings"])

if __name__ == "__main__":
    unittest.main()
