# SPA 优先的 RN 收敛方案

更新：2026-11-17，设置分类跳转及显示页网格开关已接入。
状态：唯一生产客户端是 SPA，原地 RN 化持续推进中。
轮次现状见 [UI 结构与迁移边界 · RN 轮次现状](../architecture/ui-structure.md)。

## 1. 定位

`frontend/`（SPA，线上生产界面）是唯一生产 Web 客户端。共享 RN UI 归 `packages/ui`，
SPA 通过 react-native-web 就地挂载。2026-11-16 删除了 Expo Universal App
（`apps/socrates/`）及其专属包、barrel、CI lane；保留独立 Kotlin 客户端
`apps/socrates-android/`（共享 `/api/v2` 与 `@socrates/core`）。

## 2. 现状

- SPA：42 个文件、55 处 `@socrates/ui/*` 子路径引用，0 处根入口。
- 根入口 barrel 已删除，`packages/ui/package.json` 只保留子路径 exports；
  `frontend/scripts/check-ui-entry.mjs` 在 lint 中固化"只用子路径"。
- 旧的旧版 `Sidebar`/`ChatMessageList`/`Composer` 双轨实现随 barrel 一并删除；
  现行实现只在 `shell/`、`composer/` 等子模块中，由 SPA 经 RN Web 挂载。
- SPA 的 transcript 正文来自服务端 HTML（`frontend/src/react/message-list/MessageBody.tsx`
  直接注入 `message.html`），不是客户端 markdown 解析。

## 3. 决定

| 编号 | 决定 | 理由 |
|---|---|---|
| D1 | 根入口已删除：禁止 `@socrates/ui` 根导入，只用子路径 | 根入口曾把整包拉进首屏，且与子模块双轨 |
| D2 | 新共享 UI 一律先落 `packages/ui` 子模块，再由 SPA 经 RN Web 挂载 | 共享组件由 SPA 消费，原生 Android 继续使用独立 Compose UI |
| D3 | 搬迁由 SPA 需求触发：用到时才迁，不为整洁做纯搬运 | 每轮收益可验证 |
| D4 | 每次只换一个表面；旧 DOM 实现保留到新实现签收后再删 | 可回滚，diff 可读 |
| D5 | transcript **正文**不做 RN 迁移，只迁外壳与工具栏 | 服务端 HTML 是渲染基准，改成客户端 markdown 属于产品级改动 |
| D6 | 重型编辑器（TipTap/tldraw/Mermaid/Three.js）保持 Web 原生岛 | 不在共享核心重写 |

## 4. SPA 剩余表面

| 表面 | 现状 | 体量 | 迁移方式 |
|---|---|---|---|
| 设置面板 | React + shadcn/Base UI，8 个分类按需加载，网格开关已用 RN | `react/settings` 31 个 TS/TSX 文件，约 2050 行，其中 20 个 TSX 约 1510 行 | 分类跳转已类型化，下一批是字号和内容宽度 |
| 考试 | **已迁移（2026-11-05）**：`packages/ui/src/exam` + SPA 适配层 `react/exam/ExamView.tsx` | `react/exam` 约 1090 行 → 共享 8 个组件文件 + 适配层 217 行 | 旧 6 个 DOM 组件已删除；e2e 断言改为语义 `data-*` |
| 资料库 / 项目 / 文件 | DOM | 待统计 | 列表 + 空态，先换列表行 |
| 搜索 / Cmd-K | DOM + 独立 store | 待统计 | 输入框与结果行 |
| 消息列表 | DOM，正文是服务端 HTML | `react/message-list` 约 1070 行 | 只换工具栏、操作行与外壳；正文保留 HTML |
| 富文本输入 | TipTap | `react/composer-input` 约 815 行 | 不迁编辑器，只换周边（外壳与控件栏已完成） |
| 画布 / 白板 | tldraw | — | 原生岛，不迁 |

## 5. 已签收的考试与下一轮设置面板

首个目标**考试**已于 2026-11-05 完成，落在 `packages/ui/src/exam/`：

- 数据是结构化的（题目、选项、作答、评分），不依赖服务端 HTML，和 D5 的边界不冲突。
- 没有扩写 barrel（当时仍服务 Universal，现已删除）：改为新建子模块，SPA 走
  `@socrates/ui/exam`（D2 的"新 UI 先进包"）。
- 体量自包含，1090 行集中在一个目录，回归面清晰。

### 设置面板的宿主与控件

- **Web 宿主**继续用当前的 shadcn `Dialog` / `DialogContent`。它和 `FoundationDialog` 同用 Base UI。
  Web 层持有 portal、遮罩、Escape、焦点限制与恢复、嵌套确认框的 inert 协调，以及手机分类索引和详情切换。
  `keepMounted` 与 `SettingsPanes` 的稳定 key 维持已访问分类和未保存草稿。若后续合入 `FoundationDialog`，
  先用现有用例验证这些行为及 `layout="settings"` 的几何，再单独移交弹窗外壳。
- **共享呈现**放在 `packages/ui/src/settings/`，经 `@socrates/ui/settings` 和 `WebUiTheme` 挂载。
  组件接收标签、值和回调，设置偏好、账号写入、语言和媒体查询仍由 Web 宿主对接现有模块。
  对话框里的弹出式选择继续使用 Web shadcn 控件，直到共享选择内容能由宿主控制关闭和焦点恢复。
  `type="color"` 和提供商密钥输入也归 Web 宿主，密钥草稿继续由 provider service 管理。
- **样式归属**沿用 `polish/overlays.css` 的设置外壳和 `themes.css` 的最终调色板。
  RN 行使用共享主题和对应视口的控件密度。控件接管后，按实际消费者删除旧行的专属规则。

### 落地顺序

| 批次 | 改动 | 可验收结果 |
|---|---|---|
| 1. 设置分类导航（已接入） | 设置服务一次接收打开请求和可选目标分类。侧栏账户菜单与模型菜单调用类型化入口，`socrates:settings-section` 的两个派发点和监听已移除。 | 首次打开、关闭后再次直达同一分类、手机返回索引和搜索均可用。分类按需加载失败后可重试，设置关闭时焦点返回触发位置。 |
| 2. 显示页网格开关（已接入） | `DisplaySettingsPane` 的「对话背景网格」使用共享开关，通过 `WebUiTheme` 获取主题，由 SPA 的标签行和 `settingsPreferenceActions` 接回现有布局与存储。 | 键盘和点击标签均可操作，界面立即响应，重开设置和刷新后保持状态。中英文、浅深色和桌面／手机尺寸通过检查。 |
| 3. 扩展设置分类 | 先复核显示页字号和内容宽度的分组选中态与键盘导航，再迁其它低耦合偏好行。需要弹层的通用页控件沿用现有 `PreferenceSelect`，先记录打开、关闭与焦点契约。 | 每批独立签收，校验已访问分类保留、草稿、保存失败提示和分类加载重试，再删已交接的实现与样式。 |

网格开关沿用设置行的公共几何，供其它设置项使用。涉及确认框或选择浮层的实现在有对应回归后再移交。

### 下一批执行清单（2026-11-17）

本地基线为 `79967f4e`，比当前本地记录的 `origin/main` 多一笔设置提交。设置分类直达和背景网格已经接入，相关用例已随提交更新。这轮梳理仅核对了代码和用例，测试执行结果待验收。

1. **先定行为。** 在 [显示设置面板](../../frontend/src/react/settings/DisplaySettingsPane.tsx) 复核字号和内容宽度的分组标签、单选态、Tab 进入和离开分组、方向键、Space / Enter，以及重复点选当前项时的行为。现有 [设置回归](../../frontend/e2e/settings-modal.spec.mjs) 通过 `data-slot` 点击两个分组的 XL 项，并校验即时 CSS 变量与本地存储。补上语义定位、键盘操作和重开／刷新后的分组选中态断言。
2. **只移交这两个控件。** 共享控件接收标签、选项、当前值和回调，经 `@socrates/ui/settings` 与 `WebUiTheme` 挂载。SPA 继续用 `displayPrefs.ts` 提供选项，通过 `settingsPreferenceActions.setFont` 和 `setWidth` 写入现有偏好。保留弹窗的焦点管理和分类懒加载。检查 [设置样式](../../frontend/src/styles/polish/overlays.css) 中依赖 ToggleGroup 插槽的选择器，重点对照窄屏等分布局。
3. **集中验收。** 完成整批实现后，运行前端 lint、生产构建、包体预算检查，以及设置和焦点相关 Playwright 用例。检查桌面与 390px 手机宽度下的中英文和浅深色截图。两个分组都应支持键盘操作，改变后立即生效，重开和刷新后选中态与实际排版一致。对照网格开关、颜色重置和关闭后焦点恢复的已有用例，验收后再清理失去消费者的样式并更新 UI 结构索引。

这批通过后，下一批从现有设置行中挑选无需弹层的低耦合偏好。涉及 `PreferenceSelect` 的分类另行验证关闭与焦点恢复，再决定如何移交。

## 6. 每轮的执行与验收

1. 在 `packages/ui/<域>/` 写 RN 组件，DOM-free，经 `check-packages-dom`。
2. SPA 在 `frontend/src/react/<域>/` 保留适配层：读 store、传回调、挂 `WebUiTheme`。
3. 旧 DOM 实现保留到新组件通过以下验证后再删：
   - `cd frontend && npm run lint && npm run build`
   - 设置导航批次跑 `e2e/settings-modal.spec.mjs` 中模型菜单直达、全部分类与手机搜索、焦点恢复、草稿保留和分类失败重试；补同分类重复直达的回归。
   - RN 控件批次加跑同一 spec 的显示偏好持久化，以及涉及焦点的 `e2e/a11y-focus-trap.spec.mjs`。有可见变化时查看桌面和 390px 手机截图，存放在 `frontend/test-results/`。
   - 考试相关改动跑 `e2e/exam-regressions.spec.mjs`，覆盖考试宿主仍依赖的几何与行为。
4. 更新 `ui-structure.md` 的接入面统计与该表面的迁移状态。

## 7. 护栏

- `frontend/scripts/check-ui-entry.mjs`：`frontend/src` 出现根入口 import 即失败，接入 `lint` 与 `lint:ui-entry`，基线为空。
- 现有 `check-packages-dom` 继续保证共享包 DOM-free。
- 首屏包体预算不变；每轮迁移后 `npm run build` 复核 `check-bundle-size`。

## 8. 考试迁移的已知差异（2026-11-05）

- **模型选择器**：旧版是 shadcn Popover（外部点击关闭），共享版是内联 listbox，只能再点一次触发器
  或选中选项关闭，Escape 无效。RN 侧拿不到 DOM 的 outside-click，要恢复得由宿主收回弹层
  （与 composer 的 `expanded` 契约一致），留到设置面板迁移时一起定。
- **视觉**：题目从"分隔线列表"改成卡片，选项字母去掉方框，判分徽标换成 `VerdictGlyph`。
  这些是 shadcn 方向的收敛，不是像素还原；主壳几何（`.exam-view-body` 的 padding 与 720 列宽）保持不变。
