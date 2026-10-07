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
