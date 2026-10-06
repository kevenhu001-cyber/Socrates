# Socrates Universal App (`apps/socrates/`)

React Native + Expo + React Native Web + Zustand + Reanimated。
同一套 `Sidebar` / `ChatMessageList` / `Composer`（来自 `@socrates/ui`）跑 Web + Android。

## 运行

```bash
cd apps/socrates
npm install
npm run typecheck
npm start            # Expo dev（扫码 / 按 w 跑 Web / a 跑 Android）
npm run export:web   # Web 产物（RN Web bundle）
```

## 结构

```text
App.tsx                    # 三件套装配 + SSE 流式（streamConversation）
src/runtime.ts             # api client + startChatStream（经 @socrates/api）
src/storage.ts             # 默认 memory（测试/SSR 安全）
src/storage.web.ts         # localStorage 适配（Web）
src/storage.native.ts      # SecureStore（Android/iOS 默认）
src/storage.android.ts     # Android 显式适配
src/storage.windows.ts     # Windows 占位（memory → Credential Locker）
src/storage.macos.ts       # macOS 占位（memory → Keychain）
src/ArtifactIsland.*.tsx   # TipTap/tldraw/viz/Mermaid/Three.js 的 WebView 岛
src/EmbeddedIslands.ts     # 哪些 kind 走 WebView（isWebViewIsland）
```

共享逻辑在 `packages/`（`core/contracts/api/chat/auth/settings/platform/theme/ui`），
全部 DOM-free（`node scripts/check-packages-dom.mjs`）。平台差异只留在
`src/*.web|android|windows|macos|native.ts(x)`。

> 单 React 铁律：bundle 里只能有一份 `react`，否则 renderer 与 hooks 用的
> dispatcher 不是同一个，Web 首屏白屏并报 `Cannot read properties of null
> (reading 'useCallback')`。`packages/*/node_modules` 里**不许出现实体的
> `react`/`react-dom`**——`packages/auth/node_modules` 中的 `react`/`zustand`
> 只是指向本目录 `node_modules` 的 symlink（给 `node --test` 解析用，
> realpath 后仍是同一份）。验证：`export:web --dump-sourcemap` 后
> sourcemap 里 `node_modules/react/cjs/react.production.js` 只能出现一次。

## 基准

`frontend/` 是视觉/功能基准。先对齐三件套（sidebar 280 / 消息 maxWidth 768 /
composer 圆角 24 / light+dark），再按 `docs/plans/universal-app-migration.md`
逐模块扩大（Chat/Composer → Sidebar/Nav → Auth → Settings → Library/Projects →
Search → Agent/Tools → Editor/Canvas）。
