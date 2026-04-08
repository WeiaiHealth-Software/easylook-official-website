#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

case "${1:-check}" in
  check)
    wait_for_service_health "${EASYLOOK_SITE_HEALTHCHECK_TIMEOUT:-30}"
    ;;
  once)
    check_service_health_once
    ;;
  *)
    echo "usage: $0 [check|once]" >&2
    exit 1
    ;;
esac
