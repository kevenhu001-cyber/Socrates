**当前结论（工作树快照：2026-10-04 21:10 +08）：** Home 快捷操作、手机双行 Composer、Library 主要筛选/搜索/上传交互已在 RN 源码中实现；本次最新快照的 typecheck、parity、theme 与 Jest 检查均通过。后续增补的图片缩放、Prompt Templates API 同步和 ToolCard live preview 也已进入源码及部分单测。但**Android/Web 完全视觉一致仍未设备验收**：真实 Android 截图、触摸/输入法/安全区检查缺失；Library 菜单呈现和 Grid 实际布局仍与当前 Web 不同。现有 APK 虽然签名有效，但早于最新源代码改动，不能作为最新工作树的验证包。

## 仓库状态

本次开始时指定的报告文件不存在，因此按原路径重建；审查期间**没有修改代码、依赖清单或 APK**。分支是 `feat/android-web-parity`，HEAD 为 `ac47d4ba537ef247cce3bb557dfc1dc559675fe1`。HEAD 未变，但工作树正在承载尚未提交的实现者改动；在本次复核中，代码从约 21:06 更新到 21:09。当前差异涉及 `mobile/docs/{frontend-parity.md,parity-manifest.json,ui-gap-audit.md}`、`mobile/package{,-lock}.json`，以及 `mobile/src/` 下的 Composer、HomeQuickActions、Library、附件/图片、Prompt Templates/API、ToolCard/toolState、i18n、native picker 和对应测试。不要将其误认为本次报告造成的代码变更。

## 可验收页面与功能清单

| 页面/功能 | 当前代码与对照 Web 结果 | 自动化覆盖（最新快照） | 真实 Android 验收 |
|---|---|---|---|
| Home 快捷操作 | `NewChatScreen` 挂载 Upload、Write、Research；分别调用现有文件/工具菜单、`write` extension、web-search 状态，并可逐项关闭。结构与当前 Web 手机页对应。详见 [`NewChatScreen.tsx`](mobile/src/screens/NewChatScreen.tsx)、[`HomeQuickActions.tsx`](mobile/src/components/HomeQuickActions.tsx)。 | [`HomeQuickActions.test.tsx`](mobile/src/components/HomeQuickActions.test.tsx) 2 项测试检查文案/回调和逐项关闭；没有整屏端到端验证实际菜单打开后的体验。 | 未验收。已有 390×844 Web proxy，不是设备截图。关闭按钮的占位与触控几何存在源码差异，见下节。 |
| 手机 Composer | `useResponsive()` 对 `width <= 768` 使用 compact；`Composer` 因此在空白 resting 状态也走“上方输入区 + 下方动作/工具轨”双行，而非只在聚焦后展开。对应 [`responsive.ts`](mobile/src/theme/responsive.ts)、[`Composer.tsx`](mobile/src/components/Composer.tsx)。 | typecheck/Jest 通过；但 [`Composer.test.tsx`](mobile/src/components/Composer.test.tsx) 只测试语音覆盖层，`NewChatScreen.test.tsx` mock 了 Composer，**没有断言双行尺寸、键盘或安全区几何**。 | 未验收。需要在目标 Android 尺寸核对未聚焦、聚焦、输入增长、发送/流式、IME 展开时的位置和高度。 |
| Library | 现有代码实现 5 个 collection、7 个类型选项、混合 files/artifacts、组合搜索、list/grid 开关和 New→上传。筛选纯函数在 [`libraryFilters.ts`](mobile/src/data/library/libraryFilters.ts)，界面在 [`LibraryScreen.tsx`](mobile/src/screens/LibraryScreen.tsx)。 | [`libraryFilters.test.ts`](mobile/src/data/library/libraryFilters.test.ts) 2 项测试覆盖类型分类和 collection/type/query 组合；**没有 `LibraryScreen` UI 测试**，因此按钮顺序、实际弹层、滚动、list/grid 点击路径仍只由源码确认。 | 390×844 proxy 有列表/网格画面，不是 Android 原生截图；筛选/New sheet 与真实触摸未验收。Grid 与当前 Web 实际布局不同。 |
| 附件与图片 | 继续遵守每条消息最多 6 个附件及每文件 25 MiB 预检。新增 `expo-image-manipulator`：常规图片最长边缩到 2048、JPEG quality 0.82；处理后上传 `/api/files`，Base64 小于 1.9M 字符时附带 inline preview，否则保留 server-backed `fileId`。GIF 保留原文件，避免丢失动画。见 [`attachments.ts`](mobile/src/data/chat/attachments.ts)、[`native.ts`](mobile/src/native/native.ts)。 | [`attachments.test.ts`](mobile/src/data/chat/attachments.test.ts) 3 项测试覆盖超限文件、4096×2048 图片缩放/重编码上传及超大 inline Base64 回退 server-backed。 | 仍未在设备验证实际照片格式/EXIF、不同相册 provider 的尺寸元数据、大 GIF/HEIF、上传失败体验与图片视觉质量；这些单测不能替代设备验收。 |
| Prompt Templates | 结论已更新：最新源码**已加入** `/prompts?scope=mine&limit=200` 拉取、未同步本地模板推送、UUID 行更新/删除与本地优先离线回退，见 [`prompts.ts`](mobile/src/data/chat/prompts.ts)、[`client.ts`](mobile/src/data/api/client.ts)。不再沿用早前“只本地持久化、未实现服务端同步”的结论。 | [`prompts.test.ts`](mobile/src/data/chat/prompts.test.ts) 增加远端拉取映射和本地待同步模板创建/UUID 采纳两项测试。仍没有登录账号的真实 API、多设备冲突、更新/删除及离线恢复集成验收。 | 未验收账号级同步/UI；同步失败时保留本地数据由源码处理，未在设备/服务端验证。 |
| ToolCard 运行中预览 | 最新源码仅对展开且 `running` 的工具卡显示代码或 Bash live preview；helper 见 [`toolState.ts`](mobile/src/data/tools/toolState.ts)，界面见 [`ToolCard.tsx`](mobile/src/components/ToolCard.tsx)。 | [`toolState.test.ts`](mobile/src/data/tools/toolState.test.ts) 2 项 helper 测试覆盖部分 JSON 解析、代码/Bash 命令筛选；没有 ToolCard 组件渲染测试。 | 未验收真实流式过程中的展开/刷新/截断/样式。 |
| Tool approval | 旧结论修正：当前后端不是漏做 UI；`server/src/services/agentRuntime.ts` 与 `server/src/routes/agentRuns.ts` 声明 `approvalPolicy: 'never'`，且当前运行 API 不发审批帧。不得凭空加入 Allow/Decline；只有后端提供可运行的审批协议后才列为功能缺口。 | API capability/source contract 和当前门禁检查；本轮未发现需添加 Android 决策控件的依据。 | 当前无需用设备验收不存在的后端能力。 |

## 具体视觉差异与不能签收的部分

- **Home 快捷操作：** Web 手机 CSS 在 `frontend/src/styles/restore/mobile-parity.css` 中使用 52px 行高、14px 内容间距、28px 图标盒、24px 图标和 16/24px 文案；RN 对齐了这些主尺寸。但 RN 行容器为 6px 水平内边距，关闭触控区为 44×44 的行内兄弟；Web 为 8px 左侧内边距、预留 44px 右侧空间并把 32×32 关闭按钮绝对定位。这会改变内容宽度及触控区域布局，不能从相似字号推导像素一致。
- **Library 菜单：** Web 的类型筛选和 New 是锚定按钮的 popover/menu（[`WorkspacePage.tsx`](frontend/src/react/pages/workspace/WorkspacePage.tsx)）；RN 当前用 `Overlay presentation="bottom"` 底部 sheet（[`LibraryScreen.tsx`](mobile/src/screens/LibraryScreen.tsx)）。功能入口虽已补齐，菜单几何、遮罩和手势关闭语义并非一对一复制。
- **Library Grid：** RN 使用两列网格；Web 按钮当前只切换 `viewMode` 并添加 `view-grid` class，仓库没有对应 `.library-list.view-grid` 两列布局规则。因此两列是 RN 可用实现，并非 Web 当前实际渲染的同态复刻。验收基准须以用户要求的**当前 Web 产品实际行为**为准，不能用泛化的“移动端更合适”代替。
- **Composer：** 源码结构已改为手机双行，与 Web 手机布局契约相符；但组件几何、模型/effort 标签占宽、键盘动画与滚动尚无 Android 画面证据。
- **附件、Prompt 与 ToolCard：** 这些源代码在 21:07–21:09 才进一步更新。图片压缩策略/inline 阈值、服务端同步时序、流式 live preview 的组件呈现均没有对应的最新 APK 或设备截图作实证。
- 仍需逐页对照的既有页面包括 Drawer 搜索默认展开与 Web 默认状态、Settings 原生整页与 Web modal、Images/Assistants creation surfaces、Explore 阶段进度等；本次没有在设备上重新验收 Auth、Chat、Tutor、Exam、Knowledge、Mistakes、Plugins 等页面。存在源码/纯函数测试不能等同于整页视觉签收。

## 检查结果与现存产物

在上述最新代码文件的最后观测时间（21:09 +08）之后，本轮重跑通过：

```bash
cd /workspace/Socrates/mobile
npm run typecheck
npm test -- --runInBand      # 36 suites、222 tests 全通过
npm run check:parity         # web b905fea4、18 routes、8 overlays、892 translated keys
npm run check:theme          # 通过
```

APKs 的存在、签名与源码时效需要分开记录：[`socrates-android-2.0.1-local-release.apk`](mobile/dist/socrates-android-2.0.1-local-release.apk) 约 162 MiB，SHA-256 `8d95af4b4b1aabeb2f5304c1f0b190333b7838add2fb8f22365d9043cff1b35e`，包含 arm64-v8a、armeabi-v7a、x86、x86_64；`apksigner verify --verbose --print-certs` 可验证 v2 签名，证书为 `CN=Android Debug`，不是 Play Store 签名。**但 APK 文件时间约为 20:59 +08，早于后续 `native.ts`、`attachments.ts`、ToolCard、Prompt/API 与测试文件在 21:07–21:09 的修改。故签名有效不等于 APK 与当前工作树匹配；本次只读审查没有重建 APK。**

现存 [`Home 暗色 proxy`](mobile/dist/visual-evidence/home-390x844-dark.png)、[`Home 浅色 proxy`](mobile/dist/visual-evidence/home-390x844-light.png)、[`Library 列表 proxy`](mobile/dist/visual-evidence/library-list-390x844-dark.png)、[`Library 网格 proxy`](mobile/dist/visual-evidence/library-grid-390x844-dark.png) 为 780×1688 像素（390×844 dp、2×）的早期 **Expo Web visual proxy**，文件约在 20:58 +08 生成；不是 Android 设备截图，也不覆盖完整页面/主题/状态矩阵，更不能验证随后新增的原生图片处理、Prompt 同步或 ToolCard 代码。

当前 `adb devices -l` 为空，Android emulator 可执行文件不存在，`/dev/kvm` 不可用；没有可用 Android 设备或模拟器。浏览器端完整 E2E 本轮未运行；最新实现说明记录此前 Vite 缺少生成文件 `frontend/wasm/socrates_wasm.js`。另外，`mobile/docs/frontend-parity.md` 仍写着 Prompt Templates 服务端同步“未实现或未验证”，`mobile/docs/android-web-parity-implementation.md` 仍把图片下采样列作未完成、ToolCard preview 列作差异；这些文档时间早于 21:07–21:09 的源码改动，需避免当作最新状态。按本请求，我只更新了本报告，没有改写其他文档。

**最终验收判定：** Home shortcuts、双行 Composer、Library controls、图片压缩、Prompt API 同步及运行中 ToolCard preview 可标记为“当前源码已有；按表格所列程度经过自动化覆盖”。Library menu/Grid 与 Web 当前行为仍有具体差异；其余自动化也只覆盖局部逻辑。**不得把任何 Expo Web proxy 或签名通过的旧 APK 说成 Android 设备视觉一致已验收。**
