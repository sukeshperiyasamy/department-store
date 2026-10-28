#!/usr/bin/env node
/**
 * CI Regression Check: No Emojis in User-Facing UI Code
 *
 * Scans all frontend UI components, pages, screens, and layouts for emoji characters.
 * Ensures all user-facing interface icons use professional vector icons (Lucide / Feather).
 *
 * Usage:
 *   node scripts/ci/check_no_emojis.js
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../..");

// Target UI directories
const UI_DIRECTORIES = [
  "apps/owner-dashboard/src",
  "apps/windows-pos/src",
  "apps/mobile/src",
  "apps/mobile/App.tsx",
];

// File extensions to inspect
const UI_EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".js", ".html"]);

// Excluded paths (build artifacts, tests, mocks)
const EXCLUDED_PATTERNS = [
  /node_modules/,
  /\.next/,
  /dist/,
  /build/,
  /coverage/,
  /\.test\.(ts|tsx|js|jsx)$/,
  /\.spec\.(ts|tsx|js|jsx)$/,
  /__tests__/,
  /__mocks__/,
];

// Documented intentional exceptions: [filePathRegex, reason]
const ALLOWLIST = [
  // Example: [/path\/to\/fixture\.ts$/, "Mock test fixture simulating user-typed emoji review"]
];

// Regex matching emoji characters while preserving normal typography and non-Latin scripts (Tamil, etc.)
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u;

function isAllowed(filePath, lineContent) {
  for (const [pattern] of ALLOWLIST) {
    if (pattern.test(filePath)) {
      return true;
    }
  }
  // Ignore comments that explicitly mention emoji unicode documentation or regexes
  if (lineContent.trim().startsWith("//") || lineContent.trim().startsWith("/*") || lineContent.trim().startsWith("*")) {
    return true;
  }
  return false;
}

function scanFile(filePath, violations) {
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(filePath)) return;
  }

  const ext = path.extname(filePath);
  if (!UI_EXTENSIONS.has(ext)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (EMOJI_REGEX.test(line)) {
      if (!isAllowed(filePath, line)) {
        const matches = line.match(new RegExp(EMOJI_REGEX.source, "gu")) || [];
        violations.push({
          file: path.relative(ROOT_DIR, filePath),
          line: index + 1,
          matches: Array.from(new Set(matches)),
          snippet: line.trim(),
        });
      }
    }
  });
}

function walkDir(dirPath, violations) {
  if (!fs.existsSync(dirPath)) return;
  const stat = fs.statSync(dirPath);
  if (stat.isFile()) {
    scanFile(dirPath, violations);
    return;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== "dist") {
        walkDir(fullPath, violations);
      }
    } else if (entry.isFile()) {
      scanFile(fullPath, violations);
    }
  }
}

function runCheck() {
  console.log("=== UI Emoji Audit & Regression Check ===");
  const violations = [];

  for (const relPath of UI_DIRECTORIES) {
    const targetPath = path.join(ROOT_DIR, relPath);
    walkDir(targetPath, violations);
  }

  if (violations.length === 0) {
    console.log("PASS: Zero emoji UI characters found across all inspected applications.");
    console.log(`Inspected workspaces: apps/owner-dashboard, apps/windows-pos, apps/mobile`);
    process.exit(0);
  } else {
    console.error(`FAIL: Found ${violations.length} emoji instance(s) in user-facing UI files:\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} -> [${v.matches.join(", ")}]`);
      console.error(`    ${v.snippet}\n`);
    }
    console.error("Please replace interface emojis with professional vector icons from lucide-react or @expo/vector-icons.");
    process.exit(1);
  }
}

runCheck();
