#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APP_VERSION="$(
  cd "$PROJECT_DIR" && node - <<'NODE'
const pkg = require("./package.json");
const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
process.stdout.write(version || "0.1.0");
NODE
)"

GIT_COMMIT_HASH="${GIT_COMMIT_HASH:-${GITHUB_SHA:-}}"
if [ -z "$GIT_COMMIT_HASH" ]; then
  GIT_COMMIT_HASH="$(cd "$PROJECT_DIR" && git rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
fi
GIT_COMMIT_HASH="${GIT_COMMIT_HASH%%$'\n'*}"
RELEASE_ID="${RELEASE_ID:-${GITHUB_SHA:-$GIT_COMMIT_HASH}}"
BUILD_TIME="${BUILD_TIME:-$(date -u +"%Y%m%d-%H%M%S")}"

cd "$PROJECT_DIR"
BUILD_TIME="$BUILD_TIME" GIT_COMMIT_HASH="$GIT_COMMIT_HASH" RELEASE_ID="$RELEASE_ID" yarn build

INDEX_HTML="$PROJECT_DIR/build/index.html"
if [ ! -f "$INDEX_HTML" ]; then
  echo "missing build output: $INDEX_HTML" >&2
  exit 1
fi

python3 - "$INDEX_HTML" "$APP_VERSION" "$GIT_COMMIT_HASH" "$RELEASE_ID" "$BUILD_TIME" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
version = sys.argv[2]
commit = sys.argv[3]
release = sys.argv[4]
build_time = sys.argv[5]

content = path.read_text(encoding="utf-8")

markers = [
    f'  <meta name="easylook:version" content="{version}" />',
    f'  <meta name="easylook:commit" content="{commit}" />',
    f'  <meta name="easylook:release" content="{release}" />',
]
buildinfo_tag = '  <script id="buildinfo" type="application/json">{}</script>'.format(
    json.dumps(
        {
            "VERSION": version,
            "BUILD_TIME": build_time,
            "COMMIT_HASH": commit,
            "RELEASE_ID": release,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
)

for prefix in (
    '  <meta name="easylook:version"',
    '  <meta name="easylook:commit"',
    '  <meta name="easylook:release"',
    '  <script id="buildinfo"',
):
    lines = []
    for line in content.splitlines():
      if line.strip().startswith(prefix.strip()):
        continue
      lines.append(line)
    content = "\n".join(lines) + ("\n" if content.endswith("\n") else "")

injection = "\n".join(markers + [buildinfo_tag]) + "\n"
if "</head>" not in content:
    raise SystemExit("missing </head> in build/index.html")
content = content.replace("</head>", injection + "</head>", 1)
path.write_text(content, encoding="utf-8")
PY
