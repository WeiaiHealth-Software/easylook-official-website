#!/usr/bin/env bash
set -euo pipefail
# 用法：pnpm bundle:upy v1.2.3 [artifacts/bundle.zip]
tag="${1:?需要版本 tag，例如 v1.2.3}"
output="${2:-artifacts/bundle.zip}"
if [[ ! "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo '仅支持 vMAJOR.MINOR.PATCH 正式版本' >&2
  exit 1
fi
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
[[ ! -e "$output" && ! -e "$output.sha256" ]] || { echo '输出已存在，请使用新路径' >&2; exit 1; }
version="${tag#v}"
# 避免复用旧构建产物。
python3 -c 'import shutil; shutil.rmtree("build", ignore_errors=True)'
APP_VERSION="$version" RELEASE_ID="$tag" pnpm build
[[ -f build/index.html ]] || { echo '缺少 build/index.html' >&2; exit 1; }
stage="$(mktemp -d "${TMPDIR:-/tmp}/easylook-upy.XXXXXX")"
trap 'python3 -c '\''import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)'\'' "$stage"' EXIT
cp -R build "$stage/dist"
python3 - "$stage" "$version" <<'PY'
import json
import sys
from pathlib import Path
manifest = {"name": "easylook-website", "version": sys.argv[2], "type": "static", "static": {"directory": "dist"}}
(Path(sys.argv[1]) / "upy.yaml").write_text(json.dumps(manifest, indent=2) + "\n")
PY
python3 scripts/upy/pack_bundle.py --stage "$stage" --output "$output"
