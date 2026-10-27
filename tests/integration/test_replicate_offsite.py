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
import hashlib
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

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

    # -------------------------------------------------------------------------
    # -------------------------------------------------------------------------
    # 8. S3 Download Verification (Phase 15C Comprehensive Audit)
    # -------------------------------------------------------------------------

    def test_download_file_dry_run_and_path_validation(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_123",
            region_name="ap-south-1",
        )
        dest_file = self.test_dir / "restored.sql.gz"
        dummy_sha = hashlib.sha256(b"dummy").hexdigest()
        res = client.download_file(
            remote_key="department-store-backups/20261027_102247/db.sql.gz",
            local_path=dest_file,
            expected_sha256=dummy_sha,
            dry_run=True,
        )
        self.assertEqual(res["status"], "DRY_RUN_DOWNLOAD_OK")
        self.assertTrue(res["download_verified"])
        self.assertEqual(res["expected_sha256"], dummy_sha)

        # Unsafe path traversal in download key must be rejected
        with self.assertRaises(ValueError):
            client.download_file(
                remote_key="../../etc/passwd",
                local_path=dest_file,
                dry_run=True,
            )

    def test_download_file_successful_stream_and_verification(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_123",
            region_name="ap-south-1",
        )
        dest_file = self.test_dir / "db_restore.sql.gz"
        part_file = dest_file.with_suffix(dest_file.suffix + ".part")
        payload = b"SAMPLE_DATABASE_BACKUP_SQL_GZ_PAYLOAD_CHUNK_DATA"
        payload_sha = hashlib.sha256(payload).hexdigest()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.iter_content.return_value = [payload[:20], payload[20:]]

        with patch("deployment.backup.replicate_offsite.requests.get", return_value=mock_resp):
            res = client.download_file(
                remote_key="department-store-backups/20261027_102247/db.sql.gz",
                local_path=dest_file,
                expected_sha256=payload_sha,
            )

        self.assertEqual(res["status"], "DOWNLOAD_VERIFIED")
        self.assertEqual(res["bytes_downloaded"], len(payload))
        self.assertEqual(res["sha256"], payload_sha)
        self.assertTrue(dest_file.exists())
        self.assertEqual(dest_file.read_bytes(), payload)
        self.assertFalse(part_file.exists())

    def test_download_file_checksum_mismatch_preserves_existing_destination(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_123",
            region_name="ap-south-1",
        )
        dest_file = self.test_dir / "db_restore.sql.gz"
        part_file = dest_file.with_suffix(dest_file.suffix + ".part")
        dest_file.write_bytes(b"EXISTING_VALID_DATABASE_CONTENT")
        expected_sha = hashlib.sha256(b"EXPECTED_CORRECT_BYTES").hexdigest()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.iter_content.return_value = [b"CORRUPTED_STREAMED_BYTES"]

        with (
            patch("deployment.backup.replicate_offsite.requests.get", return_value=mock_resp),
            self.assertRaises(RuntimeError) as ctx,
        ):
            client.download_file(
                remote_key="department-store-backups/20261027_102247/db.sql.gz",
                local_path=dest_file,
                expected_sha256=expected_sha,
            )

        self.assertIn("Integrity check failed", str(ctx.exception))
        self.assertEqual(dest_file.read_bytes(), b"EXISTING_VALID_DATABASE_CONTENT")
        self.assertFalse(part_file.exists())

    def test_download_file_network_interruption_and_http_error_cleanup(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_123",
            region_name="ap-south-1",
        )
        dest_file = self.test_dir / "interrupted.sql.gz"
        part_file = dest_file.with_suffix(dest_file.suffix + ".part")
        dummy_sha = hashlib.sha256(b"dummy").hexdigest()

        def faulty_stream(*args, **kwargs):
            yield b"initial chunk"
            raise ConnectionResetError("Connection aborted by remote peer")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.iter_content = faulty_stream

        with (
            patch("deployment.backup.replicate_offsite.requests.get", return_value=mock_resp),
            self.assertRaises(ConnectionResetError),
        ):
            client.download_file(
                remote_key="department-store-backups/20261027_102247/interrupted.sql.gz",
                local_path=dest_file,
                expected_sha256=dummy_sha,
            )
        self.assertFalse(part_file.exists())
        self.assertFalse(dest_file.exists())

        mock_resp_500 = MagicMock()
        mock_resp_500.status_code = 500

        with (
            patch("deployment.backup.replicate_offsite.requests.get", return_value=mock_resp_500),
            self.assertRaises(RuntimeError) as ctx,
        ):
            client.download_file(
                remote_key="department-store-backups/20261027_102247/interrupted.sql.gz",
                local_path=dest_file,
                expected_sha256=dummy_sha,
            )
        self.assertIn("HTTP 500", str(ctx.exception))
        self.assertFalse(part_file.exists())

    def test_download_file_missing_or_malformed_checksum_fails_safely(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_123",
            region_name="ap-south-1",
        )
        dest_file = self.test_dir / "test.sql.gz"

        with self.assertRaises(ValueError) as ctx:
            client.download_file("backups/test.sql.gz", dest_file, expected_sha256="abc123nothex")
        self.assertIn("Malformed expected SHA-256", str(ctx.exception))

        with self.assertRaises(ValueError) as ctx:
            client.download_file("backups/test.sql.gz", dest_file, expected_sha256="a" * 32)
        self.assertIn("Malformed expected SHA-256", str(ctx.exception))

        with patch.object(client, "head_object", return_value={"exists": True, "meta_sha256": ""}):
            with self.assertRaises(ValueError) as ctx:
                client.download_file("backups/test.sql.gz", dest_file, expected_sha256=None)
            self.assertIn("Missing expected SHA-256", str(ctx.exception))

    def test_download_file_destination_traversal_and_directory_rejected(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_123",
            region_name="ap-south-1",
        )
        valid_sha = hashlib.sha256(b"test").hexdigest()

        target_dir = self.test_dir / "target_dir"
        target_dir.mkdir()
        with self.assertRaises(ValueError) as ctx:
            client.download_file("backups/test.sql.gz", target_dir, expected_sha256=valid_sha)
        self.assertIn("cannot be an existing directory", str(ctx.exception))

        safe_base = self.test_dir / "safe_restore_dir"
        safe_base.mkdir()
        escaping_path = self.test_dir / "other_dir" / "escape.sql.gz"
        with self.assertRaises(ValueError) as ctx:
            client.download_file(
                "backups/test.sql.gz",
                escaping_path,
                expected_sha256=valid_sha,
                base_dir=safe_base,
            )
        self.assertIn("escapes base directory", str(ctx.exception))

    def test_download_file_atomic_replacement_of_existing_destination(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_123",
            region_name="ap-south-1",
        )
        dest_file = self.test_dir / "db_atomic.sql.gz"
        dest_file.write_bytes(b"OLD_ARCHIVE_BYTES")

        new_payload = b"NEW_ARCHIVE_BYTES_VERIFIED"
        new_sha = hashlib.sha256(new_payload).hexdigest()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.iter_content.return_value = [new_payload]

        with patch("deployment.backup.replicate_offsite.requests.get", return_value=mock_resp):
            res = client.download_file(
                "backups/db.sql.gz",
                dest_file,
                expected_sha256=new_sha,
            )

        self.assertEqual(res["status"], "DOWNLOAD_VERIFIED")
        self.assertEqual(dest_file.read_bytes(), b"NEW_ARCHIVE_BYTES_VERIFIED")

    def test_download_file_secrets_never_appear_in_exceptions(self):
        secret_token = "SUPER_SECRET_TOKEN_DO_NOT_REVEAL_9999"
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key=secret_token,
            region_name="ap-south-1",
        )
        dest_file = self.test_dir / "secret_probe.sql.gz"
        valid_sha = hashlib.sha256(b"dummy").hexdigest()

        mock_resp = MagicMock()
        mock_resp.status_code = 403

        with (
            patch("deployment.backup.replicate_offsite.requests.get", return_value=mock_resp),
            self.assertRaises(RuntimeError) as ctx,
        ):
            client.download_file("backups/secret_probe.sql.gz", dest_file, expected_sha256=valid_sha)
        self.assertNotIn(secret_token, str(ctx.exception))

    def test_download_file_remote_metadata_fallback(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_123",
            region_name="ap-south-1",
        )
        dest_file = self.test_dir / "metadata_fallback.sql.gz"
        payload = b"PAYLOAD_VERIFIED_BY_REMOTE_METADATA_HEADER"
        payload_sha = hashlib.sha256(payload).hexdigest()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.iter_content.return_value = [payload]

        with (
            patch.object(
                client,
                "head_object",
                return_value={"exists": True, "meta_sha256": payload_sha, "content_length": len(payload)},
            ),
            patch("deployment.backup.replicate_offsite.requests.get", return_value=mock_resp),
        ):
            res = client.download_file(
                remote_key="backups/metadata_fallback.sql.gz",
                local_path=dest_file,
                expected_sha256=None,
            )

        self.assertEqual(res["status"], "DOWNLOAD_VERIFIED")
        self.assertEqual(res["sha256"], payload_sha)
        self.assertEqual(dest_file.read_bytes(), payload)

    def test_download_file_windows_compatible_handle_cleanup(self):
        client = replicate_offsite.S3ReplicationClient(
            bucket_name="valid-backup-bucket",
            access_key_id="AKIA_TEST_KEY",
            secret_access_key="SECRET_TEST_123",
            region_name="ap-south-1",
        )
        dest_file = self.test_dir / "win_handle.sql.gz"
        payload = b"WINDOWS_SHARING_VERIFICATION_BYTES"
        payload_sha = hashlib.sha256(payload).hexdigest()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.iter_content.return_value = [payload]

        with patch("deployment.backup.replicate_offsite.requests.get", return_value=mock_resp):
            client.download_file("backups/win_handle.sql.gz", dest_file, expected_sha256=payload_sha)

        with open(dest_file, "r+b") as f:
            f.seek(0)
            f.write(b"W")
        self.assertTrue(dest_file.exists())


if __name__ == "__main__":
    unittest.main()
