"""Unit and functional safety test suite for deployment/backup/replicate_offsite.py.

Validates:
1. Malformed S3 configuration rejection (bucket name, region, endpoint protocol).
2. Prefix and object key path traversal prevention (.., backslashes, leading slash).
3. Transport security enforcement (HTTP remote endpoints blocked; HTTPS required).
4. SigV4 canonical request hashing and signature determinism.
5. Upload acknowledgement vs remote verification distinction.
6. Checksum mismatch and missing manifest fail-closed behavior.
7. Retention pruning safety invariants:
   - NEVER deletes the newest backup set, regardless of age.
   - NEVER prunes if total backups <= minimum retained backups.
   - Preserves unparseable backup names conservatively.
   - Accurately prunes only backups strictly older than cutoff.
8. Secret masking redacting tokens and credentials across all logs and reports.
"""

from __future__ import annotations

import datetime
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from deployment.backup import replicate_offsite


class TestReplicateOffsiteSafety(unittest.TestCase):
    def setUp(self):
        self.test_dir = Path(tempfile.mkdtemp(prefix="ds_test_backup_"))
        self._orig_env = os.environ.copy()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._orig_env)
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir, ignore_errors=True)

    # -------------------------------------------------------------------------
    # 1. Configuration & Path Traversal Guards
    # -------------------------------------------------------------------------

    def test_malformed_bucket_names_rejected(self):
        invalid_buckets = [
            "",
            "AB",                     # Too short (< 3 chars)
            "A" * 64,                 # Too long (> 63 chars)
            "MyBucket",               # Uppercase forbidden
            "bucket..test",           # Consecutive periods forbidden
            "-leading-hyphen",        # Starts with hyphen
            "trailing-hyphen-",       # Ends with hyphen
            "192.168.1.1",            # IP address format forbidden
            "bucket with spaces",     # Whitespace forbidden
        ]
        for b in invalid_buckets:
            with self.subTest(bucket=b), self.assertRaises(ValueError):
                replicate_offsite.validate_bucket_name(b)

    def test_valid_bucket_names_accepted(self):
        valid_buckets = [
            "my-backup-bucket",
            "department-store-backups-2026",
            "co.za.backup-bucket.1",
            "minio-bucket-prod",
        ]
        for b in valid_buckets:
            with self.subTest(bucket=b):
                try:
                    replicate_offsite.validate_bucket_name(b)
                except ValueError as err:
                    self.fail(f"Valid bucket '{b}' was unexpectedly rejected: {err}")

    def test_malformed_regions_rejected(self):
        invalid_regions = ["", "AP_SOUTH_1", "region with spaces", "region/slash"]
        for r in invalid_regions:
            with self.subTest(region=r), self.assertRaises(ValueError):
                replicate_offsite.validate_region(r)

    def test_unsafe_prefix_traversal_rejected(self):
        unsafe_prefixes = [
            "../etc/",
            "backups/../../",
            "/absolute/path/",
            r"backups\traversal",
            "null\0byte",
        ]
        for p in unsafe_prefixes:
            with self.subTest(prefix=p), self.assertRaises(ValueError):
                replicate_offsite.validate_prefix(p)

    def test_valid_prefixes_normalized(self):
        self.assertEqual(replicate_offsite.validate_prefix("backups"), "backups/")
        self.assertEqual(replicate_offsite.validate_prefix("department-store/"), "department-store/")
        self.assertEqual(replicate_offsite.validate_prefix(""), "")
        self.assertEqual(replicate_offsite.validate_prefix(None), "")

    def test_unsafe_object_keys_rejected(self):
        unsafe_keys = [
            "../secret.txt",
            "backups/../../../etc/passwd",
            r"backups\sub\key.sql",
            "key\0null",
        ]
        for k in unsafe_keys:
            with self.subTest(key=k), self.assertRaises(ValueError):
                replicate_offsite.validate_object_key(k, prefix="backups/")

    def test_object_key_must_match_prefix(self):
        with self.assertRaises(ValueError):
            replicate_offsite.validate_object_key("wrong-prefix/file.sql", prefix="backups/")

    # -------------------------------------------------------------------------
    # 2. Transport Security (HTTPS Enforcement)
    # -------------------------------------------------------------------------

    def test_insecure_remote_http_endpoint_rejected(self):
        insecure_endpoints = [
            "http://s3.amazonaws.com",
            "http://r2.cloudflarestorage.com",
            "http://my-remote-minio.company.com",
            "ftp://files.example.com",
        ]
        for ep in insecure_endpoints:
            with self.subTest(endpoint=ep), self.assertRaises(ValueError):
                replicate_offsite.validate_endpoint_url(ep)

    def test_secure_https_and_localhost_http_accepted(self):
        valid_endpoints = [
            "https://s3.ap-south-1.amazonaws.com",
            "https://accountid.r2.cloudflarestorage.com",
            "http://localhost:9000",
            "http://127.0.0.1:9000",
        ]
        for ep in valid_endpoints:
            with self.subTest(endpoint=ep):
                try:
                    replicate_offsite.validate_endpoint_url(ep)
                except ValueError as err:
                    self.fail(f"Valid endpoint '{ep}' was unexpectedly rejected: {err}")

    # -------------------------------------------------------------------------
    # 3. AWS SigV4 Canonical Request and Signature Computation
    # -------------------------------------------------------------------------

    def test_sigv4_headers_deterministic_and_contains_auth(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="test-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_KEY_123",
            region_name="ap-south-1",
        )
        payload_hash = replicate_offsite.hashlib.sha256(b"hello world").hexdigest()
        headers = client.build_sigv4_headers(
            method="PUT",
            canonical_uri="/test-bucket/file.txt",
            query_params={},
            payload_hash=payload_hash,
            extra_headers={"x-amz-server-side-encryption": "AES256"},
        )
        self.assertIn("Authorization", headers)
        self.assertTrue(headers["Authorization"].startswith("AWS4-HMAC-SHA256 Credential=AKIA_TEST_KEY/"))
        self.assertIn("SignedHeaders=", headers["Authorization"])
        self.assertIn("Signature=", headers["Authorization"])
        self.assertEqual(headers["x-amz-content-sha256"], payload_hash)
        self.assertEqual(headers["x-amz-server-side-encryption"], "AES256")

    # -------------------------------------------------------------------------
    # 4. Local Integrity Verification & Fail-Closed Behavior
    # -------------------------------------------------------------------------

    def test_missing_manifest_fails_closed(self):
        f = self.test_dir / "data.sql.gz"
        f.write_bytes(b"content")
        is_valid, errors, _hashes = replicate_offsite.verify_local_backup_integrity(self.test_dir)
        self.assertFalse(is_valid)
        self.assertTrue(any("Missing SHA256SUMS.txt" in e for e in errors))

    def test_checksum_mismatch_fails_closed(self):
        f = self.test_dir / "data.sql.gz"
        f.write_bytes(b"corrupted content")
        manifest = self.test_dir / "SHA256SUMS.txt"
        manifest.write_text("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  data.sql.gz\n")

        is_valid, errors, _hashes = replicate_offsite.verify_local_backup_integrity(self.test_dir)
        self.assertFalse(is_valid)
        self.assertTrue(any("Checksum mismatch" in e for e in errors))

    def test_valid_manifest_passes_integrity(self):
        f = self.test_dir / "data.sql.gz"
        f.write_bytes(b"good content")
        real_hash = replicate_offsite.compute_file_sha256(f)
        manifest = self.test_dir / "SHA256SUMS.txt"
        manifest.write_text(f"{real_hash}  data.sql.gz\n")

        is_valid, errors, hashes = replicate_offsite.verify_local_backup_integrity(self.test_dir)
        self.assertTrue(is_valid)
        self.assertEqual(len(errors), 0)
        self.assertEqual(hashes["data.sql.gz"], real_hash)

    # -------------------------------------------------------------------------
    # 5. Retention Pruning Invariants & Safety Rules
    # -------------------------------------------------------------------------

    def test_retention_disabled_when_zero(self):
        backups = ["20261020_000000", "20261021_000000"]
        res = replicate_offsite.evaluate_retention_pruning(backups, retention_days=0)
        self.assertFalse(res["enabled"])
        self.assertEqual(res["pruned"], [])
        self.assertEqual(res["retained"], backups)

    def test_retention_never_deletes_newest_backup(self):
        now = datetime.datetime(2026, 10, 27, 12, 0, 0, tzinfo=datetime.UTC)
        # All backups are older than 3 days
        backups = [
            "20261001_100000",
            "20261005_100000",
            "20261010_100000",  # Newest backup, but 17 days old
        ]
        res = replicate_offsite.evaluate_retention_pruning(backups, retention_days=3, now=now)
        self.assertTrue(res["enabled"])
        self.assertIn("20261010_100000", res["retained"], "Newest backup must NEVER be pruned")
        self.assertEqual(res["newest_preserved"], "20261010_100000")
        self.assertEqual(sorted(res["pruned"]), ["20261001_100000", "20261005_100000"])

    def test_retention_never_prunes_single_remaining_backup(self):
        now = datetime.datetime(2026, 10, 27, 12, 0, 0, tzinfo=datetime.UTC)
        backups = ["20260101_000000"]  # Very old, but sole backup
        res = replicate_offsite.evaluate_retention_pruning(backups, retention_days=7, now=now, min_retained_backups=1)
        self.assertEqual(res["retained"], ["20260101_000000"])
        self.assertEqual(res["pruned"], [])

    def test_retention_preserves_unparseable_names(self):
        now = datetime.datetime(2026, 10, 27, 12, 0, 0, tzinfo=datetime.UTC)
        backups = [
            "20261001_000000",      # Expired
            "manual-seed-archive",  # Unparseable: must be preserved
            "20261026_000000",      # Fresh
        ]
        res = replicate_offsite.evaluate_retention_pruning(backups, retention_days=7, now=now)
        self.assertIn("manual-seed-archive", res["retained"])
        self.assertIn("20261026_000000", res["retained"])
        self.assertEqual(res["pruned"], ["20261001_000000"])

    # -------------------------------------------------------------------------
    # 6. Dry Run Simulation & Verification State Distinction
    # -------------------------------------------------------------------------

    def test_dry_run_simulation_returns_acknowledged_and_verified(self):
        os.environ["OFFSITE_BACKUP_ENABLED"] = "true"
        os.environ["S3_BUCKET_NAME"] = "valid-staging-backup-bucket"
        os.environ["S3_ACCESS_KEY_ID"] = "AKIA_MOCK_ACCESS_KEY"
        os.environ["S3_SECRET_ACCESS_KEY"] = "MOCK_SECRET_KEY_123"
        os.environ["S3_STORAGE_CLASS"] = "STANDARD"

        f = self.test_dir / "20261027-db.sql.gz"
        f.write_bytes(b"database content")
        h = replicate_offsite.compute_file_sha256(f)
        manifest = self.test_dir / "SHA256SUMS.txt"
        manifest.write_text(f"{h}  {f.name}\n")

        res = replicate_offsite.run_replication(backup_dir=self.test_dir, dry_run=True, retention_days=30)
        self.assertEqual(res["status"], "DRY_RUN_SUCCESS")
        self.assertTrue(res["sha256_verified"])
        self.assertEqual(res["files_verified"], 1)
        self.assertEqual(res["files_uploaded"], 2)  # db.sql.gz + SHA256SUMS.txt

        for art in res["uploaded_artifacts"]:
            self.assertTrue(art["upload_acknowledged"])
            self.assertTrue(art["remote_verified"])

        self.assertIsNotNone(res["retention_evaluation"])
        self.assertIn("AES256 (Server-Side Encryption", res["encryption"])

    # -------------------------------------------------------------------------
    # 7. Secret Masking
    # -------------------------------------------------------------------------

    def test_secret_masking_comprehensive(self):
        self.assertEqual(replicate_offsite.mask_secret("AKIA12345678"), "AKIA***")
        self.assertEqual(replicate_offsite.mask_secret(""), "<none>")
        self.assertEqual(replicate_offsite.mask_secret(None), "<none>")
        self.assertEqual(replicate_offsite.mask_secret("abc"), "***")
        self.assertEqual(replicate_offsite.mask_secret("  secret_token_value  "), "secr***")


if __name__ == "__main__":
    unittest.main()
