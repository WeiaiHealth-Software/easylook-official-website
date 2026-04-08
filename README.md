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
```

## 最小部署配置

业务构建本身保留原有项目变量；OVO 部署只额外增加这些配置：

```dotenv
PUBLIC_URL=/easylook-website/

SYNC_OVO_DEPLOY_TOKEN=replace-with-real-deploy-token
SYNC_OVO_TARGET_CLIENT_ID=replace-with-client-id
SYNC_OVO_SERVICE_ID=replace-with-service-id

# Optional
# SYNC_OVO_PUBLIC_URL=/easylook-website/
# SYNC_OVO_DEPLOY_TARGET_ROOT=/var/www/easylook-website/build
# SYNC_OVO_HEALTHCHECK_URL=http://localhost/easylook-website/
```

同步到 GitHub `production` environment：

```bash
bash scripts/sync-github-production-env.sh --dry-run
bash scripts/sync-github-production-env.sh
```

需要的 GitHub 配置：
- Secret: `OVO_DEPLOY_TOKEN`
- Variable: `OVO_TARGET_CLIENT_ID`
- Variable: `OVO_SERVICE_ID`
- 可选 Variable: `OVO_PUBLIC_URL`
- 可选 Variable: `OVO_DEPLOY_TARGET_ROOT`
- 可选 Variable: `OVO_HEALTHCHECK_URL`

## GitHub Actions 部署

仓库已内置 workflow：
- [/.github/workflows/deploy-ovo.yml](/Users/aaron/Sites/@weiai/official-websites/easylook-website/.github/workflows/deploy-ovo.yml)

默认行为：
- 固定连接 `https://guard-x.site/ovo-server`
- 构建静态站点 bundle
- 打包加密 zip
- 使用 `ovo-ci publish` 发布到目标 client/service

默认线上路径建议：
- `OVO_PUBLIC_URL=/easylook-website/`
- `OVO_DEPLOY_TARGET_ROOT=/var/www/easylook-website/build`
- `OVO_HEALTHCHECK_URL=http://localhost/easylook-website/`

## 版本注入

每次 `build:release-meta` 都会把版本信息写入最终 `build/index.html`：
- `easylook:version`
- `easylook:commit`
- `easylook:release`
- `buildinfo`

同时也会写入：
- `public/version.json`

## 本地验证 bundle

```bash
bash scripts/build-with-release-meta.sh
bash scripts/build-release-bundle.sh
bash scripts/package-ovo-artifact.sh
```

构建完成后可以检查：
- `build/index.html`
- `.local/releases/<release-id>/bundle/meta.json`
- `.local/releases/<release-id>/bundle/runtime/public/index.html`
- `.local/releases/<release-id>/ovo-release-<release-id>.zip`
