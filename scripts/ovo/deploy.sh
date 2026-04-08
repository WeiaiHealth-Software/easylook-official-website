#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

log() {
  printf '[easylook-site] %s\n' "$*"
}

require_static_payload() {
  if [ ! -d "$STATIC_SOURCE_DIR" ]; then
    echo "missing static payload: $STATIC_SOURCE_DIR" >&2
    exit 1
  fi
}

sync_static_payload() {
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$STATIC_SOURCE_DIR/" "$tmp_dir/"
  else
    (
      cd "$STATIC_SOURCE_DIR"
      tar -cf - .
    ) | (
      cd "$tmp_dir"
      tar -xf -
    )
  fi

  rm -rf "$OVO_DEPLOY_TARGET_ROOT"
  mkdir -p "$OVO_DEPLOY_TARGET_ROOT"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$tmp_dir/" "$OVO_DEPLOY_TARGET_ROOT/"
  else
    (
      cd "$tmp_dir"
      tar -cf - .
    ) | (
      cd "$OVO_DEPLOY_TARGET_ROOT"
      tar -xf -
    )
  fi

  rm -rf "$tmp_dir"
}

write_release_metadata() {
  if [ -f "$RELEASE_JSON" ]; then
    cp "$RELEASE_JSON" "$OVO_DEPLOY_TARGET_ROOT/release.json"
  fi
}

require_static_payload
log "syncing static assets from $STATIC_SOURCE_DIR to $OVO_DEPLOY_TARGET_ROOT"
sync_static_payload
if [ ! -f "$OVO_DEPLOY_TARGET_ROOT/index.html" ]; then
  log "copy failed: missing $OVO_DEPLOY_TARGET_ROOT/index.html after sync"
  exit 1
fi
write_release_metadata
log "copied static assets for release $RELEASE_ID (v$APP_VERSION)"

if bash "$SCRIPT_DIR/healthcheck.sh" check; then
  log "site ready at $OVO_DEPLOY_TARGET_ROOT and $OVO_HEALTHCHECK_URL"
else
  log "deployment finished, but health check did not return HTTP 200"
  exit 1
fi
