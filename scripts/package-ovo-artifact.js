#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import process from "node:process";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..");

// 这里仍然调用系统 zip，而不是换成 JS 压缩库。
// 原因是带密码的 zip 在系统工具上的兼容性和可预期性更好，
// 对 OVO 这条发布链来说更稳。
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// zip 文件名使用“对外发布版本名”，而不是内部 release_id。
// 这样下载包、OVO 后台展示、人工排查时看到的都是更稳定的版本语义。
function resolveArchiveBaseName(meta, releaseID) {
  const appVersion =
    typeof meta.app_version === "string" && meta.app_version.trim()
      ? meta.app_version.trim()
      : typeof meta.version === "string" && meta.version.trim()
        ? meta.version.trim()
        : "";
  const explicitTag =
    process.env.RELEASE_TAG ||
    process.env.OVO_RELEASE_TAG ||
    (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "") ||
    meta.release_tag;
  const normalized = String(explicitTag || "").trim() || (appVersion ? `v${appVersion}` : releaseID);
  return normalized
    .replace(/[<>:"/\\|?*]/g, "-")
    .split("")
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("");
}

const defaultReleasesDir = resolve(ROOT_DIR, ".local/releases");
let artifactDir = process.env.ARTIFACT_DIR || "";

if (!artifactDir) {
  // 优先按最明确的输入推导 artifact 目录：
  // 1. 直接给了 BUNDLE_DIR
  // 2. 给了 RELEASE_ID
  // 3. 本地自动选择最近一次 release 目录
  // 这样 workflow、手工调试、本地补打包都能共用同一个入口。
  if (process.env.BUNDLE_DIR) {
    artifactDir = dirname(process.env.BUNDLE_DIR);
  } else if (process.env.RELEASE_ID) {
    artifactDir = resolve(defaultReleasesDir, process.env.RELEASE_ID);
  } else if (existsSync(defaultReleasesDir)) {
    artifactDir =
      readdirSync(defaultReleasesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => resolve(defaultReleasesDir, entry.name))
        .sort()
        .at(-1) || "";
  }
}

if (!artifactDir) {
  // 如果前面都没有命中，就生成一个本地临时 release id。
  // 这样在还没正式接 GitHub Actions 或 OVO workflow 时，也能手工做冒烟测试。
  const fallbackReleaseID = `release-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
  artifactDir = resolve(defaultReleasesDir, fallbackReleaseID);
}

artifactDir = resolve(artifactDir);
const releaseID = process.env.RELEASE_ID || basename(artifactDir) || "release";
const bundleDir = process.env.BUNDLE_DIR || resolve(artifactDir, "bundle");
const bundleZipPassword =
  process.env.BUNDLE_ZIP_PASSWORD || randomBytes(24).toString("base64url");

const metaPath = resolve(bundleDir, "meta.json");
if (!existsSync(metaPath)) {
  console.error(`meta.json is required in bundle root: ${metaPath}`);
  process.exit(1);
}

const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const archiveBaseName = resolveArchiveBaseName(meta, releaseID);
const zipPath = process.env.ZIP_PATH || resolve(artifactDir, `${archiveBaseName}.zip`);
// archive 字段是 OVO 上传后继续使用的压缩包描述信息，
// 所以要先把格式、压缩级别、密码写回 manifest，
// 再去真正创建 zip，确保元数据和实际产物一致。
meta.archive = {
  ...(typeof meta.archive === "object" && meta.archive ? meta.archive : {}),
  file_name: `${archiveBaseName}.zip`,
  format: "zip",
  compression_method: "deflate",
  compression_level: 9,
  password: bundleZipPassword,
};

writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

mkdirSync(artifactDir, { recursive: true });
rmSync(zipPath, { force: true });

// 直接在 bundle 根目录执行 zip，这样解压出来就是 OVO 预期的运行时结构，
// 不会额外多一层顶级目录，减少 client 侧再做路径修正的复杂度。
run(
  "zip",
  ["-q", "-r", "-9", "-P", bundleZipPassword, zipPath, "."],
  { cwd: bundleDir },
);

console.log(`[*] packaged encrypted bundle at ${zipPath}`);
console.log(`zip_path=${zipPath}`);
