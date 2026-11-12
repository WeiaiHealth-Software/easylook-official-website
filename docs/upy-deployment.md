# upy 部署

本项目使用 Rsbuild 构建 SPA 静态资源，通过 upy 的 `static` 类型部署；服务器只需 upy 和静态 HTTP 服务（如 Nginx），无需 Node.js 或 Docker。以下基于 upy v0.8.x；静态 bundle 与 CPU 架构无关。

## 构建与 Release

构建机需要 Node.js 22、pnpm、Python 3、Git。运行 `pnpm install --frozen-lockfile` 后：

```bash
pnpm build
pnpm bundle:upy v1.2.3
```

脚本仅接受 `vMAJOR.MINOR.PATCH`，输出 `artifacts/bundle.zip` 和 `artifacts/bundle.zip.sha256`，不覆盖已有文件。ZIP 根目录包含 `upy.yaml` 和 `dist/`：manifest 中的 `name` 为 `easylook-website`、`version` 为去掉 `v` 的版本号、`static.directory` 为 `dist`。只打包 `build` 产物及 manifest，不打包服务器配置或本地环境文件。

推送 `v*` tag 后，Actions 在 `production` environment 安装冻结依赖、构建并上传 Actions artifact，再创建 GitHub Release，资产名固定为 `bundle.zip` 和 `bundle.zip.sha256`。已有同名 Release 时不会覆盖；修复后发布新版本。仓库地址以 origin `WeiaiHealth-Software/easylook-official-website` 为准。

`PUBLIC_URL` 是构建期配置，默认 `/`。可在 GitHub `production` environment 的 Variables 设置同名值。

## 服务器首次部署

以下以 `/srv/easylook-website` 为例：

1. 在 Linux 服务器安装 upy v0.8.x 和 Nginx，确保部署用户有 root 目录写权限，Nginx 用户有目录读取及遍历权限。
2. 将仓库的 `deploy/upy/server.deploy.yaml.example` 复制为 `/srv/easylook-website/deploy.yaml`，确认 `repository` 和 `asset`。
3. 若 GitHub 仓库为私有，在执行 upy 的服务器用户的 `~/.upy/config.yaml` 配置 `github.token` 或环境变量 `DEPLOY_GITHUB_TOKEN`，需具备 Release 读取权限。
4. 推送新 tag 并等待 Release 创建成功后手动部署：

   ```bash
   upy release v1.2.3 --root /srv/easylook-website
   ```

   也可将 ZIP 传到服务器后执行 `upy bundle ./bundle.zip --root /srv/easylook-website`。
5. 部署后 `current` 指向当前版本的 `dist`。配置 Nginx 站点，示例：

   ```nginx
   server {
       listen 80;
       server_name easylook.example.com;

       location / {
           root /srv/easylook-website/current;
           index index.html;
           try_files $uri $uri/ /index.html;
       }
   }
   ```

## 自动部署

手动部署成功、项目登记且 Webhook 可从 GitHub Actions 到达后：

1. 在服务器 `<root>/deploy.yaml` 添加 `webhook.secret`，填入随机密钥。
2. 在服务器用户 `~/.upy/config.yaml` 设置 `server.listen: "127.0.0.1:8999"` 并运行 `upy server`；通过 HTTPS 反向代理把 `POST /api/v1/webhook/easylook-website` 转发到该端口。
3. 在本地编辑 `.env.production` 并执行 `pnpm sync-github-production-env` 同步到 GitHub Actions：
   - `UPY_WEBHOOK_URL`：完整 HTTPS 地址，路径项目名必须为 `easylook-website`
   - `UPY_WEBHOOK_SECRET`：与服务器 `<root>/deploy.yaml` 中的 `webhook.secret` 一致
   - `UPY_AUTO_DEPLOY`：设为 `true`
4. 后续每次推送 `v*` tag，Release 创建成功后 GitHub Actions 会自动发送带有 HMAC 签名的 Webhook 触发部署。
