#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$BUNDLE_DIR/.env"
RUNTIME_ENV_FILE="$BUNDLE_DIR/.env.runtime"
STATIC_SOURCE_DIR="$BUNDLE_DIR/runtime/public"
RELEASE_JSON="$BUNDLE_DIR/release.json"
OVO_DEPLOY_TARGET_ROOT="${OVO_DEPLOY_TARGET_ROOT:-${EASYLOOK_SITE_TARGET_ROOT:-/var/www/easylook-website/build}}"
OVO_HEALTHCHECK_URL="${OVO_HEALTHCHECK_URL:-${EASYLOOK_SITE_HEALTHCHECK_URL:-http://localhost/}}"
OVO_HEALTHCHECK_TIMEOUT="${OVO_HEALTHCHECK_TIMEOUT:-${EASYLOOK_SITE_HEALTHCHECK_TIMEOUT:-30}}"
OVO_PUBLIC_URL="${OVO_PUBLIC_URL:-${EASYLOOK_SITE_PUBLIC_BASE:-/}}"
APP_VERSION="${APP_VERSION:-0.0.0}"
RELEASE_ID="${RELEASE_ID:-dev}"

load_env_file() {
  local path="$1"
  if [ ! -f "$path" ]; then
    return 0
  fi
  set -a
  # shellcheck disable=SC1090
  . "$path"
  set +a
}

load_bundle_env() {
  # `.env.runtime` 只作为补充变量来源，不应该覆盖 bundle 自带的稳定配置。
  # 先加载 runtime，再加载 bundle 原始 `.env`，这样：
  # 1. runtime 里独有的业务变量仍然可用
  # 2. bundle 中明确写死的 OVO_*、RELEASE_ID、APP_VERSION 等稳定字段始终优先
  load_env_file "$RUNTIME_ENV_FILE"
  load_env_file "$ENV_FILE"
}

filesystem_ready() {
  [ -d "$OVO_DEPLOY_TARGET_ROOT" ] && [ -f "$OVO_DEPLOY_TARGET_ROOT/index.html" ]
}

http_probe() {
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location "$OVO_HEALTHCHECK_URL" >/dev/null
    return $?
  fi
  if command -v wget >/dev/null 2>&1; then
    wget --quiet --server-response --output-document=/dev/null "$OVO_HEALTHCHECK_URL" 2>&1 \
      | awk 'BEGIN{ok=0} /^  HTTP\\// { if ($2 == "200") ok=1; else ok=0 } END{ exit ok ? 0 : 1 }'
    return $?
  fi
  return 127
}

check_service_health_once() {
  if ! filesystem_ready; then
    return 1
  fi
  http_probe
  case "$?" in
    0) return 0 ;;
    127) return 0 ;;
    *) return 1 ;;
  esac
}

wait_for_service_health() {
  local timeout="${1:-$OVO_HEALTHCHECK_TIMEOUT}"
  local elapsed=0
  while [ "$elapsed" -lt "$timeout" ]; do
    if check_service_health_once; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

print_service_status() {
  local filesystem_status http_status
  if filesystem_ready; then
    filesystem_status="ready"
  else
    filesystem_status="missing"
  fi
  if http_probe; then
    http_status="healthy"
  else
    case "$?" in
      127) http_status="probe-unavailable" ;;
      *) http_status="unhealthy" ;;
    esac
  fi
  echo "service_name=easylook-website"
  echo "target_root=$OVO_DEPLOY_TARGET_ROOT"
  echo "release_id=$RELEASE_ID"
  echo "app_version=$APP_VERSION"
  echo "public_base=$OVO_PUBLIC_URL"
  echo "healthcheck_url=$OVO_HEALTHCHECK_URL"
  echo "filesystem_status=$filesystem_status"
  echo "http_status=$http_status"
}

load_bundle_env
