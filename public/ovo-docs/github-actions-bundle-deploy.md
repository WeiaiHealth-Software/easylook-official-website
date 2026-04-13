# GitHub Actions Bundle 部署指南

这篇文档面向要接入 GitHub Actions 的开发者。当前推荐只保留一条 workflow：

1. `deploy-server.yml`
   负责把带 tag 的 `main` 发布部署到 VPS，并在同一条 workflow 内按条件同步 `ovo-client` / `ovo-ci`

当前推荐链路是：

1. 推送 `v*` tag 到 `origin/main` 上的 commit
2. `deploy-server.yml` 在 GitHub Runner 上构建最新 `ovo-server` 镜像与 release archive
3. `deploy-server.yml` 访问 `${OVO_BASE_URL}/healthz`，确认新 `server` 已可用
4. `deploy-server.yml` 判断这次 tag 是否真的影响 `ovo-client` / `ovo-ci`
5. 如果需要构建，workflow 在 runner 上直接生成二进制目录
6. workflow 通过 `scp` 把二进制覆盖到 VPS 挂载目录；server 发布链路中的大体积归档则使用 `rsync --partial --inplace`
7. workflow 在 VPS 上更新 SQLite 的 `client_release_state.latest_built_at`
8. 新 `server` 从本地磁盘扫描 `.metadata.json`，把本地二进制记录同步回内存和资产快照

## 为什么合并成一个 workflow

这样做有三个好处：

- 发布时序更直观，一条 run 就能看到整次 server + binary 的完整结果
- 是否真的更新二进制仍由 workflow 自动判断，不需要再做手工导入
- 二进制步骤依旧可以按需跳过，不会在每个 tag 上都重复构建 8 个二进制

## `deploy-server.yml` 做什么

触发条件：

- `push.tags: v*`
- tag 指向的 commit 必须属于 `origin/main`

核心步骤：

1. 按白名单打包 server 部署所需的最小 release archive
2. 在 GitHub Runner 上执行 `docker build` 构建 `ovo-server` 镜像
3. 把 release archive 和镜像归档都通过 SSH / `rsync --partial --inplace` 发到 VPS
4. 生成运行时 `.env`
5. 远程执行 `deploy/server/deploy-on-vps.sh`
6. VPS 通过 `docker load` 导入 runner 构建好的镜像，再启动 compose
7. 轮询 `${OVO_BASE_URL}/healthz`
8. 判断这次 tag 是否需要重建 `ovo-client` / `ovo-ci`
9. 如果需要，就在同一条 workflow 里构建、上传、同步二进制并更新 SQLite

如果配置了 `OVO_DEPLOY_TOKEN`，workflow 还会在真正开始构建和上传前，先调用旧版本 server 的 `/api/system/events/notify` 接口，给订阅了“系统部署开始”的用户发送 Bark 提醒。这里优先复用已有 deploy token，不要求额外新增专用 token；`OVO_DEPLOY_NOTIFY_TOKEN` 只作为兼容旧配置的兜底。首次冷启动因为旧 server 还不存在，这一步可以为空并自动跳过。

为了便于排查，这条 workflow 现在会额外输出大量 `debug` 日志，包括：

- 解析后的默认值和关键路径
- release archive 白名单路径
- runner 侧镜像构建、镜像归档大小与 sha256
- release archive 的大小与 sha256
- 远端 Docker 镜像导入结果与 server image 元信息
- 运行时 `.env` 实际写入了哪些 key
- 远端 bootstrap 目录、compose 预览和 `docker compose ps`
- 对外 `${OVO_BASE_URL}/healthz` 的每次重试
- 二进制 rebuild 判断依据、上一版本 tag、命中的 changed files
- 本地构建出的二进制文件列表
- 压缩包大小与 sha256
- 远端解压后的文件列表、同步后的 binaries 目录内容
- SQLite 文件落盘情况

补充约束：

- workflow 现在会强制通过 `ssh ... /bin/bash -seuo pipefail <<EOF` 在 VPS 上执行远程脚本，不依赖远程用户默认 shell
- 如果目标机器把登录用户默认 shell 改成了 `fish`、`zsh` 或其他非 POSIX shell，部署步骤仍会统一按 Bash 解释

默认情况下，workflow 会把 `OVO_DOCKER_REGISTRY_MIRRORS` 收敛到 `https://docker.m.daocloud.io` 作为兼容兜底。当前 GitHub Actions 主链路已经不再要求 VPS 本地 `docker build`，所以镜像源配置只会在“没有上传镜像归档、回退到 VPS 本地 build”时才生效。如果生产机已经有更适合的大陆镜像源，可以在 GitHub Environment `production` 里覆写 `OVO_DOCKER_REGISTRY_MIRRORS`，使用逗号分隔多个地址。

同时，workflow 也会把 `OVO_GO_PROXY` 默认收敛到 `https://goproxy.cn,direct`，这样 GitHub Runner 执行 `docker build` 时，`go mod download` 不会再直接访问 `proxy.golang.org`。如果你的网络更适合别的代理，也可以在 GitHub Environment `production` 里覆写。

运行时 `.env` 现在需要包含：

- `OVO_BASE_URL`
- `OVO_UI_USER`
- `OVO_UI_PASSWORD`
- `OVO_DATA_DIR_HOST`
- `OVO_DB_DIR_HOST`
- `OVO_BINARIES_DIR_HOST`
- `OVO_SERVER_PORT`
- `OVO_SERVER_IMAGE`
- `S3_API`
- `S3_ACCESS_ID`
- `S3_SECRET_ACCESS_ID`
- `S3_BUCKET`
- `S3_REGION`
- `ASSET_BASE_URL` 可选
- `BARK_ICON_URL` 可选
- `SENDFLARE_SECRET` 可选
- `SENDFLARE_FROM` 可选
- `OVO_RELEASE_TAG` 由 workflow 自动写入
- `OVO_RELEASE_COMMIT` 由 workflow 自动写入

其中 `OVO_RELEASE_TAG / OVO_RELEASE_COMMIT` 会继续透传进 `ovo-server` 容器，用来在 `/ui` 返回的 HTML `head` 里写出当前线上版本标记；同时 `/system` 页头显示的系统版本也会优先直接使用这个 release tag。只有本地开发等未注入 `OVO_RELEASE_TAG` 的场景，控制台才会回退到 `server/ui-app/package.json` 里的版本号。

`OVO_DOCKER_REGISTRY_MIRRORS` 不写入容器运行时 `.env`。它只在发布链路缺少镜像归档、不得不回退到 VPS 本地 `docker build` 时，才作用于宿主机 Docker daemon。

`OVO_GO_PROXY` 同样不写入容器运行时 `.env`。它只作为 GitHub Runner 侧 `docker build --build-arg GOPROXY=...` 传入 builder 阶段，用来加速 `go mod download`。

当前 release archive 不再上传整仓库，而是只包含 server 部署白名单：

- `go.mod`
- `go.sum`
- `internal/**/*.go`（不含测试文件）
- `server/*.go`（不含测试文件）
- `server/ui-dist/`
- `deploy/server/Dockerfile`
- `deploy/server/compose.yml`
- `deploy/server/deploy-on-vps.sh`
- `deploy/server/entrypoint.sh`
- `deploy/server/nginx-ovo-server.conf.example`
- `deploy/server/notify-system-started.sh`
- `scripts/update-client-release-built-at.sh`

这样做的目的，是让 VPS 上最终保留的 `repo/` 只是最小部署工作区，而不是包含 `frontend/`、`pure-spa-page/`、`.codex/`、`docs/`、`server/ui-app/` 或测试文件等与 server 运行无关的仓库内容。

## `deploy-server.yml` 中的二进制同步段落做什么

核心步骤：

1. checkout 到当前 tag commit
2. 校验 commit 仍然属于 `origin/main`
3. 检查自上一个 `v*` tag 以来，是否有这些路径变化：
   - `client/`
   - `cmd/ovo-ci/`
   - `internal/`
   - `go.mod`
   - `go.sum`
   - `scripts/build-client-binaries.sh`
   - `scripts/build-ci-binaries.sh`
   - `scripts/package-client-binaries.sh`
   - `scripts/package-ci-binaries.sh`
   - `scripts/lib/binary_package.sh`
4. 只有 tag 精确匹配 `vX.Y.Z-bin` 时，才会强制构建并同步
5. 如果需要构建，执行：
   - `./scripts/build-client-binaries.sh`
   - `./scripts/build-ci-binaries.sh`
6. workflow 将构建目录打成临时 tar 包，通过 `scp` 发到 VPS；这里文件通常较小，当前不切换到 `rsync`
7. 远端脚本把 `ovo-client-*` / `ovo-ci-*` 及其 `.sha256`、`.metadata.json` 覆盖到宿主机挂载的 `binaries/` 目录
8. workflow 调用 `scripts/update-client-release-built-at.sh`，把 VPS 上最新的 client `built_at` 写入 SQLite

补充约束：

- 二进制同步段落的远程 `scp + ssh` 同样会强制进入 `/bin/bash`
- 这样可以避免 VPS 默认 shell 不是 Bash 时，`TMP_DIR=...`、`trap`、`set -euo pipefail` 这类语法在远端直接失败

## Tag 约定

- 普通发布 tag：`vX.Y.Z`
  只部署 server，并按 diff 判断是否需要重建二进制
- 强制二进制 tag：`vX.Y.Z-bin`
  即使代码 diff 没命中二进制相关路径，也强制重建并覆盖 VPS 上的二进制目录，同时刷新 SQLite 里的最新 `built_at`
- 其他带 `-bin` 的 tag 形式不会被接受，workflow 会直接失败，避免“看起来像强制 tag、实际没命中规则”的歧义

## GitHub Environment 建议

推荐使用 `production` environment，并把配置拆成：

Secrets：

- `OVO_VPS_HOST`
- `OVO_VPS_USER`
- `OVO_VPS_SSH_KEY`
- `OVO_VPS_KNOWN_HOSTS` 可选
- `OVO_BASE_URL`
- `OVO_UI_USER`
- `OVO_UI_PASSWORD`
- `OVO_DEPLOY_TOKEN` 可选
- `OVO_DEPLOY_NOTIFY_TOKEN` 兼容旧配置，可选
- `S3_API`
- `S3_ACCESS_ID`
- `S3_SECRET_ACCESS_ID`
- `BARK_TOKEN` 可选

Variables：

- `OVO_DEPLOY_PATH`
- `OVO_DATA_DIR_HOST`
- `OVO_DB_DIR_HOST`
- `OVO_BINARIES_DIR_HOST`
- `OVO_SERVER_PORT`
- `OVO_VPS_PORT`
- `OVO_VPS_INSTALL_COMMAND`
- `BARK_SERVER_URL`
- `BARK_ICON_URL`
- `BARK_SOUND`
- `S3_BUCKET`
- `S3_REGION`
- `ASSET_BASE_URL`
- `SENDFLARE_FROM`

## 从 `.env.production` 同步到 GitHub

仓库新增专用脚本：

```bash
./scripts/sync-github-production-env.sh
```

常用用法：

```bash
./scripts/sync-github-production-env.sh --dry-run
./scripts/sync-github-production-env.sh
./scripts/sync-github-production-env.sh --repo owner/repo
```

这个脚本会：

- 读取仓库根 `.env.production`
- 自动创建 GitHub `production` environment
- 先删除“脚本管理范围内、但本地已不再配置”的旧 secrets / variables
- 再把当前 `.env.production` 里的 secrets 和 variables 分别写入 GitHub

这意味着像 `OVO_VPS_KNOWN_HOSTS` 这类历史遗留值，如果你已经从本地 `.env.production` 去掉，下次同步时也会从 GitHub environment 一并清理掉，避免旧配置继续影响 workflow。

## 最小可用操作顺序

```bash
git clone https://github.com/AaronConlon/ovo.git
cd ovo
./scripts/sync-github-production-env.sh --dry-run
./scripts/sync-github-production-env.sh

git tag v0.6.0
git push origin v0.6.0
```

如果你只想强制重建并同步二进制，必须使用精确 tag 形式：

```bash
git tag v0.6.0-bin
git push origin v0.6.0-bin
```
