#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
DEFAULT_RELEASES_DIR="$PROJECT_DIR/.local/releases"

resolve_latest_artifact_dir() {
  if [ ! -d "$DEFAULT_RELEASES_DIR" ]; then
    return 1
  fi
  find "$DEFAULT_RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1
}

if [ -n "${ARTIFACT_DIR:-}" ]; then
  ARTIFACT_DIR="$ARTIFACT_DIR"
elif [ -n "${BUNDLE_DIR:-}" ]; then
  ARTIFACT_DIR="$(cd "$(dirname "$BUNDLE_DIR")" && pwd)"
elif [ -n "${RELEASE_ID:-}" ]; then
  ARTIFACT_DIR="$DEFAULT_RELEASES_DIR/$RELEASE_ID"
else
  ARTIFACT_DIR="$(resolve_latest_artifact_dir || true)"
  if [ -z "$ARTIFACT_DIR" ]; then
    RELEASE_ID="release-$(date +%Y%m%d%H%M%S)"
    ARTIFACT_DIR="$DEFAULT_RELEASES_DIR/$RELEASE_ID"
  fi
fi

ARTIFACT_DIR="$(cd "$(dirname "$ARTIFACT_DIR")" 2>/dev/null && pwd)/$(basename "$ARTIFACT_DIR")"
RELEASE_ID="${RELEASE_ID:-$(basename "$ARTIFACT_DIR")}"
BUNDLE_DIR="${BUNDLE_DIR:-$ARTIFACT_DIR/bundle}"
ZIP_PATH="${ZIP_PATH:-$ARTIFACT_DIR/ovo-release-$RELEASE_ID.zip}"
BUNDLE_ZIP_PASSWORD="${BUNDLE_ZIP_PASSWORD:-}"

if [ ! -f "$BUNDLE_DIR/meta.json" ]; then
  echo "meta.json is required in bundle root: $BUNDLE_DIR/meta.json" >&2
  exit 1
fi

if [ -z "$BUNDLE_ZIP_PASSWORD" ]; then
  BUNDLE_ZIP_PASSWORD="$(
    python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(24))
PY
  )"
fi

python3 - "$BUNDLE_DIR/meta.json" "$BUNDLE_ZIP_PASSWORD" <<'PY'
import json
import sys

path = sys.argv[1]
password = sys.argv[2]

with open(path, "r", encoding="utf-8") as fh:
    payload = json.load(fh)

archive = payload.get("archive")
if not isinstance(archive, dict):
    archive = {}

archive["format"] = "zip"
archive["compression_method"] = "deflate"
archive["compression_level"] = 9
archive["password"] = password
payload["archive"] = archive

with open(path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY

cp "$BUNDLE_DIR/meta.json" "$BUNDLE_DIR/release.json"

mkdir -p "$ARTIFACT_DIR"
rm -f "$ZIP_PATH"
(
  cd "$BUNDLE_DIR"
  zip -q -r -9 -P "$BUNDLE_ZIP_PASSWORD" "$ZIP_PATH" .
)

echo "[*] packaged encrypted bundle at $ZIP_PATH"
echo "zip_path=$ZIP_PATH"
