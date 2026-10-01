import csv
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "get_google_groups_takeout_manifest.py"


def mbox_message(message_id: str, subject: str, list_id: str) -> bytes:
    return (
        b"From sender@example.com Thu Jan 01 00:00:00 2026\n"
        + f"Message-ID: <{message_id}>\n".encode()
        + b"Date: Thu, 1 Jan 2026 00:00:00 +0000\n"
        + b"From: Sender <sender@example.com>\n"
        + b"To: informatica@enging.pt\n"
        + f"List-Id: <{list_id}>\n".encode()
        + f"Subject: {subject}\n".encode()
        + b"Content-Type: text/plain; charset=utf-8\n\n"
        + f"Body for {message_id}\n".encode()
    )


class TakeoutManifestTests(unittest.TestCase):
    def test_zip_inventory_deduplication_and_reconciliation(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temp = Path(temporary_directory)
            archive_path = temp / "takeout-001.zip"
            info_mbox = (
                mbox_message("one@example.com", "One", "informatica.enging.pt")
                + mbox_message("two@example.com", "Two", "informatica.enging.pt")
                + mbox_message("one@example.com", "One duplicate", "informatica.enging.pt")
            )
            other_mbox = mbox_message("other@example.com", "Other", "rh.enging.pt")
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("Takeout/Grupos do Google/informatica@enging.pt.mbox", info_mbox)
                archive.writestr("Takeout/Grupos do Google/rh@enging.pt.mbox", other_mbox)

            existing_path = temp / "existing.csv"
            with existing_path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["message_id", "source_user"])
                writer.writeheader()
                writer.writerow({"message_id": "<one@example.com>", "source_user": "member@example.com"})
                writer.writerow({"message_id": "<member-only@example.com>", "source_user": "member@example.com"})

            output_dir = temp / "reports"
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--input",
                    str(archive_path),
                    "--group",
                    "informatica@enging.pt",
                    "--output-dir",
                    str(output_dir),
                    "--existing-manifest",
                    str(existing_path),
                    "--cutoff",
                    "2026-08-25T00:00:00Z",
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            summary = json.loads((output_dir / "takeout-summary.json").read_text())
            self.assertEqual(summary["takeout"]["mbox_candidates"], 2)
            self.assertEqual(summary["takeout"]["mbox_selected"], 1)
            self.assertEqual(summary["takeout"]["matching_occurrences"], 3)
            self.assertEqual(summary["takeout"]["canonical_unique_messages"], 2)
            self.assertEqual(summary["takeout"]["duplicate_occurrences"], 1)
            self.assertEqual(summary["reconciliation"]["common"], 1)
            self.assertEqual(summary["reconciliation"]["canonical_missing_from_existing"], 1)
            self.assertEqual(summary["reconciliation"]["existing_not_in_canonical"], 1)

    def test_pending_messages_are_excluded_by_default(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temp = Path(temporary_directory)
            archive_path = temp / "takeout-001.zip"
            published_mbox = mbox_message(
                "published@example.com", "Published", "informatica.enging.pt"
            )
            pending_mbox = mbox_message(
                "pending@example.com", "Pending", "informatica.enging.pt"
            )
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("Takeout/Grupos do Google/tópicos.mbox", published_mbox)
                archive.writestr(
                    "Takeout/Grupos do Google/mensagens pendentes.mbox", pending_mbox
                )

            output_dir = temp / "reports"
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--input",
                    str(archive_path),
                    "--group",
                    "informatica@enging.pt",
                    "--output-dir",
                    str(output_dir),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            summary = json.loads((output_dir / "takeout-summary.json").read_text())
            self.assertEqual(summary["takeout"]["canonical_unique_messages"], 1)
            self.assertEqual(summary["takeout"]["pending_mboxes_found"], 1)
            self.assertEqual(summary["takeout"]["pending_mboxes_included"], 0)

    def test_same_message_id_with_different_content_preserves_both_variants(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temp = Path(temporary_directory)
            archive_path = temp / "takeout-001.zip"
            first = mbox_message("reused@example.com", "First", "informatica.enging.pt")
            second = mbox_message(
                "reused@example.com", "Second", "informatica.enging.pt"
            ).replace(b"Body for reused@example.com", b"A different body")
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("Takeout/Grupos do Google/tópicos.mbox", first + second)

            output_dir = temp / "reports"
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--input",
                    str(archive_path),
                    "--group",
                    "informatica@enging.pt",
                    "--output-dir",
                    str(output_dir),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            summary = json.loads((output_dir / "takeout-summary.json").read_text())
            self.assertEqual(summary["takeout"]["canonical_unique_messages"], 2)
            self.assertEqual(summary["takeout"]["duplicate_occurrences"], 0)
            self.assertEqual(summary["takeout"]["message_id_raw_hash_conflicts"], 1)
            self.assertEqual(summary["takeout"]["message_id_content_hash_conflicts"], 1)
            with (output_dir / "takeout-message-id-conflict-details.csv").open(
                newline="", encoding="utf-8-sig"
            ) as handle:
                details = list(csv.DictReader(handle))
            self.assertEqual(len(details), 2)
            self.assertEqual(
                {row["subject"] for row in details}, {"First", "Second"}
            )


if __name__ == "__main__":
    unittest.main()
