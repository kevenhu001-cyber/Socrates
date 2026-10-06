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
