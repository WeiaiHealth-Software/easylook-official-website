#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  chmodSync,
  copyFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..");

// 统一 public base 的格式，确保前端构建产物和 OVO 运行时脚本
// 看到的是完全一致的访问前缀，避免出现一个地方是 `/foo`
// 另一个地方是 `/foo/` 的路径偏差。
function normalizePublicBase(value = "/") {
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}

// 版本号直接以 package.json 为单一事实来源，
// 这样构建注入的版本、bundle 元数据、最终发布记录都不会各算各的。
function resolvePackageVersion() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT_DIR, "package.json"), "utf8"));
  const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
  return version || "0.1.0";
}

// bundle 对外展示的名字优先跟随 tag 语义。
// 如果当前不是 tag 构建，就退回到 `v<package version>`，
// 这样最终产物仍然是一个稳定、可读的版本名。
function resolveReleaseTag(appVersion) {
  const explicitTag =
    process.env.RELEASE_TAG ||
    process.env.OVO_RELEASE_TAG ||
    (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "");
  const normalized = String(explicitTag || "").trim();
  return normalized || `v${appVersion}`;
}

// 统一执行外部命令：
// 1. 直接透传标准输出和错误输出，方便在 CI 里排查问题
// 2. 只要子命令失败就立即退出，避免后续步骤继续污染现场
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// 某些发布字段优先使用真实 git 信息，但本地手工调试时可能没有完整上下文，
// 这里需要允许优雅降级，而不是直接把构建卡死。
function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

let gitCommitHash = process.env.GIT_COMMIT_HASH || process.env.GITHUB_SHA || "";
if (!gitCommitHash) {
  try {
    gitCommitHash = capture("git", ["rev-parse", "--short", "HEAD"], {
      cwd: ROOT_DIR,
    });
  } catch {
    gitCommitHash = "unknown";
  }
}

const releaseID =
  process.env.RELEASE_ID || `release-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
const artifactDir =
  process.env.ARTIFACT_DIR || resolve(ROOT_DIR, ".local/releases", releaseID);
const bundleDir = process.env.BUNDLE_DIR || resolve(artifactDir, "bundle");
const staticDir = resolve(bundleDir, "runtime/public");
const ovoScriptsDir = resolve(bundleDir, "scripts/ovo");
const appVersion = process.env.APP_VERSION || resolvePackageVersion();
const releaseTag = resolveReleaseTag(appVersion);
const buildTimestamp = process.env.BUILD_TIMESTAMP || new Date().toISOString();
const buildCommitSha = process.env.BUILD_COMMIT_SHA || process.env.GITHUB_SHA || "local-dev";
const buildBranch = process.env.BUILD_BRANCH || process.env.GITHUB_REF_NAME || "local";
const buildWorkflow = process.env.BUILD_WORKFLOW || process.env.GITHUB_WORKFLOW || "manual";
const buildRunID = process.env.BUILD_RUN_ID || process.env.GITHUB_RUN_ID || "local-run";
const buildActor = process.env.BUILD_ACTOR || process.env.GITHUB_ACTOR || "local-user";
const publicUrl = normalizePublicBase(process.env.OVO_PUBLIC_URL || process.env.PUBLIC_URL || "/");
const deployTargetRoot =
  process.env.OVO_DEPLOY_TARGET_ROOT || "/var/www/easylook-website/build";
const healthcheckTimeout = process.env.OVO_HEALTHCHECK_TIMEOUT || "30";
const healthcheckURL =
  process.env.OVO_HEALTHCHECK_URL || `http://localhost${publicUrl}`;
const repoURL =
  process.env.REPO_URL ||
  (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
    : "");
// `--build-only` 是一个轻量入口：
// 只做“带版本元信息的前端构建”，不继续生成 OVO runtime bundle。
// 这样本地验证版本注入时，不需要每次都走完整打包链路。
const buildOnly = process.argv.includes("--build-only");

if (!existsSync(resolve(ROOT_DIR, "node_modules"))) {
  run("yarn", ["install", "--frozen-lockfile"], { cwd: ROOT_DIR });
}

// 版本、commit、release id 等信息都在前端构建阶段注入。
// 这个脚本本身不直接改 index.html，只负责把规范化后的环境变量传给构建工具。
run("yarn", ["build"], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    BUILD_TIME:
      process.env.BUILD_TIME ||
      new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"),
    GIT_COMMIT_HASH: gitCommitHash,
    PUBLIC_URL: publicUrl,
    OVO_PUBLIC_URL: publicUrl,
    RELEASE_ID: releaseID,
    APP_VERSION: appVersion,
  },
});

const buildIndexPath = resolve(ROOT_DIR, "build/index.html");
if (!existsSync(buildIndexPath)) {
  console.error(`missing build output: ${buildIndexPath}`);
  process.exit(1);
}

if (buildOnly) {
  console.log(`[*] release metadata build prepared at ${resolve(ROOT_DIR, "build")}`);
  process.exit(0);
}

// 每次都从零重建 bundle 目录，确保当前 release 只包含本次构建产物，
// 不会夹带上一次构建残留的静态文件或旧元数据。
rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(staticDir, { recursive: true });
mkdirSync(ovoScriptsDir, { recursive: true });

// 把 build 目录下的最终静态产物逐项复制到 bundle 运行时目录。
// 这里复制“内容”而不是整个 build 目录本身，是为了让 client 解压后
// 能直接得到 runtime/public 下的站点文件布局。
for (const entry of readdirSync(resolve(ROOT_DIR, "build"))) {
  cpSync(resolve(ROOT_DIR, "build", entry), resolve(staticDir, entry), {
    recursive: true,
    force: true,
  });
}

// 这些 shell 脚本会跟随 bundle 一起下发到 OVO client，
// 由目标机器在部署、健康检查、状态读取时直接执行。
// 因此这里要同时处理好复制和可执行权限。
for (const fileName of ["common.sh", "deploy.sh", "healthcheck.sh", "status.sh"]) {
  const source = resolve(ROOT_DIR, "scripts/ovo", fileName);
  const target = resolve(ovoScriptsDir, fileName);
  copyFileSync(source, target);
  chmodSync(target, fileName === "common.sh" ? 0o644 : 0o755);
}

// bundle 内的 .env 只保留运行时真正需要的少量变量。
// 目的是让 deploy/healthcheck 脚本拿到足够的信息，同时避免把无关构建上下文带到目标机器。
writeFileSync(
  resolve(bundleDir, ".env"),
  [
    `OVO_DEPLOY_TARGET_ROOT=${deployTargetRoot}`,
    `OVO_HEALTHCHECK_URL=${healthcheckURL}`,
    `OVO_HEALTHCHECK_TIMEOUT=${healthcheckTimeout}`,
    `OVO_PUBLIC_URL=${publicUrl}`,
    `APP_VERSION=${appVersion}`,
    `RELEASE_ID=${releaseID}`,
    "",
  ].join("\n"),
);

// meta.json 既是 OVO 发布链路读取的 release manifest，
// 也是下一步生成加密 zip 时继续补 archive 信息的基础文件。
// release.json 这里先写成同一份内容，方便后续流程始终读取统一结构。
const meta = {
  release_id: releaseID,
  version: appVersion,
  app_version: appVersion,
  bundle_name: `${releaseTag}.zip`,
  release_tag: releaseTag,
  target_root: deployTargetRoot,
  base_path: publicUrl,
  healthcheck_url: healthcheckURL,
  stack: "static-spa",
  build: {
    generated_at: buildTimestamp,
    commit_sha: buildCommitSha,
    branch: buildBranch,
    workflow: buildWorkflow,
    run_id: buildRunID,
    actor: buildActor,
  },
  deploy: {
    runtime: "static-nginx",
    strategy: "rsync",
    entrypoint: "scripts/ovo/deploy.sh",
    healthcheck: "scripts/ovo/healthcheck.sh",
  },
  links: {
    repo: repoURL,
    preview_path: publicUrl,
  },
};

writeFileSync(resolve(bundleDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
writeFileSync(resolve(bundleDir, "release.json"), `${JSON.stringify(meta, null, 2)}\n`);

console.log(`[*] release bundle prepared at ${bundleDir}`);
console.log(`bundle_dir=${bundleDir}`);
