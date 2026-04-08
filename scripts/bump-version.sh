#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_JSON="$PROJECT_DIR/package.json"

usage() {
  echo "usage: bash scripts/bump-version.sh [patch|minor|major|x.y.z]" >&2
  exit 1
}

if [ $# -ne 1 ]; then
  usage
fi

TARGET="$1"

node - "$PACKAGE_JSON" "$TARGET" <<'NODE'
const fs = require('fs');

const path = process.argv[2];
const target = process.argv[3];
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
const current = String(pkg.version || '0.1.0').trim();
const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) {
  throw new Error(`invalid current version: ${current}`);
}

let [major, minor, patch] = match.slice(1).map(Number);

if (target === 'patch') {
  patch += 1;
} else if (target === 'minor') {
  minor += 1;
  patch = 0;
} else if (target === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (/^\d+\.\d+\.\d+$/.test(target)) {
  [major, minor, patch] = target.split('.').map(Number);
} else {
  throw new Error(`unsupported version target: ${target}`);
}

pkg.version = `${major}.${minor}.${patch}`;
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
process.stdout.write(pkg.version);
NODE

echo
