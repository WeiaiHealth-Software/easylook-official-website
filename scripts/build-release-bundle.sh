#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
RELEASE_ID="${RELEASE_ID:-release-$(date +%Y%m%d%H%M%S)}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$PROJECT_DIR/.local/releases/$RELEASE_ID}"
BUNDLE_DIR="${BUNDLE_DIR:-$ARTIFACT_DIR/bundle}"
STATIC_DIR="$BUNDLE_DIR/runtime/public"
OVO_SCRIPTS_DIR="$BUNDLE_DIR/scripts/ovo"
APP_VERSION="$(
  cd "$PROJECT_DIR" && node - <<'NODE'
const pkg = require("./package.json");
const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
process.stdout.write(version || "0.1.0");
NODE
)"
BUILD_TIMESTAMP="${BUILD_TIMESTAMP:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
BUILD_COMMIT_SHA="${BUILD_COMMIT_SHA:-${GITHUB_SHA:-local-dev}}"
BUILD_BRANCH="${BUILD_BRANCH:-${GITHUB_REF_NAME:-local}}"
BUILD_WORKFLOW="${BUILD_WORKFLOW:-${GITHUB_WORKFLOW:-manual}}"
BUILD_RUN_ID="${BUILD_RUN_ID:-${GITHUB_RUN_ID:-local-run}}"
BUILD_ACTOR="${BUILD_ACTOR:-${GITHUB_ACTOR:-local-user}}"
PUBLIC_URL="${PUBLIC_URL:-/easylook-website/}"
EASYLOOK_SITE_PUBLIC_BASE="${EASYLOOK_SITE_PUBLIC_BASE:-$PUBLIC_URL}"
EASYLOOK_SITE_TARGET_ROOT="${EASYLOOK_SITE_TARGET_ROOT:-/var/www/easylook-website/build}"
EASYLOOK_SITE_HEALTHCHECK_URL="${EASYLOOK_SITE_HEALTHCHECK_URL:-http://localhost${EASYLOOK_SITE_PUBLIC_BASE}}"
REPO_URL="${REPO_URL:-}"

normalize_public_base() {
  local value="${1:-/}"
  value="$(printf '%s' "$value" | tr -d '[:space:]')"
  if [ -z "$value" ] || [ "$value" = "/" ]; then
    printf '/\n'
    return 0
  fi
  value="${value#/}"
  value="${value%/}"
  printf '/%s/\n' "$value"
}

ensure_yarn_install() {
  if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    (cd "$PROJECT_DIR" && yarn install --frozen-lockfile)
  fi
}

EASYLOOK_SITE_PUBLIC_BASE="$(normalize_public_base "$EASYLOOK_SITE_PUBLIC_BASE")"
if [ -z "$REPO_URL" ] && [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  REPO_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}"
fi

ensure_yarn_install
(cd "$PROJECT_DIR" && PUBLIC_URL="$EASYLOOK_SITE_PUBLIC_BASE" bash scripts/build-with-release-meta.sh)

if [ ! -f "$PROJECT_DIR/build/index.html" ]; then
  echo "missing build output: $PROJECT_DIR/build/index.html" >&2
  exit 1
fi

rm -rf "$BUNDLE_DIR"
mkdir -p "$STATIC_DIR" "$OVO_SCRIPTS_DIR"

cp -R "$PROJECT_DIR/build/." "$STATIC_DIR/"
cp "$PROJECT_DIR/scripts/ovo/common.sh" "$OVO_SCRIPTS_DIR/common.sh"
cp "$PROJECT_DIR/scripts/ovo/deploy.sh" "$OVO_SCRIPTS_DIR/deploy.sh"
cp "$PROJECT_DIR/scripts/ovo/healthcheck.sh" "$OVO_SCRIPTS_DIR/healthcheck.sh"
cp "$PROJECT_DIR/scripts/ovo/status.sh" "$OVO_SCRIPTS_DIR/status.sh"
chmod 755 "$OVO_SCRIPTS_DIR/deploy.sh" "$OVO_SCRIPTS_DIR/healthcheck.sh" "$OVO_SCRIPTS_DIR/status.sh"
chmod 644 "$OVO_SCRIPTS_DIR/common.sh"

cat >"$BUNDLE_DIR/.env" <<EOF
EASYLOOK_SITE_TARGET_ROOT=${EASYLOOK_SITE_TARGET_ROOT}
EASYLOOK_SITE_HEALTHCHECK_URL=${EASYLOOK_SITE_HEALTHCHECK_URL}
EASYLOOK_SITE_HEALTHCHECK_TIMEOUT=${EASYLOOK_SITE_HEALTHCHECK_TIMEOUT:-30}
EASYLOOK_SITE_PUBLIC_BASE=${EASYLOOK_SITE_PUBLIC_BASE}
APP_VERSION=${APP_VERSION}
RELEASE_ID=${RELEASE_ID}
EOF

cat >"$BUNDLE_DIR/meta.json" <<EOF
{
  "release_id": "${RELEASE_ID}",
  "version": "${APP_VERSION}",
  "app_version": "${APP_VERSION}",
  "bundle_name": "easylook-website",
  "target_root": "${EASYLOOK_SITE_TARGET_ROOT}",
  "base_path": "${EASYLOOK_SITE_PUBLIC_BASE}",
  "healthcheck_url": "${EASYLOOK_SITE_HEALTHCHECK_URL}",
  "stack": "static-spa",
  "build": {
    "generated_at": "${BUILD_TIMESTAMP}",
    "commit_sha": "${BUILD_COMMIT_SHA}",
    "branch": "${BUILD_BRANCH}",
    "workflow": "${BUILD_WORKFLOW}",
    "run_id": "${BUILD_RUN_ID}",
    "actor": "${BUILD_ACTOR}"
  },
  "deploy": {
    "runtime": "static-nginx",
    "strategy": "rsync",
    "entrypoint": "scripts/ovo/deploy.sh",
    "healthcheck": "scripts/ovo/healthcheck.sh"
  },
  "links": {
    "repo": "${REPO_URL}",
    "preview_path": "${EASYLOOK_SITE_PUBLIC_BASE}"
  }
}
EOF

cp "$BUNDLE_DIR/meta.json" "$BUNDLE_DIR/release.json"

echo "[*] release bundle prepared at $BUNDLE_DIR"
echo "bundle_dir=$BUNDLE_DIR"
