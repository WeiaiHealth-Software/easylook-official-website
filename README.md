# Easylook Website

这是 Easylook 官方网站项目，使用 Rsbuild 构建 SPA 静态资源，通过 GitHub Release 和 upy 发布。

## 本地开发

使用 Node.js 22 和 pnpm：

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
```

`pnpm build` 默认使用 `/` 作为站点基础路径。部署到子路径时，构建前设置 `PUBLIC_URL`。

## 部署配置

业务构建变量和 upy 部署配置从 `.env.production` 同步到 GitHub `production` environment：

```bash
# 查看计划执行的 gh 命令
bash scripts/sync-github-production-env.sh --dry-run
# 同步配置到 GitHub
pnpm sync-github-production-env
```

- `UPY_WEBHOOK_URL` 和 `UPY_WEBHOOK_SECRET` 会同步为 GitHub Secrets
- `PUBLIC_URL`、`UPY_AUTO_DEPLOY` 和其他变量会同步为 GitHub Variables

## 发布

```bash
pnpm version:patch          # 或 version:minor / version:major
git push origin HEAD --follow-tags
```

`release-it` 创建本地 commit 和 `v<version>` tag，不自动推送。推送正式版本 tag 后，GitHub Actions 构建 `bundle.zip`、创建 Release；服务器配置完成且启用自动部署后，再通过 upy Webhook 触发升级。

手动构建 bundle：

```bash
pnpm bundle:upy v1.2.3
```

服务器初始化、Nginx、认证、升级和失败处理见 [upy 部署文档](docs/upy-deployment.md)。
