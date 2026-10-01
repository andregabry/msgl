import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "Sync-AllGoogleGroupsTakeoutBackup.ps1"


class SyncTakeoutBackupTests(unittest.TestCase):
    def test_inventory_accepts_current_gcloud_cloud_object_format(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binary_directory = root / "bin"
            binary_directory.mkdir()
            fake_gcloud = binary_directory / "gcloud"
            fake_gcloud.write_text(
                """#!/bin/sh
if [ "$1" = "config" ]; then
  echo 'andre.gabry@enging.pt'
  exit 0
fi
if [ "$1" = "storage" ]; then
  cat <<'JSON'
[{"url":"gs://test-bucket/export/engenharia@enging.pt/part-001.zip#41","type":"cloud_object","metadata":{"size":"5","md5Hash":"","crc32c":"abc","generation":"41","updated":"2026-09-02T08:00:00Z"}},{"url":"gs://test-bucket/export/engenharia@enging.pt/part-002.zip#42","type":"cloud_object","metadata":{"size":"7","md5Hash":"","crc32c":"def","generation":"42","updated":"2026-09-02T08:01:00Z"}}]
JSON
  exit 0
fi
exit 1
""",
                encoding="utf-8",
            )
            fake_gsutil = binary_directory / "gsutil"
            fake_gsutil.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            fake_gcloud.chmod(0o755)
            fake_gsutil.chmod(0o755)

            workspace = root / "workspace"
            environment = os.environ.copy()
            environment["PATH"] = f"{binary_directory}:{environment['PATH']}"
            result = subprocess.run(
                [
                    "pwsh",
                    "-NoLogo",
                    "-NoProfile",
                    "-File",
                    str(SCRIPT),
                    "-Phase",
                    "Inventory",
                    "-GroupEmail",
                    "engenharia@enging.pt",
                    "-BucketRoot",
                    "gs://test-bucket/export/",
                    "-DestinationRoot",
                    str(root / "downloads" / "export"),
                    "-ReportRoot",
                    str(root / "reports"),
                    "-WorkspaceRoot",
                    str(workspace),
                    "-ExportId",
                    "export",
                    "-ObjectRelativePath",
                    "part-002.zip",
                ],
                capture_output=True,
                text=True,
                env=environment,
            )

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            state = json.loads(
                (workspace / "groups" / "engenharia_enging.pt" / "remote-backup.json").read_text()
            )
            self.assertEqual(state["RemoteObjects"], 2)
            self.assertEqual(state["SelectedObjects"], 1)
            self.assertEqual(state["Objects"][1]["RelativePath"], "part-002.zip")
            self.assertNotIn("#42", state["Objects"][1]["LocalPath"])


if __name__ == "__main__":
    unittest.main()
