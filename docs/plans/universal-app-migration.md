# Universal App 迁移路线（2026-10-06 生效）

> 核心原则：共享业务逻辑 + 共享 React Native UI，平台差异只留在最底层。
> 不追求 100% 代码共用；80%～90% 共用 + 10% 平台适配是健康目标。

## 1. 冻结与基准

- `mobile/` 已冻结（见 `mobile/FROZEN.md`）：不再做 Web/Mobile UI parity，只允许
  release-blocking 的安全/crash/data-loss 修复。
- `frontend/` 是当前唯一的视觉/功能基准，直到本计划逐模块签收。
- M4 继续：消除 `document.getElementById` / `window.xxx` / 全局事件桥，核心界面
  全部由 React 管理。`frontend/src/extensions/chipSync.ts` 是本轮增量范例
  （DOM 归属移到专注模块，`windowExports.js` 只保留兼容别名）。

## 2. 共享核心层（DOM-free，`scripts/check-packages-dom.mjs` 强制）

| 包 | 职责 | 状态 |
|---|---|---|
| `@socrates/contracts` | API 类型、SSE 事件名、Session/Message/ToolCall 协议 | 已有，持续扩展 |
| `@socrates/core` | SSE 分帧（`consumeSseBuffer`/`dispatchChatSseFrame`）、历史裁剪、toolRun、streamPlayer | 已有 |
| `@socrates/api` | API client（token 读写经 `KeyValueStore` 注入）、`startChatStream`/`readChatStream` | 已有（未提交，需合入） |
| `@socrates/auth` | 用户会话 Zustand store、`restore`/`signOut`，storage 注入 | 本轮新增 |
| `@socrates/chat` | session/chat Zustand（sessions/active/draft/status/delta/toolCall） | 已有 |
| `@socrates/settings` | theme/language/haptics Zustand + storage hydrate | 已有 |
| `@socrates/platform` | `KeyValueStore` + `PlatformServices` 接口 + memory 实现 | 已有 |
| `@socrates/theme` | tokens + RN hex 映射（`palettesHex`），前后端同源 `frontend/src/ui/tokens.ts` | 已有 |
| `@socrates/ui` | `Sidebar` / `ChatMessageList` / `Composer`（RN + Reanimated，light/dark） | 本轮对齐基准 |

禁止这些包依赖 DOM、`react-dom`、`localStorage`、`window`/`document`。
平台差异只允许在 `apps/socrates/src/*.web.ts`、`*.android.ts`、
`*.windows.ts`、`*.macos.ts`、`*.native.ts`。

## 3. Universal App（`apps/socrates/`）

技术栈：React Native + Expo + React Native Web + Zustand + Reanimated。

v1 只做三个核心界面（均来自 `@socrates/ui`）：

- `Sidebar`（sessions/activeId/onSelect/onNewChat，280 宽，frontend 基准）
- `ChatMessageList`（FlatList，maxWidth 768，空态/工具卡，LinearTransition）
- `Composer`（multiline TextInput + Send/Stop，圆角 24，底部悬浮）

同一套 UI 跑 Web + Android：

- Web：React Native Web（`expo export --platform web`），storage 用
  `storage.web.ts`（localStorage 适配）。
- Android：React Native + SecureStore（`storage.android.ts` / `storage.native.ts`）。
- 视觉签收以 `frontend/` 为准后再扩大范围（先跑 `export:web` + Chromium
  smoke，对比 sidebar/composer/message 三件套）。

## 4. 不可跨平台组件（不重写，原生岛）

TipTap、tldraw、HTML/Viz、Mermaid、Three.js 暂时保留为 Web/局部 WebView，
不要为了“100% Native”立即重写：

- 注册表：`apps/socrates/src/EmbeddedIslands.ts`（`isWebViewIsland`）
- 容器：`ArtifactIsland.{web,native,android,windows,macos}.tsx`
  （Web/Android 用 `react-native-webview`；Windows/macOS 用有界 fallback）
- 协议：`ArtifactBridgeMessage`（ready/resize/openLink/copy/share/error）

## 5. 桌面端（2026-10-07 起出局范围）

- **决定（round 16-5，2026-10-07）：不再做 Windows / macOS 原生目标**，
  发布范围收敛为 Android / Web / iOS。桌面需求由 Expo Web 导出承担
  （`release-clients.yml` 的 “Windows release” 本就是 web bundle，
  localStorage 持久化已可用）；`*.windows.ts` / `*.macos.ts` 适配文件保留
  为休眠占位，不再投入，`storage.windows.ts` / `storage.macos.ts` 原定的
  Credential Locker / Keychain 适配随之作废。
- 平台适配机制不变：`*.web.ts` / `*.android.ts` / `*.native.ts`（iOS 走
  native）做少量差异（storage/clipboard/network/speech/statusbar），
  不碰 `packages/`。
- 若未来重新打开桌面：补 RN Windows / RN macOS 原生工程树后才谈 storage
  落地（PasswordVault / Keychain），届时恢复本节计划。

## 6. 逐模块替换旧前端（顺序）

```text
Chat / Composer
↓
Sidebar / Navigation
↓
Auth
↓
Settings
↓
Library / Projects
↓
Search
↓
Agent / Tools
↓
特殊 Editor / Canvas
```

每模块签收条件：

1. Universal App 行为与 `frontend/` 一致（同一 `packages/core` 分帧 + 同一协议）。
2. 平台差异记录为可解释差异，不用“移动端简化”代替验收。
3. 删除对应的 WebView/旧入口前保留回归用例（Playwright/单测）。
4. 特殊 Editor/Canvas 最后动，长期保留 WebView 岛也可接受。

## 7. 最终目录

```text
apps/
  socrates/        # Universal App（Expo RN + Web + Android + Desktop 适配）
packages/
  core/            # SSE/历史/toolRun/streamPlayer（纯函数）
  contracts/       # 跨端协议
  api/             # API client + SSE stream
  auth/            # auth session state
  chat/            # session/chat Zustand
  settings/        # settings Zustand
  platform/        # KeyValueStore/PlatformServices
  theme/           # tokens + RN hex
  ui/              # Sidebar/MessageList/Composer（RN UI）
server/            # 唯一 API 真源
frontend/          # 基准，逐模块签收后缩减
mobile/            # 冻结，仅安全/crash/data-loss 修复
```

## 8. 验证

- `node scripts/check-packages-dom.mjs`（packages DOM-free，已接进 `frontend npm run lint` + `lint:packages-dom`，见 AGENTS.md 护栏表）
- `cd apps/socrates && npm run typecheck`
- `cd frontend && npm run lint`（含 M4 增量）+ `npm run test:unit` + `npm run build`
- Web smoke：`cd apps/socrates && npm run export:web` + Chromium 看三件套
- Android：CI `build-apk.yml` + 真机签收（返回键/键盘/安全区/网络切换）

## 9. 进展（第二轮，2026-10-06）

- 护栏接线：`lint:packages-dom` 进 `frontend/package.json#LINT` 主链，CI 自动执行；AGENTS.md 护栏表同步。
- M4 Auth 增量：新建 `frontend/src/auth/shell.ts`（root 可注入：setGateVisible/setBootState/showView/switchTab/focusTab/setError），`auth/index.js` 的 gate/view/tab/error 改为薄委托（签名兼容，支持可选 root 传参）；表单 submit 系列留待下轮。`tsc` 0、`eslint` 0 error、`empty-catch` 384/392 通过。
- Universal App Auth+Theme：`App.tsx` 接 `useAuthStore`（restore/login/guest/signOut，经 `api.auth` + 注入 storage）与 `useSettingsStore`（明暗切换持久化）；未登录显示新建 `src/AuthGate.tsx`（email/password + guest）；三件套与 header/status 全走 `palette(theme)`。`apps typecheck` 0（另修 tsconfig exclude 测试文件）。
- 回归：新增 `frontend/test/chipSync.test.mjs`（2）、`frontend/test/authShell.test.mjs`（5）、`packages/auth/src/index.test.ts`（restore 缓存/回退/signOut 清 token，3/3）。
- 下轮建议：M4 把 auth submit 表单的 `getElementById` 逐个换成 shell 取值 helpers；Universal App 跑 `export:web` 截图对齐 sidebar/composer/message 与 `frontend/` 基准；Settings 模块（theme/language/haptics 全量 UI）迁入 Universal App。

## 10. 进展（第三轮，2026-10-06）

- M4 Auth 表单增量：`shell.ts` 新增 `getValue/isChecked/setValue/setText/setVisible/focusId/setButton`；
  `auth/index.js` 8 个 submit handler + 2 个视图预设全部改走 helpers（签名兼容，多一个可选 `root` 参数）。
  `auth/index.js` 直接 DOM 访问从 52 处降到 **1 处**（`mountAuthListeners` 的自挂载 gate 查找，M4 认可模式）。
  `tsc` 0、`eslint` 0 error；`test/authShell.test.mjs` 6/6。
- Universal App Settings 页：新建 `src/SettingsScreen.tsx`（Appearance/Language/Haptics/Sign out，经
  `@socrates/settings` + 注入 storage 持久化），`App.tsx` header 齿轮键切换 `chat/settings` 双屏
  （migration 顺序第 4 个模块）。另给 header 三个图标按钮补 `accessibilityRole="button"`。
- `export:web` 里程碑：Web bundle + 手动 smoke（auth 门 → guest → 聊天 → 明暗切换 → Settings）零 pageerror，
  浅/深色截图确认 sidebar 280 / 消息 maxWidth 768 / composer 圆角 pill 与基线一致。
- 事故复盘：`packages/auth/node_modules/react@19.3.0`（round 2 `npm install` 残留）导致 bundle 双 React，
  Web 白屏 `useCallback of null`。修法：删实体包，`react`/`zustand` 改为 symlink 指回
  `apps/socrates/node_modules`（单测仍 3/3）；铁律记入 `apps/socrates/README.md`
 （sourcemap 中 `react.production.js` 只能出现一次）。另发现本环境 `bash workdir` 参数偶发失效，
  后续命令一律用仓库根相对路径或绝对路径。
- 下轮建议：Settings 持久化 e2e（localStorage 回读）、Library/Projects 列表迁入 Universal App（第 5 个模块）、
  给 `apps/socrates` 加 `rn-web` smoke spec（自建 dist serve + guest 流，现有 `rn-web-smoke.spec.mjs`
  测的是冻结 mobile 壳，不可复用）。

## 11. 进展（第四轮，2026-10-06）

- `packages/api` 加 `projects.list/create/update/remove`（对齐 `server/src/routes/projects.ts`；
  附带把 `ApiError` 改为显式字段声明——原参数属性语法跑不过 `node --strip-types` 单测）。
  `packages/api/src/index.test.ts` 5/5（list/create/PATCH 编码/DELETE/ApiError status）。
  `packages/api/node_modules` 只放 `@socrates/*` symlink（无实体包，见第 10 轮铁律）。
- Universal App Library/Projects（第 5 个模块）：新建 `src/ProjectsScreen.tsx`（列表 + 选项目过滤 +
  name-only 新建 + 离线错误/重试）；`App.tsx` 加 `projects` 屏、登录/恢复后 `syncLibrary`
  （projects + sessions 列表合并，绝不覆盖已有消息的本地会话）、server 会话的懒详情加载
  （本地 id 免请求）、header 项目过滤 chip、新建会话自动归属当前过滤项目、登出重置。
- 验收：`export:web` + mock 登录态 smoke（projects 列表 → 选 Math → sidebar 只剩 HW 1 →
  正文懒加载出详情消息），零 pageerror，截图确认。修过一个过滤不一致（sidebar 过滤而正文仍 welcome）：
  选项目时自动切到该项目首个会话。
- 下轮建议：project 改名/删除、session 归档/改项目、给 Universal App 自建 `rn-web` smoke spec
 （mock 登录 + projects，全绿后作为 CI 门禁；冻结 mobile 的旧 spec 不可复用）。

## 12. 进展（第五轮，2026-10-06）

- `packages/api`：`sessions.patch`（title/topic/pinned/projectId 子集）、`archive`/`unarchive`
  （对齐 `POST|DELETE /sessions/:id/archive`；归档要求 UUID，本地 id 只做本地标记）。
  单测 7/7。
- 会话操作 UX 定稿：archive/move 收进 App header 溢出菜单（`⋯` → Move to project / Archive），
  全端统一；`@socrates/ui` Sidebar 回归纯导航（曾短暂给 active 行加 📁📦 按钮，已 revert）。
- 真事故复盘（spec 门禁 90s 超时×N）：Sidebar 的 `entering={FadeIn}/exiting={FadeOut}`
  使 RN Web 在挂载期 tap 取消（pointerdown/up 间行位移）+ Playwright stability 永不等到。
  修法：Sidebar 去挂载动画（MessageRow 的 LinearTransition 保留）；spec 对过渡后操作加
  `fonts.ready + 400ms` settle。另修：spec 非精确 label 撞车（`exact: true`）、compact 下
  select 关 sidebar 导致 action 不可达（header 菜单天然解决）、s1 懒加载 mock 缺口。
  最终双端（desktop 1280 + Pixel 7）~10s 全绿。
- CI 门禁：`ci.yml` 新增 `universal-app` job（apps/frontend 双 `npm ci` + Chromium +
  `npm run test:universal` + test-results artifact），新 runner 脚本
  `frontend/scripts/run-universal-smoke.mjs`（export → :4175 node 静态 serve → spec → 退出码透传）。
  现有 job 未动；YAML 已校验，待一次真实 CI 运行确认。
- 下轮建议：session 删除/purge、archived 列表入口、projects 空态引导文案对齐 `frontend/` 基准。

## 13. 进展（第六轮，2026-10-07）

- 工作区核对：10-07 审计（`docs/audits/2026-10-07-universal-app-evidence.md`）的
  U-01/U-02/U-04/U-05/U-06/U-07/U-08/U-09/U-10/U-11/U-12/U-13 已在未提交工作区中
  修好（`turn.ts` 先 save 取 UUID 再流式、turn 绑定、`transport.native.ts` 走
  `expo/fetch`、staging 改直接 `process.env` 读取、refresh 仅 401/403 清凭据 +
  generation 隔离、推理/tool 全事件进 store、EOF 非正常关闭抛错、CI 加
  typecheck+shared+DOM 门禁、sessions 分页 + `reconcileSessions` 原子操作）；
  U-03 项目删除语义已按服务端级联删除为准（`removeProject` 直接过滤会话，
  旧“移到 unfiled”注释是错的，服务端 `projects.ts` 事务内删会话/消息/附件/作品）。
- 本轮新增（第 12 轮建议的第一、二项 + 空态第三项）：
  - `packages/api` 加 `sessions.remove`（DELETE，容忍 204 空 body；单测覆盖）。
  - `packages/chat` 加 `deleteSession(id, projectFilter)` 原子 purge（删行 +
  可见会话回退；单测覆盖）。归档仍走 `archiveSession`。
  - App 会话菜单加 `🗑 Delete session` 两步确认（防误删；文案明示 purge 范围；
  流式中/切账户时守卫；`confirmDelete` 随菜单关闭、返回键、账户重置清理）。
  - `ProjectsScreen` 空态加基准文案（`sidebar.spaces.empty` 中英同源：
  “No projects yet. Create a project to organize your sessions.”）。
- 验证：`apps typecheck` 0、`test:shared` 全绿（含新增 2 项）、DOM-free 通过；
  `export:web` + `frontend npm run test:universal` 双端（desktop + Pixel 7）4/4 通过。
- 下轮建议：archived 列表入口 + unarchive（API 已有，store/UI 缺）、消息完整
  markdown/代码/推理隔离渲染（U-09 后半）、Search 模块迁入（顺序第 6 个模块）。

## 14. 进展（第七轮，2026-10-07）

- archived 列表入口 + unarchive（第 12 轮建议的剩余项）：
  - `packages/api` 加 `sessions.listArchived`（`archived=true` 分页，与 `list`
  共用游标循环）；`packages/chat` 加 `unarchiveSession(id, fallback)`（已知行
  清 flag，未持有行插入服务端取回的行，消息仍懒加载）。
  - `@socrates/ui` Sidebar 加 Archived 可折叠区（默认收起、无挂载动画、
  空态“No archived conversations.”）；App 在 `syncLibrary` 同取 archived、
  归档时本地追加、恢复时调 `unarchive` + 清单 + `select`，退出/切账户清空。
- 消息渲染（U-09 后半）确认：`MessageContent`（markdown/代码块+复制/表格/
  引用/列表/推理折叠/附件/工具卡/引用链接，HTML 只当字面文本）早已接进
  `ChatMessageList`，`turn.ts` 推理与正文分字段保存；`universal-chat` smoke
  覆盖 heading/代码/复制/推理开关/工具卡，无新增代码，只做回归确认。
- Search 模块（顺序第 6 个）迁入：
  - `contracts` 加 `SearchHit`；`packages/api` 加 `search.content`
  （POST /api/search，snippet 的 `<mark>` 只由渲染层剥除）。
  - 新建 `apps/socrates/src/SearchScreen.tsx`（本地标题即时过滤 + 服务端
  300ms 防抖 + stale 丢弃；guest 仅本地；空/载入/错误态）。
  - App 加 🔍 入口 + `search` 屏 + `openSearchSession`（未持有行先
  `sessions.get` 插入再 `select`，账户 epoch 守卫；返回键回 chat）。
- 回归：`universal-app` smoke 扩展 archived 恢复、搜索（本地 hit +
  server `<mark>` 剥除断言）、会话删除两步确认；修过一次过宽文本断言
  （strict mode 命中标题+摘要两处，收紧到 message-hit 按钮）。
- 验证：`apps typecheck` 0、`test:shared` 全绿（api 10/chat 9 含新增
  listArchived/search/unarchive 用例）、DOM-free 通过；
  `export:web` + `test:universal` 双端 4/4 通过。
- 下轮建议：Settings 全量 UI（provider/model/tone/usage/profile）、Auth 全流程
  （注册/验证/忘记密码/code-login）、附件/语音/中文/outbox；桌面工程化最后。

## 15. 进展（第八轮，2026-10-07）

- Settings 全量 phase 1（无密钥面；provider 密钥与计费动作留网页基线）：
  - `packages/settings` 加 `tone` + 5 预设全文（与 `tonePresets.js` 逐字同源，
  只管 persona/voice，不管结构与安全）+ 持久化/非法值回退；单测覆盖。
  - `contracts` 加 `AccountUsage`；`packages/api` 加 `account.usage`
  （GET /api/account/usage 只读；`/api/v2` 重写已在服务端确认）。
  - `runtime.streamConversation` 每次把当前 tone voice 作 system 首条发出去
  （与网页端 `toneVoiceSuffix` 同行为；持久化会话仍只存 user/assistant）。
  - `SettingsScreen` 加 Assistant tone 五项选择 + Account 区（身份/会话数/
  provider 数/知识节点/本月 token），guest 仅本地偏好，加 ScrollView；
  App 进设置屏即取 usage（epoch 守卫），返回键行为不变。
  - 另修 Settings 返回键缺 `accessibilityRole="button"`（与 Projects 屏不一致）。
- 护栏修补：`check-packages-dom` 把 `document.`/`window.` 误判 prose 句号
  （preset 文案 "professional document. You…"）收紧为真正的属性访问
  (`\.[A-Za-z_$]`)，并用探针确认仍能抓住 `document.getElementById`。
- 回归：`universal-chat` smoke 在 mock 服务端加契约（system 首条必须含
  scholar voice，否则 400）；`universal-app` smoke 加设置往返（tone 选中 →
  localStorage 持久化 → reload 仍在 + profile/usage 可见）。
- 验证：`apps typecheck` 0、`test:shared` 全绿（含 tone/account 新增用例）、
  DOM-free 通过；`export:web` + `test:universal` 双端 4/4 通过。
- 下轮建议：Auth 全流程（注册/验证/忘记密码/code-login）、附件（文件/相册/
  相机）+ 语音、中文 i18n 接线；provider/model 密钥管理需单独设计（密钥输入
  面，不宜与普通设置同批）。

## 16. 进展（第九轮，2026-10-07）

- Auth 全流程（无服务端改动，全部落在 mobile 已有端点 + web 共享端点）：
  - `api.auth` 加 `sendCode`/`loginWithCode`（generation 保护写 token）、
  `register`/`resendVerification`/`forgotPassword`/`changePassword`；
  凭据类端点全部加入 refresh 豁免（错码/错旧密码只报错，绝不旋转或清会话，
  单测锁定）。
  - `AuthGate` 四模式（密码/code/register/forgot）+ notice 通道；App 侧
  handlers + Settings 内改密码表单；`universal-auth` 新 smoke（register/
  forgot 提示 → code 登录进应用 + token 落盘）。
- 附件（模型可读即签收，文件库持久化后置）：
  - 新依赖 `expo-document-picker/image-picker/file-system/speech`（SDK57 对齐）。
  - `attachmentModels`（kind 判定/25MB 上限/转 Message）+ 双端 picker
  （web input 直读 + send 时 `/files/extract`；native 相册/相机 base64、
  txt 直读、文档 `uploadAsync` 同端点）。
  - `chat.beginTurn/runChatTurn` 透传 attachments（单测锁定落盘与请求携带）；
  Composer Chips + 同行附件/麦克风按钮（chips 仅暂存时展开，避免遮挡消息）。
- 语音：`speech.*` 平台分层（native `expo-speech` 朗读；web SpeechSynthesis +
  SpeechRecognition）；assistant 消息 🔊 按钮 + composer 🎤（平台无能力自动
  隐藏）；web 朗读 30s 兜底不 hanging。
- 中文 i18n 接线：`packages/ui/src/strings.ts`（组件字典 + `language` prop，
  默认英文零破坏）+ `apps/.../strings.ts`（五屏 + 回调错误文案，settings
  language 驱动热切换）；smoke 加 zh/en 往返（助手语气/退出登录可见 + 持久化）。
- 修过：mic 在桌面 Chromium 真实存在（改断言为可见）、AuthGate Email 严格
  匹配、附件栏垫高遮挡工具卡（按钮收进 composer 同行）。
- 验证：`apps typecheck` 0、`test:shared` 全绿（auth 15 含凭据豁免、api 12
  含 extract、chat 10 含附件）、DOM-free 通过；`export:web` +
  `test:universal` 双端 6/6 通过。
- 下轮建议：provider/model 密钥管理单独设计；Editor/Canvas 岛、桌面工程化；
  真机签收（返回键/键盘/安全区/网络切换）+ staging 联调仍是发布前门。

## 17. 进展（第十轮，2026-10-07）

- Provider/model 管理（密钥只发一次，服务端加密持有）：
  - `contracts.ProviderKey` + `api.providers`（list/create/patch/remove 走
  `/api-key`，返回只有 hasKey/keyHint）。
  - 新建 `ProvidersScreen`（列表/点选激活/新增表单 label+url+model+key+
  vision 开关/两步删除；built-in 行不提供删除）。
  - App `providers` 屏 + epoch 守卫的镜像更新（激活互斥/新增即活跃/删除过滤）；
  Settings 加 Models & keys 入口（活跃 model 副标题，guest 隐藏）；
  providers 返回键回设置屏。
  - 中英字典同步（19 个 key）。
- 修过：删活跃供应商后无活跃行是服务端一致行为（spec 改断 `○ Custom`）；
  旧 spec 补 `/api-key` 空列表 mock（settings 打开即取 providers，
  未 mock 会在控制台留下 refused 噪声）；空副标题只显示 ›。
- 验证：`apps typecheck` 0、`test:shared` 全绿（api 13 含 providers、
  auth 15、chat 10）、DOM-free 通过；`export:web` + `test:universal`
  双端 8/8 通过（含新 providers spec）。
- 下轮建议：附件文件库持久化（sessionId 关联上传）、Editor/Canvas 岛
  （需先有消息 viz 数据流，否则无内容可渲染）、桌面工程化；真机 +
  staging 联调仍是发布前门（本机无 SDK/设备与 staging 凭据，只能做准备）。

## 18. 进展（第十一轮，2026-10-07，rounds 11-15 合批）

> 对应提交 `b99a27fc`（`0969d03a..b99a27fc`，56 文件 +3620/-94）。
> 把第十轮预告的三项（文件库持久化、Editor/Canvas 岛所需 viz 数据流、
> 桌面前的 Agent/Tools + Exam）一次合批落地。

- 可视化 / 岛（`§4` 不可跨平台组件的正式实现）：
  - `packages/ui/src/visualization.ts`（306 行，DOM-free）：v1 spec 契约
  （`version/template/title/caption/accessibilitySummary/payload`，与
  `server/src/services/visualization.ts` 同形）+ 自包含内联 SVG/HTML 渲染
  （普通图表本地画，`svg_illustration`/`interactive_simulation` 按源原样嵌入），
  重型依赖（ECharts/Mermaid/Plotly/Three.js）绝不进共享核心。
  - `packages/ui/src/artifactDocument.ts`（151 行）：沙箱岛文档壳
  （`buildEmbeddedDocument`/`buildArtifactDocument`/HTML 转义/调色板注入）。
  - `packages/ui/src/artifacts.ts`（158 行）：栅栏（html/mermaid/three/viz）
  提取 + `ToolCall.artifacts` 归一 + `ArtifactBridgeMessage` 解析
  （ready/resize/openLink/copy/share/error）+ `isWebViewIsland` 注册表。
  - `apps/socrates/src/ArtifactIsland.{web,android,native,windows,macos}.tsx`
  + `artifactBridge.ts` + `ArtifactViewer.tsx`（96 行）：Web 真隔离 iframe
  （取代旧 `react-native-webview` 在 Web 的占位），Android/native 走 WebView，
  Windows/macOS 有界 fallback；`share.*.ts` 接分享/复制闭环。
  - `MessageContent` 转录卡只显示摘要 + “打开”，重文档进岛，不进消息列表。
- 文件库（附件落库闭环）：
  - `contracts` 加 `StoredFile`/`StoredFilePreview`（对齐 `GET /api/files`
  与 `/files/:id/content` 文本预览截断契约）。
  - `packages/api` 加 `files.uploadUrl/list/preview/remove/rawUrl/fetchRaw`
  （`uploadUrl` 专供 native `uploadAsync` 取裸 token 上传；`fetchRaw` 供 Web
  组 blob URL / native 落缓存文件；原始字节只经 `/files/:id/raw` 读取）。
  - `attachmentUpload.{web,native}.ts`：发送时带 `sessionId` 落库
  （Web FormData 经 `fetchWithAuth`，native 经 `FileSystem.uploadAsync`），
  失败绝不中断 turn（`turn.ts` 新增 `persistAttachments` 钩子 +
  `chat.setTurnAttachments` 回填 `fileId`）。
  - `fileAccess.{web,native}.ts` + `useFileImages.ts`：transcript 里
  `/files/:id/raw` 图片与附件卡经鉴权解析（Web blob URL / 原生 headers），
  可预览/下载；`fileMeta.ts`（kind 标签/二进制尺寸/URL→id）+ `urlSafety.ts`。
  - 新建 `FilesScreen.tsx`（106 行：列表/文本预览/删除/重试）+
  `FilePreview.tsx`（96 行浮层），侧栏 “打开文件” 进入文件库。
- 工具卡（Agent/Tools，顺序第 7 个模块主体）：
  - `packages/ui/src/toolModel.ts`（184 行，DOM-free，对齐 `toolCards.js`
  数据模型）：标签映射/单行输入预览/状态（running/completed/failed）/
  耗时/搜索结果（去重 + `safeLink` 过滤）/产物归一（live 字符串 id 与
  持久化 `{id,mimeType,name}` 双形）。
  - `MessageContent` 工具卡展开态：参数、stdout+stderr、来源卡
  （标题/域/摘要/日期）、产物图片内联（经鉴权 raw 解析）、HTML 产物
  在岛中打开、其余文件进文件预览。
  - `turn.ts` 保留实时 `artifacts`/`durationMs`/`executionId`/`retryable`，
  与持久化行同形渲染。
- 考试面（Exam，`frontend/src/exam.js` 1130 行的移植）：
  - `packages/ui/src/examModel.ts`（247 行，DOM-free）：题型解析
  （选择/填空/简答）、本地判分、答案归一、出题 prompt 与响应解析
  （fence/thinking/prose 兼容）。
  - `packages/ui/src/ExamView.tsx`（136 行）：作答/交卷门禁/本地判分与解析。
  - `apps/.../ExamSetupScreen.tsx`（162 行）+ `examGeneration.ts`（109 行）：
  App 内出题，逐题经 `/chat/stream` 生成（可取消、进度 `generating/parsed/
  retrying/completed` 可见），建成 `kind='exam'` 会话并 `sessions.save` 落库；
  答案防抖经 `sessions.patch`（本轮 `patch` 白名单新增 `kind`/`examData`）持久化，
  重开即恢复判分；会话列表 🗒 标记，Sidebar 新增 `onNewExam`（guest 隐藏）。
- 测试/工程：
  - 新增 5 个共享单测（`visualization/artifacts/fileMeta/toolModel/examModel`）
  与 4 个 Playwright（`universal-{tools,files,exam,exam-generation}`），
  `universal-chat` 补工具卡/viz 断言。
  - Windows 兼容：`run-shared-tests.mjs`/`test-resolver.mjs`（drive-letter
  转 fileURL）+ `run-universal-smoke.mjs`（经 node 直调 playwright cli，
  避开 `npx.cmd` EINVAL）。
  - 中英字典同步（app + ui `strings.ts` 共约 130 key 增量）。
- 修过：Web 岛容器由 `react-native-webview` 换真 iframe（旧实现 Web 直接
  返回 unsupported）；live `artifacts` 裸字符串与持久化行双形归一
  （`toolModel` 统一吃）；出题进度 `retrying` 相与取消竞争（abort 即停，
  不写半题）。
- 验证：`apps typecheck` 0、DOM-free 通过、`test:shared` 全绿
  （含新增 examModel 9/fileMeta 4/toolModel 7/visualization 5/messageContent 3）；
  `export:web` + `test:universal` 以 8 个 spec（app/auth/chat/providers +
  新增 tools/files/exam/exam-generation）双端（desktop + Pixel 7）为准，
  以 CI `universal-app` job 结果为签收依据。
- 下轮建议（第十六轮候选，按 §6 剩余 + 基线差距排序）：
  1. 消息级 parity：编辑/重发/分支（对 `frontend/src/chat/editBranch.js`）
  + 停止后重试 + 离线 outbox（对 `session/mutationOutbox.js`/`offline.js`/
  `beacon.js`，当前失败只进 error、无队列、无断网续发）。
  2. 渲染 parity：公式（KaTeX，`render/katexRefresh.js`，当前 HTML 只当字面
  文本）+ 引用/脚注与长代码性能（对照 `render/{markdown,viz}.js`）。
  3. 会话内模型切换：`modelPicker` 进 chat header（当前选模型要绕到
  Settings → Providers，不符合基线手感）。
  4. Tutor/诊断流（`teachingPlan/diagnosticGenerator`，exam 已有，tutor 缺）
  与知识/记忆入口，放在桌面工程化之前。
  5. 发布前门（单独一轮）：windows/macos storage 接 Credential Locker/
  Keychain（当前 memory 占位）、EAS 与包名决策
  （`com.topodrive.socrates.universal` vs 现发布包名）、staging 联调 +
  真机签收（返回键/键盘/安全区/网络切换）。

## 19. 进展（第十二轮，2026-10-07，round 16-1：编辑/重发/分支/离线 outbox）

> 对齐 `frontend/src/chat/editBranch.js` + `session/mutationOutbox.js` +
> `chat/offline.ts` 的纯语义；DOM 专属一律不移植（行内 textarea 编辑器、
> `createStreamRetryViewport` 视口锚点——Universal 用 FlatList 锚点重播代替、
> `beacon.js` keepalive——Universal 用 turn 后保存 + outbox 代替）。

- 纯域（`packages/chat`，DOM-free）：
  - `edit.ts`：`rollbackAfter`（锚点保留/尾部上报）/`applyEdit`（仅 user
  锚点、空文本/无变化拒绝）/`findRegenerateTarget` + `applyRegenerate`
  （回退到回复背后的 user turn）/`buildBranchSession`（附件按 20 截断，
  exam/archive/流式字段不 fork，`branchedFrom` 落点）。
  - `outbox.ts`：storage 注入的 `createMessageOutbox`
  （`queueMessageOp`/`pendingOpCount`/`drainMessageOutbox`，500 cap 新胜旧、
  单飞、逐 op 落盘、404 丢弃、非 404 停排；重放只发 `discardFollowing:
  false` 的 patch + 逐行 delete，绝不重放 prune）。
  - `retry.ts`：`STREAM_MAX_ATTEMPTS` = 6、`STREAM_RETRYABLE_STATUS`
  （524 终局，其余 5xx/429/408/425 可重试）、navigator 守卫的
  `offlineGuard`、`shouldRetryInterruptedStream`（有可见输出即不可重播）。
  - store 加 `rewindSession(sessionId, anchor, newText?)`（返回 dropped 供
  outbox 排队），`api.messages` 加 `patch`（`content/regenerate:false/
  discardFollowing`，`sessionId` 仅 UUID 才做 scope）与 `remove`。
- UI（`@socrates/ui`，handler 缺席即隐藏，guest 不传 handler）：
  `MessageContent` 用户行 ✏️ / assistant 行 ↻ / 双行 ⑂，
  `ChatMessageList` 透传；`strings.ts` en/zh +3（类型级 key 相等）。
- App：`runTurn` 抽取（send/编辑/重发/重试共用，turn 后 drain）；
  `editingId` 复用 Composer（banner + 取消 + draft 备份恢复，Send 改走
  `commitEditSend`）；`commitEdit`（PATCH settle 后重问，404 视为本地行，
  非 404 双半入队 + offlineNotice，本地照常重问）、`regenerate`（文本不变，
  失败只排 deletes）、`retryTurn`（error 态重播最后 user turn，
  error 行 ↻ Retry）、`branchFrom`（`session-*` 本地 fork + save
  best-effort，sync 前一直保留）；outbox 经 storage 注入，drain 点 =
  turn 后 + boot + `online` 事件（native 无 window，走 turn 后 drain 覆盖）。
- 验证：`apps typecheck` 0、DOM-free 通过、`test:shared` 全绿
  （新增 edit 9/outbox 6/retry 4/api-messages 2/rewind 2）；
  `frontend lint` 0 error；`export:web` + `test:universal` **18/18**
  （9 spec × desktop/Pixel 7，含新 `universal-edit`：改写/PATCH 断言/
  重发/分支切片/中段掐流→Retry→重播）。
- 实证（Chromium 零字节掐流静默重放）：首字节前掐断，Chromium 换连接
  无形重发小 POST（Playwright request 监听不可见，服务端计两次），turn
  照常成功、boring 无错。e2e 改用“写半截再掐”（首字节上路后传输层无法
  重放）；零字节 case 由单测覆盖传输语义。生产含义：首字节前失败可能
  双发 LLM turn，幂等键/去重以后轮再议（P1.5，不挡签收）。
- 下轮（round 16-2）：公式（KaTeX）+ 引用/长代码 parity；会话内模型切换
 （`modelPicker` 进 chat header）；Tutor/诊断流。发布前门仍单独一轮。

## 20. 进展（第十三轮，2026-10-07，round 16-2：公式/引用/长代码）

> 对齐 `render/katexRefresh.js`（`$$` display + `$` inline + `\(\)`/`\[\]`
> 分隔符契约）与 `render/helpers.ts stripCitationMarkers`（assistant 气泡
> 不显示 `[1]`/`【1】`，来源只在搜索工具卡）。

- 共享解析（`packages/ui/src/math.ts`，DOM-free，无占位符哨兵）：
  - `splitMathSegments`：单遍扫描，fence/行内代码优先抄过（`a[i]`/`$5`/
  `$(cmd)` 永不成公式）；`$$`/`\(`/`\[` 信任作者只判非空；
  `$..$` 另要 TeX 内容（字母/反斜杠/符号，`$5`/`$5.99` 按字面）且
  closer 不跟空白（`$5 and $10` 存活）。
  - `stripCitationMarkers`：helpers.ts 的逐字移植（单遍实现），`[[1]]`
  内层剥除行为已用基线真函数对照（同样得 `[]`，注释 aspirational）。
  - `extractFootnoteDefinitions`：`[^id]: text`  lifting 为 Notes，
  行内 ref 改写 `[n]`（无定义不动）。
- 岛排版（`artifactDocument.buildMathDocument`）：KaTeX 0.16.11 pinned
  CDN + 双 SRI + `trust: false`；math 文档专用窄 CSP（仅放行该 CDN 的
  script/style/font）；CDN 失联显示 TeX 源码（transcript 卡本就显示源码，
  永不白板）。元素查找用 window 具名属性（门禁禁
  `getElementById`/`querySelector` 字面量，连注释里都不能写）。
- 渲染（`MessageContent`，assistant only，user 原样）：
  strip → footnotes → display 公式卡（源码 + 进岛）/行内公式折成
  codespan 保句子不断行；`[^a]:` 定义进 Notes 区；>40 行代码折叠
  （前 30 行 + `Show n more lines`）；`strings.ts` en/zh +4。
- 验证：`apps typecheck` 0、DOM-free 通过、`test:shared` 全绿
  （新增 math 8）；`frontend lint` 0 error；
  `export:web` + `test:universal` **20/20**（10 spec × 双端，含新
  `universal-math`：公式卡/开岛/引用剥除/注释/代码折叠）。
  `universal-exam-generation` 在两次全量中各挂一次、单跑/6 连跑/第三次
  全量均过——该 spec 本轮未动，判负载 flake（后续若再现再修）。
- 下轮（round 16-3）：会话内模型切换（`modelPicker` 进 chat header）；
  Tutor/诊断流。发布前门仍单独一轮。

## 21. 进展（第十四轮，2026-10-07，round 16-3：模型快切 + Tutor/诊断）

> A 切片对齐 `modelPicker.js`（header 版选择器）与
> `providerConfig.service.ts setActiveProvider`（PATCH 成功才镜像、失败回滚）。
> B 切片移植 tutor 冷启动链：`tutor/*`、`chat/teachingPlan.js`、
> `chat/diagnosticGenerator.js`、`chat/diagnosticParser.js`、
> `chat/diagnosticResults.js`、`chat/mockDiagnostic.js aiGenerate`、
> `chat/socraticDirectives.js` + `sendPipeline` 的实质答案推进。

- 模型快切：
  - `packages/ui/src/modelPicker.ts`（DOM-free）：built-in 优先排序、active
  解析、label/model/url 过滤、行标签规则（model 不同于 name 才做副标题，
  否则 custom 行给 url）——与 `bindModelPicker` 的 item 语义逐条对齐。
  - `ModelPicker.tsx`：transcript 上底部 sheet（backdrop 关闭、≥4 行显示筛选框、
  Manage 入口、选中 ✓）。
  - App：header 模型 chip（`🤖 <active> ▾`，guest 隐藏）；`pickModel` 复用
  `activateProvider`（PATCH 成功才镜像，失败保留原 active 并显错）；
  Providers 返回源 `providersReturn`（settings 入口回 settings、chat 菜单回 chat）；
  BackHandler 优先消费 model 菜单。
  - strings：ui +7（`modelTitle/chooseModel/filterModels/useModel/manageModels/
  closeModelPicker/noModels/noModelMatches`）、app +2。
- Tutor 冷启动：
  - `packages/ui/src/tutor.ts`（DOM-free）：阶段机（motivate→…→check，进 exercise
  重置练习计数）、`isSubstantiveAnswer`（>40 字/词，quiz/practice origin 不计）、
  `buildDiagPrompt`（5 aspect 1:1 固定 KB、`{questionNumber}/{questionCount}/
  {aspect}` 模板、语言名、searchContext 显式参数）、`parseDiagResponse` +
  `normalizeDiagQuestions` + `extractDiagQuestionsBalanced`（字符串感知平衡
  括号兜底；store 写 `lastCallError` 改为模块级 `diagError()`）、
  `buildColdStartNodes`/`cleanTopicDomain`（5 节点骨架）、
  `buildTeachingPlanFromKB`/`syncCurrentNodeFromTeachingPlan`（blank 优先）、
  `applyDiagnosticResults`（答案折 baseline，绝不当 mastery）、
  `diagnosticPointsForNode`（诊断知识点回灌教学）、`buildTutorVoice`
  （阶段 + 基础锚 + 本轮 scope；web-only 后缀链留基线）。
  - `contracts`：`TutorData`（本地诊断 Q&A）+ `Session.tutorData`。提交后
  kbNodes/teachingStage/teachingPlan 走全量 save（服务端已支持这些列）；
  诊断 Q&A 与基线一样只留本地，save 路径剥除未知 key。
  - `DiagView.tsx`：A/B/C 级别选项逐卡作答、计数、提交门禁（对齐 ExamView）。
  - App：`tutor-setup` 屏（topic + 3/5 题、逐题进度 + 取消）、
  `generateDiagQuestions`（每问一次 `/chat/stream`，首问失败即弃、后续跳过）、
  tutor 会话（kind='tutor' + 冷启动 KB + 本地 tutorData）、提交折 KB/plan/stage
  + 全量 save best-effort、`runtime.streamConversation` tutor 分支
  （`mode:'tutor'`，system 换成 buildTutorVoice 而非 tone voice）、发送时按
  `isSubstantiveAnswer` 推进阶段、侧栏 `onNewTutor`（guest 隐藏）+ 🎓 前缀、
  窄屏进 setup 自动收侧栏。
- 验证：`apps typecheck` 0、DOM-free 通过、`test:shared` 全绿
  （新增 tutor 15 + modelPicker 4）；`frontend lint` 0 error；
  `export:web` + `test:universal` **24/24**（12 spec × 双端，含新
  `universal-model`、`universal-tutor`），连跑三次全量稳定。
- flake 溯源（实证）：exam 类 spec 在满载下轮流挂一条（desktop→mobile→desktop），
  隔离必过，快照停在 boot 中段（侧栏默认折叠）。根因：就绪断言用默认 10s，
  满载 boot 超出预算；`app.spec`/`providers.spec` 本就带 `{timeout:20000}` 故
  从不挂。按仓库既有写法把 10 个 spec 的就绪门统一改 20s，并补
  exam-generation 缺失的就绪门。属测试预算问题，非产品缺陷。
- 下一轮（round 16-4）：`assistantId` 人格绑定（session 级 + picker UI）；
  Tutor 教学 UI 加深（阶段指示、quiz/practice 控件代理）。发布前门单独一轮。

## 22. 进展（第十五轮，2026-10-07，round 16-4：assistantId 绑定 + Tutor 教学 UI）

> A 切片对齐 `ui/creationSurfaces.js`（Assistants 创建面）、`chat/api.js` 的
> assistantId 透传、`session/persistence.js` + `session/loader.js` 的
> sessionStorage 镜像语义；B 切片对齐 `render/widgetParsers.ts` +
> `render/assistantHtml.ts`（首块成控件、余块退化为正文）+
> `render/widgets.js`（quiz/practice 行为）+
> `tutor/policy.js shouldRequestTutorAfterQuiz` + `sendPipeline` 的
> exercise 计数与阶段推进。

- `assistantId` 人格绑定：
  - `contracts`：`Assistant`（id/title/source 原始 JSON/version/时间）+
    `AssistantConfig`；`packages/api`：`assistants.list/create/update/remove`
    （`/creations/items/assistants`，DELETE 幂等）+ `sessions.patch` 放开
    `assistantId`（服务端 PATCH 白名单本已特殊处理该列）。
  - `assistantPicker.ts`（DOM-free）：`source` JSON 解析（坏行降级不抛）、
    行标签（title + description 副标题）、active 解析、标题/描述过滤。
  - `AssistantPicker.tsx`：transcript 上底部 sheet，行 + `No assistant`
    解绑行 + ≥4 行筛选 + Manage 入口（对齐 ModelPicker 手感；「解绑行」为
    App 端新增，基线无 chat 内切换器，服务端 PATCH `null` 已支持）。
  - `AssistantsScreen.tsx`：基线创建面 1:1（名称/描述/指令/开场白、
    删除二次确认、`Start chat`）；`Start chat` = 新建绑定人格的本地会话 +
    开场白进草稿 + 回聊天页（基线 resetApp+starter 的可观察等价）。
  - App：助手选择器从「More」菜单打开，不占用基线顶栏空间；绑定走
    「PATCH 成功才镜像」（本地 id 只改本地，随下次 save 落库）；删除人格
    时把所有本地已持有的会话解绑（内存 + 服务端 best-effort），避免下次
    save 带悬空 assistantId 被 400；`syncLibrary` 并行拉取人格列表（失败
    不阻塞主同步），老会话不含该字段由详情懒加载补齐。
  - `runtime.streamConversation` 显式带 `assistantId`（本地未落库会话也
    携带；服务端仍保留 session 行兜底）。
- Tutor 教学 UI：
  - `scaffolds.ts`（DOM-free）：`<quiz>`/`<practice>` 解析（仅首块成控件、
    余块只留题干/题干正文、坏块 fallback、`correct` 属性、
    `practiceAnswerMatches` 归一化）；解析不做围栏感知（与基线正则一致）。
  - `messageContent.ts`：`parseAssistantSegments` 先切 scaffold 段再走
    既有公式/脚注管线；新增 `parseRichText` 供控件字段复用同一数学变换。
  - `MessageContent.tsx`：`TutorQuizCard`（首答锁定、选项对错标记、
    反馈行、正确项/已选项高亮）与 `TutorPracticeCard`（提示开关、
    `correct` 时 Reveal + 自检反馈、提交后锁定）；`onQuizPick`/
    `onPracticeSubmit` 回调可缺省（控件惰性）。
  - App：发送管线改 `submitTurn(text, origin)`（composer 快照附件并清草稿；
    quiz/practice 保留用户草稿、不过附件管线）；tutor 阶段机与基线
    `_dispatchTurn` 对齐——exercise 回合一律 attempts+1、quiz origin 不推进、
    其余实质作答推一阶段（practice 长答可推进，同基线）；`onQuizPick`
    复刻 `handleQuizPick`（exercise 对→check+清零 / 错→+1；check 对→清零
    / 错→+1；仅「声明了正确项且选错」才发 `I chose …` 合成回合，其余
    仅在卡片内反馈）；`onPracticeSubmit` 恒发 `practicePrefix+answer`
    合成回合（前缀随语言），自检命中清零 attempts。
  - header 第三枚 chip（tutor 会话）：`🎓 阶段` + 练习 phase/attempts
    （`Intuition … Check`、`Foundation/Transfer ·N`）。
- 验证：`apps typecheck` 0、DOM-free 通过、`test:shared` 全绿（新增
  scaffolds 6 + assistantPicker 3 + api 2，messageContent +1）；
  `frontend lint` 0 error；`export:web` + `test:universal` **28/28**
  （14 spec × 双端，含新 `universal-assistant`、`universal-tutor-widgets`）。
- 已知差异（可解释）：首块之外 scaffold 以 markdown 渲染（基线转义为纯文本）；
  `universal-app.spec` 补 `/creations/items/assistants` 路由 mock（boot 现在
  会拉人格列表）。
- 下一轮（round 16-5，发布前门）：Windows/macOS storage 适配
  （Credential Locker/Keychain 替换内存占位）、EAS/包名决策、staging 联调 +
  真机签收（返回键/键盘/安全区/弱网）；候选加深：错题本、
  teaching plan 进度条、assistant 编辑入口。

## 23. 进展（第十六轮，2026-10-07，round 16-5：范围收敛 + 发布决策落地）

> 发布前门里可本地闭环的两个决策切片；staging 联调与真机签收仍开放
>（见下）。原定的 storage 原生适配随桌面出局而作废（§5 已改写）。

- **范围**：放弃 Windows/macOS 原生目标，只交付 Android / Web / iOS。
  §5 改写；`storage.windows.ts` / `storage.macos.ts` 注释与 apps README
  标记 DORMANT（原定 Credential Locker/Keychain 计划作废）；桌面需求由
  Expo Web 导出承担（localStorage 持久化，`release-clients.yml` 本就
  发的是 web bundle）。
- **包名（覆盖升级路径）**：`app.json` 从
  `com.topodrive.socrates.universal` 改为 **`com.topodrive.socrates`**
  （与冻结的 mobile 2.0.1/versionCode 3 同包名），`versionCode 1 → 4`、
  `version 0.1.0 → 2.1.0`——Android 只检查 versionCode 严格递增，
  versionName 不低于 2.0.1 避免观感降级。EAS 从 app.json 派生包名，
  `eas.json` 无需改动（preview 的 staging URL 仍是 `staging.invalid`
  占位）。
- **iOS 首次纳入**：`ios.bundleIdentifier = com.topodrive.socrates`；
  plugins 补 `expo-document-picker` / `expo-image-picker`（相机 + 相册
  用法字符串，对齐 mobile 配置）。语音输入在原生端本就
  `listenSupported() === false`（无识别器），不涉及麦克风/识别权限；
  expo-speech TTS 免权限。
- **验证**：`apps typecheck` 0；`export:web` ok；`export:android` ok
  （本机 Windows 默认 `%TEMP%` 拦截 hermesc 写临时文件，需
  `TMP=$PWD/.hermes-tmp` 覆盖后通过——环境问题，与配置无关）；
  `test:shared` **208/208**。
- **未做/阻塞**：staging 联调（等真实 staging 地址替换
  `staging.invalid`）；真机签收（返回键/键盘/安全区/弱网）与 iOS 真机
  构建（需 Apple 账号 / EAS）均超出本机能力。
- 已覆盖：assistant 编辑入口由 `AssistantsScreen` 提供创建/编辑/删除；下一轮候选保留错题本与 teaching plan 进度条。

## 24. 进展（第十七轮，2026-10-08，round 16-6：会话查找/分享 + UI parity 持续验证）

> 先修测试中的过期无障碍名称，再跑触及的 Universal E2E；几何和测得的样式对齐，但严格截图仍有非零差异，不能签收为 pixel-perfect 或完整功能 parity。

- **会话内查找**：`packages/ui` 的 `findMessageMatches` 为消息生成稳定匹配索引；`FindBar` 支持大小写无关查找、前后跳转、定位当前消息与清除；消息正文按匹配位置高亮。切换会话和离开 chat 时清空查询状态。
- **会话分享**：`ShareDialog` 支持 public/private 可见性、创建链接、复制、撤销；本地会话先保存并接管服务端 UUID；新增 `sessions.createShare/revokeShare` API 与 contracts 测试。Web 使用当前 origin，原生端使用配置的 Web origin。
- **手机顶栏与绘制基准**：恢复 active conversation 的新建对话按钮，顺序与 SPA 一致；修正模型切换器的紧凑 padding 和 caret 固定尺寸。正文手机字距为 `-0.10125px`。Universal Web 的 `color-scheme` 现在随 dark/light 主题同步；会话溢出菜单使用独立的 SVG glyph，使最近会话操作点与 SPA 对齐。
- **Tutor 教学计划视图**：知识侧栏现在保留每个子主题的掌握状态，并在当前项显示阶段和 `n/3` 深入回答计数；计数跟随本地 Tutor 会话更新。对齐基线的行信息结构，尚未移植 `kbContent` 知识图谱/边界详情，也未完成达到阈值后的节点掌握、排序切换和完整复习流程。
- **回归修复**：sidebar smoke helper 统一等待可见后再点击，修复 archive fixture 返回空列表；多个 smoke 用例共用 helper；`universal-chat` 加入发出消息后手机新建按钮仍可见的断言。修正过期 accessible names：`Listen to this message` → `Read aloud`、`Edit and resend` → `Edit message`；修正 `universal-app` 把聊天内查找误当成会话搜索的测试步骤。`universal-exam-generation`、`universal-files`、`universal-tools` 的 mock API teardown 主动关闭残留 keep-alive 连接，避免断言和截图完成后测试进程超时。Parity fixture 匹配 provider、tier、session UUID、find/share 顶栏状态和当前会话行，并检查 model brand、model/caret 几何及文字溢出。
- **验证**：`apps/socrates` typecheck、Web export、`test:shared` **208/208** 通过；修复 teardown 后，文件和工具两个手机用例 **2/2** 通过；完整 Universal Playwright 桌面 + 手机 **28/28** 通过。`ui-parity-check.mjs` 的 recents fixture 一致，几何、字体度量和可见 SVG 定义检查无差异；普通模式下非像素门禁为 0 failures。
- **像素差异（未签收）**：在 16-6 的基线上继续对齐 sidebar logo、`New` 徽标和模型品牌文字，并移除 RNW 聊天列表与最近会话列表的 identity transform；Inter 字体文件哈希一致。相同 Chromium、desktop `1440×900` 和 mobile `390×844` fixture 上，严格差分从桌面 `9 / 1,296,000` 收敛到 `1 / 1,296,000`（`0.0001%`），手机 `0 / 329,160`；桌面 `Δ>12`、`Δ>48` 均为 `0`。两边给消息工具 SVG 加 `crispEdges` 后，8 个曲线像素残差消失；当前仅剩 composer 右上圆角 `(1233,842)` 的 RGB `32` vs `33`。尝试只调 RN Web 圆角至 `28.5px` 没有消除该像素且破坏 28px 几何门禁，已回滚。严格桌面门禁仍失败，故不能签收 pixel-perfect。当前 fixture 只覆盖一个聊天状态；全屏覆盖、Android 真机和 iOS 签收仍未完成，因此也不能据此保证所有页面的像素级一致或全功能等价。
- **回归修复与验证**：`universal-exam` 手机用例完成截图后，mock server 的 keep-alive 连接未关闭，导致 teardown 耗尽 90 秒用例超时；加入 `closeAllConnections()` 后，单项手机用例 2.3 秒通过。完整 Universal Playwright 桌面 + 手机 **28/28**、`test:shared` **208/208**、`apps/socrates` typecheck 和 Web export 通过。此次计划视图修改后，再次运行 `test:shared`（全绿）、`apps/socrates` typecheck（通过）、`frontend npm run lint`（0 errors，629 warnings）和 Tutor 桌面/手机 E2E **2/2**；新增 E2E 验证 `0/3 → 1/3`。4175 有现存项目预览服务时，回归使用 `UNIVERSAL_PORT=4187`，未中断旧服务。严格截图产物保存在 `frontend/test-results/ui-parity/`。
- **下一步**：先解决 composer 圆角最后 1 个像素，再扩充不同聊天状态、页面和交互状态的截图基线；并补齐 Tutor 节点掌握/切换和知识图谱交互，再进行 Android 真机安全区、字体、键盘和返回键验收。真实 staging 地址和 iOS 真机签收仍是发布前门。未完成这些门禁前，不标记 UI 或功能 parity 完成。

## 25. 进展（第十八轮，2026-10-08，round 16-7：Tutor 节点推进验收）

- **测试修复优先**：Tutor E2E 的完成断言原本多发了一个自由回答。第 4 个总回答已达到练习阶段和深度阈值，正确地完成当前节点并把下一节点重置到 `Intuition · 0/3`；第 5 个回答会开始推进下一节点，所以旧断言错误地期待 `0/3`。将验收停在节点切换后，并明确检查 `Internalized`、计划进度 `1 / 5 (20%)`、`0/3` 和 `Intuition`。桌面 + 手机 Tutor E2E **2/2** 通过。
- **Tutor 行为推进**：`tutorProgressForTurn` 已覆盖基线门槛：仅 composer 的实质回答计入深度；达到 exercise 且深度至少 3 后将节点标为 internalized；按排序后的 teaching plan 选下一个未完成节点，并重置阶段、例题索引、练习次数和深度。共享单测覆盖提前完成、quiz 不计深度、节点状态和计划索引更新。知识图谱、节点详情/置信度/笔记、快照历史，以及基线完成节点后的过渡消息和自动追问仍待补齐。
- **移动端抽屉 parity**：侧栏改成覆盖式抽屉，主聊天列保持全宽，遮罩可关闭抽屉；Tutor E2E 检查遮罩、主列宽度、点遮罩关闭、打开知识面板及回到 composer 的流程。此前手机上侧栏会压缩聊天列，这轮修复恢复了基线抽屉体验。
- **严格视觉门禁**：复跑同一 Chromium chat fixture，desktop `1440×900` 仍为 **1 / 1,296,000** 不同像素（`(1233,842)`，RGB `32` vs `33`，`Δ>12=0`，`Δ>48=0`）；mobile `390×844` 为 **0 / 329,160**。尝试仅用于诊断的圆角微调会引入更多差异，未保留到产品代码。当前只能确认这一个 fixture，不能据此宣称全站 pixel-perfect。
- **验证**：`apps/socrates npm run typecheck` 通过；`apps/socrates npm run test:shared` **210/210** 通过；`frontend npm run lint` **0 errors / 629 warnings**；本轮受影响的 Tutor + chat 桌面/手机 E2E **4/4**；`git diff --check` 通过。E2E 使用 `UNIVERSAL_PORT=4187`，因为默认本地环回监听在受限环境中返回 `EPERM`；显式允许本地测试进程后通过。
- **下一步**：补齐 Tutor 知识边界图、可编辑节点详情和快照/跳转交互；继续定位 composer 最后一个像素差异并扩大真实截图状态矩阵。之后再做 staging 联调、Android 真机和 iOS 签收。严格像素门禁与跨页/跨设备功能覆盖完成前，不将 parity 标记为完成。

## 26. 进展（第十九轮，2026-10-08，round 16-8：Tutor 知识边界交互）

- **先修测试**：知识面板加入后，`Internalized` 同时出现在教学计划和知识边界分组里，旧 E2E 的唯一文本定位器变成多元素。测试改为定位第一个计划状态，并把互动细节放在节点推进断言后，避免“跳转”产生的自动追问污染前面的回复计数。
- **知识边界**：新增 DOM-free 确定性知识图谱布局函数，移植基线的 320×240、160 轮力导向布局、问题数半径与顺序连线；节点颜色区分内化/模糊/未探测，透明度映射 confidence。RN 共用侧栏现在显示图谱、状态分组、问题/验证计数、最后更新时间和存档按钮。
- **节点详情**：图谱节点和列表项均可打开同一详情面板；支持 1–5 置信度（再次点击当前值归零）、只读系统笔记、最多 500 字个人笔记（500ms 防抖保存）、最近 8 条快照历史。快照结构与基线一致，保存最多 30 条；session 本地先更新，已登录账户再按会话串行 best-effort 保存，服务端响应保留仍在更新的本地字段，避免并发回包覆盖笔记。
- **节点跳转**：跳转设置 `currentNode`、清零 `substantiveCount` 并自动发起该节点的下一条 Tutor 提问。`packages/chat` 增加 assistant-only turn：模型请求可携带内部用户提示，但该提示不会进入可见聊天记录，也不清除草稿；新增共享测试覆盖此契约。
- **严格像素检查**：复测 workbench chat fixture，mobile `390×844` 为 `0 / 329,160` 差异像素；desktop `1440×900` 仍有 `1 / 1,296,000` 差异（composer 右上角圆弧的单个通道差 1，`Δ>12=0`、`Δ>48=0`）。试验 RN Web `28.1px` 圆角未消除桌面残差，手机新增 100 个差异像素且圆角检查失败，已撤回到 28px。严格门禁仍失败，且只覆盖 workbench chat fixture；Tutor 图谱/详情及其他页面还没有 SPA 对照截图，不能宣称全站像素级一致。
- **验证**：`apps/socrates npm run typecheck` 通过；`apps/socrates npm run test:shared` 全绿；`frontend npm run lint` 为 0 errors / 629 warnings；Tutor 桌面 + 手机 E2E **2/2** 通过，覆盖图谱节点、笔记持久化、置信度、快照、节点跳转与自动追问；`git diff --check` 通过。严格 parity 复测保存在 `frontend/test-results/ui-parity/`，其桌面门禁仍报告 1 个像素差异。
- **下一步**：定位最后一个圆角栅格差异；把 parity fixture 扩展到 Tutor 教学计划、图谱、详情/编辑和手机抽屉，并增加不同主题与转录状态；随后补 Android 真机和 iOS 签收、staging 联调。全页截图门禁与功能路径覆盖完成前，UI/功能 parity 仍为进行中。

## 27. 进展（第二十轮，2026-10-08，round 16-9：Tutor parity 差异定位）

> 本轮定位 + 落地一项对齐：阶段徽标去 emoji（产品 1 行 + E2E 3 行），全量回归通过。

- **workbench fixture 现状不变**：desktop `1 / 1,296,000`（composer 右上圆角单通道差 1，
  `Δ>12=0`）、mobile `0 / 329,160`。转录区与顶栏在 Tutor desktop fixture 下同样
  **0 差异**——Tutor 的像素差全部落在侧栏内。
- **Tutor fixture 分区取证**（`PARITY_SAVE_SHOTS=1` + 像素带统计）：
  - desktop overview `6490`：侧栏头 y280–348 工具栏区 `2233`、计划区 `1869`、知识区
    `2387`；导航 y52–280 为 `0`。detail `23809`：计划区 `12667`、知识区 `8908`（节点
    详情面板展开态）。
  - mobile overview/detail 各 `52254`：抽屉顶部 y0–346 占 `14573`、抽屉内计划/知识
    约 `1706/4875`，其余 `31100` 在抽屉右侧透出的转录带（`Δ>12` 仅 `1279`，多为
    1–12 通道的遮罩/抗锯齿 subtle 差）。
- **逐项定性**：
  1. 教学计划阶段徽标：Universal 为 `🎓 Development`，基线 `tutorSocratic.js`
     `stageLabel()` 无 emoji（`Development`）。试改去掉 emoji 后 desktop overview
     `6490 → 4954`（`-1536`）、mobile 各 `-1019`——方向有效。
  2. 教学计划阶段徽标的 `🎓` 前缀与基线 `stageLabel()`（纯文本）不一致。按像素级
     一致的要求，该 emoji 已从产品侧删除（`TeachingPlanPanel` 改为纯
     `t[planStageKey(stage)]`，与基线逐字一致），3 处 E2E 断言同步改为按新增
     `data-testid="socrates-teaching-plan-stage"` 精确匹配 `Intuition`
    （`universal-tutor.spec.mjs:153`、`universal-tutor-widgets.spec.mjs:120,130`；
     顶栏无阶段徽标，原 `getByText('🎓 Intuition')` 只可能命中侧栏芯片）。
     全量 Universal **28/28**、`test:shared` 全绿、`typecheck`/`lint` 0 errors 下复测：
     desktop overview `6490 → 4954`、detail `23809 → 23140`、mobile 各
     `52254 → 51235`。不保留可解释差异口径——像素门禁即唯一标准。
  3. 移动端导航排序：Universal compact 排序
     （new/library/scheduled/plugins/projects/sites/more）与基线
     `polish/mobile-sidebar.css`（后于 `mobile-controls.css` 生效，tier=descartes
     时 Images 隐藏、Sites 显示）完全一致——**排序不是差异源**，之前怀疑不成立。
     抽屉顶部差主要来自 phone header（Universal 紧凑头为搜索+关闭，基线为
     sidebarOpenBtn 结构）与工具栏，待下轮逐行取证。
  4. 快照按钮/图谱容器在探针层面的 `display/fontSize/color` 差多为 RNW
     `Pressable>Text` 与基线原生 `<button>` 的结构性度量差，可见文本（`Save
     snapshot` 11px muted、图谱标题/说明）实际一致；kb 容器高度差（767 vs 601）
     来自基线快照历史等长尾内容，属内容量差而非样式差。
- **验证**：`apps typecheck` 通过、`test:shared` 全绿（24 文件 0 fail）、全量
  Universal desktop+mobile **28/28** 通过、`frontend lint` 0 errors、
  `git diff --check` 通过。净改动：`packages/ui/src/index.tsx` 1 行（去 emoji +
  加 testID）、2 个 E2E 共 3 行断言。
- **下一步**：对抽屉头/phone header 与 search/knowledge 工具栏做元素级对照
  （图标 glyph、内边距、选中态），node-detail 面板逐块对照后再谈阈值；composer
  1px 与本轮 Tutor 差在严格门禁（`PARITY_PIXEL_STRICT=1`，当前 5 failures）下
  仍失败，parity 结论保持“进行中”，不签收。

## 28. 进展（第二十一轮，2026-10-08，round 16-10：工具栏对齐 + 错题本最小切片）

> 不接受可解释差异口径后，工具栏的 Mistakes 缺口只能由真实功能补上。本轮即
> 错题本的第一片：入口 + 空态/列表视图 + 答错收录接线（重做/攻克动作后置）。

- **根因取证**（双端探针实测，非猜测）：基线工具栏为搜索框（w171）+ Knowledge
  36×36（`--ui-bg-surface` 选中底）+ Mistakes 36×36；Universal 只有 Knowledge
  32×32（`p.bg.hover` 底）且行 gap/radius 不一致。图标几何两边逐字相同
  （3 圆 + 连线，stroke 2），差的是尺寸/位置/底色。
- **对齐**：`surface` token 进 `UiSurfaceHex`（dark `#212121` / light `#f3f3f3`，
  与 `--ui-bg-surface` 同源）；选中底改用它；按钮 32→36（compact 保持 44，与
  基线手机端 hit-area 一致）；图标 compact ? 18 : 17（基线桌面 17/手机 18）；
  行 gap 4→2；搜索框 radius 12→10（透明底，workbench 无影响）。
- **错题本切片**（真实功能，非占位）：
  - `packages/ui/src/mistakes.ts`（DOM-free）：`buildQuizMistake`/
    `buildPracticeMistake`（收录条件与基线 `render/widgets.js` 一致：declared
    correct + 答错才落袋）+ `prependMistake`（newest-first）+
    `unresolvedMistakeCount`（badge 口径）；`mistakes.test.ts` 4 用例。
  - `Sidebar` 新增 `mistakes` 视图：toolbar 加 bookmark 按钮（与基线同形），
    面板标题 `Mistake Book` + 空态（与 `mistakes.empty/emptyHint` 同文）+ 行
    （题干 + 测验/练习·节点）。中英字典同步（`mistakes/mistakeBook/
    mistakesEmpty/mistakesEmptyHint/mistakeTypeQuiz/mistakeTypePractice`）。
  - App 接线：答错 quiz（与合成回合同门）/答错 practice 即记入当前会话
    `mistakes`（随会话 save 持久化，contracts 已有该列）；传 `mistakes` 给
    Sidebar（仅 tutor 会话）。
- **效果**：desktop overview `4954 → 2721`（工具栏区 **2233 → 0**，清零），
  detail `23140 → 20907`；mobile fixture 因截图时工具栏隐藏而无变化
  （仍 `51235`，主体是抽屉头 + 遮罩 subtle 差，下一轮目标）。workbench 保持
  桌面 1px / 手机 0。
- **验证**：全量 Universal **28/28**（含新增错题空态/收录断言）、`test:shared`
  全绿（25 文件，含新增 `mistakes.test.ts`）、`apps typecheck` 通过、
  `frontend lint` 0 errors（i18n 中英 key 相等）、`git diff --check` 通过。
- **下一步**：mobile 抽屉头（phone header 结构差）+ 右侧遮罩 subtle 差；desktop
  计划区残差 333、知识区 2387、composer 313；错题重做/攻克动作。严格门禁仍
  失败，parity 保持“进行中”。

## 29. 进展（第二十二轮，2026-10-08，round 16-11：图谱渲染对齐）

> 方法：双端探针取计算样式 + SVG 标记逐项对照，只改实测差，不猜。

- **坐标取整**：基线 `toFixed(1)`，Universal 全精度——`graphCoord` 取整后
  应用于边/圆/文本坐标与半径（与基线一致，先 round 半径再算文本 y）。
- **填充色精确值**（浏览器计算值取证）：internalized `#40bf80→#40BF75`
  （`hsl(145 50% 50%)` 实为 rgb(64,191,117)，B 通道差 11）、fuzzy
  `#e8c259→#E9BE53`（实测 rgb(233,190,83)）；blank `#808080` 两边一致不动。
  附带把 `tutorTheme.success` 同步为 `#40BF75`（唯一消费处即 done 标记）。
- **caption 缩放**：sidebar 区 caption 应为 `10×1.035=10.35`（`--sidebar-
  font-scale = app×0.92`），不是 `10×1.125`——11.25 会换行并把图谱下推；
  改用 `WEB_SIDEBAR_TUTOR_SCALE`。
- **外框**：实测已是 x20/y748/w219 两边一致；`aspectRatio 1.3293`（外宽/
  外高比）原本正确，一度误改为 4/3 又 revert——教训：先量后改。
- **计划标记**：done 色随 success 修正；字族改为基线 mono 栈（Web 专用，
  native 保持原样）；标题字距 `0.6→10×1.035×0.06=0.621`（逐字累积消除
  中段字形错位）。`--text-500` 取证为 50%，muted token 不动。
- **效果**：desktop overview `795 → 108`（Δ>12 仅 15；工具栏/转录/顶栏/
  kb-head 全部 0，kb-graph 残 448 中仅 73 强，plan 残 62）；desktop detail
  `20551 → 20520`（详情面板是独立大项，未动）；mobile 各 `-450` 左右
  （`51235 → 48841/48844`）。workbench 保持桌面 1px / 手机 0。
- **验证**：全量 Universal **28/28**、`test:shared` 全绿（25 文件）、
  `apps typecheck` 通过、`frontend lint` 0 errors、`git diff --check` 通过。
- **下一步**：detail 面板逐块对照（1.5% 级）；mobile 抽屉头 + 遮罩；composer
  1px；错题重做/攻克。严格门禁仍失败，parity 保持“进行中”。

## 30. 进展（第二十三轮，2026-10-08，round 16-12：详情面板内容对齐）

> 本轮最大教训在 harness：detail 面板在两边都在首屏之外，之前 20520 的
> “差异”基本是滚动噪声；一度修出的双端 0 是屏外空裁剪的假阳性。最终方案：
> 底部滚动保证面板入屏 + 按面板盒裁剪对比（`compareScreenshots` 新增 crop
> 参数），并上报双方面板尺寸（当前 desktop 243×356/358，mobile 225×344/358）。

- **滚动机制取证**：SPA 是 `#knowledgePanel` 自身滚动（flex:1+overflow），
  不是其父容器；面板顶因 max-scroll 钳制永远到不了视口顶（SPA 止于 462，
  UNI 止于 381），且 Universal 点按节点会自动滚 13px（SPA 不动）——滚动对齐
  不可能精确，裁剪对比才是正解。
- **详情内容逐项对齐**（全部探针取计算值，无猜测）：容器底/边
  （`#1a1a1a99` + `border-300/0.18`）、徽标色（internalized `#79D29E` /
  fuzzy `#EDCC78` + 同源半透明底，blank 沿用 hover）、徽标去大写（基线渲染
  `Fuzzy`原文）、go 按钮字号 12.375 + accent 改 legacy 白、labels 字号
  11.25/字距 0.675、置信点选中改 legacy 白、系统笔记 14.0625/1.55 +
  tertiary 色、输入框底改 `#1f1f1f` + 边 0.15 + 字号行高、历史行
  12.9375/1.5 + caption 色 + 日期字号/marginRight 6、行高补齐（labels/badge/
  go/history 的 RNW 缺省行高是 -6px/行的系统性来源）、去掉展开行
  hover 底与 currentMark 竖条（基线均无）、sectionCount 改 app 缩放、
  sectionTitle padding 10→12、questionCount 改 sidebar 缩放、verifiedTag
  色值字号修正。
- **事故**：一块 python 批量改写后文件出现不可见的语法损坏（肉眼/hex 正常，
  tsc/esbuild 同报 311 列错），二分到历史块后用 edit 工具逐段重写恢复。
  教训：TSX 禁止批量脚本改写，改完立即 typecheck。
- **效果**：desktop detail `20520 → 2769`（对齐后 real diff；另有 head 行高
  2px 一项就占 -74%），mobile detail `48794 → 24916`；overview 保持 108，
  workbench 保持 1px/0。
- **验证**：全量 Universal **28/28**、`test:shared` 全绿（25 文件）、
  `apps typecheck` 通过、`frontend lint` 0 errors、`git diff --check` 通过。
- **下一步**：徽章文本宽 4px 之谜（同文件同计算样式，canvas 本体一致，
  DOM Range 差 41.5 vs 37.5）、历史行残差、mobile 抽屉头 + 遮罩、composer
  1px。严格门禁仍失败，parity 保持“进行中”。

## 31. 进展（第二十四轮，2026-10-08，round 16-13：错题本重做/攻克 + 手机抽屉对齐）

> 错题本从“只收录”补到基线 `ui/mistakeBook.js` 的完整闭环（筛选、重做、攻克），
> 并清掉两项实测的手机抽屉色差。严格像素门禁仍未全过，parity 保持“进行中”。

- **错题本移植**（对照 `frontend/src/ui/mistakeBook.js`）：`packages/ui/src/mistakes.ts`
  改为基线记录形状（`id/type/topic/node/nodeIdx/q/options/correct/userAnswer/
  judgedAnswer/timestamp/redoCount/quizSlotId`），提供 `normalizeMistakes`、
  `quizMistakeFor`/`practiceMistakeFor`、`bumpMistakeRedo`、`mistakeRedoPlan`、
  `assignMistakeQuizSlot`、`removeMistakesForQuizSlot` 等纯函数，单测同步扩充。
  Sidebar 错题视图补齐 全部/未攻克/已攻克 筛选、错题卡（类型/主题/相对时间、
  选项对错标记、`已重做 n 次`）、Redo 按钮与工具栏角标。
- **重做/攻克**：Redo 递增 `redoCount` 并保存；原测验卡仍在转录中时按 slot
  原地重挂为新卡，否则（以及所有练习题）在转录尾部追加
  “— Redoing a question you got wrong —” 横幅 + 新卡，测验题改指向新 slot。
  在同一 slot 上答对即按基线 `removeMistakeForQuizSlot` 移除该错题（攻克）。
  与基线一致，不提供独立的“标记攻克”按钮。登录账户另 best-effort 镜像
  `POST /mistakes`（`packages/api` 新增 `mistakes.create` + 测试），会话数组仍是
  唯一数据源。
- **角标口径（决定）**：角标显示**未攻克**数量（基线显示总数）。因为攻克即
  移除，两者只在历史数据含已攻克行时不同；保留未攻克口径。
- **练习卡标题**：基线 `mountPracticeWidget` 与流式卡都解析 `<title>` 但从不渲染，
  默认 “Practice” 标题从 Universal 练习卡删除。
- **手机抽屉对齐**（探针取证）：基线 ≤768px 抽屉右边框为
  `--ui-border-default`（dark 10% 白，light 10% 黑），New chat 行与行 hover 为
  半透明洗色（dark 10% 白 / light 5% 黑，`restore/fixes.css`）；Universal 原为
  6% 白边框与不透明 `#292929`。compact 下改为相同的半透明值，桌面不变。
  另：手机抽屉阴影移除、手机用户气泡最大宽度 72%（前一段已做）。
- **像素（普通模式，exact 差异像素）**：

  | 状态 | 本轮前 | 本轮后 |
  |---|---|---|
  | workbench desktop / mobile | 1 / 0 | 1 / 0 |
  | tutor overview desktop | 330（新 fixture） | 108 |
  | tutor detail desktop | 2769 | 2769 |
  | mistake book desktop | 87,610 | 1 |
  | tutor overview mobile | 39,345 | 7,703 |
  | tutor detail mobile | 25,010 | 24,936 |
  | mistake book mobile | 114,648 | 7,429 |

  抽屉色修正单项贡献：mobile overview `17,404 → 7,703`、mobile mistake book
  `17,130 → 7,429`。严格模式（`PARITY_PIXEL_STRICT=1`）**7 failures**，仅 workbench
  mobile 通过。
- **验证**：`apps/socrates` typecheck 通过；`test:shared` **227/227**（25 文件）；
  `export:web` 通过（`EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4176/api/v2`，
  `check-api-bundle` 通过）；`check-packages-dom` OK；`frontend npm run lint`
  **0 errors / 629 warnings**；完整 Universal Playwright 桌面 + 手机 **28/28**
  （`UNIVERSAL_PORT=4187`，因单命令 120 秒限制分 4 批运行）；
  `ui-parity-check.mjs` 普通模式 0 failures；`git diff --check` 通过。
  `universal-tutor-widgets` 新增断言：角标 2→1、筛选（已攻克为空态）、练习 Redo
  显示 `Redone once` 并追加新卡且答对、测验 Redo 原地重挂、答对后错题行移除。
- **已知差异**：手机抽屉关闭后重开会回到 Recents 视图（Sidebar 重挂，基线 DOM
  常驻保留视图）；mobile detail 24,936 与 mobile overview/mistake book 约 7.4k
  残差（抽屉头 + 遮罩 subtle 差）；desktop detail 2769；composer 1px。
- **下一步**：抽屉视图状态提升到 App 以跨开合保留；抽屉头 / 遮罩逐像素对照；
  detail 面板残差。严格门禁仍失败，parity 保持“进行中”。

## 32. 进展（第二十五轮，2026-10-08，round 16-14：抽屉视图保持 + 手机抽屉像素对齐）

> 解决上一轮记下的“手机抽屉重开回到 Recents”差异，并把手机抽屉头、导航行、
> 页脚、知识视图逐项对到基线探针数值。手机 overview / 错题本两态普通与严格
> 像素均为 0；mobile detail 反而小幅回退，严格门禁仍有 5 项失败，parity 保持“进行中”。

- **抽屉状态提升**：基线 sidebar DOM 常驻，视图（Recents/Knowledge/Mistakes）与
  `#sidebar.search-open` 跨抽屉开合保留；Universal 手机抽屉关闭即卸载，所以把
  `view` / `compactSearchOpen` 提升到 `App.tsx`，Sidebar 改为可受控（未传时仍走
  内部 state）。非 tutor 会话只是隐藏 tutor 视图（显示 Recents），不再把已选视图
  重置，回到 tutor 会话即恢复。错题筛选按基线 `kb.mistakeFilter` 改为**按会话**
  存在 `session.mistakeFilter`（默认 `all`），随下一次会话保存一起提交（与基线
  `persistence.js` 一致，切换筛选本身不单独触发保存）。关闭按钮不再顺手收起搜索行。
- **手机抽屉像素**（探针取证，桌面不变）：抽屉头左右 padding 10（`.sidebar-inner`
  0 6px + `#sidebarHeader` 4px）、按钮间距 2；头部搜索改用新 glyph
  `search-header`（基线 `SidebarHeader.tsx` 的短尾 `m20 20-4-4`）；导航行加 1px
  透明边框（内容 17px 起、圆角背景经边框盒裁切）、22px 图标格、1.8 描边、0.92
  不透明度、gap 8；`New` 徽标与桌面同一 `.nav-new-badge` 盒（2px 6px、6px 间距、
  14px 行高），label 容器继承 14/20 字体；知识视图为 `.sidebar-inner` 内 241px 盒
  （左右各缩 6、内边距 8）并裁切溢出；教学计划进度条填充改为方头（只靠轨道圆角）。
- **知识图谱框**：基线 `svg.kb-graph` 为 `height:auto` + 1px 边框，所以是**内容盒**
  320:240（手机 201×151.25、桌面 219×164.75）；原来对边框盒取 1.3293 近似比例，
  改为边框内再包一层 `aspectRatio = 320/240` 的画布。坐标取整改为
  `Number(v.toFixed(1))`，节点标签 y 按基线用未取整的 r 计算。
- **手机页脚 + 账户菜单**：基线 ≤768px 页脚只绘制账户触发器（快捷图标
  `display:none`），241×58、24px 头像、15/21 名称 + 13/18 套餐；点击弹出账户菜单。
  **菜单目前只有“个性化 / 设置”两项**（新增 `accountPersonalization` /
  `accountSettings`，zh/en 键数一致 205/205）；基线 SPA 菜单里的 **Upgrade plan、
  Profile、Help、Sign out 尚未移植**，手机上主题切换也随快捷图标一起不再出现在
  页脚（基线同样隐藏）。菜单不响应点击外部关闭（关抽屉即卸载）。
- **E2E / 工具**：新增 `openSidebarSettings`（桌面点齿轮，手机走账户菜单 → Settings），
  app / providers spec 改用它；`universal-tutor-widgets` 手机断言改为“关抽屉再开仍在
  Knowledge / Mistakes 视图、无 Recents 标题”，删掉旧的“重开回 Recents”容错。
  `ui-parity-check.mjs` 新增 `PARITY_PROBE_JS`（在两端 tutor overview 截图前执行
  探针表达式，结果写 `test-results/ui-parity/probe-<label>.json`），默认不启用。
- **像素（exact 差异像素；“本轮前”为在本机 stash 本轮改动后重导出 16-13 实测）**：

  | 状态 | 本轮前 | 本轮后 | 严格模式 |
  |---|---|---|---|
  | workbench desktop | 1 | 1 | FAIL |
  | workbench mobile | 0 | 0 | PASS |
  | tutor overview desktop | 108 | 1 | FAIL |
  | tutor detail desktop | 2,861 | 2,861 | FAIL |
  | mistake book desktop | 1 | 1 | FAIL |
  | tutor overview mobile | 7,703 | 0 | PASS |
  | tutor detail mobile | 24,936 | 26,344 | FAIL |
  | mistake book mobile | 7,429 | 0 | PASS |

  注：上一节表里 desktop detail 记为 2,769，本机重测 16-13 为 2,861，以重测为准。
  普通模式 0 failures；严格模式（`PARITY_PIXEL_STRICT=1`）**5 failures**（3 项 PASS）。
- **mobile detail 回退**：exact 24,936 → 26,344（Δ>12 12,860 → 12,830、Δ>48
  7,854 → 7,849、mean 13.62 → 13.6，强差异略降）。定位为详情面板的滚动位置：
  Universal 面板高 356.3、基线 343.8，点节点后滚动落点不同导致整块错位；本轮
  未修。
- **验证**：`apps/socrates` typecheck 通过；`test:shared` **227/227**；`export:web`
  通过（`EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4176/api/v2`，`check-api-bundle`
  通过）；`check-packages-dom` OK；`frontend npm run lint` **0 errors / 629 warnings**；
  完整 Universal Playwright 桌面 + 手机 **28/28**（`UNIVERSAL_PORT=4187`，默认单
  worker、分 4 批）；`git diff --check` 通过。另：试用 `--workers=4` 时
  `universal-assistant` mobile 失败一次，单独重跑通过，按并行偶发记录。
- **已知差异**：账户菜单缺 Upgrade plan / Profile / Help / Sign out；mobile detail
  26,344（面板高度 / 滚动位置）；desktop detail 2,861；desktop 1px（composer）。
- **下一步**：详情面板高度差（356.3 vs 343.8）与滚动落点；账户菜单补齐其余条目；
  desktop detail 残差。严格门禁仍失败，parity 保持“进行中”。

## 33. 进展（第二十六轮，2026-10-08，round 16-15：composer 合成层 + 知识列表重建 + 账户菜单）

> 处理 16-14 记下的三类残差：desktop 1px（composer）、desktop / mobile 知识详情
> 大面积差异、账户菜单条目缺失。本轮结束时**严格像素门禁 8 态全部为 0**
> （`PARITY_PIXEL_STRICT=1`，0 failures），普通模式同样 0 failures。仅限当前
> parity fixture（1440×900 / 390×844，两条消息的 workbench + tutor 三态）；
> fixture 之外的界面与交互不在此结论内。

- **composer 1px（desktop）**：用 `PARITY_LAYERS=1`（CDP LayerTree）取证，基线
  `.main-bg` 带 `will-change: transform`，Chrome 因 Overlap 把 `#mainContent` 提升为
  独立合成层，原点在列左缘；composer 圆角边框在该层内光栅化，抗锯齿结果与画进
  根层不同（探针 (1233,842) RGB 32 vs 33）。给 `#socrates-main` 加 **仅桌面 web** 的
  `transform: translateZ(0)`，得到同样的层原点。手机不加：不加为 0，加了反而 62。
- **知识文件列表重建**：按基线 `renderKnowledgeBoundaryFile`（tutorSocratic.js）重写
  `KnowledgeBoundaryPanel` 的文件视图——Internalized / Fuzzy / Not yet explored 分节
  标题（新键 `kbSection*`，0.06em 字距）、`.kb-node` / `.kb-node-name` flex 行、
  桌面 20px 行盒 / 手机继承 1.5 行高；详情面板按基线 `toggleKBDetail` 插在快照历史
  之后；状态徽标大写；`→ Go` 标签行高对齐；知识视图底部 padding 10 → 12（基线
  `#knowledgePanel` 上下各 12）。文件列表子树加入 web 文本默认值覆盖
  （white-space / unicode-bidi / position 与 detail 子树同一套）。
- **字体子集 109**：探针（`PARITY_FONTS_SELECTOR`，CDP `getPlatformFontsForNode`）
  显示 `→ Go` 在 Universal 落到 DejaVu Sans（窄 1.64px）。基线拆分的
  `@fontsource/noto-sans-sc` 对 U+2192（→）、U+A5（¥）、U+2605（★）加载 subset
  109，而现有 chinese-simplified 文件不含这些字形。新增
  `apps/socrates/assets/fonts/NotoSansSC-109-{400,500,600}.woff2`，web 端以同一
  `Noto Sans SC` family + `unicode-range: U+a5,U+2192,U+2605` 注册。
- **详情备注 textarea**：基线是原生 `<textarea>`（`resize: vertical`），右下角画出
  拖拽柄；RNW 把 TextInput 重置为 `resize: none`。在 detail 子树里恢复
  `resize: vertical`——这是上一次中间测量里两个 detail 态各剩 18 像素的原因，本轮
  复测后归零。
- **账户菜单补齐**：桌面与手机页脚的身份行现在都是账户触发器
  （`socrates-sidebar-account-trigger`）。菜单按基线 `SidebarFooter.tsx` +
  `AnchoredMenu`：身份行（→ Settings）、Upgrade plan（打开
  `https://topodrive.top/pricing`）、Personalization、Profile（→ Settings，Universal
  的资料在设置里）、Settings、分隔线、Sign out（**仅已登录非访客**）；点击菜单外
  （侧栏内透明遮罩）关闭。**Help 未接入**：基线 Help 打开的是 SPA 快捷键速查表，
  Universal 没有对应界面，`onOpenHelp` 入口保留但 App 不传，所以不显示。
- **E2E / 工具**：新增 `frontend/e2e/universal-account-menu.spec.mjs`。
  `ui-parity-check.mjs`：Universal 探针的 `footerBtn` 跳过账户触发器（基线对应物是
  `.icon-btn` 快捷图标，触发器包住身份行后会被误选，导致上次 `footerBtn.size`
  失败）；新增仅诊断用的 `PARITY_LAYERS` / `PARITY_FONTS_SELECTOR` /
  `PARITY_CHROME_ARGS` 开关与 detail 截图前的 probe 调用，默认关闭，不改变比较逻辑。
- **像素（exact 差异像素，严格模式）**：

  | 状态 | 16-14 | 16-15 | 严格模式 |
  |---|---|---|---|
  | workbench desktop | 1 | 0 | PASS |
  | workbench mobile | 0 | 0 | PASS |
  | tutor overview desktop | 1 | 0 | PASS |
  | tutor detail desktop | 2,861 | 0 | PASS |
  | mistake book desktop | 1 | 0 | PASS |
  | tutor overview mobile | 0 | 0 | PASS |
  | tutor detail mobile | 26,344 | 0 | PASS |
  | mistake book mobile | 0 | 0 | PASS |

  全部 8 态 Δ>12 0、Δ>48 0、mean Δ0。16-14 记下的 mobile detail “面板高度
  356.3 vs 343.8 / 滚动落点”在知识列表按基线结构重建后一并消失，没有单独改滚动。
- **验证（最终代码）**：`apps/socrates` typecheck 通过；`test:shared` **227/227**；
  `export:web`（`EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4176/api/v2`）+
  `check-api-bundle` 通过；`check-packages-dom` OK；`frontend npm run lint`
  **0 errors / 629 warnings**；完整 Universal Playwright 桌面 + 手机 **30/30**
  （15 个 spec，含 universal-tutor / universal-tutor-widgets / universal-account-menu，
  `UNIVERSAL_PORT=4187`，单 worker）；parity 普通模式 0 failures、严格模式
  0 failures；`git diff --check` 通过。
- **已知差异 / 风险**：账户菜单无 Help（缺快捷键速查表）；Profile 指向 Settings 而非
  独立资料页；严格 0 只覆盖 parity fixture 的 8 个截图态，菜单展开态、其它主题 /
  语言、其它视口未做像素比对；`translateZ(0)` 是对 Chrome 合成行为的对齐，换浏览器
  或 Chrome 版本可能需要重新取证。
- **下一步**：把严格模式纳入常规 parity 门禁；考虑为账户菜单展开态、浅色主题、
  中文界面补 fixture；Help / 快捷键速查表是否移植待定。
