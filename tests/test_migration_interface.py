import importlib.util
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "interface" / "server.py"
SPEC = importlib.util.spec_from_file_location("migration_interface", SCRIPT)
INTERFACE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INTERFACE)


class MigrationInterfaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = INTERFACE.load_config()
        cls.manager = INTERFACE.JobManager(cls.config)

    def test_overview_uses_registered_groups_and_domain_mapping(self):
        overview = INTERFACE.build_group_overview(self.config)
        informatica = next(
            group
            for group in overview["groups"]
            if group["email"] == "informatica@enging.pt"
        )

        self.assertEqual(
            informatica["staging_user"], "migracao.informatica@enging.pt"
        )
        self.assertEqual(
            informatica["target_mailbox"], "informatica@dynamox.net"
        )
        self.assertIsInstance(informatica["canonical_messages"], int)
        self.assertTrue(informatica["backup_exports"])
        self.assertTrue(informatica["activity"])
        self.assertEqual(overview["google_admin"], self.config["GoogleAdmin"])

    def test_remote_discovery_adds_only_remote_group_to_overview(self):
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            (workspace / "remote-groups.json").write_text(
                json.dumps(
                    {
                        "GeneratedAtUtc": "2026-09-02T10:00:00Z",
                        "ActiveAccount": "andre.gabry@enging.pt",
                        "ExportId": "20260826T152249Z",
                        "DirectoryGroups": 1,
                        "GroupsWithBackups": 1,
                        "Groups": [
                            {
                                "GroupEmail": "novo.grupo@enging.pt",
                                "DisplayName": "Novo grupo",
                                "RemoteObjects": 2,
                                "RemoteBytes": 1234,
                                "BucketPrefix": "gs://bucket/20260826T152249Z/Novo.Grupo@enging.pt/",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            config = {**self.config, "WorkspaceRoot": str(workspace)}

            overview = INTERFACE.build_group_overview(config)

            self.assertEqual(len(overview["groups"]), 1)
            group = overview["groups"][0]
            self.assertEqual(group["email"], "novo.grupo@enging.pt")
            self.assertTrue(group["remote_only"])
            self.assertEqual(group["remote_object_count"], 2)
            self.assertEqual(group["target_mailbox"], "novo.grupo@dynamox.net")
            self.assertEqual(
                group["remote_bucket_prefix"],
                "gs://bucket/20260826T152249Z/Novo.Grupo@enging.pt/",
            )

    def test_global_google_discovery_command_uses_existing_service_account(self):
        command = self.manager.build_command(
            "discover_remote_groups", {"email": "Catálogo Google"}, {}
        )

        self.assertIn("Discover-GoogleGroupsTakeoutBackups.ps1", " ".join(command))
        self.assertIn(self.config["GoogleTakeoutBucketRoot"], command)
        self.assertIn(self.config["ServiceAccountFile"], command)
        self.assertIn(self.config["GoogleAdmin"], command)

    def test_prepare_is_blocked_until_remote_backup_is_downloaded(self):
        group = {
            "backup_exports": [],
            "prepared": False,
            "content_conflicts": 0,
            "conflicts_approved": False,
            "verification_failed": 0,
        }

        with self.assertRaisesRegex(ValueError, "Baixe e registe primeiro"):
            self.manager.validate_action("prepare", group, {})

    def test_backup_exports_are_isolated_and_report_local_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            present = root / "present.zip"
            present.write_bytes(b"backup")
            rows = [
                {
                    "ExportId": "20260901T010203Z",
                    "GroupEmail": "engenharia@enging.pt",
                    "FileName": "present.zip",
                    "ManagedPath": str(present),
                    "Bytes": str(present.stat().st_size),
                    "SHA256": "abc",
                    "RegisteredAtUtc": "2026-09-01T01:02:03Z",
                },
                {
                    "ExportId": "20260901T010203Z",
                    "GroupEmail": "informatica@enging.pt",
                    "FileName": "other.zip",
                    "ManagedPath": str(root / "other.zip"),
                    "Bytes": "10",
                },
            ]

            exports = INTERFACE.backup_exports_for_group(
                rows, "engenharia@enging.pt"
            )

            self.assertEqual(len(exports), 1)
            self.assertEqual(exports[0]["available_files"], 1)
            self.assertEqual(exports[0]["files"][0]["state"], "verified_size")
            self.assertNotIn("other.zip", str(exports))

    def test_external_write_requires_explicit_confirmation(self):
        group = {
            "prepared": True,
            "content_conflicts": 0,
            "conflicts_approved": False,
            "remaining_messages": 10,
            "verification_failed": 0,
        }
        with self.assertRaisesRegex(ValueError, "confirmação explícita"):
            self.manager.validate_action("load_test", group, {"confirmed": False})

    def test_google_backup_download_is_group_isolated_and_requires_confirmation(self):
        group = INTERFACE.group_from_overview(
            self.config, "engenharia@enging.pt"
        )
        command = self.manager.build_command(
            "download_backup", group, {"confirmed": True}
        )

        self.assertIn("Download", command)
        self.assertIn("-RegisterAfterDownload", command)
        self.assertIn("engenharia@enging.pt", command)
        self.assertNotIn("informatica@enging.pt", command)
        with self.assertRaisesRegex(ValueError, "confirmação explícita"):
            self.manager.validate_action(
                "download_backup", group, {"confirmed": False}
            )

    def test_google_backup_download_can_select_exact_remote_files(self):
        group = INTERFACE.group_from_overview(
            self.config, "engenharia@enging.pt"
        )
        group["remote_backup"] = {
            "Objects": [
                {"RelativePath": "part-001.zip"},
                {"RelativePath": "part-002.zip"},
            ]
        }
        options = {
            "confirmed": True,
            "confirm_partial_export": True,
            "selected_remote_files": ["part-002.zip"],
        }

        command = self.manager.build_command("download_backup", group, options)

        self.assertIn("-ObjectSelectionJson", command)
        selection_json = command[command.index("-ObjectSelectionJson") + 1]
        self.assertEqual(json.loads(selection_json), ["part-002.zip"])
        self.manager.validate_action("download_backup", group, options)

    def test_partial_google_export_requires_a_separate_confirmation(self):
        group = INTERFACE.group_from_overview(
            self.config, "engenharia@enging.pt"
        )
        group["remote_backup"] = {
            "Objects": [
                {"RelativePath": "part-001.zip"},
                {"RelativePath": "part-002.zip"},
            ]
        }

        with self.assertRaisesRegex(ValueError, "somente parte"):
            self.manager.validate_action(
                "download_backup",
                {
                    **group,
                },
                {
                    "confirmed": True,
                    "selected_remote_files": ["part-001.zip"],
                    "confirm_partial_export": False,
                },
            )

    def test_google_login_uses_the_configured_administrator(self):
        group = INTERFACE.group_from_overview(
            self.config, "engenharia@enging.pt"
        )

        command = self.manager.build_command("gcloud_login", group, {})

        self.assertEqual(command[:4], ["pwsh", "-NoLogo", "-NoProfile", "-File"])
        self.assertIn("Connect-GoogleCloudInteractive.ps1", " ".join(command))
        self.assertEqual(command[-1], self.config["GoogleAdmin"])

    def test_m365_login_uses_the_configured_administrator(self):
        command = self.manager.build_command(
            "m365_login", {"email": "Microsoft 365"}, {}
        )

        self.assertEqual(command[:4], ["pwsh", "-NoLogo", "-NoProfile", "-File"])
        self.assertIn("Connect-M365Interactive.ps1", " ".join(command))
        self.assertEqual(command[-1], self.config["ExchangeAdmin"])

    def test_expired_google_session_has_a_stable_recovery_code(self):
        code, message = INTERFACE.classify_job_failure(
            "remote_backup_inventory",
            ["A sessão do Google Cloud expirou para andre.gabry@enging.pt."],
            1,
        )

        self.assertEqual(code, "GOOGLE_AUTH_EXPIRED")
        self.assertIn("Autentique novamente", message)

    def test_google_not_found_table_is_recorded_for_the_correct_staging_user(self):
        evidence = INTERFACE.google_evidence_from_lines(
            [
                "status    primary_email",
                "------    -------------",
                "NOT_FOUND migracao.engenharia@enging.pt",
            ],
            "engenharia@enging.pt",
            "migracao.engenharia@enging.pt",
            "2026-09-01T16:21:32Z",
        )

        self.assertEqual(evidence["Status"], "NOT_FOUND")
        self.assertEqual(
            evidence["StagingUser"], "migracao.engenharia@enging.pt"
        )

    def test_create_staging_command_uses_the_selected_groups_account(self):
        group = INTERFACE.group_from_overview(
            self.config, "engenharia@enging.pt"
        )
        command = self.manager.build_command("create_staging", group, {})

        self.assertIn("engenharia@enging.pt", command)
        self.assertIn("migracao.engenharia@enging.pt", command)
        self.assertNotIn("migracao.informatica@enging.pt", command)

    def test_prepare_command_cannot_receive_staging_or_target_overrides(self):
        group = INTERFACE.group_from_overview(
            self.config, "informatica@enging.pt"
        )
        command = self.manager.build_command("prepare", group, {})

        self.assertNotIn("-StagingUser", command)
        self.assertNotIn("-TargetMailbox", command)

    def test_date_repair_is_a_separate_explicit_operation(self):
        group = INTERFACE.group_from_overview(
            self.config, "informatica@enging.pt"
        )
        command = self.manager.build_command("repair_dates", group, {})

        self.assertIn("-RepairInternalDateFailures", command)
        self.assertIn("-RepairOnly", command)
        self.assertIn("-Execute", command)
        with self.assertRaisesRegex(ValueError, "confirmação explícita"):
            self.manager.validate_action(
                "repair_dates", group, {"confirmed": False}
            )

    def test_google_welcome_cleanup_is_explicit_and_group_isolated(self):
        group = INTERFACE.group_from_overview(
            self.config, "engenharia@enging.pt"
        )
        group["gmail_google_welcome_messages"] = 2
        group["gmail_unknown_messages"] = 0
        command = self.manager.build_command(
            "clean_google_welcome", group, {"confirmed": True}
        )

        self.assertIn("CleanStaging", command)
        self.assertIn("-ApproveGoogleWelcomeRemoval", command)
        self.assertIn("engenharia@enging.pt", command)
        self.assertNotIn("informatica@enging.pt", command)
        with self.assertRaisesRegex(ValueError, "confirmação explícita"):
            self.manager.validate_action(
                "clean_google_welcome", group, {"confirmed": False}
            )

    def test_google_welcome_cleanup_blocks_unknown_messages(self):
        group = INTERFACE.group_from_overview(
            self.config, "engenharia@enging.pt"
        )
        group["gmail_google_welcome_messages"] = 2
        group["gmail_unknown_messages"] = 1
        group["prepared"] = True
        group["google_account_ready"] = True

        with self.assertRaisesRegex(ValueError, "mensagens desconhecidas"):
            self.manager.validate_action(
                "clean_google_welcome", group, {"confirmed": True}
            )

    def test_unregistered_group_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "não pertence"):
            INTERFACE.group_from_overview(
                self.config, "migracao-nao-registrada@enging.pt"
            )

    def test_exchange_routing_domain_is_selected_only_when_unambiguous(self):
        module = ROOT / "scripts" / "ExchangeMigrationSupport.psm1"
        command = (
            f"Import-Module '{module}' -Force; "
            "$domains=@([pscustomobject]@{DomainName='dynamox.net'},"
            "[pscustomobject]@{DomainName='dynamox.mail.onmicrosoft.com'}); "
            "Resolve-GoogleTargetDeliveryDomain -AcceptedDomains $domains"
        )
        result = subprocess.run(
            ["pwsh", "-NoLogo", "-NoProfile", "-Command", command],
            check=True,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.stdout.strip(), "dynamox.mail.onmicrosoft.com")

    def test_exchange_routing_domain_ambiguity_is_blocked(self):
        module = ROOT / "scripts" / "ExchangeMigrationSupport.psm1"
        command = (
            f"Import-Module '{module}' -Force; "
            "$domains=@([pscustomobject]@{DomainName='one.mail.onmicrosoft.com'},"
            "[pscustomobject]@{DomainName='two.mail.onmicrosoft.com'}); "
            "Resolve-GoogleTargetDeliveryDomain -AcceptedDomains $domains"
        )
        result = subprocess.run(
            ["pwsh", "-NoLogo", "-NoProfile", "-Command", command],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Mais de um domínio de roteamento", result.stderr)

    def test_isolated_preparation_rejects_another_groups_target(self):
        group = "informatica@enging.pt"
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            backup = workspace / "backup"
            backup.mkdir()
            manifest = workspace / "manifest.csv"
            manifest.write_text("dedup_key\nabc\n", encoding="utf-8")
            summary = workspace / "summary.json"
            summary.write_text(json.dumps({"group": group}), encoding="utf-8")
            record_dir = workspace / "groups" / INTERFACE.safe_group_name(group)
            record_dir.mkdir(parents=True)
            record = {
                "GroupEmail": group,
                "StagingUser": "migracao.informatica@enging.pt",
                "TargetSharedMailbox": "informatica@dynamox.net",
                "BackupDirectory": str(backup),
                "Manifest": str(manifest),
                "ManifestSha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
                "Summary": str(summary),
            }
            (record_dir / "preparation.json").write_text(
                json.dumps(record), encoding="utf-8"
            )

            valid = INTERFACE.isolated_preparation_record(
                workspace,
                group,
                "migracao.informatica@enging.pt",
                "informatica@dynamox.net",
            )
            crossed = INTERFACE.isolated_preparation_record(
                workspace,
                group,
                "migracao.informatica@enging.pt",
                "engenharia@dynamox.net",
            )

            self.assertIsNotNone(valid)
            self.assertIsNone(crossed)

    def test_runtime_state_is_separate_for_each_group(self):
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            INTERFACE.update_group_runtime(
                workspace,
                "informatica@enging.pt",
                "Google",
                {"Status": "EXISTS", "StagingUser": "migracao.informatica@enging.pt"},
            )
            INTERFACE.update_group_runtime(
                workspace,
                "engenharia@enging.pt",
                "Google",
                {"Status": "NOT_FOUND", "StagingUser": "migracao.engenharia@enging.pt"},
            )

            informatica = INTERFACE.read_group_runtime(
                workspace, "informatica@enging.pt"
            )
            engenharia = INTERFACE.read_group_runtime(
                workspace, "engenharia@enging.pt"
            )

            self.assertEqual(informatica["Google"]["Status"], "EXISTS")
            self.assertEqual(engenharia["Google"]["Status"], "NOT_FOUND")
            self.assertNotEqual(
                INTERFACE.group_runtime_path(workspace, "informatica@enging.pt"),
                INTERFACE.group_runtime_path(workspace, "engenharia@enging.pt"),
            )

    def test_restore_plan_for_another_target_is_ignored(self):
        group = "informatica@enging.pt"
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            plan_dir = (
                workspace
                / "runs"
                / "restore"
                / "restore-informatica_enging.pt-20260901-120000"
            )
            plan_dir.mkdir(parents=True)
            (plan_dir / "restore-plan.json").write_text(
                json.dumps(
                    {
                        "Group": group,
                        "Phase": "Status",
                        "StagingUser": "migracao.informatica@enging.pt",
                        "TargetSharedMailbox": "engenharia@dynamox.net",
                    }
                ),
                encoding="utf-8",
            )

            plan = INTERFACE.latest_restore_plan(
                workspace,
                group,
                phases=("Status",),
                staging_user="migracao.informatica@enging.pt",
                target_mailbox="informatica@dynamox.net",
            )

            self.assertEqual(plan, {})


if __name__ == "__main__":
    unittest.main()
