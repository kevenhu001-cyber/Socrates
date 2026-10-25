# 前端视觉系统收敛与动态稳定性

日期：2026-10-25。起点：`9f0fbf74` **加任务开始时已有的 7 个未提交文件**。保留现有主题、侧栏、顶栏、composer 和 parity 参考改动。本报告依据当前源码与本轮浏览器证据；历史报告仅作线索。范围为 `frontend/`，不涉及服务端、API、共享包或部署。

## 审查先行：最值得修复的三个根因

1. **P1 / 渲染生命周期：尾块晋升时 React 身份断裂。** 已显示的段落在遇到空行后被卸载并重新创建，不能用 CSS 动画开关修复。
2. **P1 / CSS 几何：段落节奏依赖渲染包装结构。** 桌面流式/刚完成正文与历史正文分别使用 12px/16px 段距，相同答案重新进入会话后变高。
3. **P2 / 设计系统与样式所有权：手机正文未完整接入语义排版。** 正文使用旧倍率，h3/h4 仍由 legacy 决定；同一阅读界面的字号层级和文字颜色来自两套规则。

没有发现需定为 P0 的阻断缺陷。三个视口的首页/会话 composer 已对齐，横向溢出均为 0；不重做已正确的布局。以下清单于产品代码修改前建立。

## 问题清单

### P1-1：稳定段落在尾块晋升时被重新挂载

- **复现**：发布流式 `First paragraph.`，保留首个 p 的 DOM 引用；继续发布 `First paragraph.\n\nSecond paragraph.`。1440px 与 390px 均得到 `preserved:false, connected:false`。
- **证据**：`react/tool-run/LiveTextSegment.tsx` 的 JSX 将 `blocks.map(...)` 放在一个子数组中，尾块是其后的独立子节点。晋升后原文进入新建的数组项，尾节点留在原位置承接下一段。前缀缓存只缓存 HTML，无法保存原 DOM 身份。`render/streaming.ts` 的 splitter 本身正确识别稳定边界。
- **影响**：已显示的节点、选择范围和节点上的本地状态可能在边界丢失。已实证的是 DOM 被替换；不宣称每个 token 都重挂载或已测出性能收益。
- **根因**：“稳定块”和“尾块”是两个 React 兄弟槽位，身份以角色而非原文块序号绑定。
- **最小修复**：将稳定块和尾块作为同一个 keyed 子数组，用同一原文块序号贯穿尾块→稳定块。保留 splitter、播放时钟、HTML 缓存和有界的新文字 reveal；不改变请求与状态契约。
- **验收**：晋升前后 p/code 节点 `isSameNode` 为 true；已选文字仍可读取；新增段落正确显示；完成和历史恢复文本一致；现有 streaming/code/math 测试通过。

### P1-2：正文间距在流式、完成与历史恢复之间不一致

- **复现**：依次显示 `First paragraph.\n\nSecond paragraph.\n\n### A heading\n\nLast paragraph.`，在同一 live 组件结束，再以新消息身份加载同一答案。桌面 live/完成高度为 151.89px，历史为 155.89px；第二段的相对 top 从 40px 变为 44px。手机当前无这项差异。
- **证据与覆盖**：`parity/transcript.css` 的 `.msg-body p` 设置 16px；后导入的 `polish/transcript.css` 把 `--msg-para-gap` 设为 12px，并以 `.tool-run-prose.is-settled:not(.is-tail) > p:last-child` 的高特异性规则覆盖。历史答案是单个 `.tool-run-prose`，流式答案有多个 `display:contents` 包装；同一内容匹配不同的末段规则。`components/chat.css` 的移动版与 polish 又分别提供 1.65 行高和段距。另一个隐含依赖：`.tool-run-prose{display:contents}` 仍由 `legacy/12-tutor-inline-tools.css` 提供。
- **影响**：完成时当前树已保留，因此不是 DONE 即跳动；实际问题发生在重进/重新挂载相同答案时。4px 是本夹具的差异，长答案会累积。
- **根因**：两个视觉所有者对同一段落间距持有不同常量，且最后一段按包装节点而非完整正文判断。
- **最小修复**：各响应式正文 owner 声明一个段距变量，普通段落和分块末段同时消费它；去掉 polish 中相冲突的默认值。将 `display:contents` 从 legacy 迁入当前 tool 组件 owner。保留各正文 owner 的标题间距规则。
- **验收**：live→完成→历史恢复的块位置、正文高度一致（误差≤1px）；两段正文的段距符合 owner；代码、列表、引用、表格、公式保持正确；短答案底部锚定与长答案滚动保持可用。

### P2-1：手机排版漏接 Token，三级标题继承兼容色

- **复现**：390×844、默认显示倍率，中英混排消息含 h2/h3 与代码；同时检查浅/深主题。
- **证据与覆盖**：`components/chat.css` 手机 `.msg-body` 使用 `calc(15px * --app-font-scale)`；默认 1.125 得到 16.875px，而桌面读取已归一化的 `--ui-text-body` 为 16px。该文件只接管 `:is(h1,h2)`；`legacy/09-viz-markdown.css` 的 h3 `1.18em` / `hsl(--text-000)` 仍生效。实测手机 h2 20.25px、h3 19.9125px，层级仅差 0.3375px；h3 浅色纯黑/深色纯白，其他标题为语义 primary（23/237）。
- **影响**：手机正文比桌面大 5.47%，h2/h3 层次接近；三级标题亮度比其他标题突兀。字体家族本身已经统一为本地 Geist Sans + Noto Sans SC；历史报告关于 Inter/MiSans/Jakarta 的结论已过期。
- **根因**：手机 owner 迁移了背景和 h1/h2，但没有完整迁移排版角色，继续消费旧倍率与 legacy HSL 通道。
- **最小修复**：仅在手机正文 owner 使用现有 body/heading/space/weight Token，补齐 h1–h4 与正文行高；代码字号同样采用已归一化字号。保留手机导航、目录密度、抽屉、composer 双行与安全区。
- **验收**：默认正文 16/28px；h2 20px、h3 18px，颜色来自 primary；S/L/XL 按 `--app-type-scale` 等比变化且不双乘；中文标点及本地字体加载继续通过。

## 五个方面的审查结论

- **设计系统**：`themes.css` 唯一且最后导入；页面、侧栏、普通/浮层、composer 语义颜色已接入当前 Geist palette。字体的 unicode-range 已排除 CJK 标点，保留现状。主改动为补齐手机文字角色，无须创建调色板或修改基础 Token。
- **CSS 架构**：入口为 tokens→legacy→components/features→restore→parity→polish→themes。桌面四 owner 仍有效；重复选择器不必然构成缺陷。本轮实证冲突为段落节奏，局部移除被替代规则，不新增全局覆盖文件、`!important` 或高特异性补丁。
- **布局几何**：1440/1280 桌面 composer/正文 x 分别为 466/386，宽 768；手机 x=16、宽358；首页与会话相同。侧栏宽260、顶栏52，手机独立56。无横向溢出。不凭截图改这些正确尺寸。
- **视觉层级**：普通助手正文透明、无边框/阴影，用户中性气泡；工具/思考已经归入一个默认折叠的 Activity 披露，下有连续细线。桌面主操作已减为5个，手机评价进更多菜单。不存在历史“每一步一个卡片、8按钮常驻”的现状。现有浅色 composer 阴影属于任务开始时已有的参考调整，本轮保留，不另加装饰。
- **动态交互**：已完成树不在 DONE 切换 parser；操作栏 pending 时预留且 inert；稳定前缀缓存、有界历史窗口、滚动写入仲裁均已存在。新发现的重新挂载发生在尾块晋升，而非请求层。新字 reveal 仅作用于有界后缀，未发现逐 token 整段入场，保留现有约束并回归 reduced-motion。

## 证据与复现

真实 Chromium，仓库生产构建，本地 `http://127.0.0.1:4173`，现有 mock 登录/API。所有截图与测量来自当前任务；不使用旧审计的 PNG 充当基线。

- `frontend/test-results/ui-convergence/entry-working-tree.patch`：起始未提交改动快照。
- `frontend/test-results/ui-convergence/before/{1440,1280,390}-{light,dark}-{home,chat,activity}.png`：18张修改前截图。
- `before/geometry.json`：DOMRect、计算样式、主题、横向溢出与运行错误。
- `before/lifecycle.json`：晋升 DOM 身份与 live/完成/历史几何。
- `probe.mjs` / `lifecycle.mjs`：本机复现脚本（与证据同在忽略目录，不提交生成产物）。
- [截图对照页](../../frontend/test-results/ui-convergence/comparison.html)：按视口、主题、状态并排展示修改前后，可点击原图；`gallery-w1440.png` / `gallery-w1280.png` / `gallery-w390.png` / `gallery-interactions.png` 为已检查的汇总视图。

## 实施与验收结果

### 实际改动（本轮新增 9 个文件的增量）

- `frontend/src/react/tool-run/LiveTextSegment.tsx`：将尾块和稳定块放在同一 keyed 序列，保留晋升节点与选择范围；由数据计算 `data-prose-last`，避免空尾块带来多余末段间距。保持现有 memo、前缀缓存和 reveal，不新增 DOM 测量、effect 状态或滚动控制器。
- `frontend/src/styles/parity/transcript.css`：桌面段距唯一值为 `--ui-space-lg`（16px），普通段落与分块段落共用；标题字号改为等值语义 Token，桌面静态字号不变。
- `frontend/src/styles/components/chat.css`：手机正文接入 body Token（16/28px）；补齐 h1–h4 的语义字号、文字颜色、字重和间距；手机段距为 `--ui-space-md`（12px），包括没有 conversation-active 标记的只读正文。
- `frontend/src/styles/polish/transcript.css`：去除冲突的 12/10px 默认段距和重复手机行高；分块末段读取 owner 的变量并排除最后实际内容块；手机代码字号读取 `--ui-font-size-sm`（14px）。
- `frontend/src/styles/components/tool-card.css`：接管 `.tool-run-prose { display:contents }`。
- `frontend/src/styles/legacy/12-tutor-inline-tools.css`：只删除上述已迁移的一行，其他兼容规则不动。
- `frontend/test/liveTextSegment.test.mjs`：真实 React + jsdom 验证 p/代码节点、选择范围、节点本地状态、空尾块以及替换/截断内容。
- `frontend/e2e/visual-system-convergence.spec.mjs`：新增8项浏览器断言，覆盖三视口两主题的语义排版、布局、focus、披露、缩放，以及晋升/完成/恢复/空尾块/reduced-motion。
- 本报告：审查、证据索引、修改和验收结果。

任务开始时已有的7个文件未被本轮修改。`preserved-entry-changes.json` 将当前这7个文件的 diff 与任务入口快照逐行比较，结果为 `entry_changes_preserved:true`。没有新增调色板、全局覆盖文件、`!important`，没有改 `themes.css`、Token 基值、CSS 导入顺序或四大桌面表面的所有权；没有提交、推送或部署。

### 主要变化的前后证据

1. **尾块晋升**：两个视口的 `preserved/connected` 从 `false/false` 变为 `true/true`。单测及真实浏览器进一步验证选中的 `First paragraph.` 晋升后仍被选中；代码节点上的本地状态保留。
2. **桌面恢复**：同一短夹具原 live/完成为151.89px、历史为155.89px；现在三个状态均155.89px，所有块的相对 top 相同。完整含代码、公式和标题的答案也逐块比较通过，末尾空行不会产生额外正文高度。
3. **手机排版**：正文16.875→16px，行高27.8438→28px；h2 20.25→20px、h3 19.9125→18px。h3 的纯黑/白改为主题 primary；代码13.5→14px。文字缩放1.35时正文19.2px、h3 21.6px，未双重缩放。导航、目录和 composer 的手机尺寸不变。
4. **布局**：六组合首页/聊天 composer 左边和宽度相同；横向溢出0。桌面侧栏收起到52px后，正文/composer仍同列（1440px时x=362、宽768）。手机视口模拟从844缩至544时，输入区保持可见，恢复844后 y 恢复（误差≤1px）。工具菜单在两主题的桌面/手机均位于视口内。

修改前，390×844浅色：

![手机排版修改前](../../frontend/test-results/ui-convergence/before/390-light-chat.png)

修改后，同视口、主题、正文：

![手机排版修改后](../../frontend/test-results/ui-convergence/after/390-light-chat.png)

桌面静态外观保留，主要收益发生在流式和恢复边界。对应1440px浅色 [修改前](../../frontend/test-results/ui-convergence/before/1440-light-chat.png) / [修改后](../../frontend/test-results/ui-convergence/after/1440-light-chat.png)。所有6组合各有首页/聊天/展开活动截图：修改前18张、修改后同条件18张；另有10张菜单/侧栏/视口恢复截图。`verified/` 另存自动化用例的首页、focus、完成/恢复截图。

### 通过的检查

- `npm run build`：通过，日志 `build-after.log`。保留第三方依赖的 `use client` bundler 提示，未隐藏构建输出。
- `npm run lint`：通过，TypeScript、ESLint及全部架构/CSS/Token/CSP/DOM-free棘轮通过；ESLint 0 error / 469 warning。改动的 TSX 单独运行 ESLint 无警告，未扩大或更新任何检查基线。
- 聚焦单测 **50/50**：`liveTextSegment`、`streaming`、`proseCache`、`streamReveal`、`messageItemMemo`；日志 `unit.log`。最终版 `liveTextSegment` 另单独通过1项（不重复计数）。
- 主聚焦 Playwright **98/98**（3.6分钟），日志 `focused-playwright.log`：`visual-system-convergence`、`landing-light-visual`、`chat-light-palette`、`theme-system`、`home-customization`、`chat-workbench`、`stream-finish-stability`、`stream-reveal`、`stream-smooth`、`streaming-render`、`message-list-compat`、`chat-send`、`chat-stop-resend`、`keyboard-viewport`、`anchored-menu-focus`、`composer-tools-compat`、`sidebar-resize`、`message-windowing`、`cjk-punctuation-width`、`chinese-typography`。
- 为补齐收起侧栏、控件状态及只读正文风险，追加 `sidebar-rail`、`button-press`、`share-view`：**12通过、1条件跳过**（22.8秒），日志 `interaction-playwright.log`。累计 **110通过、1跳过、0失败**；没有运行完整 unit/Playwright 套件。
- `interactions.mjs`：真实浏览器操作菜单、收起/展开侧栏、输入框聚焦、模拟视口缩小/恢复；DOM断言全部通过，数据在 `after/interactions.json`。
- 改动范围内 `git diff --check`：通过。

复跑命令（均在 `frontend/`）：

```powershell
npm run build
npm run lint
npx tsx --tsconfig tsconfig.test.json --test test/liveTextSegment.test.mjs test/streaming.test.mjs test/proseCache.test.mjs test/streamReveal.test.mjs test/messageItemMemo.test.mjs
npx playwright test --config=playwright.config.mjs e2e/visual-system-convergence.spec.mjs e2e/stream-finish-stability.spec.mjs e2e/stream-reveal.spec.mjs e2e/stream-smooth.spec.mjs e2e/streaming-render.spec.mjs --workers=1 --output=test-results/ui-convergence/repro-runs
```

### 未通过、跳过及过程中的修正

- **最终无产品测试失败。** 新用例初次有2项失败：历史夹具缺少真实恢复路径的 `restoredFromHistory:true`，因此原有 post-render 守卫未给代码添加 header。按真实历史状态修正夹具后通过；没有删除比较、修改产品逻辑绕过断言或放宽误差。
- lint 首次拦截了新截图路径中的未编码动态片段。改用 `encodeURIComponent` 后全部通过；没有放宽截图路径检查或更新基线。
- **1项既有条件跳过**：`button-press.spec.mjs` 的“real shell controls”探针依赖可见 `.icon-btn` / 侧栏行；当前 shell 没有满足其前提的控件。保留原 skip 逻辑。主按钮、通用按钮、行控件、触屏、Disabled、reduced-motion和菜单触发器的其他7项均通过。
- **全工作区 `git diff --check` 非零**：任务开始时已有的 `parity/topbar.css` 未提交差异含20处 CR 行尾提示。本轮没有触碰该文件；入口diff比较确认这7个原有文件的差异保持相同。新增/修改范围单独检查通过。此项是工作区格式状态，不冒充测试通过。

### 环境、限制和下一轮

- Chromium、Windows、本地生产 dist；Browser插件未提供，按请求使用仓库Playwright。页面身份/非空/无框架错误层/运行错误/截图和实际交互均检查；六组合页面错误数组为空，新矩阵用例同时收集 console error 并断言为空。
- 测试使用现有 mock API 与可控流式响应；未调用真实模型，不能由此推断上游服务速度或质量。未修改请求和状态管理。
- 键盘覆盖的是现有 VisualViewport/overlay/resize 模拟与真实浏览器视口调整，**没有连接真手机软键盘**；Safari/iOS、Android Chrome及屏幕阅读器尚未实机验证。截图不能证明完整无障碍合规。
- 有界历史挂载和手动滚动回归通过，但没有声称提高帧率或降低堆内存；下一轮可用200/500/1000条混合内容在真机建立帧时间/内存预算。
- 仍有兼容CSS与过期所有权注释（例如restore/index的旧owner映射）；本轮仅迁移一条已确认的结构规则。后续按组件消化，并保留现有棘轮。无需为了“清理”一次性重写legacy/restore。
- 建议下一轮先做真机软键盘与系统字体加载验证，再逐组件迁移兼容几何；是否进一步收紧浮层、工具输出的视觉层级，以具体内容场景和测量为依据。
