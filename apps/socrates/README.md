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
src/ArtifactViewer.tsx     # 岛预览面板 + ArtifactBridgeMessage(ready/resize/openLink/copy/share/error) 闭环
src/artifactBridge.ts      # 各端岛适配器共享的 props / 协议类型
src/EmbeddedIslands.ts     # 哪些 kind 走 WebView（isWebViewIsland）
src/attachmentUpload.*.ts  # 发送时附件落库（POST /files + sessionId）
src/FilesScreen.tsx        # 文件库（列表 / 预览 / 删除）
src/FilePreview.tsx        # 文件预览浮层（图片 raw 源 / 文本预览 / 下载）
src/fileAccess.*.ts        # 受权的原始文件取数：Web blob URL / 原生 headers + 下载
src/useFileImages.ts       # 把消息里 /files/:id/raw 图片解析成平台图源
src/share.*.ts             # 岛内分享（Web navigator.share / RN Share）
```

可视化消息的卡片与文档生成在共享层
`packages/ui/src/{visualization,artifacts,artifactDocument}.ts`：DOM-free 地把
`render_visualization` v1 spec / `html`、`mermaid`、`three`、`viz` 栅栏转成自包含 HTML，
卡片只显示摘要 + “打开”，重型文档在沙箱岛中渲染，不进消息列表或共享核心。

文件作品闭环
附件落库后带 `fileId`；消息里的附件卡与 markdown 图片（`/api/files/:id/raw`）
经 `useFileImages` + `fileAccess` 用带鉴权的取数解析（Web 转 blob URL，原生走
headers），并可下载；侧栏 “打开文件” 进入文件库（列表 / 文本预览 / 删除）。
原始字节只经 `/api/files/:id/raw`（`optionalAuth`）读取，不落公开 URL。

工具卡与产物
`packages/ui/src/toolModel.ts`（DOM-free）把 ToolCall 归一出标签 / 单行输入预览 /
状态 / 耗时 / 搜索结果 / 产物；卡片展开后显示参数、stdout+stderr、来源卡
（标题 / 域 / 摘要 / 日期）、产物图片内联（经鉴权 raw 解析）、HTML 产物在岛中打开、
其他文件进文件预览。实时 SSE 的 `artifacts` / `durationMs` / `retryable` 由
`packages/chat/src/turn.ts` 保留，与持久化行同形渲染。

考试面
`packages/ui/src/examModel.ts`（DOM-free：题目解析、判分规则、出题 prompt 与响应解析）+
`packages/ui/src/ExamView.tsx`（选择题 / 填空 / 简答作答、交卷门禁、本地判分与解析）。
`src/ExamSetupScreen.tsx` + `src/examGeneration.ts` 提供 App 内出题：逐题经
`/chat/stream` 生成（可取消、进度可见），完成后建成 `kind='exam'` 会话并
`api.sessions.save` 落库；答案防抖经 `sessions.patch`（`kind`/`examData`）持久化，
重新打开即恢复判分结果。会话列表用 🗒 标记考试。


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
