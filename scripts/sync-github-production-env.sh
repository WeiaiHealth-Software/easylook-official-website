#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.production"
GITHUB_ENVIRONMENT="production"
GITHUB_REPOSITORY=""
DRY_RUN=0

REQUIRED_SECRET_KEYS=(
  OVO_SERVER_URL
  OVO_DEPLOY_TOKEN
)

REQUIRED_VARIABLE_KEYS=(
  OVO_TARGET_CLIENT_ID
  OVO_SERVICE_ID
)

OPTIONAL_VARIABLE_KEYS=(
  OVO_PUBLIC_URL
  OVO_DEPLOY_TARGET_ROOT
  OVO_HEALTHCHECK_URL
  OVO_HEALTHCHECK_TIMEOUT
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

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

dotenv_value() {
  local key="$1"
  node - "$ENV_FILE" "$key" <<'NODE'
const fs = require("fs");

const envFile = process.argv[2];
const targetKey = process.argv[3];
const content = fs.readFileSync(envFile, "utf8");

for (const rawLine of content.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separatorIndex = line.indexOf("=");
  if (separatorIndex === -1) continue;
  const key = line.slice(0, separatorIndex).trim();
  if (key !== targetKey) continue;
  let value = line.slice(separatorIndex + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  process.stdout.write(value);
  break;
}
NODE
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
  value="$(dotenv_value "$key")"
  if [[ -z "$value" ]]; then
    echo "missing required key in .env.production: $key" >&2
    exit 1
  fi
  echo "[*] sync secret $key"
  gh_secret_set_value "$key" "$value"
done

for key in "${REQUIRED_VARIABLE_KEYS[@]}"; do
  value="$(dotenv_value "$key")"
  if [[ -z "$value" ]]; then
    echo "missing required key in .env.production: $key" >&2
    exit 1
  fi
  echo "[*] sync variable $key"
  gh_variable_set_value "$key" "$value"
done

for key in "${OPTIONAL_VARIABLE_KEYS[@]}"; do
  value="$(dotenv_value "$key")"
  if [[ -z "$value" ]]; then
    continue
  fi
  echo "[*] sync variable $key"
  gh_variable_set_value "$key" "$value"
done
