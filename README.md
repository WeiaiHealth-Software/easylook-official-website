# Easylook Website

这是 Easylook 官方网站项目，当前通过 OVO 的 bundle 发布链路部署到目标 client。

## 本地开发

```bash
yarn install
yarn dev
```

常用命令：

```bash
yarn build
yarn build:release-meta
yarn build:release-bundle
yarn package:ovo
yarn version:patch
yarn version:minor
yarn version:major
yarn version:set -- 1.2.3
```

## 最小部署配置

业务构建本身保留原有项目变量；OVO 部署配置现在统一只认一套 `OVO_*` 变量，并全部从 `.env.production` 同步到 GitHub `production` environment：

```dotenv
OVO_SERVER_URL=https://ovo.example.com
OVO_DEPLOY_TOKEN=replace-with-real-deploy-token
OVO_TARGET_CLIENT_ID=replace-with-client-id
OVO_SERVICE_ID=replace-with-service-id

# Optional
# OVO_PUBLIC_URL=/
# OVO_DEPLOY_TARGET_ROOT=/var/www/easylook-website/build
# OVO_HEALTHCHECK_URL=http://localhost/
# OVO_HEALTHCHECK_TIMEOUT=30
```

补充约束：
- 所有 `OVO_*` 变量都会被写入 bundle 的 `meta.json / release.json`
- OVO 后台查看 bundle 历史时，会直接展示这份 `OVO_*` 配置快照
- 如果你不希望某个值出现在历史记录里，就不要把它设计成 `OVO_*` 变量

配置说明：

- `OVO_SERVER_URL`
  - OVO Server 的根地址
  - workflow 用它安装 `ovo-ci` 并调用发布 API
  - 根路径部署填 `https://ovo.example.com`，如果你的 OVO 仍挂在子路径，则填完整子路径地址

- `OVO_DEPLOY_TOKEN`
  - OVO deploy token
  - 用于下载 `install/ovo-ci.sh` 和执行 `ovo-ci publish`
  - 属于敏感信息，只应放在本地 `.env.production` 和 GitHub Secret

- `OVO_TARGET_CLIENT_ID`
  - 目标 client 的 ID
  - 决定 workflow 这次要把 bundle 下发到哪台 client

- `OVO_SERVICE_ID`
  - 目标 service 的 ID
  - 决定这次发布对应哪一个 OVO service 记录

- `OVO_PUBLIC_URL`
  - 站点对外访问的基础路径
  - 同时作为前端构建时的 `PUBLIC_URL`
  - 根路径部署用 `/`，子路径部署用类似 `/easylook-website/`

- `OVO_DEPLOY_TARGET_ROOT`
  - client 本机上静态文件最终落盘目录
  - `scripts/ovo/deploy.sh` 会把 bundle 中的静态资源同步到这里

- `OVO_HEALTHCHECK_URL`
  - 发布完成后的健康检查地址
  - 必须返回 HTTP 200 才会被 OVO 判定为部署成功
  - 建议优先使用 client 本机可访问地址，例如 `http://localhost/`

- `OVO_HEALTHCHECK_TIMEOUT`
  - 健康检查最长等待秒数
  - 适合站点 reload、代理切换或静态资源刷新需要几秒钟稳定下来的场景

同步到 GitHub `production` environment：

```bash
bash scripts/sync-github-production-env.sh --dry-run
bash scripts/sync-github-production-env.sh
```

需要的 GitHub 配置：
- Secret: `OVO_SERVER_URL`
- Secret: `OVO_DEPLOY_TOKEN`
- Variable: `OVO_TARGET_CLIENT_ID`
- Variable: `OVO_SERVICE_ID`
- 可选 Variable: `OVO_PUBLIC_URL`
- 可选 Variable: `OVO_DEPLOY_TARGET_ROOT`
- 可选 Variable: `OVO_HEALTHCHECK_URL`
- 可选 Variable: `OVO_HEALTHCHECK_TIMEOUT`

推荐映射：
- GitHub Secrets: `OVO_SERVER_URL`, `OVO_DEPLOY_TOKEN`
- GitHub Variables: `OVO_TARGET_CLIENT_ID`, `OVO_SERVICE_ID`, `OVO_PUBLIC_URL`, `OVO_DEPLOY_TARGET_ROOT`, `OVO_HEALTHCHECK_URL`, `OVO_HEALTHCHECK_TIMEOUT`

## GitHub Actions 部署

仓库已内置 workflow：
- [/.github/workflows/deploy-ovo.yml](/Users/aaron/Sites/@weiai/official-websites/easylook-website/.github/workflows/deploy-ovo.yml)

默认行为：
- 从 GitHub `production` environment 读取 `OVO_SERVER_URL`
- 构建静态站点 bundle
- 打包加密 zip
- 使用 `ovo-ci publish` 发布到目标 client/service

默认线上路径建议：
- `OVO_PUBLIC_URL=/`
- `OVO_DEPLOY_TARGET_ROOT=/var/www/easylook-website/build`
- `OVO_HEALTHCHECK_URL=http://localhost/`

当前部署链路的约束：
- workflow 不再写死任何 OVO server 域名、client id、service id、站点根路径或 healthcheck 地址
- `scripts/sync-github-production-env.sh` 只同步 `.env.production` 里的 `OVO_*` 配置
- `scripts/build-release-bundle.js`、`scripts/package-ovo-artifact.js`、`scripts/ovo/deploy.sh`、`scripts/ovo/healthcheck.sh` 统一读取同一套 `OVO_*` 变量，减少跨脚本重复口径
- 顶层 `scripts/` 尽量收敛到少量入口，避免再拆出只做单一中转的小脚本

## scripts 目录说明

- [scripts/build-release-bundle.js](/Users/aaron/Sites/@weiai/official-websites/easylook-website/scripts/build-release-bundle.js)
  - 顶层构建主入口
  - 会整理 `BUILD_TIME / GIT_COMMIT_HASH / RELEASE_ID` 这些构建环境变量并执行前端构建
  - 默认继续生成 OVO 可发布的 bundle 目录，复制 `scripts/ovo/*` 到 bundle，并写入 `.env`、`meta.json`、`release.json`
  - `bundle_name` 和最终 zip 文件名优先跟随 tag，非 tag 构建时回退为 `v<package version>.zip`
  - 会把当前全部 `OVO_*` 环境变量按稳定排序写进 `meta.json.ovo_env`
  - 传入 `--build-only` 时，只构建前端和版本元信息，不生成 bundle
  - 产物位于 `.local/releases/<release-id>/bundle`
  - 使用 Node 内置文件系统 API 和子进程调用，不依赖 Python

- [scripts/package-ovo-artifact.js](/Users/aaron/Sites/@weiai/official-websites/easylook-website/scripts/package-ovo-artifact.js)
  - 把 bundle 目录打成加密 zip
  - 同时把 archive 信息写回 `meta.json`
  - 默认 zip 名称不再使用内部 `release_id`，而是使用 tag 版本名
  - workflow 里最终发布给 OVO 的就是这个 zip
  - 通过 Node 写回 metadata，再调用系统 `zip` 生成加密压缩包

- [scripts/sync-github-production-env.sh](/Users/aaron/Sites/@weiai/official-websites/easylook-website/scripts/sync-github-production-env.sh)
  - 读取 `.env.production`
  - 自动创建或更新 GitHub `production` environment
  - 把 `OVO_SERVER_URL`、`OVO_DEPLOY_TOKEN` 同步成 Secrets，把其余 `OVO_*` 配置同步成 Variables
  - 这是“本地配置 -> GitHub Actions 配置”的唯一同步入口
  - 这是当前顶层 scripts 里唯一保留 shell 的脚本

- [scripts/ovo/common.sh](/Users/aaron/Sites/@weiai/official-websites/easylook-website/scripts/ovo/common.sh)
  - OVO runtime 脚本共享基础库
  - bundle 在 client 上执行 `deploy.sh`、`healthcheck.sh`、`status.sh` 时都会先 source 这个文件
  - 负责加载 bundle 内 `.env`、解析运行时配置、判定文件是否就绪、执行 HTTP 健康检查、输出状态字段

- [scripts/ovo/deploy.sh](/Users/aaron/Sites/@weiai/official-websites/easylook-website/scripts/ovo/deploy.sh)
  - OVO client 真正执行的部署入口
  - 把 bundle 中的静态文件同步到 `OVO_DEPLOY_TARGET_ROOT`
  - 写入 `release.json`
  - 最后调用 `healthcheck.sh`，只有返回 HTTP 200 才算部署成功

- [scripts/ovo/healthcheck.sh](/Users/aaron/Sites/@weiai/official-websites/easylook-website/scripts/ovo/healthcheck.sh)
  - OVO 部署完成后的健康检查入口
  - `check` 模式会在超时时间内轮询等待服务健康
  - `once` 模式只做一次检查
  - 当前依赖 `OVO_HEALTHCHECK_URL` 和 `OVO_HEALTHCHECK_TIMEOUT`

- [scripts/ovo/status.sh](/Users/aaron/Sites/@weiai/official-websites/easylook-website/scripts/ovo/status.sh)
  - 输出 OVO service 的状态摘要
  - 用于让 OVO server/client 读取当前 release、部署目录、public base、healthcheck 状态等信息
  - 本质上是把 `common.sh` 里的状态采集结果格式化输出

## 版本注入

版本注入由 [rsbuild.config.js](/Users/aaron/Sites/@weiai/official-websites/easylook-website/rsbuild.config.js) 在构建阶段直接完成。每次 `build:release-meta` 都会把版本信息写入最终 `build/index.html`：
- `easylook:version`
- `easylook:commit`
- `easylook:release`
- `buildinfo`

同时也会写入：
- `build/version.json`

## 版本管理

版本号现在通过 [release-it](https://github.com/release-it/release-it) 管理，不再维护自定义的 `bump-version.js`。

常用命令：

```bash
yarn version:patch
yarn version:minor
yarn version:major
yarn version:set -- 1.2.3
```

当前配置下：
- `release-it` 会更新 [package.json](/Users/aaron/Sites/@weiai/official-websites/easylook-website/package.json) 和 lockfile 中的版本
- 会自动创建 release commit，并打 `v<version>` tag
- 不会自动 push
- 不会发布 npm package，也不会创建 GitHub Release

对应配置放在 [package.json](/Users/aaron/Sites/@weiai/official-websites/easylook-website/package.json) 的 `release-it` 字段里，后续如果你想把“改版本 + 打 tag + 发 GitHub Release”连起来，也可以继续在这里扩展

## 本地验证 bundle

```bash
node scripts/build-release-bundle.js --build-only
node scripts/build-release-bundle.js
node scripts/package-ovo-artifact.js
```

构建完成后可以检查：
- `build/index.html`
- `.local/releases/<release-id>/bundle/meta.json`
- `.local/releases/<release-id>/bundle/runtime/public/index.html`
- `.local/releases/<release-id>/v<package-version>.zip`

其中 `meta.json / release.json` 现在除了 release、archive、deploy 信息，还会包含：
- `ovo_env`
  - 本次发布时全部 `OVO_*` 环境变量的快照
  - 便于在 OVO 后台回看历史 bundle 时，确认当时到底是用哪一组部署配置发布的
