# pure-spa-page 示例

`pure-spa-page/` 是一个专门演示“纯静态单页 + client 原生 nginx”链路的项目。它借鉴了 `frontend/` 的 Vite + React 结构，但 release bundle 现在进一步收敛成极简 SPA 交付物：只保留静态资源、release 元数据，以及围绕它们的最小脚本集合。deploy 阶段只做两件事：

1. 在 CI 中执行 `npm run build && scripts/build-release.sh`，生成包含 `runtime/public`、`.env`、`scripts/ovo` 的 bundle。
2. client 执行 bundle 自带的 `scripts/ovo/deploy.sh`，把 `runtime/public` 同步到 `~/www/pure-spa`，再通过 `scripts/ovo/healthcheck.sh` 检查 `http://localhost/pure-spa/` 是否返回 HTTP 200。

## 构建 & 发布流程

- `npm run build`：产出 `dist/`。`pure-spa-page/src` 默认把 `import.meta.env.BASE_URL` 设成 `/pure-spa/`，可以用 `PURE_SPA_PUBLIC_BASE` 覆盖。
- `npm run build:release`：会触发 [pure-spa-page/scripts/build-release.sh](https://github.com/AaronConlon/ovo/blob/main/pure-spa-page/scripts/build-release.sh)，把 `dist/` 拷进 `release/runtime/public`，生成 `.env`、`meta.json` 以及 `scripts/ovo/{deploy,healthcheck,status,common}.sh`。`meta.json` 里会附带一组更完整的示例字段，方便在 Bundle 详情页查看真实发布长相。
- `scripts/build-pure-spa-bundle.sh`：顶层发布脚本，负责调用 npm build + release 之后，把 `pure-spa-page/release` 拷进 bundle 目录。
- 顶层 [scripts/build-release.sh](https://github.com/AaronConlon/ovo/blob/main/scripts/build-release.sh) 会在 bundle 目录的 `meta.json` 中补齐 `archive.password` 等压缩字段，然后在 zip 加密前把这份完整 JSON 明文传给 `ovo-ci`，供 server 持久化与后续 client 解压使用。
- `scripts/simulate-pure-spa-ci.sh`：本地模拟 CI。脚本会读取 [pure-spa-page/.env.production](https://github.com/AaronConlon/ovo/blob/main/pure-spa-page/.env.production.example)，安装 `ovo-ci`，再带着 `BUNDLE_BUILD_SCRIPT=scripts/build-pure-spa-bundle.sh` 去走主链路。

## 部署脚本行为

`release/scripts/ovo/` 现在保留四个脚本：

- `deploy.sh`：确保 `runtime/public` 存在，默认把内容同步到 `~/www/pure-spa`，然后调用 `healthcheck.sh check` 作为本次部署的成功判定。
- `healthcheck.sh`：纯静态服务的统一探针入口。先检查目标目录和 `index.html` 是否存在，再对 `PURE_SPA_HEALTHCHECK_URL` 发起 HTTP 探活；如果宿主机没有 `curl` / `wget`，会退化为文件存在性检查。
- `status.sh`：输出 `target_root`、`release_id`、`healthcheck_url`、`filesystem_status`、`http_status` 等状态字段，供 client/server 在非 deploy 场景下独立查询服务状态。
- `common.sh`：统一加载 `.env` / `.env.runtime`，封装文件系统检查、HTTP 探活、等待逻辑，避免 deploy 和 health/status 出现多份状态判断实现。

client 在 heartbeat / task report 阶段也会读取当前 release 的 `scripts/ovo/status.sh`。对 `pure-spa-page` 来说，`http_status=healthy` 会被控制面解释成服务正在运行；如果宿主机无法执行 HTTP 探针，则会回退到 `filesystem_status=ready` 作为“已就绪”的状态来源。

`release/.env` 默认提供：

```bash
PURE_SPA_TARGET_ROOT=~/www/pure-spa
PURE_SPA_HEALTHCHECK_URL=http://localhost/pure-spa/
PURE_SPA_HEALTHCHECK_TIMEOUT=30
PURE_SPA_PUBLIC_BASE=/pure-spa/
APP_VERSION=<package.json 版本>
RELEASE_ID=<CI 注入或当前版本>
```

客户端可以直接编辑这份 `.env` 来灌入新路径或自定义健康检查入口，但默认契约就是检查 `localhost/pure-spa/` 返回 200。

`release/meta.json` 现在除了基础的 `release_id / app_version / target_root / base_path / healthcheck_url` 外，还会示例性带上：

- `build.generated_at / commit_sha / branch / workflow / run_id / actor`
- `deploy.runtime / strategy / entrypoint / healthcheck`
- `contacts.owner / channel`
- `links.repo / runbook / preview_path`
- `notes[]`

这些字段主要用于演示 server 持久化后的 Bundle 元数据展示，不要求 client 在部署时逐项消费。

## bundle 结构

当前 bundle 只包含这几个必要资产：

```text
bundle/
├── .env
├── meta.json
├── runtime/public/*
└── scripts/ovo/{deploy,healthcheck,status,common}.sh
```

nginx 路由配置仍然保留在仓库里的 [pure-spa-page/config/nginx-location-pure-spa.conf](https://github.com/AaronConlon/ovo/blob/main/pure-spa-page/config/nginx-location-pure-spa.conf) 供运维参考，但它不再打进 release bundle。

## 快速演示步骤

```bash
git clone https://github.com/AaronConlon/ovo.git
cd ovo
cp pure-spa-page/.env.production.example pure-spa-page/.env.production
# 根据环境补充 SERVER_URL / DEPLOY_TOKEN / TARGET_CLIENT_ID / SERVICE_ID
./scripts/simulate-pure-spa-ci.sh <client_id> <service_id>
```

部署完成后，client 会把静态资源同步到 `~/www/pure-spa`。当 nginx 已经把这个目录挂到 `/pure-spa/` 后，本次 deploy 会以 `http://localhost/pure-spa/` 返回 200 作为成功标准。
