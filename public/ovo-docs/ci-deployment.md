# CI 部署说明

这篇文档描述当前推荐的 CI 发布协议。现在的默认主链路已经切换为：

1. `CI` 构建 bundle zip
2. `ovo-ci publish` 向 `server` 申请 bundle 资产上传地址
3. `CI` 把 zip 上传到 `server` 管理的 R2 / S3 兼容对象存储
4. `CI` 产出的 bundle zip 根目录必须带 `meta.json`；由于 zip 本体会被密码保护，CI 需要在加密前把这份 `meta.json` 明文通过 `--manifest-json` 一并提交给 `server`
5. `server` 记录 bundle asset、`meta.json`，并创建 release
6. `server` 下发 deploy task
7. `client` 在执行任务时按需下载 bundle zip

## 核心变化

与旧链路相比，当前协议有三个关键变化：

- bundle 不再通过 WebRTC 从 CI 直接传给 client
- `ovo-ci publish` 的核心动作变成“上传 bundle asset + 触发 deploy”
- `client` 部署时如果本地缺少 zip，会按 `bundle_download_url` 从 server 下载

## CI 负责什么

CI 现在只负责：

- 构建 bundle
- 生成描述该 bundle 的 `meta.json`
- 用高压缩级别重新打 `bundle.zip`
- 为 zip 生成压缩密码，并把这份密码写回 `meta.json`
- 计算 `md5`
- 调用 `ovo-ci publish`

如果 zip 根目录缺少 `meta.json`，`ovo-ci publish` 必须直接失败；即使绕过 `ovo-ci` 直接调用 server API，server 也必须拒绝没有 `bundle_manifest_json` 的发布请求。由于 zip 会整体加密，`ovo-ci` 不再依赖从加密 zip 内反读 `meta.json`，而是优先消费 CI 显式传入的 `--manifest-json`。新的发布主链还要求 `meta.json.archive` 至少包含：

- `format=zip`
- `compression_method=deflate`
- `compression_level>=8`
- `password=<non-empty>`

启用这条加密 bundle 链路前，目标 `client` 必须先升级到支持 `bundle_manifest_json + archive.password` 的版本；旧 client 常见现象是把加密 zip 当普通 zip 读取，日志里只会看到 `flate: corrupt input before offset ...`。

CI 不再负责：

- 点对点传 bundle
- 维护 transfer 会话
- 等待 DataChannel 完成

## `ovo-ci publish` 现在做什么

`ovo-ci publish` 现在内部执行三步：

1. `POST /api/assets/uploads`
   目的：申请 bundle zip 的预签名上传 URL，并利用 `md5` 做去重
2. `PUT <presigned-url>` + `POST /api/assets/{asset_id}/complete`
   目的：把 zip 上传到对象存储，并通知 server 资产已完成
3. `POST /api/transfers` + `POST /api/releases/deploy`
   目的：登记 release 的 bundle 元信息（含 `meta.json`），并为目标 `client + service` 下发 deploy task

这里保留了 `/api/transfers` 这个历史入口名；当请求里带有 `bundle_asset_id` 时，它承担的是“登记 release 基座”的职责，而不是 WebRTC 传输会话编排。

## 必填输入

- `--server`
- `--token`
- `--client-id`
- `--service-id`
- `--artifact`

可选输入：

- `--bundle-version`
- `--bundle-remark`
- `--manifest-json`
- `--bundle-archive-path`
- `--bundle-extract-path`
- `--service-access-entries-json`

## 产物要求

bundle zip 至少需要：

- 一个稳定文件名
- 一份与该 release 对齐的 `meta.json`
- `meta.json.archive` 内记录 zip 格式、压缩级别和解压密码
- 能计算 `md5`
- 解压后包含 `scripts/ovo/deploy.sh`
- 满足项目自己的运行契约

## 发布结果

`ovo-ci publish` 会输出：

- `release_id`
- `bundle_path`
- `bundle_version`
- `bundle_remark`
- `bundle_manifest_json`
- `bundle_md5`
- `bundle_asset_id`
- `task_id`

## 对接建议

如果你接的是 GitHub Actions 或其他外部 CI，直接围绕 `ovo-ci publish` 集成即可。对外部仓库来说，不应该再理解 WebRTC offer / answer 或 transfer completion 这些旧细节。

## 最小 GitHub Actions 配置

对业务仓库来说，推荐把 OVO 相关配置压到最少，只保留这两类输入：

- 必需 Secrets：
  - `OVO_DEPLOY_TOKEN`
- 必需发布参数：
  - `client_id`
  - `service_id`

其中 `client_id / service_id` 可以直接写在 workflow 默认值里，也可以放进 GitHub Variables；不要求业务仓库再维护一大串 OVO 专用环境变量。

当前线上控制面的固定地址是：

- `OVO_SERVER_URL=https://guard-x.site`

因此业务仓库通常不需要再把 `OVO_SERVER_URL` 配成 Secret 或 Variable，直接在 workflow 里写死即可；真正需要保密的只有 `OVO_DEPLOY_TOKEN`。

`ovo-ci` 安装脚本和 `ovo-ci publish` 现在直接使用你传入的 `server` 根地址：

- 传 `https://guard-x.site` 会保持为 `https://guard-x.site`
- 如果你需要自定义前缀路径，显式传完整地址即可，例如 `https://guard-x.site/custom-prefix`

推荐顺序保持为：

1. 业务仓库生成合法 bundle 目录
2. CI 把 bundle 目录压成 zip，并补齐 `meta.json.archive`
3. CI 通过 `curl -fsSL -H "Authorization: Bearer $OVO_DEPLOY_TOKEN" "https://guard-x.site/install/ovo-ci.sh" | bash -s -- --server "https://guard-x.site" --token "$OVO_DEPLOY_TOKEN"` 安装 `ovo-ci`
4. CI 执行 `ovo-ci publish --server "https://guard-x.site" --token "$OVO_DEPLOY_TOKEN" --client-id "<client_id>" --service-id "<service_id>" --artifact "<zip>"`

`release_id` 不应该由外部 CI 手动传入；当前协议下它会由 `server` 在创建 release 时自动分配，再通过 `ovo-ci publish` 的输出回传给调用方。

如果 zip 做了密码保护，CI 还应该显式传入 `--manifest-json`，避免 `ovo-ci` 反读加密包内的 `meta.json` 失败。

`--container-name` 现在是可选输入：

- 纯静态站点、纯文件同步类 bundle 不需要传
- 仍然依赖容器运行名的项目可以继续显式传入

## Deploy Token 作用域

手动签发的 deploy token 现在应以 `client` 为绑定主键，而不是 `service`：

- 签发阶段只选择目标 `client`
- 发布阶段仍然必须显式传入 `service_id`
- 同一个 deploy token 可以部署到该 `client` 下的多个服务
- `server` 在鉴权时先校验 token 是否允许目标 `client`，再由发布请求里的 `service_id` 决定具体投递到哪个服务

这条规则的目的是让 CI 凭证管理更稳定：仓库只需要维护“这个 workflow 发布到哪台 client”的权限，不需要因为新增同 client 下的服务就重复签发一批 token。


## GitHub Actions 二进制同步

如果你使用 OVO 主仓库自带的 GitHub Actions：

- `deploy-server.yml` 负责 server 部署，并在同一条 workflow 内决定是否同步二进制
- 二进制段落只在需要时构建，并通过 `scp` 覆盖 VPS 上挂载的 `binaries/` 目录
- 同一条 workflow 会在 VPS 上直接更新 SQLite 的 `client_release_state.latest_built_at`
- `server` 启动后或控制台读取时，会继续扫描本地二进制目录并把二进制文件记录同步到内存和资产表快照

这意味着 GitHub Actions 直接把二进制当作 VPS 本地部署内容处理，不再走二进制上传到 R2 的链路；clients 页面的“可升级”判断由客户端上报的 `built_at` 与 SQLite 中记录的最新 client `built_at` 决定。
