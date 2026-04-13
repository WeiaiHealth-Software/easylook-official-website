# 部署职责边界说明

本文定义 OVO 当前推荐的长期职责边界。新的主链路已经从“CI 通过 WebRTC 直传 bundle 给 client”切换为“bundle 走 `server + 对象存储`，二进制走 `workflow + VPS 本地磁盘`”。

## 一句话结论

- `CI` 负责构建 bundle zip，并把它上传到 `server` 管理的对象存储。
- `CI` 也负责按 tag 决定是否重建 `ovo-client` / `ovo-ci`，并把二进制覆盖到 VPS 挂载目录。
- `server` 负责资产登记、去重、预签名 URL、release 编排、任务下发、审计和后台管理。
- `client` 负责按任务下载 bundle、校验、落盘、解压、执行并上报结果。

换句话说：

- `CI` 负责产物生成
- `server` 负责资产控制面与发布控制面
- `client` 负责目标机器上的真实执行

## 统一资产中心

`server` 现在提供统一的资产服务，负责：

- 连接 S3 兼容对象存储，例如 Cloudflare R2
- 为 bundle zip、用户头像、client icon、service icon 生成预签名上传 URL
- 基于 `md5` 做去重，避免重复上传相同内容
- 在 `assets` 表里统一记录资产元数据、状态、版本、对象路径和来源
- 为 bundle 记录公开对象地址，供 browser 和 client 直接下载

为了便于直接在 R2 上排查和管理，新上传对象会按资源族分目录：

- `bundle/...`
- `images/avatars/...`
- `images/icons/...`
- `images/<scope>/...`

数据库里的 `assets.object_key` 仍然是唯一索引来源；目录结构只是让对象存储视角更容易读。

补充约束：

- `bundle` 资产现在不再继续挂 `logical_name / yyyy / mm / asset_id` 这些中间层级
- bundle 对象 key 固定收敛成 `bundle/<scope>/<bundle_file_name>`
- 例如某个 tag 构建的 bundle zip 名称是 `v2.0.2.zip`，公开地址会直接是 `.../bundle/release/v2.0.2.zip`
- 图片资产仍然保留 `yyyy / mm / asset_id` 这些层级，避免同名覆盖并方便按记录回查

资产中心是现在的唯一推荐入口。新的主链路不再要求把 bundle 写进 server 容器本地目录；bundle 只保存在对象存储，二进制只保存在 server 本地磁盘。

## 三层职责

### CI 负责什么

`CI` 现在负责：

1. 构建业务产物
2. 组装 release bundle 目录
3. 生成并更新 `meta.json`
4. 使用高压缩级别和压缩密码重新打包 zip
5. 计算 zip 的 `md5`
6. 调用 `ovo-ci publish`
7. 通过 `server` 申请 bundle 资产上传地址并上传到 R2
8. 在 bundle 上传完成后，请求 `server` 创建 release 并下发 deploy task

`CI` 不负责：

- 直接连接 client 做点对点 bundle 传输
- 直接 SSH 到目标机器
- 直接在目标机器上保存历史 bundle
- 直接写入 client / service / user 的图标和头像存储

### server 负责什么

`server` 现在负责：

- 资产元数据持久化和 `md5` 去重
- 预签名上传 URL 与 bundle 下载地址管理
- release / task / service / token / UI 用户的控制面状态
- 为控制台 `/system/logs` 提供当前 server 进程的系统日志缓存、流式查看和最近 `1` 天的磁盘持久化能力
- 二进制资源后台导入
- client / ovo-ci 安装与升级时所需二进制资源查询
- 用户头像、client icon、service icon 的资产引用
- deploy / rollback / backup 编排与审计
- 记录并持久化 bundle `meta.json`，包括 archive password
- 在需要时通过 WebRTC 向 client 按需拉取历史 release 日志，并在内存中解析后直接返回
- task / command / transfer 的“下发接口”必须先把队列状态持久化，再异步触发 WebSocket 通知；不能把等待 client 立即收包这件事放在 HTTP 请求主链里，否则单台 client 的慢连接会拖住整个控制台请求

`server` 不负责：

- 在容器内长期保存 bundle zip
- 在 server 本机重新构建 bundle zip
- 直接执行项目脚本
- 把历史 release 日志归档落到 server 磁盘或对象存储

补充约束：

- `/system/logs` 现在会同时展示当前进程内存缓冲和 server 磁盘上最近 `1` 天的系统日志，并通过 SSE 继续追更；它仍然不是长期审计归档，超过 `24h` 的旧日志会自动清理

### client 负责什么

`client` 现在负责：

- 安装时使用一次性 install token 调用 `install-complete`，由 server 直接换发长期 `client token`；本地先把长期 token 写入 `client.env`，再注册并启动 client service，避免出现“刚安装完成但本地只有 pending token”的半初始化状态
- 接收 server task
- 当本地缺少 bundle 或 bundle `md5` 不匹配时，按 task payload 里的 `bundle_download_url` 拉取 bundle
- bundle 下载使用独立的长超时 HTTP client，默认超时窗口为 `10m`；如需覆盖，可通过 `OVO_DOWNLOAD_TIMEOUT` / `CLIENT_DOWNLOAD_TIMEOUT` 调整
- 把 zip 保存到本地 release 目录
- 校验 `md5`
- 使用 server 下发的 `bundle_manifest_json` 中记录的密码解压 zip，再执行 `scripts/ovo/*.sh`
- 回报任务结果、运行状态和日志
- 在本地保留历史 release 日志，按需响应 server 的日志回拉
- 当操作者通过控制台重新签发 `client token` 后，允许本地直接把新 token 写回 `client.env`；重新签发会立即使这台 client 旧的 `client token / pending token` 失效，下一次 `register / heartbeat` 命中新的有效 client token 时，server 会把这台 client 视为已激活

`client` 不负责：

- 生成 bundle
- 维护全局资产索引
- 决定某个服务应该部署哪个 release

## 二进制文件

客户端安装包与 `ovo-ci` 二进制不再走 R2。

- workflow 在 runner 上按需构建 `ovo-client-*` / `ovo-ci-*`
- 通过 `scp` 把构建结果发到 VPS；server 发布链路只上传 release archive，并在 VPS 本地通过大陆可用 Docker mirror + Go proxy build `ovo-server` 镜像
- VPS 把二进制、`.sha256`、`.metadata.json` 覆盖到宿主机挂载的 `binaries/` 目录
- `server` 只从本地磁盘读取这些文件，并把 `ovo-client` 的最新 `built_at` 同步进数据库
- 控制台和升级逻辑只用 `built_at` 判断 client 是否可升级

补充约束：

- `ovo-client` 参与升级判断，比较的是 `client.built_at` 和 server 当前平台二进制的 `built_at`
- `ovo-ci` 不参与 client 升级判断，因此不维护独立的“最新构建时间”状态
- `server` 不再负责把二进制导入对象存储

## 图片与图标

以下资源已经统一收敛到资产中心：

- 用户头像
- client icon
- service icon

控制台保存的是资产下载地址或资产引用，而不是旧的纯前端 SVG 图标名。历史 `Tfi*` 图标值仍可兼容显示，但不是新的推荐主路径。

## 当前推荐主链路

```text
CI
  -> build bundle zip
  -> call ovo-ci publish
  -> server issues presigned upload URL
  -> CI uploads bundle to R2
  -> server records asset + release
  -> server queues deploy task
client
  -> receives task
  -> downloads bundle from the task-provided object storage URL when needed
  -> verifies md5
  -> executes scripts/ovo/*.sh
  -> keeps release logs locally
server
  -> audits state, releases, bundle assets
  -> pulls logs from client on demand via WebRTC
```

补充约束：

- deploy / rollback 任务都必须直接消费对象存储公开 URL；如果 bundle 资产缺少可直接访问的对象地址，server 必须拒绝创建 task。deploy 要提示操作者重新发布，rollback 要提示操作者手动回滚
- `server` 代理地址 `/api/assets/:id/blob` 只保留给控制面兼容下载，不再允许作为 deploy / rollback 主链的 bundle 下载入口

## 为什么只保留日志 WebRTC

WebRTC 仍然适合实时流或点对点场景，但它不再承担 bundle 下载职责。当前只保留它来做“按需查看历史 release 日志”，收益是：

- bundle 下载不依赖目标 client 在线
- 浏览器不需要创建 WebRTC 会话，直接打开对象存储地址即可
- server 不需要缓存 bundle，也不需要维护 bundle 下载 transfer 会话
- 历史日志保持“需要时再取”，不会额外占用 server 磁盘或对象存储
