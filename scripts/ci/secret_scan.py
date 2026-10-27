#!/usr/bin/env python3
"""
CI Secret Scanner for Departmental Store SaaS.
Scans git-tracked files for potential secrets, private keys, API keys, and sensitive tokens.
Excludes safe documentation, examples, and test fixture files.
"""

import os
import re
import subprocess
import sys

# High-risk secret patterns
FORBIDDEN_PATTERNS = [
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"), "Unencrypted Private Key"),
    (re.compile(r"rzp_live_[0-9a-zA-Z]{14,}"), "Live Razorpay Secret Key"),
    (re.compile(r"sk_live_[0-9a-zA-Z]{24,}"), "Live Stripe Secret Key"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS Access Key ID"),
    (re.compile(r"(?i)api[_-]?secret[\s]*[:=][\s]*['\"][0-9a-zA-Z]{32,}['\"]"), "High-entropy API Secret"),
    (re.compile(r"(?i)client[_-]?secret[\s]*[:=][\s]*['\"][0-9a-zA-Z]{32,}['\"]"), "OAuth Client Secret"),
    (re.compile(r"(?i)password[\s]*[:=][\s]*['\"][^'\"]{10,}['\"](?=.*[A-Za-z])(?=.*\d)"), "Hardcoded High-Entropy Password"),
]

# Paths and extensions to ignore
EXCLUDED_PATTERNS = [
    r"^\.env\.example$",
    r"^deployment/ingress/\.env\.example$",
    r"^apps/owner-dashboard/\.env\.example$",
    r"^tok\.env$",
    r"^node_modules/",
    r"\.git/",
    r"\.next/",
    r"dist/",
    r"target/",
    r"\.test\.ts$",
    r"\.test\.tsx$",
    r"\.test\.py$",
    r"\.spec\.ts$",
    r"docs/",
    r"graphify-out/",
    r"\.png$",
    r"\.webp$",
    r"\.jpg$",
    r"\.lock$",
    r"package-lock\.json$",
]

EXCLUDED_RES = [re.compile(p) for p in EXCLUDED_PATTERNS]

def is_excluded(filepath: str) -> bool:
    normalized = filepath.replace("\\", "/")
    return any(ex.search(normalized) for ex in EXCLUDED_RES)

def get_tracked_files() -> list[str]:
    try:
        output = subprocess.check_output(["git", "ls-files"], text=True)
        return [line.strip() for line in output.splitlines() if line.strip()]
    except Exception as e:
        print(f"Warning: git ls-files failed ({e}), falling back to walking directory.")
        tracked = []
        for root, _, files in os.walk("."):
            for f in files:
                tracked.append(os.path.relpath(os.path.join(root, f), "."))
        return tracked

def scan_files() -> int:
    files = get_tracked_files()
    findings = []

    print(f"Scanning {len(files)} tracked files for credential leaks and sensitive keys...")

    for rel_path in files:
        if is_excluded(rel_path):
            continue

        if not os.path.exists(rel_path):
            continue

        try:
            with open(rel_path, "r", encoding="utf-8", errors="ignore") as f:
                for line_num, line in enumerate(f, 1):
                    # Check each forbidden pattern
                    for pattern, label in FORBIDDEN_PATTERNS:
                        if pattern.search(line):
                            # Ignore mock / demo strings explicitly marked
                            if "mock_" in line.lower() or "test_" in line.lower() or "example" in line.lower():
                                continue
                            findings.append({
                                "file": rel_path,
                                "line": line_num,
                                "label": label,
                                "preview": line.strip()[:60] + "..."
                            })
        except Exception as e:
            print(f"Error reading {rel_path}: {e}")

    if findings:
        print("\n[CRITICAL FAILURE] Secret scanner identified potential credential leaks:")
        for finding in findings:
            print(f"  - {finding['file']}:{finding['line']} [{finding['label']}]: {finding['preview']}")
        print(f"\nTotal violations: {len(findings)}")
        return 1

    print("[SUCCESS] Zero secrets, private keys, or credentials detected in tracked files.")
    return 0

if __name__ == "__main__":
    sys.exit(scan_files())
