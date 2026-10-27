"""Unit and functional tests for deployment/backup/replicate_offsite.py.

Validates:
1. Disabled state returns cleanly with SKIPPED status and exit code 0.
2. Enabled state with missing credentials fails closed without leaking secrets.
3. Corrupted local backup aborts with checksum error prior to upload.
4. Dry-run simulation calculates SigV4 headers, verifies SHA256, and returns DRY_RUN_SUCCESS.
5. Secret masking utility properly redacts sensitive tokens.
"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path

from deployment.backup import replicate_offsite


class TestReplicateOffsite(unittest.TestCase):
    def setUp(self):
        self.test_dir = Path(tempfile.mkdtemp(prefix="ds_test_backup_"))
        self._orig_env = os.environ.copy()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._orig_env)
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_offsite_disabled_returns_skipped(self):
        os.environ["OFFSITE_BACKUP_ENABLED"] = "false"
        res = replicate_offsite.run_replication(backup_dir=self.test_dir)
        self.assertEqual(res["status"], "SKIPPED")
        self.assertIn("OFFSITE_BACKUP_ENABLED is not set to 'true'", res["message"])
        self.assertFalse(res["sha256_verified"])

    def test_offsite_enabled_missing_credentials_fails_closed(self):
        os.environ["OFFSITE_BACKUP_ENABLED"] = "true"
        os.environ.pop("S3_BUCKET_NAME", None)
        os.environ.pop("S3_ACCESS_KEY_ID", None)
        os.environ.pop("S3_SECRET_ACCESS_KEY", None)

        # Create valid mock backup dir
        dummy_file = self.test_dir / "test-database.sql.gz"
        dummy_file.write_bytes(b"dummy sql gz content")
        file_hash = replicate_offsite.compute_file_sha256(dummy_file)
        sums_file = self.test_dir / "SHA256SUMS.txt"
        sums_file.write_text(f"{file_hash}  test-database.sql.gz\n", encoding="utf-8")

        res = replicate_offsite.run_replication(backup_dir=self.test_dir, dry_run=False)
        self.assertEqual(res["status"], "FAILED")
        self.assertTrue(res["sha256_verified"])
        self.assertTrue(any("Missing required off-site storage configuration" in err for err in res["errors"]))

    def test_corrupted_local_backup_aborts_upload(self):
        os.environ["OFFSITE_BACKUP_ENABLED"] = "true"

        # Create file with hash that differs from SHA256SUMS.txt
        dummy_file = self.test_dir / "test-database.sql.gz"
        dummy_file.write_bytes(b"actual content on disk")
        sums_file = self.test_dir / "SHA256SUMS.txt"
        sums_file.write_text("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  test-database.sql.gz\n", encoding="utf-8")

        res = replicate_offsite.run_replication(backup_dir=self.test_dir, dry_run=True)
        self.assertEqual(res["status"], "FAILED")
        self.assertFalse(res["sha256_verified"])
        self.assertTrue(any("Checksum mismatch" in err for err in res["errors"]))

    def test_dry_run_simulation_success(self):
        os.environ["OFFSITE_BACKUP_ENABLED"] = "true"
        os.environ["S3_BUCKET_NAME"] = "my-test-backup-bucket"
        os.environ["S3_ACCESS_KEY_ID"] = "AKIA_TEST_KEY_123"
        os.environ["S3_SECRET_ACCESS_KEY"] = "SECRET_KEY_MOCK_XYZ"
        os.environ["S3_STORAGE_CLASS"] = "STANDARD_IA"
        os.environ["S3_SSE_ALGORITHM"] = "AES256"

        f1 = self.test_dir / "20261027-test-database.sql.gz"
        f1.write_bytes(b"sample database archive content")
        h1 = replicate_offsite.compute_file_sha256(f1)

        f2 = self.test_dir / "20261027-test-site_config_backup.json"
        f2.write_bytes(b'{"db_name": "test_db"}')
        h2 = replicate_offsite.compute_file_sha256(f2)

        sums = self.test_dir / "SHA256SUMS.txt"
        sums.write_text(f"{h1}  {f1.name}\n{h2}  {f2.name}\n", encoding="utf-8")

        res = replicate_offsite.run_replication(backup_dir=self.test_dir, dry_run=True)
        self.assertEqual(res["status"], "DRY_RUN_SUCCESS")
        self.assertTrue(res["sha256_verified"])
        self.assertEqual(res["files_verified"], 2)
        self.assertEqual(res["files_uploaded"], 3)  # 2 files + SHA256SUMS.txt
        self.assertEqual(res["storage_class"], "STANDARD_IA")
        self.assertEqual(res["encryption"], "AES256")
        self.assertTrue(res["remote_destination"].startswith("s3://my-test-backup-bucket/"))

    def test_secret_masking(self):
        self.assertEqual(replicate_offsite.mask_secret("AKIA12345678"), "AKIA***")
        self.assertEqual(replicate_offsite.mask_secret(""), "<none>")
        self.assertEqual(replicate_offsite.mask_secret(None), "<none>")
        self.assertEqual(replicate_offsite.mask_secret("abc"), "***")


if __name__ == "__main__":
    unittest.main()
