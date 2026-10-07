# Universal App 迁移复审取证（2026-10-07）

审计基线：`d1de923752a97f92bc9830ce06c3d9e628156428`，同时检查当前工作区。
入场已有四个未提交文件：`.github/workflows/build-apk.yml`、
`apps/socrates/src/runtime.ts`、`mobile/FROZEN.md`、`packages/api/src/index.ts`。
本轮只取证、验证、记录；未修改这些文件，未部署、未触发发布。

## 结论与判定口径

当前是可以导出、通过有限 mock smoke 的 Universal App 原型，尚不能按功能模块签收。
“有代码”“mock 验证”“真实后端验证”“Android 设备签收”必须分开记录。
不能用文件数量、DOM 调用下降比例或旧 mobile 文档的勾选数推算完成百分比。

优先级：P0 为进入联调/交付前必须解决的阻断或数据安全问题；P1 为核心正确性与验收缺口；
P2 为后续模块与工程化工作。以下 P0 不表示已在生产发生事故。

## 新发现的阻断与正确性问题

| 编号 | 优先级 | 证据 | 影响与处理方向 |
|---|---|---|---|
| U-01 | P0 | `App.tsx:109-143` 创建 `session-${Date.now()}`，welcome ID 也是非 UUID；runtime 将其同时放进 query/body；`server/src/lib/sessionOwnership.ts:16-21` 拒绝非 UUID，stream 路由要求 owned session | 已登录用户从新建会话发消息会被服务端拒绝。先保存、采用服务端 UUID，再流式请求；当前 App 没有任何 `api.sessions.save` 调用，消息也没有持久化闭环，刷新会丢本地新对话 |
| U-02 | P0 | `App.tsx:135-138` 回调调用无 session 参数的 `appendDelta`；`packages/chat/src/index.ts` 按 activeSessionId 更新 | 流 A 期间选择 B，A 的增量写进 B。最小复现：A 文本为空，B 收到 `reply-to-a`。回调需要绑定 session/turn，并隔离过期请求的 status/done/error |
| U-03 | P0 | `App.tsx:180-189` 注释及行为假定项目删除将会话移到 unfiled；`server/src/routes/projects.ts:64-167` 实际事务删除项目会话、消息、附件、作品等 | 客户端保留已删除会话，行为与数据删除范围不一致。统一删除语义、确认文案、客户端清理，并用真实契约覆盖；现有删除 smoke 使用没有会话的 Physics，掩盖问题 |
| U-04 | P0 | runtime 使用 `globalThis.fetch`；已安装 RN `Libraries/Network/fetch.js` 加载 `whatwg-fetch`；API reader 强制要求 `response.body.getReader()`；旧 mobile SSE 明确使用 `expo/fetch` | 当前 Android 传输与 reader 契约不匹配。需平台注入支持流式 body 的 fetch，并验证 Hermes/Android；Web mock 通过不能证明原生 SSE |
| U-05 | P0 | runtime 用 `runtime.process?.env?.EXPO_PUBLIC_API_BASE_URL` 间接读取；app.json extra 无消费者；以 staging sentinel 导出后 bundle 不含 sentinel、仍含生产默认地址 | staging 配置没有生效。Expo 构建期环境读取须改为可内联形式或明确平台配置注入，加入产物断言；目前默认地址直接指向生产 |
| U-06 | P1 | `packages/api/src/index.ts:64-67` 任意非 2xx refresh 均 clearTokens/onAuthLost | 最小复现：503 后 token storage=null、authLost=1。暂时性故障会永久清凭据。区分拒绝凭据与 429/5xx/网络故障，并覆盖恢复 |
| U-07 | P1 | API refreshInFlight 仅合并正在执行的 refresh；fetchWithAuth 没有比较请求使用 token 与最新 token；refresh 回写不校验 auth generation | 静态风险：迟到的旧 token 401 可启动第二轮刷新，撤销其他请求正在使用的新 token；登出/重新登录期间旧 refresh 成功可能回写旧账户凭据。需要并发与 session generation 回归测试，尚未动态复现这些时序 |
| U-08 | P1 | `runtime.ts:14` 自动 auth lost 仅调用 auth store signOut；`App.tsx:161-170` 手动退出才清 projects/chat；退出不 abort stream，sync/detail 回调无账户 generation 检查 | 自动失效后旧账户聊天/项目保留；下一账户登录可能看到旧数据。手动退出后迟到的同步/流回调也可回写。统一退出清理、abort、缓存隔离及异步请求失效机制 |
| U-09 | P1 | `App.tsx:136` reasoning 调用 appendDelta；未注册 onToolUse/Result/Progress/CallDelta 等；UI 仅 Text 和简单 tool name/output | 推理与最终答案混在同一 rawText，后续 history 也携带推理；实时工具事件被丢弃。先正确保存协议字段，再补 markdown/代码/推理/引用/附件/tool 渲染 |
| U-10 | P1 | API readChatStream EOF 不调用结束处理；App 只在 onDone/onError 设置 status | 最小复现：只有 partial SSE 后 EOF，onDoneCalls=0；App 将停留 streaming。需要明确非正常 EOF 的错误/收尾、reader finally 清理、停止和重试测试 |
| U-11 | P1 | `npm run typecheck` 报 API archive/unarchive 的 id 为隐式 any，行 147/148；`ci.yml:404-447` 只有 export+smoke | 当前类型检查失败，CI Universal job 没跑 typecheck，Metro 转译仍成功。将 typecheck 和共享包实际测试纳入同一门禁 |
| U-12 | P1 | `App.tsx:65-68` 各同步请求 catch 返回 null，外层 catch 无法接收到这些错误；sessions list 丢弃 nextCursor，固定 limit=50 | 同步失败无错误/重试反馈；只显示第一页会话。合并保留旧 metadata、不移除消失的 server rows，也缺分页和一致性策略 |
| U-13 | P1 | 项目筛选只在有首个会话时切 active；归档后的 next 未限制项目；删除项目仅在当前 filter 命中时处理 session；move 合并旧闭包 store.sessions | 空项目可继续展示其他项目对话；归档可切到筛选外对话；异步 move 可覆盖期间新增消息。需要共享 store 原子领域操作和边界测试 |

## 按原八步重新核对

### 1. 冻结 mobile

- 冻结文档、根 AGENTS 已存在，但 `docs/plans/rn-migration.md:5-17` 仍把 mobile 定义为 RN 主应用，旧勾选不能用于 Universal 签收。
- 未发现 check-mobile-frozen 或等价 CI diff 门禁。需要明确允许修复的例外机制；冻结守卫不能把共享包正常变更一并禁掉。
- 工作区已删除 build-apk 的 check:parity 并补 FROZEN 说明，属于既有未提交修改。
- 冻结意味着停止扩展，既有交付路径仍可维护；不能在 Universal 未验证前直接切换正式发布。

### 2. frontend Legacy DOM / M4

2026-10-07 按 `.js/.ts/.jsx/.tsx` 文本调用计数（含注释可能命中，非 AST）：

- 全部源码匹配 510 次 / 116 文件；排除 vendor-files 后 464 次。与“约 400”不同。
- exam 51、pickers 33、share 21、displayPrefs 19、keyboardShortcuts 19、sidebarChrome 14、viz 14、loader 12、i18n 12。
- `windowExports.js` 去注释后直接 window 点属性赋值匹配 79 次；不涵盖动态属性/Object.assign 等，所以不是全局桥总量。
- index.html 855 行 / 69,721 bytes，距离用户提出的 ≤8KB 纯壳目标很远；index 中 data-action=0，但 source 中有 10 个文件包含该词。
- auth/index 的直接 DOM 减少主要通过 shell helper 委托：减少散落访问不等于 auth shell 已由 React 接管。M4 需追踪 DOM 归属和桥消费者，不能只查次数。
- pickers → share → exam → viz 可以作为后续增量顺序；本轮未修改 frontend 业务代码，未跑完整旧前端套件。

### 3. 共享核心层

- 九个包已存在；DOM-free 检查通过。
- **token 刷新已在当前未提交 diff 中实现**：提前 30 秒、single-flight、401 单次重试，chat 改走认证 fetch。应判“已有待验证实现”，不是“缺失”，也不是“完成”。见 U-06/U-07/U-08。
- auth restore 遇缓存用户直接 signed-in，完全跳过 me；login 设置用户但没有调用 persistUser。离线缓存、认证校验和正常登录缓存写入策略不一致。
- chat 仍按 active session 写入；archive/move/filter/project data 均主要在 App，缺可复用的原子领域操作。
- settings hydrate 对 JSON 不校验，坏缓存使启动 Promise reject；language/haptics 存储可变，但没有 i18n/haptic 行为接线。
- 现有单测文件仅 core、api、auth；chat/settings/ui 未发现单测。CI shared 只跑 core toolRunConformance/streamPlayer，连 core/index.test.ts 也未执行。
- auth/api 测试依赖本地包解析环境，不能把开发机 symlink 当成干净 runner 安装方案；本轮 chat 最小复现需临时 resolver 从 App 解析 zustand。

### 4–5. Universal App 功能

- 有 Chat/Sidebar/AuthGate/Settings/Projects 原型及项目改名、删除、会话归档/移动。模块有入口不表示签收；不能称 Chat/Auth 已完整迁完。
- AuthGate 为密码登录 + 本地 guest。guest 只是构造 user 对象，无后台凭据；真实 chat route requireAuth，因此 guest 不能按当前代码完成真实聊天。
- 消息缺完整 markdown、代码、公式、推理隔离、引用、图片/附件、作品、工具审批；实时工具事件还未接 store。
- 缺注册/验证/忘记密码/code-login 完整路径，Settings provider/model/tone/usage/profile，Search、Agent/Tools、Exam/Tutor、Library tags/memory、分享、附件、语音、实际中文翻译、离线 outbox。
- 无 App 级硬件 BackHandler、KeyboardAvoidingView 等接线；当前移动 Playwright 是浏览器视口，不是 Android 原生验收。
- 历史报告中的“从没真机跑过/从没联调过”无法仅凭代码证明；本轮只确认未发现 Universal 的设备/staging 验收记录和交付接线。

### 6. 跨平台岛

- 五端文件和 kind/bridge 类型存在，但 App/UI 未导入岛，未发现 HTML 生成及 bridge 消费管线。
- **Web 并非可用容器**：ArtifactIsland.web 直接用 react-native-webview；当前安装包通用 WebView.js 返回 `React Native WebView does not support this platform.`。
- Android/native 只有 source html；无 onMessage、尺寸协议、copy/share/openLink/缩放接线。Windows/macOS 是 fallback 文案。
- 后续 Web 需真正的隔离 iframe 适配，native 用 WebView；统一受控消息协议及能力调用。

### 7. 桌面端

- windows/macos storage 为 memory；无持久化凭据适配、RN Windows/macOS 工程/打包/CI。
- build-apk 仍保留检测 desktop/electron 的条件步骤，不存在时跳过；不是新 RN 桌面工程。
- 桌面工程化可以后置，但不得把 Expo Web zip 称为原生 Windows/macOS 已交付。

### 8. 替换与发布

- Universal 有 app.json/package/lock、web export、mock smoke job；无 eas.json、App 图标/splash 配置或 Android 交付工作流。
- build-apk/release-clients/android-device-smoke 仍针对 mobile；构建路径和 release artifact 名都没有 Universal 接线。
- 新 Android package 为 `com.topodrive.socrates.universal`，现有 Google Play 发布使用 `com.topodrive.socrates`。这决定是旁路验收 App 还是旧 App 的升级包，切正式发布前必须确定身份、版本和签名策略。
- eas.json 是选择 EAS 的配置，不是本地 Gradle/Actions 构建的必需品；应先决定交付途径，不应只“加 eas”就判发布完成。
- staging baseUrl 当前构建配置失效，见 U-05；未接真实 API 契约 smoke。
- 读取 Actions：当前 HEAD 查询 CI 记录为空。最新可见 run `37494034102`（另一提交）Frontend smoke fail、Server coverage fail、shared pass，**没有 Universal App job**，不能推断新 job 已红或已绿。
  证据：[该次 CI](https://github.com/kevenhu001-cyber/Socrates/actions/runs/37494034102)。

## 本轮验证记录

| 检查 | 结果 | 限制 |
|---|---|---|
| App `npm run typecheck` | 失败，2 个 TS7006 | 当前 HEAD 未提交工作区一起检查；本轮没有修改生产源码，不归因于本轮 |
| api `node --experimental-strip-types packages/api/src/index.test.ts` | 7/7 | 无 refresh/SSE 测试；mock 删除返回 200/null，而真实 API 204 |
| auth 同上直接执行 | 3/3 | 只验证 cached restore/fallback/signOut |
| `node scripts/check-packages-dom.mjs` | 通过 | DOM-free 不等于原生功能可用 |
| `frontend npm run test:universal` | desktop + Pixel 7 浏览器视口 2/2，通过，约 11 秒 | 先 web export；请求均 mock；未登录真实服务、未发送 SSE、未测设备。首次受 sandbox 禁止监听，获执行权限后通过 |
| staging sentinel web export | 导出成功，sentinel 不在 bundle | bundle 仍保留生产默认与间接 env 读取，证实配置未内联 |
| 三个最小复现 | refresh 503 清凭据、切会话串写、EOF 不 done 均复现 | 仅临时 /tmp 脚本，不是加入仓库的回归测试 |
| GitHub Actions 读取 | 当前 HEAD 无 CI 记录；旧 run 无 Universal job | 未触发新工作流、未上传修改 |

临时复现和 staging export 放在 `/tmp/socrates-rn-audit/`；dist/test-results 均未提交。
没有读取或输出密钥，没有登录生产、写入外部数据或执行正式发布。

## 建议执行顺序（按本次取证修订）

1. 先修 U-01/U-02/U-03/U-04/U-05：保存并采用 UUID、绑定 stream 到 session/turn、明确项目级联删除、原生流式 fetch、有效 staging 配置。
2. 同轮修 refresh 暂态/并发/退出隔离、推理/tool 协议、EOF；补聚焦回归，并把 App typecheck、api/auth/core 与新增共享测试接进 CI。
3. 旁路 Android debug 构建/产物校验，再 staging 登录→过期刷新→新会话→流式→停止→保存→重启恢复；真实设备返回键/键盘/安全区/网络切换签收。正式切换 release 放在签收后。
4. 完成消息渲染，再以 frontend 为基准逐模块签收；M4 按 pickers/share/exam/viz 每轮一个模块。
5. Search → Agent/Tools → Auth 全流程 → Settings 全量 → Library/附件/语音/中文/outbox → Editor/Canvas 岛；桌面工程化最后单独一轮。

无 staging 地址/测试身份和设备验收证据时，不能宣称联调或设备通过；配置和自动化准备可以先完成。
