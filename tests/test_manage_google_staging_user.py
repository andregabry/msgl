import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "manage_google_staging_user.py"
SPEC = importlib.util.spec_from_file_location("staging_user_manager", SCRIPT)
MANAGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MANAGER)


class StagingUserManagerTests(unittest.TestCase):
    def test_create_body_uses_random_unreported_password(self):
        body = MANAGER.create_body(
            "migracao.informatica@enging.pt",
            "informatica@enging.pt",
            "/Migracoes",
        )
        public = MANAGER.public_user(body, "CREATED")

        self.assertGreaterEqual(len(body["password"]), 32)
        self.assertFalse(body["changePasswordAtNextLogin"])
        self.assertEqual(body["orgUnitPath"], "/Migracoes")
        self.assertNotIn("password", public)

    def test_staging_email_is_normalized(self):
        self.assertEqual(
            MANAGER.normalize_email(
                " MIGRACAO.Informatica@ENGING.PT ", "staging user"
            ),
            "migracao.informatica@enging.pt",
        )

    def test_invalid_email_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Invalid staging user"):
            MANAGER.normalize_email("not an email", "staging user")


if __name__ == "__main__":
    unittest.main()
