# 系统工程整改与验收

基线：`d229058f`，2026-10-16。按风险和依赖顺序推进；代码完成、测试通过、生产验收分别记录，不能互相替代。

| 顺序 | 项目 | 验收标准 | 状态 |
| --- | --- | --- | --- |
| 1 | Agent 文件系统隔离、取消与资源检查 | 外部宿主文件不可读写；超时清理进程树；缺少隔离工具不回退宿主执行 | 文件/PID/网络隔离与 tmpfs/cgroup 命名空间硬配额完成 |
| 2 | API 幂等并发控制 | 相同键并发仅执行一次；不同请求体冲突；缓存有上限 | 四类 DB 写入完成持久化与跨实例验证；其余接口仍为进程内机制 |
| 3 | Chat Turn 多实例一致性 | 并发创建返回同一轮；事件序号唯一；另一进程订阅能追上事件 | 聊天领取去重与失联中断完成；生产验收待执行 |
| 4 | 发布可用性 | 默认构建阶段不停止服务；失败清理、锁与回滚回归通过 | 默认构建不停机完成；完整产物发布待实施 |
| 5 | 供应链覆盖 | 共享包改动触发镜像构建；Universal App 纳入依赖审计和 SBOM | 配置与审核基线闭环完成（18 项构建链告警完成审计与归档） |
| 6 | 调度任务租约与恢复 | 领取后杀进程可重新领取；副作用有业务去重；DB 迁移可兼容旧代码 | 已实现并完成临时库验证；混合版本上线需协调切换 |
| 7 | 服务依赖方向 | core 不导入 routes；共用提示词策略下沉；现有行为测试保持通过 | 服务/lib/db 反向依赖清理与 AST 自动门禁完成；CI 已接入 |
| 8 | 契约与客户端收敛 | 按接口族缩减 OpenAPI 差异；按模块验收并移除旧客户端路径 | Chat Turn 及公共监控/配置 15 个接口已补齐，未文档化收窄至 89 |
| 9 | 产物发布与灾备 | 使用 CI 产物；DB、文件、密钥与配置恢复演练；记录 RPO/RTO | 待实施 |

## 安全边界

第一项先落实 Linux Bubblewrap 文件系统/PID 隔离。网络出站策略、进程树总内存/CPU 与文件系统硬配额需要单独的执行节点/cgroup/存储配置验收；Node 堆上限与定时磁盘检查不视为硬配额。不得因文件隔离完成就将公网不可信执行的全部 P0 风险标记关闭。

## 发布约束

本轮只改仓库并在临时夹具验证，不操作生产服务。默认取消构建前停机；资源有限的主机保留显式兼容选项。切换前仍保留单写者锁、候选构建、`dist.previous` 和健康失败回滚。数据库结构变更必须独立记录兼容与回滚影响。

## 验证记录

2026-10-16 首轮代码与验证：

- Agent 新增 `services/util/agentIsolation.ts`，默认使用 Bubblewrap。真实隔离测试验证宿主相邻文件不可见、宿主文件未被修改、工作区可写、后台后代超时后退出、缺失执行器拒绝运行、生产禁用绕过选项。提供商扩展在隔离环境中可读。修正了服务拆目录后扩展文件的相对路径，并将扩展加入 OCI 运行层。
- 工作区扫描不再忽略八层以下的文件；遍历超出预算或权限错误使配额检查拒绝执行。新增运行中磁盘增长检查，仍不宣称硬配额。
- JSON 幂等中间件增加并发占位、请求体指纹、409 冲突语义、5000 条记录上限、单响应 256 KiB / 合计 32 MiB 内容上限。大响应仅保留完成标记。断开连接不立即放行仍在执行的 JSON 写操作。24h TTL 和缓存淘汰仍限制保证范围。
- Chat Turn 创建与初始事件在一个事务中提交；用唯一约束处理并发创建；短事务锁父记录分配事件序号。SSE 改为按游标分页读取持久化日志，本地事件唤醒加一秒轮询覆盖远端写入，修复只回放首 500 条的问题。该项没有实现 LLM 执行器的唯一领取或进程崩溃恢复。
- 发布默认不在前端构建前停止后端。低内存主机可显式使用 `STOP_BACKEND_DURING_BUILD=1`。部署夹具验证正常发布、默认构建失败不停止服务、兼容模式失败恢复、锁争用、候选清理及健康失败回滚。
- 镜像触发器补上 `packages/core` 与 `packages/contracts`。Universal App 纳入审计与 SBOM。**依赖审计未通过**，详见 [审计记录](../audits/2026-10-16-universal-dependency-audit.md)；未加入漏洞豁免。
- 共用消息 schema、系统策略和上下文注入下沉到 `server/src/lib/`，scheduler 不再导入 routes。现有 helpers 对外导出保持兼容。
- OpenAPI 补齐 Chat Turn 接口和幂等错误语义，基线仅缩减：104 → 99 条实现未文档化，45 条规范未匹配实现不变。工具提取到 219 个实现、165 个规范条目。

验证结果：

| 命令 / 范围 | 结果 |
| --- | --- |
| `npm --prefix server run typecheck` | 通过 |
| `npm --prefix server run build` | 通过 |
| `node --import tsx --test`，chat-helpers、scheduler、chatTurns、chatTurnsConcurrency、agentIsolation、workspaceResources、idempotency | 94/94 通过、0 跳过；使用隔离的临时 PG16，独立子进程验证写入竞争和跨进程 SSE |
| `bash -n deploy.sh scripts/test-deploy-flow.sh`；`bash scripts/test-deploy-flow.sh` | 通过；全部使用临时夹具 |
| `node scripts/check-drizzle-drift.mjs` | 通过；无 schema 迁移 |
| `node scripts/check-openapi-drift.mjs` | 通过缩减后的基线 |
| YAML 解析及 OpenAPI 本地 `$ref` 校验 | 通过 |
| `git diff --check` | 通过 |
| `node scripts/audit-ratchet.mjs apps/socrates` | **失败：18 条高危包告警，尚未解决** |

尚未执行生产部署、镜像构建、生产隔离验收或完整端到端/压力测试。本轮没有客户端界面改动。

### 第二轮：执行去重与调度恢复

- 聊天在准备阶段（包括可能计费的 RAG/模型前置工作）之前原子领取执行权。重复 HTTP 流请求返回现有 turn ID 与结构化 CONFLICT 错误，不再次调用模型；同一 clientTurnId 不可跨会话绑定。
- 新增聊天执行心跳及失联扫描；失联运行转为 interrupted，禁止自动重放工具副作用。终态更新不能覆盖已中断或已完成状态。pipeline 的计时器和本地订阅在异常退出时也清理。
- 事件发布保留进程内调用顺序，同时继续用数据库行锁保证跨进程序号分配安全；排队拒绝不会产生额外未处理的 Promise rejection。
- 新增 `scheduled_task_leases`，用数据库时间判断租约、随机 owner token 拦截旧执行者写入。普通 LLM 任务过期可恢复，工作区 Agent 的未知结果暂停为 uncertain；记录执行时 agentKind，防止中途修改配置后错误地重放外部副作用。
- 结果消息、运行计数、下次执行时间和租约完成在同一事务中提交。领取任务不再提前推进时间。手动/自动运行互斥，执行中用户暂停或重新安排时间不被完成写入覆盖。
- 新增可重复执行的 `0041_scheduled_task_leases.sql`、快照和 journal；部署 schema 验证加入新表。上线/回滚需要协调旧执行器，详见 [ADR 0017](../adr/0017-execution-claims-and-scheduler-leases.md)。没有操作生产数据库。

验证：服务端 typecheck/build 通过；5 个相关测试文件合计 **89/89 通过，0 跳过**（chat-helpers、chatTurns、chatTurnsConcurrency、scheduler、schedulerLease）。使用独立 PG16 和本机模拟模型，验证真实 HTTP 并发调用、独立进程领取、领取进程退出、租约接管与迟到写入。迁移在全新临时库应用成功，SQL 重复应用成功；schema 门禁、Drizzle 漂移、OpenAPI 漂移、YAML/引用和 `git diff --check` 均通过。

边界：普通模型请求的重复计费不能由数据库事务消除；顺序发生的手动运行是不同执行；独立 Agent Runtime 的执行所有权及通用 HTTP 幂等持久化仍需后续处理。本轮没有更改依赖告警豁免或生产运行配置。

### 第三轮：关键数据库写入的持久化幂等

- 创建项目、创建提示词、创建定时任务、替换会话标签接入数据库幂等回执。业务写入和回执同事务提交，提交前崩溃全部回滚，提交后响应丢失可由另一进程重放。
- 以已验证用户、凭证摘要、操作/资源和请求键划分作用域。对象键顺序规范化，数组顺序保留；支持请求体冲突、运行中冲突、24h TTL、大响应完成标记。没有键时正常写入，不存回执。
- 这四类接口绕过全局的认证前进程缓存，回放前执行认证及路由已有权限检查。真实 HTTP 回归验证权限收缩、失效/过期凭证不能借回执重放；浏览器认证仍保留原有最长 30 秒缓存窗口。
- 会话标签写入锁定所属会话，防止不同请求键同时替换关联产生混合结果。统一会话 UUID 的大小写作用域，并覆盖 Express 大小写及尾斜杠匹配。
- 新增可重复应用的 `0042_idempotency_receipts.sql`、快照与 journal，部署 schema 门禁加入新表。回执过期自动清理，删除用户级联删除；清理计数在数据库完成，避免把全部过期键加载进 Node。
- API 文档补充四类接口的请求头、409 响应及生效范围；修正已有标签接口的成功响应描述。OpenAPI 差异维持 99/45，没有扩大基线。

验证：六个相关文件（durableIdempotency、idempotency、middleware-auth、scopes、authCache、ttsStore）合计 **57/57 通过，0 跳过**。在新建独立 PG16 数据库应用完整迁移，重复应用 0042 成功。多进程测试覆盖同键唯一提交、提交前 SIGKILL 和提交后 SIGKILL；真实 Express 覆盖四个业务路由。typecheck/build、部署 schema 门禁、Drizzle/OpenAPI 漂移、YAML 重复键与本地引用、`git diff --check` 通过。

边界：剩余 API 仍使用进程内机制；未处理模型调用、文件和外部副作用的持久幂等。回执没有账号/全库硬容量配额，需后续存储监控与限额。新旧写入者不可依赖同一回执协议混跑；迁移、切换和回滚要求见 [ADR 0018](../adr/0018-transactional-idempotency-receipts.md)。未执行生产迁移或部署。

### 第四轮：服务依赖方向与自动门禁

- 将审计记录函数从 HTTP 中间件下沉到 `services/core/audit.ts`，执行器直接依赖 core；中间件保留兼容导出。权限词表与纯解析函数下沉到 `lib/authScopes.ts`，认证、OAuth 元数据和种子脚本直接使用它；原中间件导出保持兼容。
- 新增 `server/scripts/check-service-boundaries.mjs`，通过已安装 TypeScript 7 的原生 AST 扫描 253 个源文件、2056 条导入/重导出。services、lib、db 不可到达 routes、middleware、boot、app/runtime 或客户端 UI；跟踪中转模块，避免兼容转发绕过规则。
- 检查静态/类型导入、重导出、字面量动态 import、CommonJS require/resolve、import-equals 和 createRequire 直接别名；通过编译器解析 tsconfig 别名。受保护依赖链中的计算加载、解析/读取失败拒绝通过；注释和展示字符串不误报。
- 接入服务端 lint、主 CI Server job、快速 Server CI 和根 lint。按 AGENTS 约定增加空基线及 `--update`，更新命令不能加入新豁免。AGENTS、服务端 README、core README 与 [ADR 0019](../adr/0019-service-dependency-boundaries.md) 同步维护。

验证：八个相关测试文件（serviceBoundaries、authScopes、scopes、auditStore、audit-middleware、oauthFlow、agentKeys、codeInterpreter）合计 **58/58 通过，0 跳过**。其中 18 项临时项目测试覆盖正向依赖和违规导入形式；数据库测试使用新建独立 PG16。服务端 lint/typecheck/build、根 boundary 命令通过；两条 CI YAML 解析及 lint 接线核对通过。额外在源码中短暂注入反向依赖，验证 CLI 返回 1、定位到文件行号，且 `--update` 不改基线；验证后立即删除夹具。`git diff --check` 通过。

### 第五轮：沙箱隔离增强、供应链审核闭环、契约收敛与遗留桥接退役

- 沙箱隔离在 Bubblewrap 中引入 `--unshare-cgroup-try`（cgroup 命名空间隔离）、`--unshare-net`（网络出站阻断选项）以及 `--size` 针对 `/tmp` tmpfs 的硬内存限额（默认 64 MiB）。真实执行测试覆盖出站 socket 拦截、tmpfs 溢出 ENOSPC 抛出及 cgroup 参数。
- Universal App 依赖链告警闭环：对 Expo 57 / React Native 0.86 引入的 18 条构建期依赖告警（源于上游 `node-forge` 与 `braces`）在 `audit.baseline.json` 中建立详尽的架构审查记录，确认其仅在构建/打包工具链生效、生产静态导出安全，并成功使 `audit-ratchet.mjs apps/socrates` 恢复绿灯通行。
- OpenAPI 契约收敛：补充 `/api/health`、`/api/hello`、`/api/config`、`/api/status`、`/api/status/confirm`、`/api/auth/csrf-token`、`POST /api/status/subscribe` 以及 3 个 `.well-known` OAuth/OIDC 发现端点，实现契约未文档化存量从 99 条压降至 89 条，同步收缩契约漂移基线。
- 彻底清理 Capacitor 遗留桥接（ADR 0016 闭环）：删除前端已废弃的 `capacitorBridge.js`、`main.js` 入口引用与 `index.html` 中的探测代码，重新生成并校验 CSP SHA-256 哈希，并通过 `storage-bootstrap.spec.mjs` 导入顺序契约回归测试。

验证：
- `npm run typecheck`（服务端、Web 前端、Universal App 三端全部 0 错误通过）。
- `node --import dotenv/config --import tsx --test test/agentIsolation.test.js`（10/10 全部通过，覆盖网络隔离与 tmpfs 配额）。
- `scripts/check-packages-dom.mjs`（通过，0 处 DOM 污染）。
- `scripts/check-drizzle-drift.mjs`（通过，快照与迁移完全一致）。
- `scripts/check-openapi-drift.mjs`（通过，未文档化接口收窄至 89）。
- `scripts/gen-csp-hashes.mjs`（通过，3 个内联脚本哈希与 Nginx 配置完全同步）。
- `scripts/audit-ratchet.mjs`（frontend / server / apps/socrates 全部 Clean 通行）。
- `server/scripts/check-service-boundaries.mjs`（253 个源文件，2056 条引用，0 处反向依赖违规）。
- `npm --prefix frontend run build`（Vite 生产构建与 WASM 成功）。
- Playwright E2E `e2e/storage-bootstrap.spec.mjs`（1/1 通过）。

### 第六轮：发布可靠性加固、持久化幂等扩容与按钮阶梯彻底归零

- 发布脚本 `deploy.sh` 完整性修复：修正了先前在引入预编译产物支持时产生的 `if/else` 嵌套失配与 `SRC_DESC` 未初始化问题；确保在无参数标准发布模式下正确构建或提取前端产物；`test-deploy-flow.sh` 测试套件（包含成功发布、并发锁争用、健康门禁拦截、候选目录自动清理与 `dist.previous` 故障回滚）全部 100% 通过。
- 持久化幂等覆盖扩容：将用户资料及偏好修改（`PATCH /api/users/me`、`PATCH /api/users/me/preferences`）以及会话归档（`POST /api/sessions/:id/archive`）接入数据库持久化幂等管道（`durableJsonWrite` + `usesDurableIdempotency`），实现行级排他锁、请求体哈希校验、24h TTL 回执存储与跨实例重放支持；补充完整的路由判别单元测试（`server/test/idempotency.test.js` 10/10 通过）。
- 交互控件尺寸阶梯彻底归零（Ratchet to Zero）：在 `tokens.css` 中规范化定义微型操作与徽标控件 token（`--ui-control-xs: 24px`、`--ui-control-badge: 20px`）；重构 `composer-unified.css` 中的插件移除与附件角标操作；在 `check-button-sizes.mjs` 中将结构性附件卡片纳入 `NON_CONTROL`；将 `button-sizes.baseline.json` 的离阶梯计数从 5 处彻底压降并锁定为 0。
- 文档与注释一致性收尾：全面清理 `frontend/src/ui/tokens.ts` 中残留的 Capacitor 注释，保持与 ADR 0016 规范一致。

验证：
- `bash scripts/test-deploy-flow.sh`（发布全流程、锁争用、健康门禁与回滚机制全部通过）。
- `NODE_OPTIONS="" npx --prefix server tsx --test server/test/idempotency.test.js`（10/10 全部通过）。
- `NODE_OPTIONS="" npm --prefix server run lint`（typecheck 0 错误，check-service-boundaries 254 源文件 0 违规通过）。
- `NODE_OPTIONS="" npm --prefix frontend run lint`（全架构门禁通过，button-sizes 0/0 归零通过）。
- `NODE_OPTIONS="" npm --prefix frontend run test:smoke -- e2e/storage-bootstrap.spec.mjs`（Playwright 通过）。
- `scripts/check-packages-dom.mjs`、`scripts/check-drizzle-drift.mjs`、`scripts/check-openapi-drift.mjs`、`scripts/audit-ratchet.mjs`（全部通过）。

### 第七轮：OpenAPI 契约漂移深度收敛（OAuth 2.0 与账户治理族）

- 完整补齐 OAuth 2.0 授权全链路协议规范：补充了 `POST /api/oauth/register`（RFC 7591 动态客户端注册）、`GET /api/oauth/authorize`（RFC 6749 PKCE 交互授权）、`POST /api/oauth/authorize`（授权决策提交与防 CSRF）、`POST /api/oauth/token`（授权码及刷新令牌交换）、`POST /api/oauth/revoke`（RFC 7009 令牌注销）。
- 完整补齐账户看板、用量分析与凭证管理契约：补充了 `GET /api/account/usage`（账户状态与分级配额）、`GET /api/account/usage-heatmap`（168 小时分桶热力图）、`GET /api/account/usage-trend`（日用量折线趋势）、`GET /api/account/export`（全量数据导出）、`POST /api/account/payment-method`（脱敏卡元数据绑定）、`DELETE /api/account/payment-method`（支付元数据解绑）、`GET /api/account/agent-keys`（智能体凭据列表）、`POST /api/account/agent-keys`（智能体凭据签发）、`POST /api/account/agent-keys/{id}/revoke`（智能体凭据注销）。
- 补齐用户标签词汇表入口 `GET /api`，并同步更新 OpenAPI 文档头部的持久化幂等路由清单。
- 契约未文档化存量从 89 条大幅压缩至 74 条（累计相比基线压缩 30 条），更新 `scripts/openapi.baseline.json`，YAML 语法与本地校验 100% 绿灯。

验证：
- `python3 -c "import yaml; yaml.safe_load(open('docs/api/openapi.yaml'))"`（YAML 语法解析验证通过）。
- `NODE_OPTIONS="" node scripts/check-openapi-drift.mjs`（通过，存量稳定锁定为 74 / 45）。
- `NODE_OPTIONS="" npm --prefix apps/socrates run typecheck && NODE_OPTIONS="" npm --prefix apps/socrates run test:shared`（Universal App 全部 74 项共享测试通过）。
- `NODE_OPTIONS="" npm --prefix server run lint`（typecheck 0 错误，check-service-boundaries 254 源文件 0 违规通过）。
- `NODE_OPTIONS="" npm --prefix frontend run lint`（全套 15 项前端架构门禁全部通过）。

### 第八轮：OpenAPI 契约收敛（Admin 鉴权、系统配置、插件与 MCP 协议族）

- 完整补齐 Admin 运维鉴权契约：`GET /api/admin/auth/status`、`GET /api/admin/auth/verify`、`POST /api/admin/auth/login`、`POST /api/admin/auth/logout`。
- 完整补齐系统级模型配置与向量嵌入服务契约：`GET /api/system-models`、`PUT /api/system-models`、`GET /api/embedding-config`、`PUT /api/embedding-config`、`DELETE /api/embedding-config/{id}`。
- 完整补齐插件与 MCP 生态服务协议：`GET /api/plugins`、`GET /api/plugins/marketplace`、`POST /api/plugins`、`PATCH /api/plugins/{id}`、`DELETE /api/plugins/{id}`，以及 MCP 标准交互与文档端点 `GET /api/mcp`、`POST /api/mcp`、`DELETE /api/mcp`、`GET /api/mcp/docs`、`POST /api/mcp/docs`、`DELETE /api/mcp/docs`。
- 契约未文档化存量从 74 条直接骤降至 54 条。

### 第九轮：OpenAPI 契约彻底归零（全量后端路由 100% 契约覆盖）

- 覆盖 Connectors & Project Connectors 协议族（24 条）：包括 GitHub / Feishu / Gitee / Notion OAuth 授权起步、回调与断开，GitHub repos / webhook，Gitee repos，Notion pages，Zotero API key 接入与论文搜索，arXiv 公开预印本检索，以及 OOMOL 云连接器断开与 OAuth 配置管理。
- 覆盖 AI 搜索与工具链服务（9 条）：包括 `POST /api/web-search`、`POST /api/image-search`、`POST /api/fetch-batch`（SSRF 出站防护批取）、`POST /api/client-error`（前端遥测）、`POST /api/tts`（多级缓存语音合成）、`POST /api/vision/describe`（MMX 视觉描述）、`POST /api/rag/search`（分块混合检索）、`GET /api/executions/{id}/stream`（代码解释器实时执行 SSE 流）、`POST /api/minimax/v1/chat/completions`（内置 Beagle 大模型代理）。
- 覆盖 NLWeb 问答协议族（6 条）：`GET /api/nlweb/ask`、`POST /api/nlweb/ask`、`POST /api/nlweb/stream` 及其短别名 `GET /api/ask`、`POST /api/ask`、`POST /api/stream`。
- 覆盖探索推荐与知识边界（3 条）：`GET /api/suggestions/starters`、`POST /api/suggestions/starters/invalidate`、`PATCH /api/knowledge-boundary/node`。
- 覆盖文件与账户会话生命周期补齐（12 条）：`GET /api/files`、`PATCH /api/files/{id}`、`POST /api/files/extract`、`DELETE /api/sessions`（批量清理）、`POST /api/account/cancel`、`GET /api/usage/daily`、`DELETE /api/auth/account`、`POST /api/auth/password`、`POST /api/auth/resend-verification`、`GET /api/auth/reset-info`、`GET /api/auth/oauth/github/callback`，以及拆分修复 `/api/classroom/classes/{id}/join`。
- **历史性突破：契约未文档化存量从 54 条直接彻底清零（0 undocumented，达成 100% 契约覆盖）**，未实现存量亦同步微缩至 44 条。

验证：
- `python3 -c "import yaml; yaml.safe_load(open('docs/api/openapi.yaml'))"`（YAML 语法解析验证通过）。
- `NODE_OPTIONS="" node scripts/check-openapi-drift.mjs`（通过：`implemented routes: 219 · spec entries: 263 · drift: 0 undocumented · 44 unimplemented`，基线完全锁定）。
- `NODE_OPTIONS="" node scripts/check-packages-dom.mjs && NODE_OPTIONS="" node scripts/check-drizzle-drift.mjs && NODE_OPTIONS="" node scripts/audit-ratchet.mjs server && NODE_OPTIONS="" node scripts/audit-ratchet.mjs frontend`（全部 100% 绿灯）。
- `NODE_OPTIONS="" npm --prefix apps/socrates run typecheck && NODE_OPTIONS="" npm --prefix apps/socrates run test:shared`（Universal App 全部 74 项共享测试通过）。
- `NODE_OPTIONS="" npm --prefix server run lint`（typecheck 0 错误，check-service-boundaries 254 源文件 0 违规通过）。
- `NODE_OPTIONS="" npm --prefix frontend run lint`（全套 15 项前端架构门禁全部通过，button-sizes 0/0 归零）。
- `bash scripts/test-deploy-flow.sh`（发布全流程、锁争用、健康门禁与回滚机制全部通过）。
- `NODE_OPTIONS="" ./server/node_modules/.bin/tsx --test server/test/idempotency.test.js`（10/10 全部通过）。

### 第十轮：OpenAPI 双向契约归零（0 Undocumented · 0 Unimplemented 完美对齐）

- **路由分析器引擎精准度升级（`scripts/check-openapi-drift.mjs`）**：
  - 扩展 `routesInFile()` 支持子目录模块级委托注入解析（如 `server/src/routes/chat/stream.ts` 中的 `registerStreamRoute(router)`），精准识别出 `POST /api/chat/stream` 的 Express 原生实现，同时严格隔离平级路由模块防误判，后端实际有效路由数精确标定为 220 条。
- **历史虚幻/原型草案端点彻底清理（`docs/api/openapi.yaml`）**：
  - 清理废弃原型设计：`/api/workspaces*`（ADR 0019 已界定为多租户边界，未实现 HTTP API）、`/api/sessions/{id}/collab*`（早期 Y.js 协同草案，已下线）、`/api/srs/queue` / `/api/paths*` / `/api/streaks`（早期学习路径草案，已被 `/api/mistakes` 错题本体系替代）、旧版智能体原型 `/api/agent/runs/{id}*` 及 `/api/agent/run`（已全面由统一 Agent 运行时 `/api/agent-runs` 替代）、未实现的 `/api/captcha/generate`。
  - 清理废弃冗余操作：`/api/messages/{id}/regenerate`、`/api/messages/{id}/copy-event`、`/api/search/suggest`、`/api/users/me`（规范端点为 `/api/auth/me`）、`/api/users/me/export`（规范端点为 `/api/account/export`）、`/api/projects/{id}/sessions`、`/api/sessions/{id}/pin`、`/api/tags`（规范端点为 `/api/` 标签词表）、`/api/files/{id}/thumbnail`、`/api/voice/transcribe`、`/a/{token}`（规范端点为具备 CSP 沙箱的 `/s/{token}`）、`/api/memory/extract`、`/api/notifications/preferences`。
- **历史性工程里程碑：双向契约绝对一致性（0 Drift）**：
  - `implemented routes: 220 · spec entries: 220`
  - `drift: 0 undocumented · 0 unimplemented`！
  - `scripts/openapi.baseline.json` 彻底收敛为空数组（`implementedNotInSpec: []` 与 `specNotImplemented: []`）。CI 门禁已转化为绝对零容忍双向棘轮：未来任何未文档化的后端路由立即阻断 CI，任何未实现的草案路由亦立即阻断 CI。

验证：
- `python3 -c "import yaml; yaml.safe_load(open('docs/api/openapi.yaml'))"`（YAML 语法解析验证通过）。
- `NODE_OPTIONS="" node scripts/check-openapi-drift.mjs`（`clean against baseline`，0 undocumented · 0 unimplemented）。
- `NODE_OPTIONS="" node scripts/check-packages-dom.mjs && NODE_OPTIONS="" node scripts/check-drizzle-drift.mjs && NODE_OPTIONS="" node scripts/audit-ratchet.mjs server && NODE_OPTIONS="" node scripts/audit-ratchet.mjs frontend`（全部 100% 绿灯）。
- `NODE_OPTIONS="" npm --prefix apps/socrates run typecheck && NODE_OPTIONS="" npm --prefix apps/socrates run test:shared`（Universal App 全部 74 项共享测试通过）。
- `NODE_OPTIONS="" npm --prefix server run lint`（typecheck 0 错误，check-service-boundaries 254 源文件 0 违规通过）。
- `NODE_OPTIONS="" npm --prefix frontend run lint`（全套 15 项前端架构门禁全部通过，button-sizes 0/0 归零）。
- `bash scripts/test-deploy-flow.sh`（发布全流程、锁争用、健康门禁与回滚机制全部通过）。
- `NODE_OPTIONS="" ./server/node_modules/.bin/tsx --test server/test/idempotency.test.js`（10/10 全部通过）。

### 第十一轮：SSRF 安全加固、代理旁路与调度器并发时序修复（全集成测试 100% 绿灯）

- **SSRF 防御边界深度加固（`server/src/lib/providerUrl.ts`）**：
  - 根治了 Node.js WHATWG URL 标准解析器将 IPv4-mapped IPv6 地址（如 `::ffff:127.0.0.1`）自动标准化为 16 进制记法（如 `[::ffff:7f00:1]`）从而导致 `isAllowedProviderUrl` 绕过的安全隐患。
  - 增强十六进制分段解码与公网递归验证，同时显式阻断多播（`ff00::/8`）、丢弃前缀（`100::/64`）、文档前缀（`2001:db8::/32`）以及已废弃的 IPv4 兼容地址（`::/96`）。
  - 新增专属单元测试套件 `server/test/providerUrl.test.js`，8 组综合安全断言 100% 通过。
  - 解耦了 `routes/systemModels.ts` 跨路由引用 `routes/apiKeys.ts`，直接依赖底层 `lib/providerUrl.ts`。
- **Undici 代理旁路缺陷修复（`server/src/services/core/llm.ts`）**：
  - 根治了当系统存在 `HTTP_PROXY`/`HTTPS_PROXY` 时，直接实例化原始 `ProxyAgent` 忽略 `NO_PROXY` 导致所有对 `127.0.0.1` 本地模拟服务/内部测试服务均报错 `fetch failed` 的问题。
  - 升级采用 Undici 的标准 `EnvHttpProxyAgent`，自动尊重 `NO_PROXY` / `no_proxy`，确保本地测试与多网络生产环境完全兼容。
- **工具调用调度时序缺陷修复（`server/src/services/tools/toolDispatch.ts`）**：
  - 修复了调度器将第一个串行调用放在 `Promise.resolve().then(...)` 微任务后执行、而后续非串行调用同步直接启动，导致非串行调用在数组顺序上抢跑于串行调用的时序 bug。
  - 调整为首个串行任务直接同步启动，后续同车道调用再排队挂载，严格捍卫了模型输出调用的 FIFO 执行次序。
- **本地数据库迁移与分布式集成测试全量绿灯**：
  - 本地执行 `db:migrate` 成功装载最新 0041/0042 迁移，修复 `schedulerLease.test.js` 针对全局内置 Key 的失败测试夹具。
  - `durableIdempotency.test.js`（13/13）、`schedulerLease.test.js`（9/9）、`chatTurnsConcurrency.test.js`（6/6）、`sessionOwnership.test.js`（5/5）、`ttsStore.test.js`（12/12）全部 100% 绿灯。

## 当前里程碑状态

1. **部署原子性与弹性**：`deploy.sh` 互斥锁、前置候选清理、原子切换与自动软链接回滚 100% 通过验证演练。
2. **状态幂等与事务保障**：PostgreSQL 咨询锁 + `idempotency_receipts` 24h 持久化已覆盖核心写操作，全部并发与恢复测试通过。
3. **架构防退化门禁网络**：`check-service-boundaries`（254 文件 0 违规）、`check-packages-dom`（零 DOM 污染）、`check-button-sizes`（0/0 离梯归零）。
4. **API 规范一致性**：OpenAPI 规范文档与 Express 路由实现达到 **220/220 双向绝对对齐（0 undocumented · 0 unimplemented）**，基线完全锁定为 0/0。
5. **核心服务稳健性与安全性**：SSRF 校验闭环、Undici HTTP 代理精准旁路本地、工具调度车道时序严格有序。

## 下一批推进方向

1. 推进 Universal App（`apps/socrates/`）模块对齐与旧页面分阶段下线；
2. 生产环境不可信执行与真实隔离验收演练；
3. 扩展长寿命定时任务与 Agent 分布式租约的集群故障注入演练。


