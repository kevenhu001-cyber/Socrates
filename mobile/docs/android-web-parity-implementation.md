# Web → Android 对齐审查与实现记录

正式 Android 客户端是 `mobile/` 下的 Expo + React Native 应用，入口为 [`App.tsx`](../App.tsx)；旧 `capacitor/` wrapper 和独立 demo 均未作为移植目标。上一轮从干净的 `ac47d4ba` baseline 建立本地分支 `feat/android-web-parity`；本轮在该分支继续，未切换分支，并保留已有未提交改动。本轮没有修改 `frontend/` 源码，也没有提交、推送或创建 PR。

## 网页结构与 Android 实现映射

| 网页端 | Android 正式实现 | 对照结果 |
|---|---|---|
| SPA 导航、SidebarNav 和浮层 | [`App.tsx`](../App.tsx) 的 native stack、[`AppDrawer`](../src/components/AppDrawer.tsx) 和登记过的 Embedded targets | 使用原生 screen 与 Android 返回键；不把整个网页装进 WebView，可嵌入目标仍受 manifest allow-list 限制。 |
| Home / `#topicSetup`、网页 [`homeSurface.js`](../../frontend/src/ui/homeSurface.js) | [`NewChatScreen`](../src/screens/NewChatScreen.tsx)、[`HomeQuickActions`](../src/components/HomeQuickActions.tsx)、[`Composer`](../src/components/Composer.tsx) | 补回网页当前三个快捷动作并连接真实行为，详见下文。 |
| Chat、Composer tools、SSE 消息流 | [`ChatScreen`](../src/screens/ChatScreen.tsx)、`appStore`、SSE client、`MessageBubble`、`ToolCard` | 保持现有流式消息、停止/重试、附件、消息操作和受控 HTML artifact 路径；本轮未重写聊天后端。 |
| 网页 `WorkspacePage` / workspace.css | [`LibraryScreen`](../src/screens/LibraryScreen.tsx)、[`libraryFilters.ts`](../src/data/library/libraryFilters.ts) | 对齐 files + artifacts 混合展示、collection/type 筛选、搜索、上传、预览、重命名/删除与视图切换。 |
| 网页设置 / Profile / Display | [`SettingsScreen`](../src/screens/SettingsScreen.tsx)、`DisplaySettingsScreen` 及现有 Profile sheet | 复用正式移动状态/API；设置以原生整页/弹层承载，几何仍需设备截图验收。 |
| 网页主题 tokens、dark/light 和 locale | [`theme.ts`](../src/theme/theme.ts)、ThemeProvider、[`strings.ts`](../src/i18n/strings.ts) | 沿用项目共享 token 和中英翻译，不另造品牌色；由 parity/theme gate 检查。 |

## 本轮完成

首页重新出现网页当前的 Upload、Write、Research 操作，且每项都可单独关闭并有无障碍标签。Upload 打开现有原生 Composer 工具菜单，Write 选择 `write` extension，Research 切换既有 web-search 状态；这与网页的 [`homeSurface.js`](../../frontend/src/ui/homeSurface.js) 行为相对应，而不是新建另一套“研究服务”。

手机 Composer 的 resting 状态改为网页手机端的两行结构，不再先显示单行胶囊、聚焦后才切换布局；保留原生输入法、附件 picker、语音和系统安全区交互。`appStore` 原本已有每轮最多 6 个附件的限制，本轮补上 picker 返回后的 25 MiB 单文件预检，并新增超限时不会调用上传 API 的单测。

Library 手机标题与 New/偏好设置同排，搜索与类型筛选/视图按钮共用一行；列表密度、图标和文件类别颜色按当前网页手机 CSS 校准。页面现在能混合展示文件与 artifacts，提供五个 collection chips、七类文件类型筛选、搜索、New/上传、预览、重命名、删除以及 list/grid 控件。筛选分类抽成可测纯函数，交互补上 tab/button/selected 等无障碍状态。

有一项差异必须以网页当前代码为准：网页 Grid 按钮会切换 `viewMode` 并添加 `view-grid` class，但 frontend 当前没有 `.library-list.view-grid` 布局规则；Android 提供可工作的两列网格，是实现意图而非声称网页当前已有相同网格像素。

主题、翻译与 parity 文档也已更新。`parity-manifest.json` 的 Web baseline 从过期的 `a722b35d…` 改为当前前端 commit `b905fea4…`；同时更正工具审批和 Prompt Templates 状态描述，避免把服务端禁止的审批操作误报为 Android 缺陷，或把本地模板持久化误报为服务端同步。

## 验收结果

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 通过。 |
| `npm test -- --runInBand` | **36 suites、216 tests 全部通过**；仍有既有 `NewChatScreen.test.tsx` React `act()` 与 Expo Notifications 开发期警告，无失败。 |
| `npm run check:parity` | 通过：18 routes、8 overlays、892 translated keys。 |
| `npm run check:theme` | 通过：网页 CSS、共享 tokens、RN 颜色表与移动字体门禁一致。 |
| Release APK | 仓库 CI 的 `assembleRelease` 成功；`apksigner verify` 与仓库 `verify:apk` 均通过，包含 arm64-v8a、armeabi-v7a、x86、x86_64。使用 Android debug certificate，可本地安装测试，不是 Play Store 发布签名。 |

Expo Web 代理在 **390×844** 暗色视口验证了 Library 列表、两列网格和图片类型筛选；Home 有暗/浅主题手机代理图。这些不是 Android 原生设备截图：[`Home 暗色`](/workspace/Socrates/mobile/dist/visual-evidence/home-390x844-dark.png)、[`Home 浅色`](/workspace/Socrates/mobile/dist/visual-evidence/home-390x844-light.png)、[`Library 列表`](/workspace/Socrates/mobile/dist/visual-evidence/library-list-390x844-dark.png)、[`Library 网格`](/workspace/Socrates/mobile/dist/visual-evidence/library-grid-390x844-dark.png)。

## 尚未完全对齐或尚未设备验收

1. **原生像素签收未完成。** 当前环境没有 `adb`、Android emulator 或 `/dev/kvm`，因此不能声称全 App UI 完全一致。尚未在设备上检查 390×844、412×915、768×1024、1440×900 的全视口矩阵，也没有完成 light/dark/system、英/中、键盘、TalkBack 和各数据状态验收。上面的首页与 Library 截图仅是快速 Expo Web 代理。
2. **网页浏览器截图参考受到 WASM 输入缺失限制。** 尝试只读构建 frontend 时，Vite 无法解析生成文件 `frontend/wasm/socrates_wasm.js`；本机也没有 `wasm-bindgen` CLI 或 `wasm32-unknown-unknown` Rust target，因此没有运行完整网页 E2E。没有为绕过错误修改网页源码或伪造生成物；源码对照依据仍是仓库当前 React/CSS/JS。
3. **图片附件处理（第二轮已实现，设备侧仍待签收）。** Android 现在会下采样/重编码并上传服务端文件引用；细节与剩余设备验证见“第二轮增量”。
4. **其他页面能力仍需逐页对照。** Images/Assistants 页面和 Workspace Agent `agent_step` 流程已有 mobile 实现；仍有 UI 几何、light/dark、IME 和 TalkBack 等差异未完成设备签收。抽屉搜索行为已存在，设置仍使用原生整页/弹层。
5. **工具审批不是可伪造的 Android 控件。** 当前服务端能力声明为 `approvalPolicy: 'never'`，不会发送审批帧；因此本轮没有添加 Allow/Decline。只有在后端提供并验证审批协议后，这项能力才有一致实现的基础。

完整对照矩阵及登记状态见 [`frontend-parity.md`](./frontend-parity.md)；`mobile/` 是本轮唯一应用源码修改范围。

## 本地交付文件

Release APK：[`socrates-android-2.0.1-local-release.apk`](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-local-release.apk)，大小约 162 MiB。SHA-256：`8d95af4b4b1aabeb2f5304c1f0b190333b7838add2fb8f22365d9043cff1b35e`；校验文件：[`socrates-android-2.0.1-local-release.apk.sha256`](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-local-release.apk.sha256)。

完整源码审查补丁：[`android-web-parity.patch`](/workspace/Socrates/mobile/dist/android-web-parity.patch)，包含新增源码/测试文件与文档差异，不包含 APK。


补充说明：本仓库的 `mobile/android` 是由 Expo prebuild 生成且被 Git 忽略的原生构建目录；正式可维护的 Android 源代码在 `mobile/src`。本轮从这套正式源树构建 APK，没有把旧独立 demo 或临时生成的 Java/Kotlin 工程当成主应用。

## 第二轮增量（2026-10-04）

本节覆盖上述“尚未完全对齐”列表所记录的第一轮状态；此前 APK、校验和与 `android-web-parity.patch` 均保留为历史交付，不作为第二轮源码的最终 APK。

### 实现

- 新增 [`CreationsScreen`](../src/screens/CreationsScreen.tsx)，从 More 进入，提供 Images 列表/生成/提示词编辑，以及 Assistants 列表/创建/编辑/删除。`creationsApi` 仅使用已核验的 `/api/creations/images`、`/edit` 与 `/items/assistants` CRUD 契约。图片生成只在用户操作页面按钮时发生；开发验证使用 mock，没有实际调用生成服务。
- 图片附件改用 Expo 原生 ImageManipulator（尺寸可读取时将长边下采样至 2048）、压缩重编码（GIF 保留动画），然后通过现有 `/api/files` 上传；小 payload 保留 inline data，大 payload 走 `fileId`/持久文件引用。进一步核验发现共享 history builder 不会自动把 `fileId` 转成模型可发现的附件指针；移动端现在通过 `attachmentPointers.ts` 附加 server 已支持的 `[Attached file: … — fileId: …]`，可让 `read_attachment` 读取大图，同时不修改 shared core/server/frontend。
- Prompt Templates 在登录恢复完成后同步，避免 access token 初始化竞态；按 server cursor 拉取完整账户列表，映射服务器 UUID，上传本地-only 模板，服务失败不阻断 secure-storage 本地缓存。API 契约已核验 `/api/prompts`；guest/offline 状态仍仅本地可用。
- ToolCard 加入 Code/Bash live preview。Workspace Agent 服务端会真实发送 `agent_step`；共享 `@socrates/core` 尚不分发此事件，但 mobile SSE client 已在 `mobile/` 内作窄范围适配，并更新同一 tool-call 卡片的阶段标题、详情与运行/结束状态。
- `tool_approval` 不实现为等待审批 UI：服务端当前声明 `approvalPolicy: 'never'`，未发送审批帧，也没有供本轮对齐的审批决策流；移动端只保留既有安全状态呈现代码，不宣称可审批。

### 第二轮验收

| 检查 | 第二轮结果 |
|---|---|
| 定向 Jest | Creations、SSE、Prompt pagination、attachment pointers/uploads、tool state：6 suites、41 tests passed。 |
| 全量 Jest | **38 suites、230 tests 全部通过**（含 fileId pointer adapter）；既有 NewChatScreen `act()` 与 Expo Notifications 开发期 console warnings 仍会打印，无测试失败。 |
| `npm run typecheck` | 通过（包含 Creations 与 mobile `agent_step` adapter）。 |
| `npm run check:parity` | 通过：19 routes、8 overlays、914 translated keys。 |
| `npm run check:theme` | 通过。 |
| Release APK | `NODE_ENV=production ./gradlew --no-daemon :app:assembleRelease` 通过；最新 Metro bundle 含 1857 modules。`verify-apk.mjs`、`apksigner verify`（v2）、`zipalign -c -p 4` 和 APK 内 bundle 检查均通过；含 arm64-v8a、armeabi-v7a、x86、x86_64。Package `com.topodrive.socrates`，version `2.0.1` / code `3`。使用 Android Debug signer，仅供本地安装测试，不是 Play Store 发布签名。SHA-256：`e382a210c52f496d8c4951e7c3dcb0677e2136e1fe876f563c8b6877153128d5`。 |
| Android 设备/模拟器 | **未验收**：当前机无 `adb`、模拟器和 `/dev/kvm`；本轮不声称原生设备 UI 验收通过。 |

### 第二轮交付路径

- 新增源码补丁：`mobile/dist/android-web-parity-round2.patch`；不覆盖首轮 `android-web-parity.patch`。
- 新增最终 Release APK：[socrates-android-2.0.1-round2-release.apk](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round2-release.apk)，169,135,272 bytes；SHA-256 校验文件：[对应 `.sha256`](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round2-release.apk.sha256)。首轮 APK/校验文件未覆盖。


## 第三轮增量（2026-10-04）：Composer 焦点与流式文本

本轮继续在 `feat/android-web-parity` 上做增量修改，只改 `mobile/` 源码并保留此前未提交改动、round2 APK/校验文件和补丁；没有 checkout、reset、stash、提交、推送或创建 PR。

### 先对照网页与 Android 的现行行为

网页当前并没有“聚焦即把单行 Composer 高度从 54px 扩到 116px”的实际行为。`frontend/src/styles/legacy/06-chat-transcript.css` 中仍留有这句说明，但当前 `frontend/src/react/composer-input/RichComposer.tsx` 明确把 focus 视为交互状态、把几何变化交给实际换行内容；`frontend/e2e/mobile-home-visual.spec.mjs` 也断言手机端聚焦前后高度差不超过 2px。现行 `frontend/src/styles/parity/composer-unified.css` 描述手机布局为常驻两行。也就是说，这条 54→116 是过期注释，不能当作网页现状照搬。

网页键盘升起时的上移来自另一条路径：`frontend/src/ui/keyboard/geometry.ts` 测量 `visualViewport`，`keyboard/index.ts` 随几何事件同步写 `--keyboard-inset`，并在同一事件内调用 `TranscriptAnchor.correct()`；避免再叠一个独立动画去追键盘。Android 改动前，`Composer.tsx` 的 `isExpanded = isCompact || focused || …` 在手机宽度上恒为 true，因此聚焦不会改变 Composer 容器高度或位置；工具区也没有独立的 focus 展开状态，看到的上移主要来自已有的 Android `adjustResize` / `KeyboardStickyView`。

消息流方面，Android **原本已逐次累计并显示 SSE delta，并非等完整回答才一次性渲染**：`appStore.appendAssistant()` 更新 `rawText`，`MessageBubble` 将它传给 `Markdown` 且保留 `streaming` 状态，`MarkdownView` 对每个可见文本版本解析一次并显示光标。差异是原生固定每 64ms 才提交一次（首个 delta 也要等这一拍），而网页 `frontend/src/react/chatRuntime.bridge.ts` 首个 delta 立即提交，之后按文本长度以 50/80/120ms 合并，并由 `requestAnimationFrame` 落屏。Android 的 Markdown renderer 每次提交仍会对当前全文 parse 一次；现有 `useMemo([text])` 和消息/块组件的 memo 避免同一提交中的重复工作，但它没有复用网页式的稳定前缀 DOM。

### 本轮实现

按这次明确提出的“空闲态—聚焦态”目标，Android 手机 Composer 现在在空闲时收起工具轨，聚焦后展开输入/工具区，失焦或 Android Back 收起键盘后回到空闲态。**这是为目标体验新增的 Android 状态转换，不是网页手机现有布局的逐像素复制**（网页手机目前常驻两行）。紧贴软键盘的垂直移动仍只交由 `KeyboardStickyView` 跟随 Android IME；没有另加 `KeyboardAvoidingView` 或第二份键盘 padding。`Screen` 和既有 safe-area 容器保持不变。

焦点转换保留同一个原生 `TextInput` 实例，避免为显示工具区重新挂载输入框而打断 IME。手机空闲壳体最小高度 64px，聚焦工具轨打开后为 104px；布局用 220ms、无过冲的 ease 曲线，工具轨用 190ms cubic ease-out 淡入并从 8px 上移到位。系统启用 Reduce Motion 时取消布局动画并直接设定工具轨终态。键盘隐藏事件会主动 blur 仍处于焦点的输入框，避免 Android Back 后留在“无键盘但工具栏仍展开”的状态。

`ChatScreen` 新增列表高度变化重锚：仅当用户此前正贴底时，在每次实际 `FlatList.onLayout` 后的下一帧重新贴底；用户正在读历史时不会被强制拉到底。已有 `KeyboardStickyView` 仍是 composer/error cluster 唯一的 IME 位移来源，`keyboardDidShow` 只保留作粗粒度 resize 设备的末尾兜底。

SSE 保留累计 buffer：首个非空文本 delta 现在立即 flush；之后小于 2,000 字符按 50ms、2,000–7,999 按 80ms、8,000 及以上按 120ms 合并提交，拼接每批 delta 后更新 `rawText`/`content`，不丢中间块。没有把流式 Markdown 延迟到完成后。未闭合代码围栏仍显示可读源码；未闭合 math/viz 不会提前交给 WebView/typesetter；未完成的 widget 尾部继续隐藏，streaming 光标保留。这样匹配网页的首帧与节奏，又用更长回答更低的重绘频率控制原生全文 parse 成本。

### 第三轮回归与 APK 验收

新增回归覆盖了 Composer 聚焦显示工具轨、失焦收起且输入框身份不变；MessageBubble 对累计中文 delta 和未闭合代码围栏持续输出可读前缀；AppStore 首个 delta 立即可见、后续 delta 在窗口到期后累计且不丢字；cadence 的 2,000/8,000 字符边界。验收结果：

| 检查 | 第三轮结果 |
|---|---|
| 定向 Composer / stream Jest | 通过：focus/blur、累计中文 delta、partial code fence、首 delta 与 cadence 边界回归通过。 |
| 完整 Jest | **40 suites、235 tests 全部通过**。 |
| `npm run typecheck` | 通过。 |
| `npm run check:parity` | 通过：19 routes、8 overlays、914 translated keys。 |
| `npm run check:theme` | 通过。 |
| Expo Web / DOM 尺度验证 | `expo export --platform web` 成功；`scripts/visual/capture.mjs 06-composer-focused` 的 phone 和 wide 状态均通过（2/2）。手机图为 **390×844 CSS viewport、Expo Web/DOM 的非原生示意**，没有真实 Android IME；[查看图](/workspace/Socrates/mobile/dist/visual-evidence/NON-NATIVE-expo-web-composer-focused-390x844-round3.png)。 |
| Release variant APK | `assembleRelease` 成功。`verify-apk.mjs` 确认 arm64-v8a、armeabi-v7a、x86、x86_64 均含 React Native core；`apksigner verify` 的 v2 签名验证通过；`zipalign -c -v 4` 和 `unzip -t` 通过。与 round2 一样，仓库缺少 `ANDROID_KEYSTORE_PATH` / release 签名变量，因此使用 Android Debug signer：可用于本地安装测试，**不是 Play Store 发布签名**。SHA-256：`afa58c5fa809c7166fb4de0a86928b2264839ed2b200f672ea3cb1ddb0ac4598`。 |
| Android 设备视觉验收 | **未执行**：当前环境没有 `adb`、`emulator` 或 `/dev/kvm`；没有真实 IME 动画帧、键盘遮挡或原生尺寸截图可供签收。 |

新增 round3 Release APK：[socrates-android-2.0.1-round3-focus-stream-release.apk](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round3-focus-stream-release.apk)（169,141,544 bytes），校验文件：[对应 `.sha256`](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round3-focus-stream-release.apk.sha256)。本轮源码增量补丁：[android-web-parity-round3-focus-stream.patch](/workspace/Socrates/mobile/dist/android-web-parity-round3-focus-stream.patch)。round2 APK、其校验和与补丁均保留，round2 APK 的原 `.sha256` 复核仍为 `OK`；本轮工作树分支仍为 `feat/android-web-parity`，没有提交或推送。


## 第四轮增量（2026-10-04）：聚焦高度与网页手机布局一致

本节是 round3 焦点行为的修订，不覆盖或删除 round1–3 历史记录、APK、校验和或 patch。round3 当时使用的“失焦收起工具轨、聚焦扩高”与网页现行手机行为不一致；按完整 parity 优先，本轮将手机端恢复为静止态两行且聚焦前后 Composer 几何不变。范围仍仅限 `mobile/`，继续在 `feat/android-web-parity` 上工作；没有 reset、stash、checkout、提交、推送或创建 PR。

手机端（`isCompact`）现在始终渲染两行 Composer：外壳最小高度 104dp、工具轨预留 48dp。焦点只改变输入框的焦点边框/阴影，不触发布局动画、工具轨淡入或上移；工具轨从首帧起保持可见。多行文本、附件及上下文 chips 的实际内容增长行为仍保留。原生 `TextInput` 沿用同一实例，不在 focus/blur 时重新挂载。

软键盘仍只通过现有 Android `adjustResize` 与 `KeyboardStickyView` 路径推动底部输入区/消息视口；没有增加第二套 keyboard padding、`KeyboardAvoidingView` 或 Composer 自身的键盘位移动画。聊天列表原有“用户此前贴底时随真实视口布局帧重锚”与 `keyboardDidShow` 粗粒度兜底均保留。round3 的流式修复未改动：首个文本 delta 即时提交，后续仍按 50/80/120ms 自适应合并；partial Markdown、未闭合代码围栏可读文本、已有键盘期间的列表锚定与流式光标均保留。

### 第四轮验收

| 检查 | 第四轮结果 |
|---|---|
| Composer 聚焦几何回归 | 通过：定向 Jest 4 tests；检查 104dp 外壳、48dp 工具轨、编辑器高度/对齐在 focus/blur 前后一致、输入框实例不变，且不调用 `Animated.timing` 或 `LayoutAnimation.configureNext`。 |
| 完整 Jest | **40 suites、235 tests 全部通过**。仍能看到 round3 已记录的 `NewChatScreen` React `act()` 和 Expo Notifications 开发期 console 警告；均非测试失败。 |
| `npm run typecheck` | 通过。 |
| `npm run check:parity` | 通过：Web baseline `b905fea4`、19 routes、8 overlays、914 translated keys。 |
| `npm run check:theme` 与 `git diff --check` | 均通过。 |
| Release APK | 使用最终源码执行 `NODE_ENV=production ./gradlew --no-daemon :app:assembleRelease`，构建成功；包名 `com.topodrive.socrates`，版本 `2.0.1` / code `3`。`verify-apk.mjs`、APK v2 签名校验、`zipalign -c -v 4`、`unzip -t` 和四 ABI（arm64-v8a、armeabi-v7a、x86、x86_64）检查全部通过。使用 Android Debug signer，可本地安装测试，**不是 Play Store 发布签名**。 |
| Android 设备与真实 IME 帧 | **未验收**：当前环境无 `adb`、emulator 或 `/dev/kvm`。因此不能声称已验证真实设备上的 IME 逐帧平滑度、键盘遮挡或原生截图；这些仍需设备侧签收。 |

round4 APK：[socrates-android-2.0.1-round4-focus-parity-release.apk](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round4-focus-parity-release.apk)，169,138,356 bytes；SHA-256 为 `b8ad974ccb4e10dd279087809eb9792215ce403371d6c49a9fda8e37f63605ac`，对应校验文件：[`.sha256`](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round4-focus-parity-release.apk.sha256)。本轮仅增量 patch：[android-web-parity-round4-focus-parity.patch](/workspace/Socrates/mobile/dist/android-web-parity-round4-focus-parity.patch)。round3 APK 的既有 SHA-256 校验仍通过（`afa58c5fa809c7166fb4de0a86928b2264839ed2b200f672ea3cb1ddb0ac4598`），round3 patch 仍保留且 SHA-256 未变；round1、round2 产物也未覆盖。


## 第五轮增量（2026-10-04）：稳定正文增量解析与轻量动效

本轮在 round4 未提交工作树之上继续增量修改；当前分支为 `feat/android-web-parity`，HEAD 仍为 `ac47d4ba`。没有 reset、stash、checkout、提交、推送或创建 PR；round1–4 源码与 APK/patch 保持原位。本轮改动限定于 `mobile/`，未修改 Web 源码。

### Web 与 Android 当前流行为及优化取舍

Web 的 `frontend/src/react/chatRuntime.bridge.ts` 对上游 delta 做帧边界提交；`frontend/src/render/streamPlayer.ts` 还通过 `@socrates/core` 的 `PlaybackClock` 区分到达长度和视觉播放游标，按 rAF 逐步揭示可见前缀。Android round4 的真实路径不同：`appStore` 首个 delta 立即提交，之后按已存在的 50/80/120ms 文本长度窗口合并 delta；每批把当前累计 `rawText`/`content` 一次提交，而不是按字符游标慢放。**本轮没有把 Web `PlaybackClock` 移植到 Android**：那会令已经到达的正文再进入一段播放队列，可能增加可感知尾延迟；在没有 Android 设备/IME 帧验证的条件下，不值得以未经测量的渐进延迟换取视觉平滑。本轮保留首字即时可见和现有 cadence，不声称两端播放节奏完全一致。

解析瓶颈比提交 cadence 更明确：round4 的 `MarkdownView` 虽以 `useMemo([text])` 避免同一提交中重复 parse，但每次 `text` 累加后仍扫描/解析整篇回答；`BlockView` 的 memo 只阻止已渲染子块重复生成，不减少这一轮全文 parser 成本。Web 已有保守的稳定边界策略，避免在未闭合围栏、数学块、Tutor widget 或 loose list 中切分。本轮将该边界契约移植到 mobile parser：增量 splitter 从尚未封存的尾部寻找新边界，完成后只解析新增稳定块一次；`MarkdownView` 把稳定块与 live tail 分开，稳定块列表引用保持不变，常规 flush 只重解析 tail。若消息内容被替换而非追加，缓存会安全 reset。未闭合代码围栏继续显示可读源码，未闭合 math/widget、表格行及列表边界不会被误切，中文 token 累积路径不变。这里报告的是减少重复 parser 输入/已封存块 reconciliation 的实现路径，**没有设备侧 CPU/FPS 百分比基准**。

### 动画与输入响应

- 流式 `MessageBubble` 的正文/整行不再先从低透明度渐显；首个字符仍即时以完整不透明度呈现。非流式 assistant 消息保留一次短淡入（130ms），不加 translateY。
- `ToolCard` 状态图标阶段变化采用 120ms 仅 opacity 反馈，不改变卡片尺寸/行高；running 状态在低动态偏好下用静态图标替代持续转圈。
- `AnimatedPressable` 的按下/抬起视觉反馈从 180ms spring 调为 120ms ease-out、无过冲缩放。点击回调仍直接传递，不等待动画；Reduce Motion 时保留静态 scale/相同 hit target 与样式几何。
- 新增共享 `useReducedMotion`：单例订阅 `AccessibilityInfo` 系统偏好；偏好解析前按静态模式处理，启用时跳过按压、spinner/dot、消息淡入和 thinking panel 动效；thinking panel 的开启动效同时缩短。ToolCard/streaming 状态转换只作用在 icon opacity，不增加位移层。
- **round4 Composer 和列表锚点代码没有改动**：手机静态态/聚焦态维持原两行恒定最低高度、工具轨常驻、原生 TextInput 实例不重挂；输入内容确实变多时仍按已有内容自然增长。IME 和贴底锚点仍沿用 `adjustResize` / `KeyboardStickyView` / 原有列表路径，没有新增键盘位移、focus height change 或第二条 translateY 追随动画。

### 第五轮回归与视觉验收

| 检查 | 第五轮结果 |
|---|---|
| 新增定向回归 | **4 suites、45 tests 通过**。覆盖首 delta 可见、中文 burst、cadence 窗口内合并、停止时同步 flush、partial code fence、稳定块/尾部解析分割、表格/列表/代码块语义、替换文本 reset、Reduce Motion 禁止持续动效、按压动作立即执行且 hit-target 几何不变。 |
| 全量 Jest | **40 suites、242 tests 全通过**。输出仍有先前已存在的 Expo Notifications 开发警告及 `NewChatScreen` 的 React `act()` 测试警告；无失败。 |
| `npm run typecheck` | 通过。 |
| `npm run check:parity` | 通过：Web baseline `b905fea4`、19 routes、8 overlays、914 translated keys。 |
| `npm run check:theme` / `git diff --check` | 均通过。 |
| Expo Web / DOM 交互截图 | `npm run visual:build` 与 `npm run visual:capture -- 04,05,06` 成功，**8/8 phone/wide 状态通过**（chat、stream、Composer 聚焦）。截图检查确认流式状态、Markdown code/table、Composer 工具区未裁切。证据是 Expo Web/DOM（phone 390×844 CSS viewport、DSF 2），不是 Android 原生截图或 IME/帧率验证。round5 截图：[`chat phone`](/workspace/Socrates/mobile/dist/visual-evidence/NON-NATIVE-expo-web-chat-phone-round5.png)、[`stream phone`](/workspace/Socrates/mobile/dist/visual-evidence/NON-NATIVE-expo-web-chat-stream-phone-round5.png)、[`stream wide`](/workspace/Socrates/mobile/dist/visual-evidence/NON-NATIVE-expo-web-chat-stream-wide-round5.png)、[`focused Composer phone`](/workspace/Socrates/mobile/dist/visual-evidence/NON-NATIVE-expo-web-composer-focused-phone-round5.png)。 |
| Android Release 构建 | `ANDROID_HOME=/home/ubuntu/Android/Sdk ANDROID_SDK_ROOT=/home/ubuntu/Android/Sdk NODE_ENV=production ./gradlew --no-daemon :app:assembleRelease` 成功（648 actionable tasks、60 executed）。首次尝试因 SDK 未在环境变量/local.properties 中指定而在配置阶段失败；补设已有 SDK 路径后构建通过。 |
| APK 验收 | `verify-apk.mjs` 确认 arm64-v8a、armeabi-v7a、x86、x86_64 均有 React Native core；`apksigner verify` 的 v2 签名为 true；`zipalign -c -v 4`、`unzip -tq`、SHA-256 校验全部通过。证书为 Android Debug signer，供本地安装测试，不是 Play Store 发布签名。 |
| 设备侧验收 | 当前 `adb devices -l` 无已连接设备，Android emulator binary 与 `/dev/kvm` 缺失；所以**没有** Android 原生 IME 逐帧、键盘遮挡、设备尺寸/帧率或安装启动验证，不能把 Expo Web 截图解释为原生验证。 |

### Round5 制品与工作树

- 分支 `feat/android-web-parity`，HEAD `ac47d4ba`；没有新增提交/远端操作。
- round5 Release APK：[`socrates-android-2.0.1-round5-stream-render-release.apk`](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round5-stream-render-release.apk)，169,144,644 bytes；SHA-256 `a47fc69fbc7adc822053c5e948cb20ea1a8f2b07c90b6e07a15f5eff49dd99ba`；[校验文件](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round5-stream-render-release.apk.sha256)。
- round5-only 增量 patch：[android-web-parity-round5-stream-render.patch](/workspace/Socrates/mobile/dist/android-web-parity-round5-stream-render.patch)。该 patch 以 round4 未提交工作树快照为基线，不重复包含 round1–4 改动。
- 本轮 Gradle 构建覆盖的标准输出 APK 已复制为 round5 唯一文件后，`android/app/build/outputs/apk/release/app-release.apk` 与 `output-metadata.json` 均恢复为 round4 备份；round4 APK SHA-256 仍为 `b8ad974ccb4e10dd279087809eb9792215ce403371d6c49a9fda8e37f63605ac`。`mobile/dist/` 内旧轮次 APK/校验文件未覆盖，检查通过。


## 第六轮增量（2026-10-05）：Reduce Motion 安全启动与 Markdown 活动尾段评估

本轮继续在 `feat/android-web-parity`、HEAD `ac47d4ba` 的 round5 未提交工作树之上增量修改。没有 reset、stash、checkout、commit、push 或 PR；round1–5 APK、校验文件与 patch 均保留。只修改 `mobile/src/` 与本报告，并新增 round6 APK、checksum、增量 patch 和非原生视觉证据。

### A) Reduce Motion 异步读取前的首次 focus

根因是 `Composer.tsx` 自己用 `useState(false)` 初始化偏好，再异步调用 `AccessibilityInfo.isReduceMotionEnabled()`。查询尚未返回时，宽屏工具轨的 `Animated.timing` 会被允许；如果系统随后报告启用了 Reduce Motion，首次 focus 的动效已经开始。

Composer 现在复用共享的 `useReducedMotion()` / `motionAllowed()`。查询未完成、查询失败或系统设置不可用时都采用静态安全态；只有偏好明确解析为“不减少动态效果”后，才允许非必要动画。输入焦点、键盘和普通输入仍立即响应，没有等待偏好查询；偏好到达也不会重放首次 transition。新增宽屏测试验证“查询未完成时首次 focus 不调用动效、偏好明确允许后后续 transition 可动效”，round4 手机两行静止/聚焦几何、常驻工具轨和同一输入路径保持不变。

### B) 长活动 Markdown 尾段

现有 API 是纯整字符串 `parseMarkdown(source): Block[]`，不是可恢复 parser state 的增量 API。`MarkdownView` 已只解析新增稳定块一次，但每个 flush 仍把未封存的 tail 交给 `stripChatArtifacts`、`stripCitationMarkers`、`preprocessLite` 和整段 block/inline parser。开放 fence/math/widget 的闭合状态依赖尾段后续任意位置；loose list 的空行归属取决于之后的列表项/续行；行内 emphasis、link、code、math 定界符也能跨任意字节距离才闭合。因此固定字节预算切片会丢失前缀语法上下文、改变 partial 内容或过早封存 block；把这些上下文重新带入切片又会重复解析同一大段。当前实现没有足以在不改变语义的条件下增量续接这些状态的 parser API。

本轮未做表面分片、未增加更大范围的重复解析，也不报告未经测量的性能百分比。新增长 burst 压力回归，以 384 字符分批推进大型未闭合 code/math/widget 与 loose-list，检查活动尾段一直完整、闭合后拆分解析与整段解析一致。它是结构正确性压力测试，不是设备性能基准，也不意味着活动 tail 的全文解析已消除。

### 流式节奏与 Composer/IME 保持项

本轮没有改动流式提交 cadence：**首个 delta 仍即时可见；后续 delta 仍按既有 50/80/120ms 窗口合并**。这不等于网页 `PlaybackClock` 的 rAF 逐帧播放；本轮不移植 PlaybackClock，也不为可见文本增加播放队列或延迟。round4 手机 Composer 静止/聚焦高度不变、常驻工具轨和原生输入继续保留；IME 仍沿用既有 `adjustResize` / `KeyboardStickyView` 与列表锚定路径，没有新增第二套键盘位移或自定义 IME 轨迹。

### 第六轮验证

| 检查 | 第六轮结果 |
|---|---|
| 定向 Jest | Composer 与 Markdown：2 suites、40 tests 通过；包含新增长尾 burst 与宽屏异步偏好回归。 |
| 全量 Jest | **40 suites、244 tests 全部通过**。仍可见既有 Expo Notifications 与 `NewChatScreen` React `act()` 开发期警告；无测试失败。 |
| `npm run typecheck` | 通过。 |
| `npm run check:parity` | 通过：Web baseline `b905fea4`、19 routes、8 overlays、914 translated keys。 |
| `npm run check:theme` / `git diff --check` | 均通过。 |
| Expo Web smoke | `npm run visual:build` 成功（Web bundle 1,378 modules）。用临时长流 fixture（180 个 Markdown 段落与 96 行未闭合代码段），在 `prefers-reduced-motion: reduce` 下跑 phone/wide 流式及聚焦态，**4/4 通过**。测试 fixture 与 capture harness 已恢复；截图仅是 Expo Web/Playwright，不是原生设备验证。证据：[长流 phone](/workspace/Socrates/mobile/dist/visual-evidence/NON-NATIVE-expo-web-round6-large-stream-phone.png)、[长流 wide](/workspace/Socrates/mobile/dist/visual-evidence/NON-NATIVE-expo-web-round6-large-stream-wide.png)、[reduced-motion Composer phone](/workspace/Socrates/mobile/dist/visual-evidence/NON-NATIVE-expo-web-round6-reduced-motion-composer-phone.png)、[reduced-motion Composer wide](/workspace/Socrates/mobile/dist/visual-evidence/NON-NATIVE-expo-web-round6-reduced-motion-composer-wide.png)。 |
| Release APK | `ANDROID_HOME=/home/ubuntu/Android/Sdk ANDROID_SDK_ROOT=/home/ubuntu/Android/Sdk NODE_ENV=production ./gradlew --no-daemon :app:assembleRelease` 成功（648 actionable tasks，60 executed；bundle 1,859 modules）。独立 round6 APK 为 169,144,360 bytes。 |
| APK 校验 | `verify-apk.mjs` 确认 arm64-v8a、armeabi-v7a、x86、x86_64；`apksigner verify` 显示 v2 `true`；`zipalign -c -v 4` 与 `unzip -tq` 均通过。SHA-256：`a569d6267d869bffda20ba36499f347c5d3bd7649d09e2f76e01c5a17f0e45b8`。证书为 Android Debug signer，仅供本地安装测试，不是 Play Store 发布签名。 |
| Android 原生设备验收 | 当前没有 `adb`、emulator 或 `/dev/kvm`，因此没有原生安装/启动、IME 轨迹或 FPS 验证；Expo Web 结果不代表这些验证。 |

### Round6 制品与工作树

- Release APK：[socrates-android-2.0.1-round6-boundary-fix-release.apk](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round6-boundary-fix-release.apk)，169,144,360 bytes；SHA-256 `a569d6267d869bffda20ba36499f347c5d3bd7649d09e2f76e01c5a17f0e45b8`；[校验文件](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round6-boundary-fix-release.apk.sha256)。
- Round6-only 增量 patch：[android-web-parity-round6-boundary-fix.patch](/workspace/Socrates/mobile/dist/android-web-parity-round6-boundary-fix.patch)。只包含本轮相对 round5 基线的 Composer 源码/测试、Markdown 长 burst 测试和本报告增量，不重复 round1–5。
- Gradle 标准输出 `android/app/build/outputs/apk/release/app-release.apk` 与 `output-metadata.json` 已恢复为 round4 状态；标准 APK SHA-256 仍为 `b8ad974ccb4e10dd279087809eb9792215ce403371d6c49a9fda8e37f63605ac`。`mobile/dist/` 内 round1–5 APK、checksums 与 patches 均未覆盖。


## 第七轮增量（2026-10-05）：Chat/渲染/动效/长列表表现层重构

本轮继续在本地分支 `feat/android-web-parity`、HEAD `ac47d4ba537ef247cce3bb557dfc1dc559675fe1` 的未提交工作树上实施；未切分支、reset、stash、checkout、commit、push 或创建 PR。round1–6 代码和分发制品均保留。`git fetch origin` 后最新 Web 基线为 `origin/main` **`740b485f35d0a0ae464a679c3f0651de8b3961eb`**（2026-10-05，`fix(frontend): restore the landing 44px header chip; realign stale mobile specs`），不是前几轮报告里的 `b905fea4`。从 `b905fea4` 到该基线，frontend diff 覆盖 137 个文件（4,806 insertions / 4,147 deletions）；本轮没有修改 Web 源码，只改 Android 正式树、测试、报告、视觉测试 harness 与新制品。

### 1. 核心根因与实现

| 源码可确认的问题 | Round7 改动 | 本轮证据 / 尚未测量项 |
|---|---|---|
| `AppStore` 的流式帧更新会替换活动会话/消息值。原 `ChatScreen` 同时订阅活动会话消息并承载 header、banner、modal、列表、dock；因此每次可见文本更新都让屏级 JSX 重新协调。 | 将消息、搜索、列表与贴底锚点迁到 memoized `ChatTranscript`；屏壳只选取 title/mode 等低频 chrome 状态，Composer 仍独立持有 draft/attachments。消息仍按帧更新，但不再因此重建屏级 chrome。行键以消息身份为主，并将布局、content-size、keyboard anchor 合并到单一 rAF 请求。 | `ChatScreen.performance.test.tsx`、`ChatTranscript.test.tsx` 覆盖 mount/remount、消息 burst 不重绘 header、稳定 row key、历史行不重播入场、anchor coalescing。代码路径有据；设备端 React commit 时长/FPS 没有仪器实测。 |
| Round6 的 Android 采用 50/80/120ms 文本 cadence；Web `740b485f` 的 `frontend/src/render/streamPlayer.ts` 用共享 `@socrates/core` `PlaybackClock`，以 rAF 推进可见前缀。Web/Android 原有节奏不同。 | Android 增加 `createMobileStreamPlayer`，直接复用同一 core clock 默认值（base 90 chars/s、max 600、catch-up 400 chars、drain boost 2.2、starve 320ms）。SSE 到达只入队，文本由 rAF 前缀推进；首个 rAF 可显示首字，不等 cadence 定时窗；自然 Done/Error 进入 drain，用户 Stop/会话切换则同步 `flushNow` 并丢弃旧帧。Stop 后消息标成 `stopped` 并提供 Resend，调用既有 retry/send API。 | `streamPlayback.test.ts` 与 `appStore.streaming.test.ts` 使用同一 `SPLIT_THINK_TURN` SSE fixture 覆盖首帧、Done drain、Stop 同步 flush、stopped 状态、Resend 和 stale frame。测试模拟 60Hz 时间轴；这不是实机 60fps 或首像素时间测量。Core `PlaybackClock` 接口没有 pause/resume 状态/API（只有 idle/playing/starved/draining/done），Web 也无单独 pause 路径；没有为 Android 臆造暂停能力。 |
| Web 将 `<think>` reasoning 与正文分开。Android 原 SSE/Markdown 流若在任意 delta 边界收到 `<think>` 标签，存在正文污染或漏 thought 的风险。 | 新增跨任意 frame 边界的 `inlineThinkRouter`；Done、EOF、错误、主动 Stop 都通过相同终态路径排空缓冲 reasoning 一次。 | `inlineThinkRouter.test.ts`、`sseClient.test.ts` 与共享 SSE fixture 测试覆盖切开的 `<think>`/`</think>`、自然完成、Stop 与延迟 token storage 下先取消请求。 |
| 流式公式更新会改变 Math WebView HTML/source；活动块从 tail 移进 stable 区时分属两份子树，可能换 WebView/重置 quiz/disclosure；历史消息被 FlatList 回收后可能再次播放淡入。 | `RichBlock` 对同一 WebView 保持 source identity，通过注入脚本更新已加载文档内容；inline math 不再按每字 `JSON.stringify`/换 source。Stable 与 active Markdown blocks 合并进一个 keyed child list；未闭合代码使用更轻的可读源码路径；只有新消息显式消费一次 entrance，历史消息回收不重播。 | `RichBlock.test.tsx`、`MarkdownView.test.tsx`、`MessageBubble.test.tsx` 覆盖 source identity、stable/live block continuity、partial math/code/widget/list 与 entrance/recycle。代码证据支持“避免 React source remount”；原生 WebView 实际 reload 次数、layout height 回报频率和电量/FPS未在设备上测量。 |
| Markdown parser API 仍是整字符串 `parseMarkdown(source)`。即使稳定前缀已缓存，未闭合的大段 math/chart/widget/list 仍可能在后续每个可见帧重新解析；固定长度切片会破坏跨任意长度闭合的 Markdown 语义。 | 延续 stable-prefix splitter 与 block cache，只对活动尾段重解析；活动 code tail 有轻量路径，block 从 live 到 stable 保持同一 key。没有用不安全字节预算切段，也没有为了动画延迟 SSE。 | 新增 `long-assistant-turn.md`：同一份长 Markdown 同时由 Jest SSE integration 与 Expo Web visual mock 使用，含表格、inline/display math、列表、代码和未闭合 ECharts block。Done/Stop 测试逐帧 parse active tail，并断言自然完成后增量拆块结果与整段解析一致；Stop 中 math/chart 保持正确 `closed:false`。**仍未消除活动超长尾段全文 parse**；无设备 CPU/FPS 数据，不报告性能百分比。 |
| 多个 content-size、键盘与布局 callback 可对同一帧连续要求滚动贴底；WebView 高度变化与 IME layout 同期时存在反复锚定的源代码风险。 | `ChatTranscript` 用单个 pending rAF 汇总 anchor 更新；Composer 仍走既有 Android `adjustResize` + `KeyboardStickyView` 唯一路径，不加第二套 `KeyboardAvoidingView`、bottom padding 或 Composer 键盘 translate 动画。Composer 单个原生 `TextInput` 在 compact/wide/focused 条件下切换样式而不换节点。 | `Composer.test.tsx` 覆盖 phone 几何不变与 800/1024dp 聚焦前后 TextInput identity；这些是 Jest/Expo Web 结构证据，**不是原生 IME、键盘遮挡或焦点未中断的实机验收**。 |
| `ThemeProvider` 将视觉主题与异步偏好 readiness 混在一处，且尺寸依赖会扩大主题更新的订阅面；Splash 可能早于浅色偏好 hydration 隐藏。 | 分离视觉 ThemeContext 和 readiness/controller context；去掉无用的窗口宽度依赖。`SplashReveal` 等待 fonts、首屏 layout、持久化主题偏好 ready 后再隐藏系统 splash。统一 motion duration/easing，小幅用于 Pressable、Composer、drawer、overlay、screen transition、Home 和 settings；Reduce Motion 未解析或开启时装饰动画默认静态，偏好后来到达不补播已发生的 entrance。 | `ThemeProvider.test.tsx`、`SplashReveal.test.tsx`、`AnimatedPressable.test.tsx` 与 Compose/screen tests 覆盖 hydration/theme switch/reduced motion 首次加载。Splash/暗色竞态在代码和单测层面缓解；没有原生冷启动录像/FPS。 |
| Library 视图切换会引起列表身份/选择状态/滚动锚点风险；Creations 旧 `ScrollView` 对所有图片卡片一次性映射。 | Library grid/list 共用一个稳定 FlatList，不因 viewMode 换 key，筛选/切换时保留 selection/anchor。Creations 改为有界 FlatList，以两项分组形成网格行，使用初始 6、batch 8、window 7；保留刷新、加载、空态、错误、图片占位和 assistants tab。 | `LibraryScreen.test.tsx`、`CreationsScreen.test.tsx` 覆盖 view switch 不 remount 与有界渲染/空态。没有真实大图库设备内存或滚动 FPS 基准。 |

### 2. 基于 `740b485f` 的 parity matrix

| Web /体验面 | 最新 Web source 基线 | Android round7 状态 | 验收与残差 |
|---|---|---|---|
| Landing、header chip、home quick actions、mode | `740b485f` 明确恢复 44px landing chip，并调整移动端 mode-switch/顶部行为。 | 保留 RN 原生首页与既有 Chat/Tutor 会话入口；home quick action 有 44dp 最小高度；不通过整页 WebView 模拟网页。 | Playwright phone/wide 与 Home 亮/暗状态通过，parity manifest 指向 740b。RN 与 CSS box model 仍有平台差异，不声称逐像素一致。 |
| Chat/stream/Stop/Resend | `streamingTurn.js` 使用 `frontend/src/render/streamPlayer.ts`；Done drain 与 abort `flushNow` 分离，stopped bubble 有 Resend，`<think>` 分流。 | Android 复用 shared core clock；首 rAF、natural drain、Stop sync flush、stopped/Resend 与 think router 已接通。 | Jest 同一 SSE fixture 覆盖时序；长流 math/chart fixture 由 Jest 与视觉 harness 共用。rAF 真实机帧 pacing 未测；Web 与 Android 仍有渲染引擎差异。 |
| Markdown、公式、chart/code/widget | Web 有 live rawText 与 finish render 路径，并保护开放结构。 | Native RN 消息/列表；公式/chart 以稳定 WebView surface 渲染，source identity 不随每字变化；stable/live block 保留 identity。 | long fixture partial/closed tests、RichBlock 和 Markdown component tests 通过。Unclosed 大 tail 仍通过整段 parser API；复杂 RichBlock 的原生测量仍未实测。 |
| Composer、IME、focus | Web latest CSS 已更新 mobile composer/reference 与 keyboard behavior。 | 保留单个 RN TextInput、工具轨与既有 adjustResize/KeyboardStickyView，focus 前后不换节点；scroll anchor 单帧汇总。 | 800/1024dp 和 phone Jest/DOM focus tests 通过；原生 IME 开关、窗口 resize 帧和真实键盘动画仍需 Android 设备。 |
| Library、More、Creations、Settings、profile/error/empty | Latest Web 有 mobile directory/sidebar/surface CSS 与更新的 empty/error/reference states。 | RN 屏幕维持原生；Library/Creations 有界列表，empty/error/loading 与 visual mock 保留；motion 使用共同 token。 | 36-state Playwright/Expo Web 矩阵全通过；API 真实账号数据、原生文件选择器不由 visual mock 代替。 |
| Routes/tokens/i18n | latest `740b485f`。 | parity manifest 更新到完整 SHA；theme checker 按最新 Web CSS/shared tokens/RN values/typography 校验。 | `check:parity`：19 routes、8 overlays、916 translated keys；`check:theme` passed。此 manifest 数字不是每个状态的逐像素自动断言。 |

### 3. 最终验证（本轮实测）

| 检查 | Round7 结果 |
|---|---|
| Full Jest | **49 suites、276 tests 全通过**；含 Chat mount/remount、streaming bursts/partial Markdown/Stop/Resend、首次 Reduce Motion/theme hydration、focus/固定尺寸、Library/Creations 等回归。控制台仍有 Expo Go push-notification 开发提示和既有 `NewChatScreen` React `act()` 警告；未导致失败。 |
| TypeScript | `npm run typecheck` 通过。 |
| Routes/parity | `npm run check:parity` 通过：Web `740b485f`、19 routes、8 overlays、916 translated keys。 |
| Theme drift | `npm run check:theme` 通过；Web CSS/shared tokens/RN hex/typography 一致。 |
| Diff/harness | `git diff --check` 与 `node --check mobile/scripts/visual/capture.mjs` 均通过。 |
| Expo Web / Playwright / DOM | round7 bundle + fixture 跑完 **36/36 states**：auth、home light/dark、drawer、chat/stream phone/wide、focused Composer、attachment/tools/model menus、settings/profile/message actions、Library、More、Creations images/assistants。截图 36 张在 `mobile/dist/round7-visual/`。这是 DOM/Expo Web 证据，不是原生 Android 截图。 |
| Android release variant | `ANDROID_HOME=/home/ubuntu/Android/Sdk ANDROID_SDK_ROOT=/home/ubuntu/Android/Sdk ./gradlew --no-daemon --console=plain :app:assembleRelease` 一次构建成功；648 actionable tasks，60 executed。round7 APK 169,158,552 bytes。 |
| APK 完整性 | SHA-256 `dab4c047171675a01fc73a1983c8f470d8a88a353a4507cbdfb21955534b517a`；`verify-apk.mjs` 确认 arm64-v8a、armeabi-v7a、x86、x86_64 四个 `libreactnative.so`；`unzip -tq` 无损坏；`zipalign -c 4` 通过；`apksigner verify` 显示 v2 `true`。证书为 `CN=Android Debug`，是本地 debug key，不是商店/生产发布签名。 |
| 历史制品 | 构建前后对 round1–6 APK、checksum、patch 共 18 个既有文件执行 `sha256sum -c`，**全部 OK**。Gradle 标准 `app-release.apk` 构建前等同于 round4（SHA `b8ad974...`），构建后已由预构建备份恢复为该字节内容；标准 `output-metadata.json` hash 未变。 |
| 原生设备 | Android SDK 的 adb 二进制存在，但 `adb devices -l` 无已连接设备；emulator 与 QEMU binary 不存在。故没有安装/启动、原生 IME/焦点中断、键盘遮挡、设备 FPS/掉帧或 WebView 高度回报实测。 |

### 4. 制品、可重现验收与已知残差

- Round7 APK：[`socrates-android-2.0.1-round7-full-rewrite-release.apk`](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round7-full-rewrite-release.apk)；对应 checksum：[`socrates-android-2.0.1-round7-full-rewrite-release.apk.sha256`](/workspace/Socrates/mobile/dist/socrates-android-2.0.1-round7-full-rewrite-release.apk.sha256)。
- Round7-only 源代码增量 patch（以 `/tmp/socrates-round7-baseline/mobile` 的 round6 工作树快照为基线，不重复包含 rounds 1–6）：[`android-web-parity-round7-full-rewrite.patch`](/workspace/Socrates/mobile/dist/android-web-parity-round7-full-rewrite.patch)。
- Expo Web/DOM 截图：[`round7-visual/`](/workspace/Socrates/mobile/dist/round7-visual/)；此目录不是 Android 原生截图。
- 重现源代码门禁：从 `mobile/` 执行 `npm test -- --runInBand`、`npm run typecheck`、`npm run check:parity`、`npm run check:theme`；可视矩阵先 `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787/api/v2 npx expo export --platform web --output-dir dist-visual-round7`，再使用 `VISUAL_DIST_DIR` / `VISUAL_OUT_DIR` 执行 `node scripts/visual/capture.mjs`。APK 校验使用 `node mobile/scripts/verify-apk.mjs <apk>`、`unzip -tq <apk>`、Android build-tools `zipalign -c 4 <apk>` 和 `apksigner verify --verbose --print-certs <apk>`。
- 仍然没有设备数据可支持“FPS 提升多少”“IME 已流畅”或“完全 Web 一致”等结论。最具体未消除项是：整字符串 Markdown API 使一个未闭合、持续增长的复杂活动尾仍可能重复 parse；RichBlock 尺寸与键盘同帧合流已在代码层收敛，但原生 WebView/layout/IME 测量缺失；低端 Android 上 rAF 更新与复杂 math/chart 并发的真实负载尚未 profile；附件按钮已在 visual 测试覆盖，但系统原生文件选择器未安装实测。
- Latest Web 是 740b485f 且与 b905fea4 有显著 source drift；round7 确实对齐了本次涉及的 stream/stop/Resend/think、视觉 tokens、home、列表和 Markdown 生命周期，不宣称逐个 Web feature 全量等价。分支仍为 `feat/android-web-parity`、HEAD 未变；无 commit/push/PR。
