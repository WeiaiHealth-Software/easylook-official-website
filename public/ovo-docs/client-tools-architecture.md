# 客户端工具化架构设计 (Client Tools Architecture Design)

## 1. 背景与目标

为了提高客户端的灵活性和可维护性，我们将客户端的任务执行逻辑从核心调度逻辑中剥离，采用“工具化（Tools）”架构。

- **解锁插件式执行**：通过定义统一的 Tool 接口，可以轻松扩展新的任务类型。
- **一致的更新机制**：工具内置于 `ovo-client` 二进制中，保证执行逻辑与客户端版本同步演进。
- **增强的可观测性**：所有工具执行过程中的标准输出/错误均实时流式传输至 Server，支持在管理端实时查看，并在本地长期留存。
- **受控的本地扩展**：通过专用的脚本执行工具，支持 Server 动态下发定制化的运维脚本。

---

## 2. 核心架构设计

### 2.1 Tool 接口定义

在 `client/internal/tools`（拟定路径）中定义：

```go
type Tool interface {
    // Name 返回工具的唯一标识（如 "deploy", "backup"）
    Name() string
    
    // Execute 执行具体任务
    // ctx: 用于取消任务
    // payload: 任务参数（JSON 格式）
    // logger: 用于实时记录和上报日志的接口
    Execute(ctx context.Context, payload []byte, logger ToolLogger) (Result, error)
}

type ToolLogger interface {
    // Log 记录并实时发送一条日志
    Log(level LogLevel, message string)
}
```

### 2.2 实时日志流 (WebSocket Streaming)

工具在执行期间调用的 `logger.Log` 会将日志封装为特定的消息格式，通过当前的 WebSocket 连接实时推送到 Server。

**消息格式示例：**
```json
{
  "type": "tool_log",
  "task_id": "task-789",
  "time": "2024-03-21T10:00:00Z",
  "stream": "stdout",
  "content": "Building docker image..."
}
```

### 2.3 历史日志持久化与按需回拉

除了实时日志流，`client` 现在还承担一层“历史 release 日志归档”职责：

- 每个带 `service_id + release_id` 的任务，在执行结束后都要把完整日志写到本地 release 目录
- 同一个 release 的多次 deploy / rollback / backup 日志会长期保存在 `projects/<service-id>/releases/<release-id>/logs/`
- release 日志目录会额外维护 `manifest.json`，用于持久化 task 级审计上下文（`task_id/service_id/release_id/action/script_source/script_version/env_source/env_version/status/exit_code`）
- client 会同步生成该 release 的日志归档，例如 `logs.tar.gz`
- 这份归档只保留在 client 本地；server 不会再缓存到磁盘，也不会转存到对象存储
- `logs.tar.gz` 除 `.log` 文件外还会包含 `manifest.json`，供 server 拉取后直接构建审计索引
- 客户端全局日志上报会附带 task / command 上下文，方便控制台在“实时输出”和“历史审计”之间建立关联，但审计主链仍然以 release manifest 为准
- 当 server 需要查看某个历史 Bundle 的完整日志时，不依赖旧的内存缓冲，而是通过 WebRTC 发起一次 on-demand 拉取，让 client 回传这个归档
- transfer 下发采用“双通道”策略：优先走现有 WebSocket 推送；如果推送期间 client 漏掉了某个 `offer_ready` transfer，client 的心跳周期还会主动轮询一次 `/api/clients/{id}/transfers/next` 作为兜底，避免历史日志读取长期卡在 `offer_ready`
- server 侧把 task / command / transfer 写入队列后，必须立刻返回 API 响应，再异步触发对应 client 的 WebSocket 通知；不能把“等待当前 WebSocket 连接成功写入消息”放到下发接口里，否则某台 client 的慢连接会把控制台下发和 dashboard 初始化一起拖超时

### 2.4 按项目隔离的并发执行

当前 client 的调度模型改成了“同项目串行、不同项目并发”：

- `server` 在同一个 client 下派发部署类任务时，会按 `service_id` 判断是否可并发
- `client` 本地也会对活动任务做二次保护：同一个 `service_id` 同时只允许一个部署类任务运行
- 不同项目的 deploy / rollback / backup 可以并发执行，不再因为某个项目正在部署而阻塞其他项目
- 对于仍然使用 `docker compose` 的示例项目，client 不再按 `service_id` 或历史 slug 派生 `COMPOSE_PROJECT_NAME`
- 如果运行时仍需要 `COMPOSE_PROJECT_NAME`，可以继续复用 CI 显式提供的 `container_name`；是否真正使用 compose project name 由项目脚本自己决定
- `compose_project_name` 已退出默认发布输入；`container_name` 只保留为可选兼容字段，不再要求所有 bundle 都传
- deploy 失败后，如果本次 release 已经创建了新的 compose project，client 会先执行一次 `docker compose down --remove-orphans` 清掉失败现场，再决定是否恢复上一版，避免同一项目留下两套容器并存
- release 元数据里即使暂时没有写入 `compose_file`，client 也会回退探测 bundle 根目录下的 `docker-compose.yml` / `compose.yaml` / `compose.yml`，确保旧版本仍然可以被 stop / status / purge 逻辑找到

---

## 3. 内置工具集 (Built-in Tools)

### 3.1 Deploy Tool (部署工具)
专注于 release 执行目录的组装与项目脚本执行。即使项目内部继续使用 compose，这也只是脚本自己的实现细节，不再是 client 侧的旧兼容层：
1.  **基座准备 (Base)**: release zip 固定保存在 `artifact.zip`，并在 `base/` 目录形成 immutable 解压基座。
2.  **执行组装 (Assemble)**: 每次 deploy/rollback/backup 先复制 `base/` 到 `execution/`，再叠加本次选定的脚本/env版本。
3.  **执行快照 (Execution Snapshot)**: client 只生成当前 release 的执行目录和日志归档。
4.  **脚本执行 (Runtime-owned Execution)**: client 只负责执行 `scripts/ovo/*.sh`；是否进一步调用 `docker compose` 由项目脚本自己决定。
5.  **状态上报**: 捕获脚本和 Docker 命令的完整输出。

补充约束：

- deploy tool 的稳定契约是“解压 bundle 后执行 `scripts/ovo/deploy.sh`”
- 安装脚本与激活流程写入 `client.env` 时，`OVO_CLIENT_TOKEN / CLIENT_TOKEN`、`OVO_CLIENT_ID / CLIENT_ID`、`OVO_SERVER_URL / SERVER_URL` 这几组键必须保持同值，避免宿主机残留的旧 `OVO_*` 环境变量在 client 重启后覆盖新 token，导致控制台短暂显示在线、刷新后又掉回待激活
- 新安装链路必须先拿到 `install-complete` 返回的长期 `client token`，再写入 `client.env`，最后才允许注册并启动 client service；不能先启动一个空 token client，也不能再依赖“pending token + 远程 activate”两段式补全
- 安装脚本在 `bootstrap-token / activate-token` 阶段如果发现 managed service 还没有注册完成，只允许写入 token，不允许 fallback 在后台常驻启动一个临时 `ovo-client` 进程；否则容易在 service 注册完成后形成“双实例同时在线”的现场
- 控制台返回给用户的安装命令不再显式携带 `CLIENT_BUILT_AT`；安装脚本应在下载二进制后从 `.metadata.json` 自动读取 `built_at`。当前 metadata 里的构建时间按 UTC/RFC3339 持久化，展示时如果需要面向中国时区用户，应换算为本地时间再解释。
- client 进程日志、部署任务输出和本地 `client.log` 默认统一按东八区 `Asia/Shanghai` 生成；如需覆盖，只允许通过 `OVO_TIMEZONE` 或 `TZ` 显式改写，避免 server/client/task 日志一部分是 UTC、一部分是本地时间
- 新的 bundle zip 默认是带密码的高压缩 zip；client 不能自己猜密码，而是必须使用 server 下发的 `bundle_manifest_json` 中记录的 archive password 解压。启用这条链路前必须先升级 client；旧 client 往往只会报 `flate: corrupt input before offset ...`，看起来像 zip 损坏，实际是密码没有被消费。
- `docker-compose.yml` 可以存在，也可以不存在；是否使用 compose 由项目脚本自己决定
- 执行脚本时必须把工作目录切到当前 release 的 bundle 根目录，避免脚本相对路径依赖宿主机当前目录
- deploy / backup 相关命令执行必须受 `context timeout / cancel` 约束，避免脚本卡死后长期占住项目互斥锁
- `scripts/ovo/*.sh` 是唯一允许的项目动作脚本入口；不再回退到 bundle 根目录 `deploy.sh/backup.sh`
- 服务级命令也要复用同一套脚本契约：`start_service -> scripts/ovo/start.sh`、`stop_service -> scripts/ovo/stop.sh`、`restart_service -> scripts/ovo/restart.sh`、`status -> scripts/ovo/status.sh`
- `purge_service` 在真正清理本地项目状态前，允许 server 显式指定一组 `scripts/ovo/*.sh` 先执行；client 只能接受当前 release bundle 内真实存在的脚本文件，并按请求顺序执行后再进入 purge 清理。
- client 在解压 bundle 后会把 `scripts/ovo/*.sh` 统一归一化为可执行，避免 zip 权限元数据差异导致脚本在宿主机上无法启动
- 如果 release 是新的密码保护 zip，client 需要优先走受控解压命令；不能回退到无密码解压并静默继续
- rollback 默认执行 `scripts/ovo/deploy.sh` 并注入 `OVO_ACTION=rollback`；若存在 `scripts/ovo/rollback.sh` 则优先执行该脚本
- healthcheck 统一执行 `scripts/ovo/healthcheck.sh`
- client 不再通过 `docker inspect`、`docker compose ps` 或宿主机端口推断服务健康；所有服务状态采集都必须依赖当前 release bundle 自带的 `scripts/ovo/healthcheck.sh` 或 `scripts/ovo/status.sh`
- client 需要每分钟刷新一次当前服务健康快照；如果 `healthcheck.sh` 和 `status.sh` 都不存在，要直接把该服务记为异常，并把缺失脚本信息随 telemetry 一起上报
- 服务状态采集不能只覆盖 compose 项目；即使 bundle 内存在 `docker-compose.yml`，client 也必须优先执行脚本，再把脚本输出映射成统一的 `ClientServiceStatus`，避免控制台长期显示 `unreported`
- `service_name` 不再属于 deploy / rollback 主链的输入；稳定身份收口为 `service_id / release_id`

### 3.2 Backup Tool (备份工具)
专注于数据保护与自定义脚本执行：
1.  **快照 (Snapshot)**: 针对 SQLite 等文件型数据库进行物理备份。
2.  **脚本执行**: 接收 Server 下发的 shell 脚本片段，在客户端受控环境下执行（如执行云备份镜像上传）。
3.  **自定义逻辑**: 支持为不同服务配置不同的备份触发脚本。

补充约束：

- v2 推荐链路必须走 `service_id + release_id + scripts/ovo/backup.sh`
- backup task 必须显式携带服务级语义，不再沿用服务级旧备份入口
- client 不再根据旧任务里的 `service_id` 自动升级出其他派生键

---

## 4. 任务调度流程

1.  **Server 下发任务**: 任务 Payload 中明确指定 `tool: "deploy"` 或 `tool: "backup"`。
2.  **Client 接收**: 在 `handleTask` 中根据显式 `tool` 字段从 `ToolRegistry` 查找对应的工具，缺少 `tool` 或 `tool_payload` 的任务直接失败。
3.  **初始化 Logger**: 为该任务创建一个关联 WebSocket 的 `ToolLogger`。
4.  **并行执行**: 运行 `tool.Execute(...)`。
5.  **实时反馈**: 所有的 stdout 实时流回 Server。
6.  **最终上报**: 任务结束后，发送汇总的状态报告。
7.  **本地归档**: 对带 `service_id/release_id` 的任务，把完整日志持久化到该 release 的本地日志目录。
8.  **按需回拉**: 当控制面需要查看历史 release 日志时，通过单独的 WebRTC transfer 将本地日志归档临时回传给 server，并由 server 在内存中解包后直接返回给调用方。

补充说明:

- `server` 在恢复历史任务时，会尽量补齐标准 `tool + tool_payload`，减少 client 侧走历史脏数据的概率
- `client` 不再按 `task.type` 推断工具，也不再从旧 payload 反向拼工具契约
- deploy tool 在下载 bundle 时，只消费 server 已经写入 task payload 的 `bundle_download_url`。现在 deploy / rollback 都是强约束场景：server 只能下发对象存储公开 URL；如果找不到可直接访问的 bundle 对象地址，deploy 必须直接拒绝创建 task 并提示操作者重新发布，rollback 则必须提示操作者手动回滚，不能再把 `/api/assets/:id/blob` 当成 deploy / rollback 的兜底下载地址
- `client` 的 bundle / binary 专用下载链现在默认强制走 `HTTP/1.1`，不再尝试 `HTTP/2`，并且会把 TLS ALPN 也显式锁到 `http/1.1`。这是为了规避对象存储公开域名在大文件下载时偶发返回 `stream INTERNAL_ERROR` 或直接回 `HTTP/2` 帧给 `HTTP/1.x` client 的问题；heartbeat、report、普通 API 仍可继续使用默认 HTTP 行为
- deploy task 的 env override 不允许参与 execution 目录里的 `.env` 组装。bundle 自带 `.env` 必须原样进入执行目录，CI 打包时确定的 `OVO_* / APP_VERSION / RELEASE_ID` 和其他业务变量都不能被部署阶段覆盖；override 文件只保留在历史目录里供审计与排障查看
- client 为脚本补充的运行时变量也不能写回 bundle 原始 `.env`。像 `OVO_RELEASE_ID / OVO_BUNDLE_MD5 / COMPOSE_PROJECT_NAME` 这类 client 本地推导字段，只允许写到 execution 目录下的 `.env.runtime`，由项目脚本按需额外加载
- `client` 上报的运行态服务列表只用于补充运行时状态、端口、入口等附加信息；当前内置采集器只会 best-effort 地读取仍然采用 `docker compose` 的 release，对完全由项目脚本自管的非 compose 运行时不会强行探测，也不能因为某个历史 compose 记录损坏就让 heartbeat 持续报错
- `client` 还会写一份本地行为日志，专门记录卸载、服务清理、临时文件删除以及宿主机文件/目录变更等维护动作，方便开发者从真实清理轨迹里整理定制脚本
- `server` 侧真正的服务对象由控制面创建并持久化保存，UI 会优先按 `service_id` 聚合 runtime 状态，只在缺少稳定标识时才回退到服务名
- 因此历史 Bundle 和回滚入口都应该通过独立子路由进入；客户端详情页只保留精简服务 grid，客户端日志从顶部操作菜单拉起独立模态查看，客户端级回滚入口集中到 `/clients/:clientID/rollbacks`，具体服务则统一进入 `/clients/:clientID/services/:serviceID/bundles/:serviceKey/:releaseID`。Bundle 详情页现在只展示 CI 持久化下来的 `meta.json`，最后进入回滚确认。回滚步骤本身不再允许修改 env/script，也不再临时切换到新的 override 版本；server 只消费该 release 已持久化的原始资产。
- `Service Bundle` 页在首屏读取历史脚本 / 环境版本失败时，错误提示也应留在当前子路由内渲染，而不是额外抛全局 toast。这样操作者还能保留当前 Bundle 上下文，并直接在错误态里重试读取。
- client 在提交 WebRTC transfer answer 时，不能无限期阻塞在 `PendingLocalDescription()/LocalDescription()` 读取上；实现上必须给这一步加短超时和有限轮询，只接受真正带 candidate 的 local description。若超时后仍拿不到可用 answer，client 应立即把 transfer 标记为失败，或在确认本地 `OnICECandidate` 已采集到 candidate 后显式把这些 candidate 补写回 `CreateAnswer()` 产出的 SDP 再提交；不能再把一个没有 candidate 的裸 answer 当成兜底提交给 server，否则 sender 只会在长超时后报 `bundle send timed out`。answer 提交日志也应明确标出本次使用的是哪一种来源，方便排查“client 已收 offer 但 server 长期拿不到 answer”的场景。
- release bundle 的正式发布主链已经不再走 WebRTC transfer。`ovo-ci publish` 现在只负责把 zip 上传到 `server + R2` 资产中心，再请求 server 为目标 client 下发 deploy task；client 只在执行任务时按 `bundle_download_url` 拉取 zip。因此这些发布任务不再依赖 ICE 配置、offer / answer 或 `ovo-transfer-sender`。
- `OVO_WEBRTC_LOOPBACK_ONLY`、ICE 配置和 candidate 调优现在只服务于“历史日志按需回拉”这一条点对点链路。它仍然需要处理同机回环、多网卡和 NAT 场景，但不再影响 bundle 下载或 CI 发布主链。
- client 在 heartbeat 阶段恢复当前 compose release 时，也要兼容旧的本地 release 记录：如果历史状态把 `execution/` 目录误存成 `compose_file`，或把 release 根目录误存成 bundle root，client 需要自动把 bundle 根纠正到 `execution/`，再重新推导真实的 `docker-compose.yml / compose.yaml / compose.yml`，避免 `docker compose -f .../execution` 把目录当配置文件读取并持续报 `is a directory`。
- 历史日志回拉这条“server 作为 WebRTC 发送端”的链路，server 自己创建 PeerConnection 时也必须复用同一份 `configuredICEServers()` 结果；不能只把 ICE server 列表下发给 client，却让 server 端继续裸连，否则会出现 answer 已就绪但 DataChannel 长时间停在 `connecting/checking`、最终 `disconnected/failed` 的假性断链。
- 控制台上层的统一 `Tasks` 审计视图现在只汇总真正的 `task` 与 `command`；Bundle 下载已经改为页面内临时会话，不再进入 `Tasks` 列表，也不再影响 aside 的任务数量。
- server 现在只支持“撤销仍在队列里的 queued task”。实现上会把 task 从对应 client 的 `TaskQueue` 中移除，并同步把 task / release 审计状态记为 `canceled`；一旦任务已经进入 `dispatched` 或运行态，就不能再由 server 强制打断，必须等待 client 后续 report。
- client 侧同一个 `service_key` 现在把 `deploy / rollback task` 和服务级 `command` 统一纳入一把项目锁；只要某个项目已经在执行 deploy、rollback、`start_service`、`stop_service`、`restart_service`、`purge_release`、`purge_service` 之一，后续同项目 task / command 都必须等前一个执行完再重试，避免 release 目录在下载 `artifact.zip` 或组装 `execution/` 时被并发清理。
- `Service Bundle` 页里的 rollback 确认在 UI 上不再走全局阻塞 loader；点击确认后直接创建 rollback task，按钮自身进入 loading，成功后刷新 dashboard，让统一 `Tasks` 视图和 aside badge 立即出现新增记录。
- 控制台查看某个历史 release 的部署日志时，应在 Bundle 子路由内展示 server 刚刚按需拉回的日志内容；重新拉取成功后，日志视图需要默认滚动到日志末尾，让运维先看到最新输出

---

## 5. 安全性考虑

- **路径限制**: 所有的脚本执行工具必须在 Client 配置的 `workspace` 或特定白名单目录下操作。
- **超时控制**: 每个 Tool 调用都有强制的 Context Timeout。
- **鉴权绑定**: 只有合法的 Client 命令才能触发 Tool 执行。
- **Shell 兼容边界**: Server 生成的客户端安装/部署入口命令仅保证兼容 `bash`、`zsh`、`fish` 三种常见交互环境；具体执行脚本继续由内置 `bash` 脚本承载，避免把 shell 方言暴露到外层粘贴命令中。

---

## 6. 持久化

`client` 现在采用稳定的双层存储模型：

- `config.json`：保存 `alias`、`server_url`
- `client.db`：保存部署历史、项目 release 索引、待补报 report
- 文件系统：保存 bundle zip、解压目录、历史脚本、环境变量、按 release 归档的日志与 `logs.tar.gz`

`client.db` 由 SQLite `PRAGMA user_version` 管理 schema 版本，但客户端不会再从旧 JSON 状态文件做迁移导入。

这意味着：

- Tool 执行逻辑不需要直接扫描整个 workspace 才能拿到运行状态
- 客户端升级后可以稳定演进本地数据结构
- `server_url` 不再只依赖宿主机环境变量，而是会落到本地配置中持久保存
- 本地 CLI 可以通过 `ovo-client completion <shell>` 输出 shell completion，让终端 `Tab` 提示 `status/start/stop/restart/update/uninstall` 等子命令和 `uninstall --delete-config/--delete-data` 选项
- 本地 CLI 现在把 client 进程日志入口收敛为 `ovo-client logs` 与 `ovo-client clean logs`；`logs -f` 会持续跟随本地 `client.log`，`clean logs` 只清理这份 client 自身进程日志，不影响 release 任务日志或项目级日志归档
- 本地 CLI 的 `status/start/stop/restart/update/logs/clean logs/uninstall` 都支持 `-v / --verbose` 详细模式；详细模式会输出当前命中的 env/config 路径、service manager / unit、日志路径、下载目标、清理目标等上下文，便于开发者在宿主机上直接排障

存储层细节见：

- [client-storage.md](https://github.com/AaronConlon/ovo/blob/main/docs/client-storage.md)

---

## 7. 客户端命令边界

当前需要明确区分两类命令：

- client 级远程命令：`start`、`stop`、`restart`、`upgrade`、`uninstall`
- 本地 token 兜底命令：安装脚本生成的 `setup-client-service.sh` 继续保留 `activate-token` / `set-token`
- 服务级命令：`start_service`、`stop_service`、`restart_service`、`purge_service`

边界约束：

- client 级命令只作用于 `ovo-client` 自身，不直接控制某个服务
- 服务的启停、重启必须通过服务级命令或服务详情页触发
- 服务级命令的主键现在是 `target_service_id`；server 排队时必须同步解析出 `service_key/current_release_id`，client 再从该 release 的 `scripts/ovo/*.sh` 执行真正动作
- server 命令队列不再按服务名做主寻址，也不再做“同名 managed service”自动回填
- 实时 compose 日志跟随也属于服务级能力，但 release 定位应优先依赖 `service_id`，不能假定控制面服务名等于 compose 内部 service key
- 服务详情页触发的备份会先由 server 解析 `service_id/current_release_id`，再排入项目级 backup task；服务级 backup hook 已不再是 v2 主链
- `purge_service` 会先停止该服务所属项目的所有历史 compose project，然后删除该项目在 client 本地的 `releases/`、脚本/env 历史、override、项目数据目录，以及显式 `current_release_id`
- `purge_service` 是服务级“彻底删除”，和 `uninstall` 的目标完全不同；它不会移除 `ovo-client` 自身
- `purge_release` 是 release 级“只删这一版历史 Bundle”；client 只能删除非当前 release，对应地只移除该 release 的本地目录、脚本/env 历史和 override，并从本地 release 索引与 deployment history 中剔除这一条，不能顺带清空整个服务目录
- `purge_release / purge_service` 与同项目 deploy / rollback 现在必须串行执行，不能再和正在下载 bundle、校验 `artifact.zip` 或复制 `execution/` 的 deploy 流程并发落到同一个 `projects/<service-id>/releases/<release-id>/` 目录
- `uninstall` 现在只卸载 client 自身的托管 service、二进制和控制链路，不会自动停止已经部署的项目服务
- `uninstall` 默认保留本地配置和本地数据；只有显式指定删除选项时，才会删除配置文件或本地 SQLite / Bundle 历史 / 部署日志
- 本地直接执行 `ovo-client uninstall` 时，client 在真正退出前也必须 best-effort 通知 server 命中 `/api/clients/{client_id}/self-delete`；server 收到后应立即把该 client 标记为 `uninstalled` 并清理控制链路状态，而不是简单等离线超时
- 控制台还必须提供一个只作用于 server 控制面的兜底删除动作，用于 client 已丢失或彻底离线时直接删除数据库记录；这条链路会移除 `Clients / Tasks / Tokens` 里的关联控制面状态，并直接删除所有绑定到该 `client_id` 的 issued token 记录，同时阻止原 `client_id` 继续复用旧凭证，不会连接目标主机，也不会清理任何本地文件
- 无论是 client 本地执行 `uninstall` 后上报 self-delete，还是 server 收到成功的 `uninstall` command report，server 都必须把该 client 的控制链 token 清掉，例如 `install / client / pending`，避免宿主机已卸载后还能继续拿旧控制链凭证连回 server；但已签发的 `deploy token` 不应因为 client 卸载而被删除或改状态，只有操作者在 server 侧明确执行“删除 client 数据 / 删除 client”时，才允许把绑定的 deploy token 一起移除
- 以上几条 client 移除链路还必须同步删除该 client 关联的 active alert 记录；控制台不应继续展示已经不存在的 client offline / service abnormal / bundle deploy failed 告警
- `uninstalled` client 仍然保留原有 `client_id`、别名、图标和历史发布/服务上下文，方便操作者审计和复装；它不应再被自动打成 `offline`，也不应继续接收远程控制、日志流或升级命令
- 控制台需要为 `uninstalled` client 提供“重新安装脚本”入口，并复用原有 `client_id` 重新签发一次性 install token。只有 `status=uninstalled` 的 client 才允许走这条复装链路；其他状态仍应继续使用“新增客户端”安装脚本
- 重新安装链路不能再要求操作者重新填写客户端名称或图标；server 生成脚本时应继续沿用当前 `uninstalled` 记录里的别名和图标，只允许调整安装目录、工作目录、服务管理器等宿主机安装参数
- “新增客户端”只负责生成一次性安装脚本和预分配 `client_id`，不应在 server 里提前创建 placeholder client 记录；真正的 client 数据必须等安装完成并命中 install-complete / register 后再落库
- `install-complete` 只允许把空白 / `awaiting_token` / `installing` / `uninstalled` 的 client 重新接回控制链；它会直接签发一枚绑定到该 `client_id` 的长期 `client token`，并把 install token 立刻标记为已消费和已吊销。已经进入 `online / offline / unreported` 等已激活态的 client，必须先走 `uninstall` 或 `reinstall cleanup`，server 不能因为重复安装脚本命中就把它重新打回待激活。
- 每次生成安装脚本都必须重新签发一次性 install token，并立即使该 `client_id` 之前残留的 install token 失效；install token 默认只允许使用一次，且有效期固定为 5 分钟，避免同一条安装命令被并发复用到多台同名 client 上。
- 控制台不再提供“一键激活客户端”这条远程命令链。首次接入由安装脚本在本地自动完成“install token -> 长期 client token”的交换；如果现场需要人工纠偏，只保留“重新签名 client token”入口。
- `Clients` 列表的右键菜单需要提供“重新签名 client token”。这条链路会立刻签发一枚新的 `authRoleClient` token，并把明文 token / `client.env` 推荐片段展示给操作者复制；同时 server 必须立即使这台 client 旧的 `client token / pending token` 失效，避免新旧 token 同时可用。
- 只要某台 client 后续使用一枚有效、且绑定到自身 `client_id` 的 `client token` 命中 `register` 或 `heartbeat`，server 就必须把它视为“已激活控制链”，立即把状态提升到 `online`，并删除该 client 仍残留的 `pending token`
- 即使现场还残留旧的 `pending token`，`register` / `heartbeat` 这类 telemetry 也只能刷新主机信息、版本号和运行态，不允许把已经激活过的 client 从 `online / offline / unreported` 再降回 `awaiting_token`
- server UI 的“远程控制”对话框也按这个边界执行：服务命令放在服务详情页，client 远程控制只下发 client 级命令
- server UI 下发 client 级远程命令后，不再只提示“已下发”；除 `upgrade` 外，控制台仍会轮询该命令的执行状态与命令日志，并通过 `Sonner toast + 全局 loader` 持续展示 `queued -> dispatched -> success/failed` 过程。命令详情接口必须对 UI 做脱敏处理，不能把激活 token 一类敏感 payload 直接暴露到前端。
- `upgrade` 仍然通过 client command 链路执行，但 UI 只负责把升级任务下发给 client，不再阻塞等待升级完成或等待 client 重新上线。server 会同步创建一条镜像 task，把升级状态和日志写进统一 `Tasks` 审计流；client 自己执行升级并持续上报，操作者通过 `Tasks` 和客户端状态查看结果。
- `start_service` / `stop_service` / `restart_service` 现在也必须像 `upgrade` 一样同步创建镜像 task，把命令状态和日志写进统一 `Tasks` 审计流；服务详情页触发后，UI 需要保留结果态并要求操作者手动返回，避免命令成功/失败后自动关掉上下文。

---

## 8. 后续演进

- **二进制隔离**: 未来可考虑支持外置的可执行文件作为 Tool，通过标准输入输出与 Client 通信。
- **并发控制**: 限制同一时间运行的 Tool 数量，防止 VPS 资源耗尽。
