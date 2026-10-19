# 交付链路整改：让门禁重新具有约束力

本轮从本地 `main@526bc59c` 开始，针对系统工程评估中的本地可修复问题整改。未推送代码、未部署、未修改 GitHub 分支保护或线上配置；不能将本地通过表述为远端 CI 全绿或生产已验收。

## 已落地的交付约束

- **SBOM 验证真实执行。** Security 工作流调用 `scripts/verify-sbom.mjs`，通过文件读取解析 JSON，不再把 `sbom/...` 当作 Node 包名。校验三个预期文件、metadata 与非空组件列表，缺失/空文件/无效 JSON/空组件有回归测试。按 CI 的 Node 22 / npm 10 与 CycloneDX 6.0.1 实际生成三份清单并通过验证（frontend 538、server 410、Universal App 473 个组件）。本机 Node 24 / npm 11 的 `npm ls --package-lock-only` 在 server 清单上无 JSON 输出，不据此改变生成策略或放宽验证。
- **发布不可因缺工具隐式放行。** `deploy.sh` 在缺少 git/gh、HEAD 不可解析、查询失败、无成功运行、取消/未完成/未知结论时拒绝部署；gh 从源仓库目录查询。保留明确的 `DEPLOY_SKIP_CI_CHECK=1` 应急覆盖和 dry-run。`scripts/test-deploy-flow.sh` 覆盖这些分支以及锁竞争、健康检查、清理和回滚；始终执行的 CI sanity 作业也运行该回归，不再仅靠人工记得运行。
- **公开 API 只有一个来源。** `docs/api/openapi.yaml` 是规范；`npm run openapi:generate` 生成 `site/openapi.json`，`openapi:check` 和 focused tests 阻止手工漂移。标为 admin、`x-internal: true` 或路径含 `_internal` 段的接口不公开。新增内部指标也在 canonical 中记录；实现与规范为 237/237，零漂移。
- **最小内部指标。** `/api/_internal/metrics` 和 v2 别名默认 404，需专用高熵 `INTERNAL_METRICS_TOKEN` 的 Bearer 鉴权，常量时间比较摘要。仅返回进程、滚动请求和 SSE 计数，禁止缓存，抓取不污染业务采样；没有部署、启用或连接真实 collector。
- **代理步骤走真实可见入口。** 原 E2E 点击了被 React activity surface 覆盖的 legacy 兼容节点；现在先用鼠标展开可见 activity disclosure，再定位其内部步骤并点击，仍断言命令输出。没有扩大超时、force click 或替换成键盘绕过；重建后 focused E2E 通过。序列化断言同步到真实 `rawText` 数据契约，同时保留 legacy HTML 不嵌入步骤 chrome 的约束。
- **全量回归暴露的样式回归。** 首轮桌面 E2E 以三处失败停止（34 通过、494 未运行）：活动 disclosure 在答案开始后被高特异性规则压到 24px（桌面/移动均失败），按压反馈将主按钮缩至 0.975。修复为既有 32/44px 点击尺寸和 paint-only 按压契约；不修改断言阈值或增加例外。后续完整回归结果须单独记录，不把这次提前停止视为全量通过。
- **文档去漂移。** Lobe 设计 ADR 从重复的 0017 调整为 0020，补齐 ADR 索引；AGENTS 删除易漂移源码行数与存量计数。[运维手册](../ops/runbook.md) 对照现有脚本写明发布、回滚、隔离恢复、证书/密钥轮换、观测和待人工配置项。

## 视觉基线的意图，不是放松容差

既有 `d0e8bfe0` 等设计提交已经把首页三个快捷入口改为横向三列，并扩展输入区可用宽度。本轮保留该设计，不回退界面，也不增加 1 px 容差。首次完整实跑覆盖 6 场景 × 3 桌面宽度 × 2 主题 × 2 语言，共 72 场景，客观布局缺陷为 0；与旧基线的漂移仅涉及快捷入口高度及编辑器宽度：

- `homeQuickActions.h`：136 → 42。
- `composerEditor.w`：1440/1280 视口为 508/469 → 624；1024 首页为 424/385 → 540，聊天为 504/465 → 620（旧值按语言而异）。

已审阅[暗色首页](../assets/parity-2026-10-19/home-dark.png)、[亮色首页](../assets/parity-2026-10-19/home-light.png)和[窄桌面英文首页](../assets/parity-2026-10-19/home-narrow.png)。这些截图记录被接受的既有改版意图，不代表线上截图。

另外修复了基线写入的真实漏洞：原审计在检测到未解析角色、设置失败退出码后仍会写文件。现在未解析角色、客观布局缺陷、空矩阵或 `--quick`/`--only` 的不完整更新均拒绝写入，保留旧基线；新增五项回归测试。正常更新仍须完整测量并审阅差异。

## 已完成的本地检查

- 前端 build/WASM 成功，960 项单测通过；完整 lint 为 0 error / 455 个既有 warning，包含自研棘轮。另修正上轮性能 E2E 的动态截图名编码，使截图路径门禁保持零例外。
- 服务端 typecheck 通过；逐文件隔离测试入口与单次 test:unit 入口均为 902 项中 833 通过、69 跳过、0 失败，缺数据库等环境的集成测试不算已验证。
- 共享包 251 项测试通过；新增交付/基线/公开契约 focused tests 共 10 项通过；发布流程夹具回归通过。
- OpenAPI 实现/规范 237/237，公开产物漂移、文档路径、服务边界、DOM-free 和 CSP 检查通过。
- 完整 `parity-audit.mjs --update --check`：72 场景、0 缺陷、1px 容差；最终样式重建后的独立 `--check --quick`：6 场景、0 缺陷。后者是抽查，不替代全矩阵。
- 重建后 agent-steps / activity-polish / button-press 三个 focused specs：16 通过、1 跳过、0 失败（跳过的是当前 shell 未找到兼容 `.icon-btn` 的用例）。
- 第二次完整 SPA Playwright 以 `--max-failures=3` 诊断性停止：44 通过、1 跳过、3 失败、483 未运行；原活动尺寸/按压失败已通过，此次三个失败均位于 `chat-autoscroll.spec.mjs` 的流式测试准备等待阶段。随后有界 focused 复测该 spec：6/6 失败，前三项卡在 `bootStreamingChat` 的 evaluate，后三项卡在 `bootSendableChat` 的消息计数；预送 delta 的推测修复未解决问题且发现 stream interceptor 未启动，已撤销。该 spec 和产品流式逻辑本轮没有为此盲改，根因尚未确认。因此不能声称完整 E2E 或 CI 已全绿。

## 第一批结束时的本地发布阻塞（历史记录）

以下保留第一批结束时的状态。续查曾两轮通过目标六项，但后续合跑再次暴露一项 sticky-bottom 间歇失败；以本文最后的逐类对照记录为当前结论，完整门禁仍不能签收。

`frontend/e2e/chat-autoscroll.spec.mjs` 的 6 项失败必须继续定位，重点核对 askChatTurn 的调用前置条件、页面阶段/fixture 和流请求为何未进入 controllable interceptor。验证应保留固定读者跟随、上滑停止、新回复 pill 和重新固定的真实用户断言，不能扩大 timeout 或移出 smoke 来掩盖。闭环前本轮整改只能称为第一批修复，不能签收“完整门禁恢复”。

## 仍然需要远端或真实环境验收

1. 将整改推送到评审分支，观察同一 SHA 的完整 CI/Security/相关工作流结果；本地检查不能证明远端已恢复绿色。
2. 经授权配置并核验 main 的分支保护/规则集、实际必需检查名称、评审与 bypass 权限。本轮没有修改远端设置。
3. 对默认分支的 CodeQL 告警逐条 triage，不能仅依据旧评估计数批量 dismiss；本轮未读取或处置远端告警。
4. 建立隔离 staging；真实核验邮件告警、metrics/OTLP、安全密钥配置、异地备份和隔离恢复演练。运维手册的 SLO/RPO/RTO 是建议目标，不是已实现承诺。
5. Universal App 真机/iOS/联调签收、CSS 分层债务与跨包工具链统一仍为后续任务，不能以本轮门禁修复替代。

## 前次续查：自动滚动六项当时两轮通过，相邻回归未全绿

### 根因与证据

这不是靠预送 delta 或放宽超时可以解决的问题。运行时探针确认 provider 可用、session id 没有被覆盖，受控 `/api/v2/chat/stream` 已命中，流式 placeholder 也已写入状态。此前“interceptor 未启动”的推测没有在本次复现中成立。

前三项的 fixture 将当前用户问题放在 24 条历史消息**之前**。`MessageList` 初次只挂载最新 12 行，当前问题被排除在窗口外；`turnAnchor.ts` 找不到 `.msg.user`，因此无法为该回合建立 `data-viewport-anchor`，而准备函数一直等待这个锚点。修复只把消息恢复成“历史 → 当前问题”的真实顺序，仍由产品发送逻辑建立锚点，不人工盖章锚点，也不预送 delta 绕过准备阶段。

后三项同时暴露了测试准备假设和产品缺陷：

- 状态中始终有完整 30 条消息，但 DOM 只有 12 条，没有消息被异步启动流程覆盖。渐进挂载本来就不承诺立即渲染全部历史，原准备逻辑却先等待 30 条全部出现。
- `progressiveMount.ts:shiftMountWindow` 在 `items.length <= MAX_MOUNTED_ROWS`（60）时直接返回，导致 13–60 条历史即使触发真实滚动，也不能从初始 12 行向旧历史展开。这是实际产品缺陷，不只是测试兼容问题。去掉该错误条件，保留显式 full-mount 的短路和 60 行驻留上限；没有改成全量常驻。
- fixture 现在先将最新已挂载行滚入视野，再通过真实鼠标上滚读取历史，之后仍要求 DOM 精确为 30 条。不能一开始就在 `scrollTop=0` 处反复上滚：这种手势没有位置变化，不会触发加载所依赖的 `scroll` 事件。

新增 13、25、30、60 条历史的四个边界单测：修复前四项全部以“older history must not be stranded outside the window”失败；修复后全部通过。既有长历史驻留上限、窗口滑动、live-tail 保留和 full-mount 约束仍保留。

### 本轮实际验证

- `npm run build` 成功，含 TypeScript 检查和 Vite 生产构建；Playwright 测试针对这个重建产物运行。
- 三个相关单测文件 `progressiveMount`、`messageListDeferredRows`、`messageOwnership`：**17/17 通过**。
- `chat-autoscroll.spec.mjs`：独立运行 **6/6 通过**；随后与相邻 specs 合跑再次 **6/6 通过**。固定读者跟随、逐帧单调跟随、真实上滑停止、新回复 pill、点击重新固定、发送动画、答案超过预留高度后的 sticky bottom、覆盖旧 thinking 回合的视觉稳定断言全部保留。未增加 timeout、降低阈值、force click、跳过用例或修改 smoke 配置。
- 完整 `npm run lint` 通过，包括自研架构门禁，仍为 **0 error / 455 个既有 warning**。
- 八个 specs 的相关回归完整执行 **61 项：34 通过、27 失败，无跳过**。这不是完整 SPA smoke，更不是全绿；未用 max-failures 提前停止。

相关回归复现命令（在 `frontend/` 运行）：

```sh
npx playwright test --config=playwright.config.mjs \
  e2e/chat-autoscroll.spec.mjs e2e/chat-send.spec.mjs \
  e2e/chat-stop-resend.spec.mjs e2e/streaming-render.spec.mjs \
  e2e/message-list-compat.spec.mjs e2e/chat-send-glide.spec.mjs \
  e2e/chat-keyboard-anchor.spec.mjs e2e/history-rich-content.spec.mjs \
  --workers=1
```

### 仍失败的明确范围

本轮没有越出目标六项去批量改动其他 specs，也没有把这些失败算作通过：

| Spec | 通过 / 失败 | 失败证据 |
| --- | --- | --- |
| `chat-autoscroll` | 6 / 0 | 两次六项均通过 |
| `chat-keyboard-anchor` | 3 / 11 | 都卡在 `bootHistory` 第 71 行的全量 DOM 数量等待：预期 30/40，实际 24 |
| `chat-send-glide` | 2 / 11 | 9 项卡在第 90 行的全量 DOM 数量等待：预期 30/80，实际 12；另 2 项为桌面/移动短历史 streaming 场景，第 170 行 `sawSettling` 实际 false |
| `chat-send` | 7 / 2 | Tutor send 第 201 行预期 24、实际 12；viewport changes 第 318 行预期 30、实际 12 |
| `chat-stop-resend` | 6 / 0 | 全部通过 |
| `history-rich-content` | 3 / 0 | 全部通过（分项计数已按原始日志纠正） |
| `message-list-compat` | 6 / 0 | 全部通过（分项计数已按原始日志纠正） |
| `streaming-render` | 1 / 3 | 静态 h3 测试通过；三项流式用例都卡在 `prepareDelayedStream` 第 8 行 evaluate；同样将当前用户放在历史之前，但当时未修改或重跑该 fixture 修复来闭环 |

其中 22 项仍在全量历史 DOM 数量等待阶段失败，3 项卡在流式准备，2 项是发送动画所有权断言失败。当前证据不足以给全部 27 项确定最终根因，尤其不能把那 2 项动画失败一概归为 fixture。没有另建完整 HEAD 对照构建，因此不将这些失败全部宣称为“已证明的既有失败”或“本轮新引入回归”。后续须逐类修复并实跑，不能为 80 条历史断言简单取消 60 行驻留上限。

工作区保持未暂存、未提交、未推送，HEAD 仍为 `526bc59c86e8e01548ef8185df45d2bbcaa875ab`。核对本轮开始时保存的 diff，前一批已跟踪整改内容逐字未变，原有未跟踪路径均保留；本轮仅新增三个代码/测试文件的修改及本文续查记录。

## 本次逐类核对：原 27 项在 HEAD 重现，最新合跑仍有 28 项失败

**当前结论：不能签收全绿。** 原日志的 27 项均在未应用本轮整改的 `526bc59c` 源码构建上重现，同一用例、同一准备阶段或所有权断言失败。没有证据把这 27 项归为本轮新引入回归。与此同时，当前工作区八个 specs 的新一轮合跑是 **61 项：33 通过、28 失败、0 跳过**，比原日志多一项 `sticky bottom resumes once the answer outgrows the prompt reserve`。该新增失败尚未确认归因，不能因为随后五次单独复测通过而抹掉。

### 对照如何保证不破坏工作区

- 将 `git archive HEAD` 导出的前端、共享包及构建依赖源码放在 `/tmp/socrates-triage/head/`，没有 stash、reset、checkout 覆盖、暂存、提交或推送原工作区。
- 对照副本复用本机已安装的相同 Node/前端依赖和 WASM 构建产物；HEAD 的 TypeScript 检查、Vite 生产构建成功。初次对照构建因导出副本缺少被 git 忽略的 `frontend/wasm/socrates_wasm.js` 而失败，补入相同 WASM 后成功；这是对照副本准备问题，不是浏览器测试已通过的证据。此对照不是另一次干净 npm 安装或远端 CI 验证。
- HEAD 运行四个含失败的 specs，共 **40 项：13 通过、27 失败、0 跳过**；随后当前工作区产物运行原八个 specs，共 **61 项：33 通过、28 失败、0 跳过**。顺序运行、单 worker、独立端口和输出目录，避免双浏览器并行改变动画采样。未改 timeout、retries、阈值或原测试断言。
- 四个失败相关 spec 的 HEAD 文件与工作区文件 SHA-256 一致。当前产物仍是前次修复后重建的产物；本次未修改产品代码，因此没有用旧产物验证新增代码的问题。

### 22 项历史数量等待：夹具假设不符合渐进挂载，不是本轮新增

| 失败位置 | 项数 | 预期 / 当前实际 | HEAD 对照 |
| --- | ---: | --- | --- |
| `chat-keyboard-anchor:seedChat` 第 71 行 | 11 | 10 项 40/24，1 项 30/24 | 同 11 项失败，实际均为 12 |
| `chat-send-glide:bootChat` 第 90 行 | 9 | 4 项 30/12，5 项 80/12 | 同 9 项、相同数量失败 |
| `chat-send` 第 201、318 行 | 2 | 24/12、30/12 | 同 2 项、相同数量失败 |

`progressiveMount.ts` 明确规定初始 12 行、分块 12 行、驻留上限 60 行；`useProgressiveMessageMount.ts:118–146` 通过真实滚动或初始高度不足时的有限 idle 扩展挂载，不承诺一开始全量 DOM。三个夹具都在灌入状态后直接等待全部历史行出现，尚未执行所要验证的键盘/发送行为就已失败。80 条消息也不能同时要求 80 个常驻 DOM 行而仍遵守 60 行上限。

HEAD 还含有上轮已经定位并修复的真实产品缺陷：`shiftMountWindow` 对 `items.length <= 60` 直接短路。本轮现有修改移除这个短路，保留 full-mount 的显式契约和 60 行上限，**应当保留**；对照中键盘夹具从 12 行变成 24 行，与允许有限扩展一致，不是历史数据丢失或新增“只渲染 24 行”的限制。该修复不等于保证所有历史在没有读者滚动时立即挂载完毕。

**状态：22 项仍失败，未修夹具，未关闭。** 已证明同一环境下 HEAD 也失败，不把它们计为本轮新回归；也不把准备失败当作后续键盘/发送功能已验收。

### 3 项流式准备：错误的历史顺序使用户锚点不在挂载窗口

`streaming-render:prepareDelayedStream` 第 59 行构造 `[当前 user, ...24 条旧 assistant]`，将当前问题放在最旧一端；第 67–73 行无限逐帧等待 assistant 的 `data-viewport-anchor`，最终由 60 秒测试总超时终止。`turnAnchor.ts:588–596` 在找不到已挂载 `.msg.user` 时直接返回，不会盖上该锚点。

两份产物的只读运行时诊断均确认：状态有 **26 行**（含 live placeholder）、DOM 有 **12 行**、挂载 user **0 个**、viewport anchor **0 个**，而受控流请求已经命中 **1 次**。因此不是凭“没有请求”猜测 API/provider 或运行环境坏了。仅在临时诊断中将数据顺序换成“24 条历史 → 当前 user”，两份产物均出现 **1 个 user 和 1 个 viewport anchor**；没有修改正式 spec，也没有把这个诊断算作三个流式用例通过。

**状态：3 项仍在准备阶段超时，未关闭。** HEAD 同样复现，原因为既有夹具顺序与初始尾部挂载不兼容；Markdown 节点稳定性、scroll-away、finish row-anchor 的后续断言仍未被这三项实际验证。

### 2 项发送动画所有权：既有排队契约与旧测试场景不一致

桌面和移动的短历史 streaming 场景均在 `chat-send-glide:assertGlide` 第 170 行失败：`sawSettling=false`。这两项确实进入了采样阶段，**不能混入历史数量等待失败**。

HEAD 与当前 `sendPipeline.ts:62–76` 都规定：流式回合进行中且没有 `bypassQueue` 时，`submitChatMessage` 将后续问题入队并返回，不立即新建用户行或启动新发送锚点。该 spec 的 `startBackgroundAnswer` 保持旧流不结束，随后 `sendAndSample` 再调用普通 `submitChatMessage`，却要求立即取得新发送的 scroll ownership，与既有契约不符。

运行时诊断在两份产物上都观察到：第二次提交发出 `socrates:promptqueuechange`，队列 count 为 **1**；受控流请求仍为 **1 次**，消息状态仍为 **4 行**，没有新 follow-up 用户行，也没有新的 settling。相关既有单测 `promptQueue.test.mjs` 的 `submitChatMessage enqueues when streaming is active` 同时通过。这足以解释两项采样失败，而不需更改产品排队策略或将 `sawSettling` 断言删掉。

**状态：2 项仍失败，未关闭。** 不是本轮引入；没有加 `bypassQueue` 偷换场景，也没有改为接受 `false`。将来若调整这两个 spec，需先明确它们要验证“排队后自然发送”还是显式的立即覆盖入口；本次不扩展到这项测试重设计。

### 新发现的第 28 项：sticky-bottom 间歇失败仍开放

当前八个 specs 合跑中 `chat-autoscroll:320` 失败于第 344 行：答案增长后期望底部距离 `<= 4px`，实际 **28px**，原 10 秒等待超时。该断言检查实际几何位置，不能因其他 27 项属于旧夹具问题而一起豁免。

在不改源码、数据、超时或断言的情况下，以同一产物单独执行该用例 `--repeat-each=5 --workers=1`，结果 **5 通过、0 失败**。这说明目前不能稳定复现，并不证明它必然是机器负载、测试环境问题，也不证明它已修复。HEAD 原夹具在消息数量准备阶段已失败，无法直接到达同一长答案阶段，因此不能拿这个受阻对照证明新增的 28px 现象在 HEAD 存在或不存在。

**状态：1 项未归因的间歇行为失败，作为潜在回归保持开放。** 本次未发现足以支持最小产品补丁的因果证据，故不盲改内容跟随、滚动协调器或历史窗口逻辑；不增加重试配置，不把单独复测当作覆盖合跑失败。原“目标六项关闭”只能作为当时两轮结果，不能再表述为稳定闭环。

### 最新实际结果与本次改动边界

| Spec | 当前合跑通过 / 失败 | HEAD 对照通过 / 失败 |
| --- | --- | --- |
| `chat-autoscroll` | 5 / 1 | 未运行；不能据此归因新增 sticky 失败 |
| `chat-keyboard-anchor` | 3 / 11 | 3 / 11 |
| `chat-send-glide` | 2 / 11 | 2 / 11 |
| `chat-send` | 7 / 2 | 7 / 2 |
| `chat-stop-resend` | 6 / 0 | 未运行 |
| `history-rich-content` | 3 / 0 | 未运行 |
| `message-list-compat` | 6 / 0 | 未运行 |
| `streaming-render` | 1 / 3 | 1 / 3 |
| **合计** | **33 / 28（61 项）** | **13 / 27（40 项）** |

另单独验证 `progressiveMount`、`messageListDeferredRows`、`messageOwnership`、`promptQueue` 四个相关单测文件，**20/20 通过**，其中前三个仍为 **17/17**。sticky-bottom 五次复测单列为 **5/5**，不折算到上述 61 项结果中。此前 build 和完整 lint 的成功记录保留；本次只改审计文档，没有声称重新运行了完整 lint、全量 SPA smoke 或远端 CI。

已保留的修复是上轮的历史顺序/真实滚动夹具修正，以及 13–60 行历史不可展开的产品修复与四个边界单测；本次**没有新增产品或正式测试文件的修改**，仅纠正本文旧表的分项计数、补上 HEAD 对照归因及新发现的未关闭风险。22 + 3 + 2 + 1 = **28 项仍未关闭**，其中原 27 项已在 HEAD 重现，新增 1 项尚不能判定为本轮引入或环境问题。

本地证据保存在 `/tmp/socrates-triage/`：`head-build.log`、`head-e2e.log`、`head-results.json`、`current-e2e.log`、`current-results.json`、`runtime-probe.mjs` / `.json`、`focused-e2e.log`、`unit.log`；原始输入日志 `/tmp/autoscroll-related.log` 未改。临时 `compare.config.mjs` 只切换源码/产物路径、服务端口及输出目录；`focused.config.mjs` 仅独立输出位置。所有诊断和对照文件均在仓库外。

最终 HEAD 仍为 `526bc59c86e8e01548ef8185df45d2bbcaa875ab`，**所有工程整改仍未暂存、未提交、未推送**。工作区开始时的已跟踪 diff 和所有现存未跟踪文件已保存校验；除本文外应逐字保持不变，原有删除的 ADR 路径也保持删除状态。没有部署、修改远端配置或把本地失败报告成通过。


## 本轮继续整改：修复滚动时序，恢复真实用户回归

本节接续上面的历史记录，最终签收状态以本节末尾的实跑结果为准。没有提交、推送、部署或修改 GitHub 规则；HEAD 仍为 `526bc59c`，前批整改保留在工作区。

### Sticky-bottom 不只是测试波动

加强原用例后，不再仅等待一次瞬时距底小于等于 4px：先断言全部 140 份流式文本已实际播放、答案确实超过预留高度，再次要求距底不超过 4px、没有用户 away 意图、尾部内容可见。这使原先可能假绿的“先碰到底，再停住”行为成为可稳定发现的失败。原有超时、跟随阈值、上滑停止和重新固定断言不变。

`scroll.js` 中确认并修复了三个相连的问题：

1. `ResizeObserver` 将 `(entries, observer)` 传给回调，原代码却直接接到 `scheduleContentFollow(baselineOverride)`，把 entries 数组当成旧几何。现在用无参数转发，避免污染基线。纯 resize、不发生 mutation 的确定性测试在旧代码失败，修复后通过。
2. `scroll` 事件可能先于尺寸观察到达；`rememberScrollPosition` 把新高度写成旧基线，随后尺寸观察就看不到增长。内容增长现在有独立基线，不再被滚动事件消费。红测中实际位置停在 400、应为新底部 420；修复后精确为 420。
3. 通知入队时冻结 `grew/shouldFollow`，可能吞掉同帧稍后才出现的最后一次增长。现在在合并后的 RAF 执行时重新测量、评估并推进内容基线。确定性测试先通知无增长、同一帧再增高并通知，仍只排一个内容帧且跟到最终底部；仅修回调参数的对照版仍失败在 400。

保留 96px pin slack、away、turn hold/settling、retry 所有权和现有平滑滚动实现；没有增加永久轮询或强行吸底。

### 自然排队后的旧结束任务不能再抢回位置

真实队列路径暴露出可见回跳：新问题已经从约 682px 平滑移动到 12px，旧回复的 `finishViewport` 仍在其 30 帧恢复窗口内。新发送所有权释放后，旧任务又把位置恢复到 682px。修复不是取消队列或加等待，而是让结束捕获绑定当时的 session 与最后一条消息身份；每帧发现新消息或会话切换就永久停止，并清理意图监听。

新测试通过真实 stateStore 追加消息；旧实现会将位置写回 400，修复后保留新位置 682、无后继帧且监听已清理。还覆盖同回合仍恢复原位置、最多 30 帧、会话隔离与真实用户 wheel 取消。

### 旧 E2E 改成当前产品契约，而不是降低门槛

- 键盘与发送测试不再等待初次 DOM 就有全部 24/30/40 行；先滚入已挂载的最新行，再用真实鼠标向上读取，随后仍精确核对全部历史的数量、顺序和文本。`_history-reader.mjs` 统一这段准备过程，未调用强制全量挂载接口。
- 80 行发送场景逐步遍历、收集每条实际挂载的历史，证明 80 条全部可读，同时要求任一采样时驻留不超过 60 行，并核对 state 内完整顺序。没有取消驻留上限或把 80 改成 60。
- 发送动画按新消息 clientId 采样，不再用“DOM 用户行数必须增加”识别新消息；历史窗口切到 live tail 时行数本来就可能减少。仍测量真实新问题的每帧可见位置，不用 state 位置替代屏幕位置。
- 流式期间发送先验证真实入队事件和没有提前用户行，再自然结束旧流，验证出队、新 SSE 请求确实包含待发送内容、新用户消息只增加一条。之后仍执行原有单调性、超过 100px 的位移、至少 8 个中间动画帧及最终 `12±2px` 的几何断言；没有用 bypassQueue 绕过排队。
- `streaming-render` 的准备顺序改为“历史 → 当前用户”，保证当前问题真实处于尾部窗口；保留原 Markdown、流式和跟随断言。

### 长历史发送动画中的挂载争抢

按新消息身份采样后，过去被“未采到新消息”挡住的产品问题暴露出来：桌面/移动端新问题在动画中从约 1628/2550px 反向跳到 3931/5539px，最终仍可落在 12px。原因是 live-tail 窗口刚重置到 12 行，程序滚动在 `NEAR_TOP_PX` 内触发渐进挂载，不断向问题上方插入历史；对应 history 位置补偿又被发送所有权阻止。

`useProgressiveMessageMount` 现在在 `turnAnchorSettling` 或 `turnViewportOwner=turn` 时暂停窗口 shift，包括 scroll 和 idle fill 路径；发送释放后，真实历史滚动仍可继续加载。保留初始 12 行、60 行上限、阈值和动画时长。新增所有权决策测试；逐帧 E2E 继续保留原单调性约束，最终浏览器结果见下。

### 本轮证据与阶段结果

- 回调参数修复后、第二批时序修复前，八个 specs 串行跑完为 **51 通过、10 失败**。失败完整保留，没有提前停止。
- 内容基线与旧结束任务修复后，重建产物八个 specs 为 **58 通过、3 失败、0 跳过**：6 个自然排队发送场景和 sticky-bottom 均通过；两项长历史 idle 发送可见回跳，以及一项桌面 full-transcript 动画只有 6 个中间帧、未达原要求的 8 帧，仍如实报失败。
- 新挂载约束后的完整前端单测实跑 **978/978 通过**；不是只凭新增 focused tests 判断。参数未缩小测试集合，日志实际覆盖完整前端单测。
- 完整 lint 保持 **0 error / 455 个既有 warning**。生产构建成功；最终挂载约束落地后须再重建并复核，最终结果如下。
- 仓库外证据保存在 `/tmp/socrates-round3/`：`content-follow-red.log`、`content-follow-order-red.log`、`content-follow-coalesce-red.log`、`content-follow-green.log`、`finish-viewport-red.log`、`finish-viewport-green.log`、`unit-final.log`、`mount-during-send-focused.log`、`related.log` / `related-results.json`、`final.log` / `final-results.json`。失败目录保留 trace；这些是本机运行证据，不是 CI 产物。

### 最后两次复核与未被掩盖的失败

- 自动滚动六项在同一重建产物上串行重复五轮：**30/30 通过**。其中加强后的 sticky-bottom 五次均通过；文本完整播放后仍吸底的检查没有移除。该重复针对内容基线与 finish 修复后的产物，随后挂载约束修复又重建并参加相关合跑。
- 最终挂载修复生产构建成功，完整 lint 通过。随后八个 specs 完整合跑仍为 **58 通过、3 失败**，但失败组成已改变：桌面/移动端深历史 idle 发送原有反向回跳均通过；现在两项桌面 full-transcript（idle/streaming）的中间动画帧不足 8，另出现一项 `streaming respects an intentional scroll-away` 位置失败。没有把失败视为无效运行。
- 上滑用例原先直接写 `scrollTop=0` 并派发合成 scroll；这不能代表真实 wheel 输入取消正在运行的动画，而且窗口顶端也不一定是历史顶端。现在使用真实鼠标上滚，直到首条历史 `pre-0` 已挂载且位置小于 8px；之后仍要求 away=true、直播内容继续到指定检查点、新回复 pill 可见、完成后位置变化不超过 2px。没有在测试中直接取消动画或写 away 状态。其重复及最终合跑结果见下。
- 两项桌面动画的至少 8 个中间帧要求仍原样保留。没有为了达标而增加产品动画时长、降低帧数、关闭 trace、扩大超时、增加 retries 或 skip；如果最终仍未达标，就保留明确的门禁失败。

### 本轮最终结论：59 通过、2 失败，尚不能签收全绿

最后一次八个相关 specs 完整串行合跑 **61 项：59 通过、2 失败、0 跳过、0 flaky**。未使用 max-failures 提前停止。相较本轮起点的 33 通过 / 28 失败，准备契约、sticky-bottom、旧结束任务争抢及长历史可见回跳已得到实际改进；但这不是完整 SPA smoke，也不是远端 CI 全绿。

| Spec | 通过 | 失败 |
| --- | ---: | ---: |
| `chat-autoscroll` | 6 | 0 |
| `chat-keyboard-anchor` | 14 | 0 |
| `chat-send-glide` | 11 | 2 |
| `chat-send` | 9 | 0 |
| `chat-stop-resend` | 6 | 0 |
| `history-rich-content` | 3 | 0 |
| `message-list-compat` | 6 | 0 |
| `streaming-render` | 4 | 0 |

真实 wheel 上滑用例在最后合跑前独立重复 **5/5 通过**，最后合跑再次通过。自动滚动独立五轮 **30/30 通过**，最后产物合跑再次 **6/6 通过**。完整前端单测 **978/978 通过**，最终产品构建成功、完整 lint 为 **0 error / 455 个既有 warning**，`git diff --check` 通过。

**保留的两项发布阻塞**：`desktop: full transcript at the bottom, AI idle/streaming — send glides to the new prompt`。两项不再发生反向回跳，最终可见位置都约为 12px；但原断言要求至少 8 个中间动画帧，最后实测 idle 为 **5 帧**、streaming 为 **6 帧**，所以仍失败。不能仅凭轨迹证明是采样环境、渲染性能还是动画规划本身导致，归因尚未关闭。没有降低此断言、增加动画时长或超时、跳过用例、隐藏失败，故门禁仍应保持阻塞。

最终复核沿用上文八个 specs 的命令、单 worker 和原 Playwright timeout/retries/trace 设置；仓库外配置只调整被测服务端口与证据输出目录。原始证据为 `/tmp/socrates-round3/completed.log`、`completed-results.json`、`completed-results/`（两项失败 trace）、`scrollaway-repeat.log` / `scrollaway-repeat-results.json`、`autoscroll-repeat.log` / `autoscroll-repeat-results.json`、`build-mount-final.log`、`lint-mount-final.log` 和 `mount-during-send-focused.log`。保留前几轮失败目录，不用后续通过覆盖早期失败证据。

与本轮起点 diff 对照，前批已跟踪整改除本轮明确增补的 `chat-autoscroll.spec.mjs` 与 `progressiveMount.test.mjs` 外逐字保留；其余新增变更均属于本文所述产品时序、测试夹具与回归。HEAD 仍为 `526bc59c86e8e01548ef8185df45d2bbcaa875ab`，暂存区为空，全部改动仍在工作区；未提交、推送、部署或改变 GitHub 规则。下一步应针对这两项动画帧不足做带时间戳的性能归因，而不是宣布恢复了完整发布门禁。

## 独立复核最后两项动画：可解释帧数不足，但不据此放行

本次只针对桌面 full-transcript 的 idle / 自然排队 streaming 两项继续取证。**没有足够证据支持新的产品代码修复；保留原帧数门禁，不将失败改判为通过。** 原有未提交工程改动保留；本次仓库内仅增补本文，诊断脚本和产物均在仓库外。

### 原始 trace 与实际界面

重新读取 `/tmp/socrates-round3/completed-results/` 的两份失败 trace，而非只看断言数字。idle 原始可见偏移为 `682 → 450 → 178 → 61 → 36 → 15 → 13 → 12`，streaming 为 `682 → 288 → 178 → 106 → 61 → 36 → 15 → 13 → 12`（省略起点/终点重复值）。两个轨迹均单调上移，尾部保持 12px。已直接查看 trace 截帧：问题从下方进入视野并在顶部落稳，未看到先前长历史的反向回跳；截图的低频采集本身不能证明没有掉帧，也不能替代 RAF 取样。

### 时间戳和所有权证据

重建当前生产产物后，将原 spec 原样复制到 `/tmp/socrates-animation-review/diagnostic.spec.mjs`，仅在副本中增加取证：采样时间、行数、scrollTop、settling、bubble fade duration、RAF 回调时间戳及原生 scrollTop setter 堆栈。保留原 `>=8`、单调性和落点断言，未修改时长、超时、trace 或 retries。诊断运行两项仍失败，均为 6 个合格中间帧；诊断会影响运行负载，不作为正式门禁结果。

- 两项实测都是 **670px 位移、666px 视口、205ms 动画**，与 `motion.js:118–130` 的既有 `planSendGlide` 一致：不超过 1.5 个视口的发送使用 `easeOutQuint`，不是长距离的 ease-in-out。
- 首个新问题采样早于动画第一次 setter 写入（idle 约 16.8ms、streaming 约 0.6ms），且首个偏移仍为 682px。**本次并非取样晚开始、漏掉动画开头。**
- idle 动画 RAF 的相对时间戳包含 `0,16.6,33.3,83.3,100,116.6,133.3,…,233.3ms`，中间出现 **50ms** 间隔；streaming 包含 `0,16.6,33.4,66.6,83.3,100,133.3,…,216.6ms`，出现 **33.3ms** 间隔。按墙钟时间推进的曲线不会补画已错过的刷新帧。
- 每次动画写入都能用原 205ms 曲线拟合，最大差为 **0.494px 以下**，符合浏览器整数 scrollTop 舍入。glide 区间所有 setter 堆栈均来自 `velocityScrollTo` 的插值或正常结束分支，未见外来写者切断或抢占；提示词的 `offset + scrollTop` 恒定，挂载行数未在 glide 中增加。正常结束后的旧 reserve 退休虽会改写原始 scrollTop，但本次可见偏移仍保持 12px，不能把布局补偿直接当成回跳。

### 帧数断言和设计的关系

用**同一生产 motion 模块**计算，670px / 666px / 205ms 的曲线在理想 60Hz、浏览器整数舍入下，严格满足 `start−1 > offset > end+1` 的样本也只有 **8 个**，并无一帧余量。quint 在末段很早就进入终点的 1px 邻域，之后仍运行的动画帧不会计入原断言。把本次实际 RAF 时间戳代回同一曲线，恰好解释观察到的 6 个合格中间帧；不需要假设动画被取消或另一个滚动所有者抢走位置。

因此，现有证据**支持固定帧数假设对刷新节奏过于敏感，与现有时间制动画设计并非稳定对应**，且排除了本次采样中的晚启动、竞争写者和目标漂移。但不能进一步断言是“纯测试噪声”或产品性能无缺陷：33–50ms 的间隔究竟来自应用渲染/布局、trace 开销还是宿主调度，尚未取得可区分的性能证据；原始两次失败也没有逐 setter 时间戳，不能把新采样归因无条件外推为全部运行的根因。

本轮不以延长动画、改变 easing、减少取样工作或降低帧数来凑通过，不新增跳过、force click、等待或 retries。即使后续要重议动画契约，也应在单独授权的设计/测试变更中处理，不能在本轮把失败静默消除。若继续归因，下一项证据应是同一真实发送路径的 main-thread / rendering 性能轨迹，以区分丢失刷新机会的来源；此前两项仍阻塞。

### 本次验证与证据位置

- 当前源码生产 build 成功，含类型检查与生产打包；不是复用未核对的旧产物。
- `motion`、`scroll`、`scrollCoordinator`、`turnAnchor`、`contentFollow`、`finishViewport`、`progressiveMount` 七个相关单测文件 **73/73 通过、0 跳过**。
- 仓库外诊断证据：`/tmp/socrates-animation-review/diag-idle.json`、`diag-streaming.json`、`diagnostic-summary.json`、`diag.log`、`diag-results/`；可复现准备/分析脚本为 `prepare-diagnostics.py` 和 `analyze-diagnostics.mjs`。原始 trace 截帧保留在同目录，未覆盖上轮失败目录。
- 未插桩的原始八个相关 specs 完整串行执行 **61 项：59 通过、2 失败、0 跳过、0 flaky**，总耗时约 3.6 分钟；没有 max-failures 提前停止。`chat-send-glide` 为 11 通过 / 2 失败，其余七个 specs 全部通过，与上轮失败范围一致。本次 idle / streaming 合格中间帧分别为 **6 / 3**，原 `>=8` 断言仍原样失败；两条轨迹均单调到达 12px，但门禁未通过，不能将其他通过项外推为完整 SPA smoke 或 CI 全绿。
- 正式证据：`/tmp/socrates-animation-review/regression.log`、`regression-results.json` 和 `regression-results/` 的两份失败 trace；构建和单测日志分别为 `build.log`、`unit.log`。正式复核使用仓库外 `review.config.mjs`，只调整服务端口与产物输出；测试使用原仓库 specs、原 timeout / retries / trace 设置和单 worker。诊断副本没有进入正式回归集合。

**最终结论：不做没有根因证据的产品改动，保留两项阻塞。** 本轮仅更新整改记录；没有更改任何产品源码或仓库测试断言。已用开始时的已跟踪 diff 作逐文件比较、核对工作区路径清单和关键源码校验和，前批已跟踪改动逐字保留，所有原有工作区路径保持相同修改/删除/未跟踪状态，暂存区为空。HEAD 仍为 `526bc59c86e8e01548ef8185df45d2bbcaa875ab`，未提交、推送、部署或改动远端规则。`git diff --check` 通过。

## 继续归因：刷新受软件合成链路约束，尚无可安全落地的产品修复

本轮从已推送的 `07bf68363901499910566bfe80ab93f3f1f3fc2d` 和干净工作区开始。没有修改产品源码、原仓库 specs、动画参数或门禁；没有提交、推送。取证副本、Chromium Performance trace 及分析脚本均在 `/tmp/socrates-perf-review/`，不进入正式测试集合。

### 主线程不足以解释所有 33ms 间隔

保持原 `retain-on-failure` Playwright trace、60 秒 timeout、零 retries、单 worker 和真实发送/自然出队路径，在仓库外副本增加 Chromium timeline、渲染分类及采样耗时记录。第一轮 idle / streaming 仍以 **7 / 6** 个合格中间帧失败，轨迹均单调落在 12px；随后两轮细分渲染采集分别是 **8 / 8**（两项通过）及 **7 / 8**（idle 失败）。插桩运行有额外负载，不能替代原始 specs 的正式门禁，也不能从一次两项通过宣称恢复。

失败的第一轮动画观测区间内，renderer main thread 最大单任务约 **13.6 / 13.8ms**；Layout 单事件最大约 **0.66 / 0.39ms**，没有出现贯穿整个 33ms 间隔的 JS 长任务。确实存在一次约 **8.3 / 8.1ms** 的样式计算，发生在 scroll handler 读取 `scrollTop` 时，不应假装应用工作量为零。但另一些 33.3ms RAF 间隔中，主线程两次实际回调间仅忙碌约 **3.7 / 2.8ms**；因此不能把全部刷新缺失归因于 React commit 或强制布局。

同一失败窗口里，`VizCompositorThread` 的 display deadline 任务连续耗时约 **17–20ms**。增加 `viz/gpu/skia` 分类后，已确认运行的是 **SoftwareRenderer**：主要成本位于 `Display::DrawAndSwap → DirectRenderer::DrawFrame → SoftwareRenderer::DoDrawQuad`，不是仅凭进程名字猜测。细分运行的单次 DrawFrame 中位数约 **14.6–16.1ms**，已逼近 60Hz 的 16.7ms 预算；每个被采集帧另可见约 **3.7–3.9ms** 的 `ImageOperations::Resize`，源图 **1,024,000 pixels（1280×800）**、目标图 **324,000 pixels**，与 trace 整页采集缩图链路一致。Resize 嵌套在 DrawFrame 内，不能再次与 DrawFrame 总时长相加。原失败轮未开启细分分类，故不能把后轮各子成本数字无条件外推到前轮。

这将主要瓶颈从“来源完全未知的 RAF 缺口”收窄到了**本地软件合成/整帧采集的渲染节奏**；同时保留应用场景绘制复杂度和宿主速度的影响，尚不能声称全部只是 trace 噪声，也未定位到应改动的单一产品 CSS、React 或动画调度缺陷。没有为验证假说而关闭 trace、改变浏览器绘制后端或减轻正式采样负载。

### 采样确有顺序延迟，但没有漏掉已执行的插值

逐个关联 bundle 与原源码，而非只看函数名：生产 bundle 第 2 行第 **61378** 列的 `n` 是 `velocityScrollTo` 的 **scroll listener**（`scroll.js:212–215`），第 **61611** 列的 `m` 才是 **RAF 插值 tick**（`scroll.js:228–269`）。把前者当成插值会得出错误的采样顺序结论。

实测测试 tick 在同一轮 RAF 中先于动画 tick 执行，通常相差零点几毫秒；因此当前采样读取的是上一轮写入的位置，而不是本轮稍后才写入的新位置。固定顺序本身不会丢失中间帧：测试继续到释放后 20 帧，下一次 tick 会读到该写入。把每个实际动画 RAF 的时间戳代回既有 **205ms / 670px / easeOutQuint**，与**下一次**采样的 offset 逐项对照，第一轮 idle / streaming 最大误差均 **0.494px 以下**，其他复核亦在整数舍入误差内。未见测试漏掉已经执行的中间插值；帧数减少对应实际 RAF 时间戳跨过刷新机会。

没有更改采样几何读取路径；第一轮整次采样最大耗时约 **0.4 / 0.6ms**。`frames` 包括 prompt 尚未出现时的记录，不能与 `offsets` 混为一谈：第一轮分别为 **44/42** 和 **68/41** 条。启动准备发生在首个动画 tick 之前，而动画计时从首个 tick 的 RAF timestamp 开始，不能把 reserve/DOM mount 等待直接算成侵占 205ms 动画时长。

### 保留边界与证据

目前没有足够证据支持修改产品实现。仍保留至少 8 个中间帧、原单调性、位移和落点断言；不延长动画或 timeout，不 skip，不改门禁，也不把不稳定通过当成修复。若继续区分产品绘制成本与执行环境成本，需要同一 trace/测试条件下可比的硬件加速或其他执行宿主性能证据，或能归因到具体可见绘制节点的受控实验；不能在本轮凭软件合成成本直接删除视觉效果换绿。

主要复现与取证文件：
- `/tmp/socrates-perf-review-prepare.py`：从原 spec 生成仓库外副本；`/tmp/socrates-perf-review/performance.spec.mjs`、`perf.config.mjs` 为实际运行副本/配置（细分采集在副本额外开启 viz/gpu/skia 分类）。
- `/tmp/socrates-perf-review/timeline-{idle,streaming}-trace.json` 及对应 `-samples.json`：第一轮失败的主线程/RAF 证据。
- 同目录 `render-{idle,streaming}-trace.json`、`render-confirm-{idle,streaming}-trace.json` 与各自 samples：后两轮软件绘制细分证据。
- 同目录 `analyze.py`、`correlate.py`、`timeline-summary.json`、`correlation-summary.json`、`sampling-order-proof.json`：事件占用、精确回调识别和曲线/下一帧采样对照。缺失 trace 分类的汇总成本为 0，表示未采集到该分类，不表示实际没有绘制。
### 本轮正式回归结果

在所有性能采集结束后，使用未插桩的原仓库八个 specs、原断言/timeout/retries/trace 和单 worker 完整串行执行 **61 项：59 通过、2 失败、0 跳过、0 flaky**，约 3.6 分钟，无 max-failures 提前停止。失败仍仅为桌面 full-transcript 的 idle / streaming 发送动画，两项均 **7 个**合格中间帧，未达原 `>=8`；两条轨迹仍单调到达 12px。其余七个 specs 全部通过。没有把诊断轮的通过替代本轮正式结果，也没有将本次结果外推为完整 SPA smoke 或远端 CI 状态。

正式日志：`/tmp/socrates-perf-review/regression.log`；结构化结果：`/tmp/socrates-animation-review/perf-final-results.json`；原始失败 trace：`/tmp/socrates-animation-review/perf-final-results/`。本轮没有改产品源码，复用上轮已验证构建的同一生产产物，未重复声称本轮新做了 build 或 73 项单测。最终工作区仅本文新增内容，原 specs 与产品源码仍等于 HEAD；暂存区为空，HEAD 仍为 `07bf68363901499910566bfe80ab93f3f1f3fc2d`，没有提交、推送、部署或改动远端规则。

**当前结论：软件合成及整帧采集的帧预算压力已有直接证据，采样漏读和动画曲线误写不受本轮证据支持；具体产品缺陷归因仍未闭环，不做猜测性修复，保留原两项门禁阻塞。**
