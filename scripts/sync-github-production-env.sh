#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.production"
GITHUB_ENVIRONMENT="production"
GITHUB_REPOSITORY=""
DRY_RUN=0
SYNC_PREFIX="SYNC_"

REQUIRED_SECRET_KEYS=(
  OVO_DEPLOY_TOKEN
)

OPTIONAL_VARIABLE_KEYS=(
  OVO_TARGET_CLIENT_ID
  OVO_SERVICE_ID
  OVO_PUBLIC_URL
  OVO_DEPLOY_TARGET_ROOT
  OVO_HEALTHCHECK_URL
)

usage() {
  cat <<'USAGE'
usage: ./scripts/sync-github-production-env.sh [options]

options:
  --env-file <path>   dotenv file to read. default: ./.env.production
  --env <name>        GitHub Environment name. default: production
  --repo <owner/repo> Target GitHub repository. default: current git remote
  --dry-run           Print planned gh commands without applying them
  -h, --help          Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --env)
      GITHUB_ENVIRONMENT="$2"
      shift 2
      ;;
    --repo)
      GITHUB_REPOSITORY="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$ROOT_DIR/$ENV_FILE"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is required" >&2
  exit 1
fi

dotenv_value() {
  local key="$1"
  python3 - "$ENV_FILE" "$key" <<'PY'
import sys
env_file, target = sys.argv[1], sys.argv[2]
with open(env_file, "r", encoding="utf-8") as fh:
    for raw in fh:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key != target:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        print(value)
        break
PY
}

resolve_repository() {
  if [[ -n "$GITHUB_REPOSITORY" ]]; then
    printf '%s\n' "$GITHUB_REPOSITORY"
    return 0
  fi
  local remote_url
  remote_url="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote_url" =~ github.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    printf '%s/%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return 0
  fi
  gh repo view --json nameWithOwner --jq '.nameWithOwner'
}

ensure_env() {
  local repo="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "gh api --method PUT repos/$repo/environments/$GITHUB_ENVIRONMENT"
    return 0
  fi
  gh api --method PUT "repos/$repo/environments/$GITHUB_ENVIRONMENT" >/dev/null
}

gh_secret_set_value() {
  local key="$1"
  local value="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "gh secret set $key --env $GITHUB_ENVIRONMENT --repo $GITHUB_REPOSITORY <redacted>"
    return 0
  fi
  printf '%s' "$value" | gh secret set "$key" --env "$GITHUB_ENVIRONMENT" --repo "$GITHUB_REPOSITORY"
}

gh_variable_set_value() {
  local key="$1"
  local value="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "gh variable set $key --env $GITHUB_ENVIRONMENT --repo $GITHUB_REPOSITORY --body <value>"
    return 0
  fi
  gh variable set "$key" --env "$GITHUB_ENVIRONMENT" --repo "$GITHUB_REPOSITORY" --body "$value"
}

GITHUB_REPOSITORY="$(resolve_repository)"
ensure_env "$GITHUB_REPOSITORY"

for key in "${REQUIRED_SECRET_KEYS[@]}"; do
  value="$(dotenv_value "${SYNC_PREFIX}${key}")"
  if [[ -z "$value" ]]; then
    echo "missing required key in .env.production: ${SYNC_PREFIX}${key}" >&2
    exit 1
  fi
  echo "[*] sync secret $key"
  gh_secret_set_value "$key" "$value"
done

for key in "${OPTIONAL_VARIABLE_KEYS[@]}"; do
  value="$(dotenv_value "${SYNC_PREFIX}${key}")"
  if [[ -z "$value" ]]; then
    continue
  fi
  echo "[*] sync variable $key"
  gh_variable_set_value "$key" "$value"
done
