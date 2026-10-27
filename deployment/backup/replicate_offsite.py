#!/usr/bin/env python3
"""Provider-Independent Off-Site Backup Replication Utility.

Supports S3-compatible cloud object storage providers:
- Amazon S3
- Cloudflare R2
- MinIO / Self-Hosted S3
- Backblaze B2 / Wasabi

Safety Guarantees & Operational Principles:
1. Local Preservation: Preserves local backups intact; local copies are NOT deleted or altered.
2. In-Transit Transport Security: Mandatory TLS (HTTPS) enforced for all remote endpoints;
   plain HTTP is strictly blocked except for local test hosts (localhost / 127.0.0.1).
3. Server-Side Encryption at Rest: Uploads request server-side encryption via standard
   'x-amz-server-side-encryption: AES256'. Note: Client-side pre-encryption before upload
   is NOT configured; encryption is applied server-side by the S3-compatible storage provider.
4. Cryptographic Integrity: Validates SHA-256 integrity checksums against local SHA256SUMS.txt
   prior to upload, attaches SHA-256 metadata headers, and verifies remote object existence
   and size via post-upload HEAD requests.
5. Explicit Verification States: Distinguishes 'UPLOAD_ACKNOWLEDGED' (HTTP 200 from PUT)
   from 'REMOTE_VERIFIED' (post-upload HEAD probe confirms remote object existence & length).
6. Immutable, Scoped Paths: Destination keys are scoped strictly under the validated prefix
   with timestamped directories. Path traversal ('..') and backslashes are strictly rejected.
7. Credential Masking: Sanitizes and masks secrets, access keys, and endpoint passwords
   in all CLI outputs, logs, and structured reports.
8. Safe Retention Pruning: Retention pruning is scoped exclusively to the intended prefix,
   requires explicit configuration, and strictly guarantees that the newest backup and
   minimum retained backups (at least 1) can NEVER be pruned.
9. Failure Isolation: Failed uploads or partial runs fail closed and leave all existing
   valid local and remote backups completely untouched.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import hmac
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    requests = None
    import urllib.error
    import urllib.request


BUCKET_NAME_REGEX = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
REGION_REGEX = re.compile(r"^[a-z0-9-]+$")
MIN_RETAINED_BACKUPS_DEFAULT = 1


def mask_secret(secret: str | None, show_chars: int = 4) -> str:
    """Mask sensitive string, showing only first few characters."""
    if not secret:
        return "<none>"
    s = secret.strip()
    if len(s) <= show_chars:
        return "***"
    return f"{s[:show_chars]}***"


def sign(key: bytes, msg: str) -> bytes:
    """HMAC-SHA256 signing helper."""
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def get_signature_key(key: str, date_stamp: str, region_name: str, service_name: str) -> bytes:
    """Derive AWS SigV4 signing key."""
    k_date = sign(("AWS4" + key).encode("utf-8"), date_stamp)
    k_region = sign(k_date, region_name)
    k_service = sign(k_region, service_name)
    k_signing = sign(k_service, "aws4_request")
    return k_signing


def compute_file_sha256(file_path: Path) -> str:
    """Compute SHA-256 hash of a local file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def validate_bucket_name(bucket: str) -> None:
    """Validate S3 bucket naming rules per AWS specification."""
    if not bucket or not isinstance(bucket, str):
        raise ValueError("S3 bucket name must be a non-empty string")
    b = bucket.strip()
    if len(b) < 3 or len(b) > 63:
        raise ValueError(f"S3 bucket name '{b}' must be between 3 and 63 characters long")
    if not BUCKET_NAME_REGEX.match(b):
        raise ValueError(
            f"Invalid S3 bucket name '{b}': must consist of lowercase letters, numbers, hyphens, and periods, "
            "and must begin and end with a letter or number"
        )
    if ".." in b:
        raise ValueError(f"S3 bucket name '{b}' cannot contain consecutive periods")
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", b):
        raise ValueError(f"S3 bucket name '{b}' cannot be formatted as an IP address")


def validate_region(region: str) -> None:
    """Validate AWS region format."""
    if not region or not REGION_REGEX.match(region.strip()):
        raise ValueError(f"Invalid AWS region '{region}': must be alphanumeric with hyphens (e.g. ap-south-1)")


def validate_prefix(prefix: str | None) -> str:
    """Validate prefix to prevent path traversal or unsafe leading slashes."""
    if prefix is None:
        return ""
    p = prefix.strip()
    if not p:
        return ""
    if ".." in p or "\\" in p or "\0" in p:
        raise ValueError(f"Unsafe prefix '{prefix}': path traversal and backslashes are strictly prohibited")
    if p.startswith("/"):
        raise ValueError(f"Unsafe prefix '{prefix}': must not start with a leading slash")
    if not p.endswith("/"):
        p += "/"
    return p


def validate_object_key(key: str, prefix: str = "") -> str:
    """Validate remote object key to ensure it stays within prefix and has no traversal."""
    if not key or not isinstance(key, str):
        raise ValueError("Object key must be a non-empty string")
    k = key.strip().lstrip("/")
    if ".." in k or "\\" in k or "\0" in k:
        raise ValueError(f"Unsafe object key '{key}': path traversal characters are strictly prohibited")
    if prefix and not k.startswith(prefix):
        raise ValueError(f"Object key '{k}' must start with required prefix '{prefix}'")
    return k


def validate_endpoint_url(endpoint_url: str | None) -> None:
    """Validate endpoint URL scheme for transport security."""
    if not endpoint_url or not endpoint_url.strip():
        return
    parsed = urllib.parse.urlparse(endpoint_url.strip())
    if parsed.scheme.lower() not in ("https", "http"):
        raise ValueError(f"Invalid endpoint scheme in '{endpoint_url}': must use HTTPS (or HTTP for localhost)")
    host = (parsed.hostname or "").lower()
    if parsed.scheme.lower() == "http" and host not in ("localhost", "127.0.0.1", "testserver"):
        raise ValueError(
            f"Insecure endpoint URL '{endpoint_url}': HTTPS is required for all remote S3 endpoints to protect data in transit"
        )


class S3ReplicationClient:
    """S3-compatible REST client implementing AWS Signature Version 4."""

    def __init__(
        self,
        bucket_name: str,
        access_key_id: str,
        secret_access_key: str,
        region_name: str = "ap-south-1",
        endpoint_url: str | None = None,
        storage_class: str = "STANDARD",
        sse_algorithm: str = "AES256",
    ) -> None:
        validate_bucket_name(bucket_name)
        validate_region(region_name)
        validate_endpoint_url(endpoint_url)

        self.bucket = bucket_name.strip()
        self.access_key = access_key_id.strip()
        self.secret_key = secret_access_key.strip()
        self.region = region_name.strip() or "ap-south-1"
        self.storage_class = storage_class.strip() or "STANDARD"
        self.sse_algorithm = sse_algorithm.strip() or "AES256"

        if endpoint_url and endpoint_url.strip():
            self.endpoint = endpoint_url.strip().rstrip("/")
            parsed = urllib.parse.urlparse(self.endpoint)
            self.host = parsed.netloc
            self.scheme = parsed.scheme or "https"
            self.url_base = f"{self.scheme}://{self.host}/{self.bucket}"
        else:
            if self.region == "us-east-1":
                self.host = f"{self.bucket}.s3.amazonaws.com"
            else:
                self.host = f"{self.bucket}.s3.{self.region}.amazonaws.com"
            self.scheme = "https"
            self.url_base = f"https://{self.host}"

    def build_sigv4_headers(
        self,
        method: str,
        canonical_uri: str,
        query_params: dict[str, str],
        payload_hash: str,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, str]:
        """Generate AWS SigV4 signed headers for S3 REST request."""
        now = datetime.datetime.now(datetime.UTC)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")

        headers = {
            "host": self.host,
            "x-amz-date": amz_date,
            "x-amz-content-sha256": payload_hash,
        }
        if extra_headers:
            for k, v in extra_headers.items():
                headers[k.lower()] = v.strip()

        sorted_headers = sorted(headers.items())
        canonical_headers = "".join([f"{k}:{v}\n" for k, v in sorted_headers])
        signed_headers = ";".join([k for k, _ in sorted_headers])

        sorted_query = sorted(query_params.items())
        canonical_querystring = urllib.parse.urlencode(sorted_query)

        canonical_uri_encoded = urllib.parse.quote(canonical_uri, safe="/")

        canonical_request = (
            f"{method}\n"
            f"{canonical_uri_encoded}\n"
            f"{canonical_querystring}\n"
            f"{canonical_headers}\n"
            f"{signed_headers}\n"
            f"{payload_hash}"
        )

        algorithm = "AWS4-HMAC-SHA256"
        credential_scope = f"{date_stamp}/{self.region}/s3/aws4_request"
        string_to_sign = (
            f"{algorithm}\n"
            f"{amz_date}\n"
            f"{credential_scope}\n"
            f"{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"
        )

        signing_key = get_signature_key(self.secret_key, date_stamp, self.region, "s3")
        signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

        authorization_header = (
            f"{algorithm} Credential={self.access_key}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )

        final_headers = {k: v for k, v in headers.items()}
        final_headers["Authorization"] = authorization_header
        return final_headers

    def head_object(self, remote_key: str) -> dict[str, Any]:
        """Issue HEAD probe to verify remote object existence and metadata."""
        clean_key = remote_key.lstrip("/")
        if self.endpoint_url_custom():
            canonical_uri = f"/{self.bucket}/{clean_key}"
            target_url = f"{self.endpoint}/{self.bucket}/{clean_key}"
        else:
            canonical_uri = f"/{clean_key}"
            target_url = f"{self.url_base}/{clean_key}"

        empty_hash = hashlib.sha256(b"").hexdigest()
        headers = self.build_sigv4_headers(
            method="HEAD",
            canonical_uri=canonical_uri,
            query_params={},
            payload_hash=empty_hash,
        )

        if requests:
            resp = requests.head(target_url, headers=headers, timeout=30, verify=True)
            if resp.status_code == 200:
                return {
                    "exists": True,
                    "content_length": int(resp.headers.get("Content-Length", -1)),
                    "etag": resp.headers.get("ETag", "").strip('"'),
                    "meta_sha256": resp.headers.get("x-amz-meta-sha256", ""),
                    "status_code": 200,
                }
            return {"exists": False, "status_code": resp.status_code}
        else:
            req = urllib.request.Request(target_url, headers=headers, method="HEAD")
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return {
                        "exists": True,
                        "content_length": int(resp.headers.get("Content-Length", -1)),
                        "etag": resp.headers.get("ETag", "").strip('"'),
                        "meta_sha256": resp.headers.get("x-amz-meta-sha256", ""),
                        "status_code": 200,
                    }
            except urllib.error.HTTPError as err:
                return {"exists": False, "status_code": err.code}

    def upload_file(
        self,
        local_path: Path,
        remote_key: str,
        sha256_hash: str,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        """Upload a file to S3 with AES256 server-side encryption and post-upload verification."""
        file_size = local_path.stat().st_size
        clean_key = remote_key.lstrip("/")
        validate_object_key(clean_key)

        if self.endpoint_url_custom():
            canonical_uri = f"/{self.bucket}/{clean_key}"
            target_url = f"{self.endpoint}/{self.bucket}/{clean_key}"
        else:
            canonical_uri = f"/{clean_key}"
            target_url = f"{self.url_base}/{clean_key}"

        extra_headers = {
            "x-amz-server-side-encryption": self.sse_algorithm,
            "x-amz-storage-class": self.storage_class,
            "x-amz-meta-sha256": sha256_hash,
            "content-length": str(file_size),
            "content-type": "application/octet-stream",
        }

        headers = self.build_sigv4_headers(
            method="PUT",
            canonical_uri=canonical_uri,
            query_params={},
            payload_hash=sha256_hash,
            extra_headers=extra_headers,
        )

        if dry_run:
            return {
                "file": local_path.name,
                "remote_key": clean_key,
                "size_bytes": file_size,
                "sha256": sha256_hash,
                "sse": self.sse_algorithm,
                "storage_class": self.storage_class,
                "upload_acknowledged": True,
                "remote_verified": True,
                "status": "DRY_RUN_OK",
            }

        # 1. Perform HTTP PUT upload
        with open(local_path, "rb") as data_stream:
            if requests:
                resp = requests.put(target_url, headers=headers, data=data_stream, timeout=60, verify=True)
                if resp.status_code not in (200, 201, 204):
                    raise RuntimeError(
                        f"S3 upload failed for {local_path.name} (HTTP {resp.status_code}): {resp.text[:200]}"
                    )
            else:
                req = urllib.request.Request(target_url, data=data_stream, headers=headers, method="PUT")
                with urllib.request.urlopen(req, timeout=60) as resp:
                    if resp.status not in (200, 201, 204):
                        raise RuntimeError(f"S3 upload failed for {local_path.name} (HTTP {resp.status})")

        # 2. Post-upload verification: Probe remote object via HEAD
        head_info = self.head_object(clean_key)
        if not head_info.get("exists"):
            raise RuntimeError(
                f"Post-upload verification probe failed: object '{clean_key}' not found after upload (HTTP {head_info.get('status_code')})"
            )
        if head_info.get("content_length", -1) != file_size:
            raise RuntimeError(
                f"Post-upload length mismatch for '{clean_key}': expected {file_size} bytes, remote store reports {head_info.get('content_length')} bytes"
            )

        return {
            "file": local_path.name,
            "remote_key": clean_key,
            "size_bytes": file_size,
            "sha256": sha256_hash,
            "sse": self.sse_algorithm,
            "storage_class": self.storage_class,
            "upload_acknowledged": True,
            "remote_verified": True,
            "status": "REMOTE_VERIFIED",
        }

    def download_file(
        self,
        remote_key: str,
        local_path: Path,
        expected_sha256: str | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        """Download a file from S3 with SHA-256 integrity verification and atomic write."""
        clean_key = remote_key.lstrip("/")
        validate_object_key(clean_key)

        if self.endpoint_url_custom():
            canonical_uri = f"/{self.bucket}/{clean_key}"
            target_url = f"{self.endpoint}/{self.bucket}/{clean_key}"
        else:
            canonical_uri = f"/{clean_key}"
            target_url = f"{self.url_base}/{clean_key}"

        empty_hash = hashlib.sha256(b"").hexdigest()
        headers = self.build_sigv4_headers(
            method="GET",
            canonical_uri=canonical_uri,
            query_params={},
            payload_hash=empty_hash,
        )

        if dry_run:
            return {
                "remote_key": clean_key,
                "local_path": str(local_path),
                "expected_sha256": expected_sha256,
                "download_verified": True,
                "status": "DRY_RUN_DOWNLOAD_OK",
            }

        local_path.parent.mkdir(parents=True, exist_ok=True)
        part_path = local_path.with_suffix(local_path.suffix + ".part")
        hasher = hashlib.sha256()
        total_downloaded = 0

        try:
            if requests:
                resp = requests.get(target_url, headers=headers, stream=True, timeout=60, verify=True)
                if resp.status_code != 200:
                    raise RuntimeError(f"S3 download failed for {clean_key} (HTTP {resp.status_code})")
                with open(part_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=65536):
                        if chunk:
                            f.write(chunk)
                            hasher.update(chunk)
                            total_downloaded += len(chunk)
            else:
                req = urllib.request.Request(target_url, headers=headers, method="GET")
                with urllib.request.urlopen(req, timeout=60) as resp:
                    if resp.status != 200:
                        raise RuntimeError(f"S3 download failed for {clean_key} (HTTP {resp.status})")
                    with open(part_path, "wb") as f:
                        while chunk := resp.read(65536):
                            f.write(chunk)
                            hasher.update(chunk)
                            total_downloaded += len(chunk)

            actual_sha = hasher.hexdigest().lower()
            if expected_sha256 and actual_sha != expected_sha256.lower():
                part_path.unlink(missing_ok=True)
                raise RuntimeError(
                    f"Integrity check failed on downloaded object '{clean_key}': expected {expected_sha256}, got {actual_sha}"
                )

            if local_path.exists():
                local_path.unlink()
            part_path.rename(local_path)

            return {
                "remote_key": clean_key,
                "local_path": str(local_path),
                "bytes_downloaded": total_downloaded,
                "sha256": actual_sha,
                "download_verified": True,
                "status": "DOWNLOAD_VERIFIED",
            }
        except (RuntimeError, ValueError, OSError):
            part_path.unlink(missing_ok=True)
            raise

    def endpoint_url_custom(self) -> bool:
        """Check if custom endpoint URL is in use."""
        return hasattr(self, "endpoint") and bool(self.endpoint)


def verify_local_backup_integrity(backup_dir: Path) -> tuple[bool, list[str], dict[str, str]]:
    """Validate SHA256SUMS.txt against files in backup directory."""
    sums_file = backup_dir / "SHA256SUMS.txt"
    if not sums_file.exists():
        return False, ["Missing SHA256SUMS.txt in backup directory"], {}

    expected_hashes: dict[str, str] = {}
    with open(sums_file, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split(maxsplit=1)
            if len(parts) == 2:
                expected_hashes[parts[1].lstrip("* \t")] = parts[0].strip().lower()

    if not expected_hashes:
        return False, ["SHA256SUMS.txt contains no file entries"], {}

    errors = []
    verified_hashes: dict[str, str] = {}
    for filename, expected_hash in expected_hashes.items():
        file_path = backup_dir / filename
        if not file_path.exists():
            errors.append(f"Missing referenced artifact: {filename}")
            continue

        actual_hash = compute_file_sha256(file_path).lower()
        if actual_hash != expected_hash:
            errors.append(f"Checksum mismatch on {filename}: expected {expected_hash}, got {actual_hash}")
        else:
            verified_hashes[filename] = actual_hash

    return (len(errors) == 0, errors, verified_hashes)


def find_latest_backup_directory(root_path: Path) -> Path | None:
    """Identify the most recent timestamped backup directory."""
    if not root_path.exists():
        return None

    dirs = [d for d in root_path.iterdir() if d.is_dir() and not d.name.startswith(".")]
    if not dirs:
        return None

    dirs.sort(key=lambda d: d.name, reverse=True)
    return dirs[0]


def parse_backup_timestamp(name: str) -> datetime.datetime | None:
    """Parse timestamp from backup directory or object key name."""
    match = re.search(r"(\d{8})_(\d{6})", name)
    if match:
        try:
            return datetime.datetime.strptime(f"{match.group(1)}_{match.group(2)}", "%Y%m%d_%H%M%S").replace(
                tzinfo=datetime.UTC
            )
        except ValueError:
            pass
    match_date = re.search(r"(\d{8})", name)
    if match_date:
        try:
            return datetime.datetime.strptime(match_date.group(1), "%Y%m%d").replace(tzinfo=datetime.UTC)
        except ValueError:
            pass
    return None


def evaluate_retention_pruning(
    backup_sets: list[str],
    retention_days: int,
    now: datetime.datetime | None = None,
    min_retained_backups: int = MIN_RETAINED_BACKUPS_DEFAULT,
) -> dict[str, Any]:
    """Evaluate retention pruning rules safely.

    Safety Guarantees:
    1. NEVER deletes the newest backup set, regardless of retention age.
    2. NEVER prunes if total backups <= min_retained_backups.
    3. Only prunes backup sets strictly older than cutoff (now - retention_days).
    4. Conservative: unparseable backup names are NEVER pruned.
    """
    if retention_days <= 0:
        return {
            "enabled": False,
            "retained": list(backup_sets),
            "pruned": [],
            "reason": "Retention pruning disabled (retention_days <= 0)",
        }

    now_dt = now or datetime.datetime.now(datetime.UTC)
    cutoff = now_dt - datetime.timedelta(days=retention_days)

    dated_backups: list[tuple[str, datetime.datetime | None]] = []
    for b in backup_sets:
        ts = parse_backup_timestamp(b)
        dated_backups.append((b, ts))

    dated_backups.sort(key=lambda x: x[1] or datetime.datetime.min.replace(tzinfo=datetime.UTC))

    if len(dated_backups) <= min_retained_backups:
        return {
            "enabled": True,
            "cutoff_iso": cutoff.isoformat(),
            "retained": [b for b, _ in dated_backups],
            "pruned": [],
            "reason": f"Total backups ({len(dated_backups)}) <= minimum retained ({min_retained_backups})",
        }

    newest_backup = dated_backups[-1][0]
    retained: list[str] = []
    candidates_for_pruning: list[str] = []

    for name, ts in dated_backups:
        if name == newest_backup or ts is None:
            retained.append(name)
        elif ts < cutoff:
            candidates_for_pruning.append(name)
        else:
            retained.append(name)

    if not retained and candidates_for_pruning:
        retained.append(candidates_for_pruning.pop())

    return {
        "enabled": True,
        "cutoff_iso": cutoff.isoformat(),
        "retained": retained,
        "pruned": candidates_for_pruning,
        "newest_preserved": newest_backup,
    }


def run_replication(
    backup_dir: Path | None = None,
    dry_run: bool = False,
    verify_only: bool = False,
    retention_days: int = 0,
) -> dict[str, Any]:
    """Execute off-site replication workflow."""
    now_iso = datetime.datetime.now(datetime.UTC).isoformat()
    enabled = os.environ.get("OFFSITE_BACKUP_ENABLED", "false").lower() in ("true", "1", "yes")

    report: dict[str, Any] = {
        "timestamp": now_iso,
        "enabled": enabled,
        "dry_run": dry_run,
        "verify_only": verify_only,
        "status": "INITIALIZING",
        "backup_directory": None,
        "files_verified": 0,
        "files_uploaded": 0,
        "total_bytes": 0,
        "sha256_verified": False,
        "remote_destination": None,
        "storage_class": None,
        "encryption": "AES256 (Server-Side Encryption via x-amz-server-side-encryption header; transmitted over TLS; client-side pre-encryption is not configured)",
        "retention_evaluation": None,
        "errors": [],
    }

    # 1. Check if off-site backup is enabled
    if not enabled and not dry_run and not verify_only:
        report["status"] = "SKIPPED"
        report["message"] = (
            "Off-site backup replication skipped: OFFSITE_BACKUP_ENABLED is not set to 'true'. "
            "Local backup copy preserved. Note: A local copy is NOT proof of off-site disaster recovery."
        )
        return report

    # 2. Locate backup directory
    target_dir = backup_dir
    default_root = Path(os.environ.get("BACKUP_ROOT", Path.home() / "departmental-backups"))
    if not target_dir:
        target_dir = find_latest_backup_directory(default_root)

    if not target_dir or not target_dir.exists():
        report["status"] = "FAILED"
        report["errors"].append("No valid backup directory found to replicate")
        return report

    report["backup_directory"] = str(target_dir.resolve())
    backup_id = target_dir.name

    # 3. Validate local integrity before upload
    is_valid, integrity_errors, verified_hashes = verify_local_backup_integrity(target_dir)
    report["sha256_verified"] = is_valid
    report["files_verified"] = len(verified_hashes)

    if not is_valid:
        report["status"] = "FAILED"
        report["errors"].extend(integrity_errors)
        return report

    if verify_only:
        report["status"] = "VERIFIED_LOCAL_ONLY"
        report["message"] = f"Local backup {backup_id} integrity verified cleanly ({len(verified_hashes)} files)."
        return report

    # 4. Validate Cloud S3 configuration
    bucket = os.environ.get("S3_BUCKET_NAME", "").strip()
    key_id = os.environ.get("S3_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("S3_SECRET_ACCESS_KEY", "").strip()
    region = os.environ.get("S3_REGION_NAME", "ap-south-1").strip()
    endpoint = os.environ.get("S3_ENDPOINT_URL", "").strip() or None
    raw_prefix = os.environ.get("S3_PREFIX", "department-store-backups/").strip()
    storage_class = os.environ.get("S3_STORAGE_CLASS", "STANDARD").strip()
    sse = os.environ.get("S3_SSE_ALGORITHM", "AES256").strip()

    if dry_run:
        bucket = bucket or "synthetic-staging-backup-bucket"
        key_id = key_id or "SYNTHETIC_KEY_ID"
        secret_key = secret_key or "SYNTHETIC_SECRET_KEY"

    # Validate inputs
    try:
        validate_bucket_name(bucket)
        validate_region(region)
        prefix = validate_prefix(raw_prefix)
        validate_endpoint_url(endpoint)
    except ValueError as ve:
        report["status"] = "FAILED"
        report["errors"].append(f"Configuration validation failed: {ve}")
        return report

    missing_env = []
    if not bucket:
        missing_env.append("S3_BUCKET_NAME")
    if not key_id:
        missing_env.append("S3_ACCESS_KEY_ID")
    if not secret_key:
        missing_env.append("S3_SECRET_ACCESS_KEY")

    if missing_env and not dry_run:
        report["status"] = "FAILED"
        report["errors"].append(
            f"Missing required off-site storage configuration: {', '.join(missing_env)}. "
            "Please configure credentials in a secure environment file."
        )
        return report

    report["remote_destination"] = f"s3://{bucket}/{prefix}{backup_id}/"
    report["storage_class"] = storage_class

    client = S3ReplicationClient(
        bucket_name=bucket,
        access_key_id=key_id,
        secret_access_key=secret_key,
        region_name=region,
        endpoint_url=endpoint,
        storage_class=storage_class,
        sse_algorithm=sse,
    )

    # 5. Upload artifacts sequentially
    uploaded_files = []
    total_bytes = 0

    artifacts = [p for p in target_dir.iterdir() if p.is_file()]
    for art in artifacts:
        rel_name = art.name
        sha = verified_hashes.get(rel_name, compute_file_sha256(art))
        remote_key = f"{prefix}{backup_id}/{rel_name}"

        try:
            validate_object_key(remote_key, prefix=prefix)
            res = client.upload_file(
                local_path=art,
                remote_key=remote_key,
                sha256_hash=sha,
                dry_run=dry_run,
            )
            uploaded_files.append(res)
            total_bytes += art.stat().st_size
        except (RuntimeError, ValueError, OSError) as exc:
            report["status"] = "FAILED"
            report["errors"].append(f"Upload failed for {rel_name}: {exc}")
            return report

    report["files_uploaded"] = len(uploaded_files)
    report["total_bytes"] = total_bytes
    report["uploaded_artifacts"] = uploaded_files

    # 6. Evaluate retention policy if configured
    configured_retention = retention_days or int(os.environ.get("S3_RETENTION_DAYS", "0"))
    if configured_retention > 0:
        known_backups = [d.name for d in default_root.iterdir() if d.is_dir()] if default_root.exists() else [backup_id]
        if backup_id not in known_backups:
            known_backups.append(backup_id)
        ret_result = evaluate_retention_pruning(known_backups, retention_days=configured_retention)
        report["retention_evaluation"] = ret_result

    report["status"] = "DRY_RUN_SUCCESS" if dry_run else "SUCCESS"
    report["message"] = (
        f"Successfully replicated backup {backup_id} ({len(uploaded_files)} files, "
        f"{total_bytes} bytes) to {report['remote_destination']}"
    )
    return report


def main() -> int:
    """CLI entry point for offsite replication."""
    parser = argparse.ArgumentParser(description="Department Store Off-Site Backup Replication Tool")
    parser.add_argument("--backup-dir", type=str, help="Specific backup directory to replicate")
    parser.add_argument("--dry-run", action="store_true", help="Simulate replication without making network requests")
    parser.add_argument("--verify-only", action="store_true", help="Verify local backup checksums without uploading")
    parser.add_argument("--retention-days", type=int, default=0, help="Retention period in days for older backups")
    parser.add_argument("--status-json", type=str, help="Path to write structured JSON status report")
    args = parser.parse_args()

    target_path = Path(args.backup_dir) if args.backup_dir else None
    result = run_replication(
        backup_dir=target_path,
        dry_run=args.dry_run,
        verify_only=args.verify_only,
        retention_days=args.retention_days,
    )

    print("=" * 80)
    print("DEPARTMENT STORE OFF-SITE BACKUP REPLICATION")
    print("=" * 80)
    print(f"Timestamp:          {result.get('timestamp')}")
    print(f"Status:             {result.get('status')}")
    print(f"Backup Directory:   {result.get('backup_directory')}")
    print(f"Files Verified:     {result.get('files_verified')}")
    print(f"Files Uploaded:     {result.get('files_uploaded')}")
    print(f"Total Bytes:        {result.get('total_bytes')} bytes")
    print(f"SHA-256 Validated:  {result.get('sha256_verified')}")
    print(f"Remote Destination: {result.get('remote_destination')}")
    print(f"Storage Class:      {result.get('storage_class')}")
    print(f"Encryption at Rest: {result.get('encryption')}")

    if result.get("retention_evaluation"):
        ret = result["retention_evaluation"]
        print(f"Retention Pruning:  Evaluated (Retain: {len(ret.get('retained', []))}, Prune: {len(ret.get('pruned', []))})")
        if ret.get("newest_preserved"):
            print(f"Preserved Newest:   {ret.get('newest_preserved')}")

    if result.get("message"):
        print(f"\nMessage: {result.get('message')}")

    if result.get("errors"):
        print("\nErrors Encountered:")
        for err in result["errors"]:
            print(f"  - {err}")

    print("=" * 80)

    if args.status_json:
        try:
            with open(args.status_json, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2)
            print(f"Report written to: {args.status_json}")
        except OSError as exc:
            print(f"Warning: Failed to write status JSON: {exc}", file=sys.stderr)

    return 0 if result["status"] in ("SUCCESS", "SKIPPED", "DRY_RUN_SUCCESS", "VERIFIED_LOCAL_ONLY") else 1


if __name__ == "__main__":
    sys.exit(main())
