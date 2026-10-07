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

## 5. 桌面端

- Windows：React Native Windows；macOS：React Native macOS。
- 平台功能通过 `*.web.ts` / `*.android.ts` / `*.windows.ts` / `*.macos.ts`
  做少量适配（storage/clipboard/network/push/speech/statusbar）。
- 当前占位：`storage.windows.ts` / `storage.macos.ts` 用 memory store，
  后续换 Credential Locker / Keychain，不碰 `packages/`。

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
