# 前端 UI 与交互流畅度审查

日期：2026-10-16。范围：`frontend/` 当前工作区（含已有未提交修改），桌面 1440×900、手机 390×844，Chromium、本地生产构建、模拟登录与聊天 API。本次只审查，不修改产品代码。

## 结论

现有页面已有良好的基础：768px 阅读栏、统一主题、克制的消息样式、输入法合成保护、消息 memo、稳定段落缓存、流式播放时钟和滚动写入仲裁。桌面及手机的输入框和回复结束布局已有回归保护。下一步应优先改善输出连续性、用户对滚动和折叠的控制、长会话成本，再做视觉细节。

Kimi、ChatGPT、Claude 在这里作为体验方向；本次没有登录它们的在线产品做同条件性能比较，不能据此声称已测出与它们的性能差距。

## 发现与优先级

### P1：菜单关闭后丢失键盘焦点（已复现）

- 位置：`frontend/src/react/menu/AnchoredMenu.tsx:15`、`:29`、`:61`。
- 复现：打开侧栏账户菜单，按 Escape，等待关闭完成。焦点从菜单的 `account-menu-identity` 按钮落到 `BODY`，没有留在 `.sidebar-account-trigger`。
- 原因：Escape 先聚焦触发器，再调用 `requestClose`；`closing` 改变导致回调及依赖它的 layout effect 重跑，effect 又聚焦菜单第一项。延时卸载后焦点丢失。
- 建议：首次打开时执行一次初始聚焦；定位、监听和初始聚焦分开。Escape 关闭完成后恢复触发器焦点；Tab 和点击外部按各自导航意图处理，避免抢焦点。菜单项执行导航时不要把焦点拉回旧触发器。
- 验收：Escape 关闭后焦点仍在触发器；连续打开、关闭及键盘上下选择不跳焦；Tab 能继续导航。

### P1：流式正文动画与现有稳定性约定冲突（已复现，HEAD 已存在）

- 位置：`frontend/src/styles/polish/transcript.css:311`。
- 证据：`stream-smooth.spec.mjs` 的正文无动画检查检测到 1 个动画，期望为 0。CSS 对所有 `.tool-run-prose.is-live` 应用 `streamBlockFadeIn`。同一规则也存在于 HEAD，不能归因于当前未提交修改。
- 影响：新建的 live 正文片段可能再次淡入；与播放时钟、消息入场同时作用，增加输出亮度变化。不是每次 token 更新都会重播动画，不能将其描述为逐字闪烁。
- 建议：正文完全交给播放时钟呈现。一次性入场只用于明确的新消息外壳；光标独立动画；已落定段落保持 DOM 身份、位置和不透明度。
- 验收：恢复现有无正文动画检查；流式结束仍保持正文节点与位置稳定。

### P1：长会话最终全量挂载（已测量，真实负载收益待 profiling）

- 位置：`frontend/src/react/message-list/useProgressiveMessageMount.ts:62`；`progressiveMount.ts:4`。
- 证据：注入 240 条短消息、等待 2 秒，240 条全部挂载，消息区共有 7,560 个 DOM 元素。初始 12 条、每批 12 条的机制会在空闲时持续补齐；它是渐进挂载，不是有界虚拟列表。
- 影响：首屏工作被摊开，但长会话的节点、组件和内存仍持续增长。已有 `content-visibility` 可以减少部分布局绘制成本，不能消除这些节点的驻留成本。本次未量化堆内存或真实设备掉帧。
- 建议：先用 200／500／1000 条、混合代码和工具卡的固定场景量化。达到预算后采用有界窗口或按回合分段回收，缓存测得高度；保留当前 live 回合。全文搜索、浏览器查找、文本选择、复制、辅助技术读取要有明确方案。
- 验收：在同一设备和负载下比较打开时间、长任务、DOM 数、内存和滚动帧时间；保留历史锚点与定位结果，不能仅靠减少节点数验收。

### P2：播放时钟与 React 发布存在双重节流（代码确认，视觉影响待测量）

- 位置：`frontend/src/chat/streamingTurn.js:380`、`frontend/src/react/chatRuntime.bridge.ts:254`、`frontend/src/render/streaming.ts:8`。
- 现状：播放时钟按 rAF 推进，React delta 提交再按文本长度限定为 50／80／120ms，理论最高约 20／12.5／8.3 次每秒。回复越长，显示更新间隔越大。
- 风险：即使网络持续供给、主线程有余量，长回复也可能以较大文本块跳动。现有测试验证了渐进显示和最终内容，没有证明视觉更新足够连续。
- 建议：先记录“网络收到→播放推进→React commit→可见变化”的间隔和耗时。昂贵 Markdown 解析与轻量尾部显示分别调度，稳定块复用缓存；让显示预算取决于测得的开销，而不是只看总字符数。不要直接将全量解析提高到 60 次每秒。
- 验收建议：持续供给条件下，轻量尾部先以约 30 次每秒为实验目标；记录可见更新间隔 P95，同时确认输入和滚动不退化。该数值是拟定目标，不是竞品测量结论。

### P2：思考区无法在生成中收起，键盘和本地化不完整（代码确认）

- 位置：`frontend/src/react/tool-run/ThinkingAccordion.tsx:10`。
- 现状：`isLive || userExpanded` 强制生成中展开，且默认 `userExpanded=true`；点击头部在 live 时直接返回。头部是可点击 div，没有原生键盘按钮语义或 `aria-expanded`；标题、复制状态写死英文。
- 影响：长推理持续占用阅读空间，用户不能主动收起；中文界面混入英文；键盘用户无法正常操作折叠。
- 建议：生成状态与用户展开意图分别存储。默认紧凑摘要，用户可随时展开、收起，状态更新不重置选择。使用独立 disclosure button，配置 `aria-expanded`／`aria-controls`，复制按钮保持同级；接入 en／zh 文案。
- 验收：生成中可收起；完成后保持用户选择；Enter／Space 可切换；中文状态与复制反馈完整。

### P2：消息操作栏信息密度过高（截图观察与设计建议）

- 位置：`frontend/src/react/message-list/MessageToolbar.tsx:145`。
- 观察：助手回复后常驻 8 个操作图标，手机上同样完整铺开；多项功能仅凭图形难以区分。当前截图的正文和输入框已经较清晰，操作栏是更明显的视觉噪声来源。
- 建议：优先保留复制、重新生成，将分享、分支、换种解释、朗读等放入“更多”；评价可根据使用数据决定位置。桌面支持 hover 和 focus-within，手机保留明确入口。工具栏预留高度，避免完成时推挤内容。
- 验收：触摸和键盘均可发现、使用全部功能；完成边界无高度跳变。低频功能分类是设计建议，需结合实际使用数据调整。

### P2：首屏样式成本值得收敛（构建测量）

- 当前主 CSS：779.16 kB，gzip 175.11 kB；主 JS：833.44 kB，gzip 261.57 kB；editor chunk：464.25 kB，gzip 142.91 kB。以上是单独文件大小，不是整个首屏传输总量。
- 中文字体的三个字重通过 unicode-range CSS 分片引入；样式入口同时包含兼容层与当前组件层。字体声明和兼容规则的具体占比尚未测量。
- 建议：先做 CSS Coverage 与请求瀑布，分离必须的壳层、当前页面和重型功能样式；再评估字体分片声明与非关键字重。不要在没有数据时删除中文字体或继续叠加覆盖规则。
- 保持 `themes.css` 唯一且最后导入，四个 parity 桌面 owner、手机独立尺寸、存储 bootstrap 和 CSP 合约不变。

## 如何参考 open-claude-ui

参考仓库：https://github.com/Caho1/open-claude-ui ，本次检查 commit `f504349`。这是第三方实现，README 对逆向精度及生产级能力的表述未独立验证。

值得借鉴的内容是交互约定与组件划分：

- `code-examples/useClaudeScrollPinning.ts`：显式表达用户滚动意图、底部吸附容差、短暂冷却和跳至最新状态。Socrates 已有滚动仲裁，应整合这些状态约定，避免再引入一个并行滚动控制器。
- `code-examples/ClaudeMotionPresets.ts`：为控件、浮层和面板分配不同运动角色。当前项目已有 motion tokens，可将规则映射进去；无需为套用参数引入完整动效依赖。
- `code-examples/ThinkingAccordion.tsx`、`ChatComposer.tsx`：用来检查状态、折叠、输入和操作职责。示例仍需补齐本地化、键盘、焦点与本项目的边界测试。

不建议整体搬入它的 palette、Tailwind 样式或桌面窗口能力。Socrates 的统一主题与 Universal App 迁移方向已经明确，跨平台复用应沉淀交互状态与契约；DOM 测量、原生输入和 Web 动效留在对应平台。

## 实施顺序与验收

1. 第一批：修菜单焦点、正文动画、思考区可控性与本地化。收益明确，改动相对集中。
2. 第二批：建立流式与长会话性能采样，再做尾部调度和有界挂载。以输入延迟、可见更新间隔和滚动帧时间共同验收。
3. 第三批：简化消息操作栏，统一菜单／工具卡展开节奏，按 Coverage 结果削减首屏样式。浅色、深色、桌面、手机均留截图对照。

建议补充的体验预算：输入到下一帧反馈 P95 <50ms；显式点击到状态反馈 <100ms；回复完成时正文位移 ≤1px；用户上滚后不被流式内容拉回。预算需要在固定设备与明确负载下测量，不以本地 API mock 的加载时间代表线上体验。

## 验证记录

- TypeScript 检查及生产构建完成。初次构建遇到 root 所属的生成目录权限问题；修正 `.vite-temp` 和 `dist` 所属权后重新运行标准构建成功。
- 聚焦检查：`chat-workbench`、`stream-smooth`、`stream-finish-stability`，共 14 项。标准构建成功后复跑，仍为 13 通过、1 失败（42.5 秒）；失败为上文已定位的正文动画。
- 菜单 Escape 焦点丢失、240 条消息最终全量挂载另用浏览器脚本复现。
- 已查看桌面和手机聊天截图，位于 gitignored 的 `frontend/test-results/ui-audit/`。截图使用模拟消息，不包含真实用户数据。
- 未测真实后端 TTFT、线上网络、真实手机键盘／Safari、低端设备 GPU、堆内存及竞品在线页面；这些不能由此次检查推断。

## 第一批修复记录

用户确认开始修复后，已实施菜单焦点、流式正文动画、思考区可控性三项：

- 菜单仅在打开时设置初始焦点；退出期间不可交互。Escape 返回触发器，Tab 从触发器按文档顺序继续，点击外部保留目的控件焦点。
- 移除 live 正文块的淡入动画，保留独立光标和消息外壳的现有表现。
- 思考区默认折叠，使用原生按钮和 ARIA 关联；生成中可切换，更新与完成保持用户选择。支持运行中切换中英文，以及复制成功／失败反馈、卸载清理。
- 新增 `anchored-menu-focus.spec.mjs`、`thinking-accordion.spec.mjs`、`thinkingAccordion.test.mjs`。新组件及既有活动状态模型的 13 项单元检查通过；新增交互、流式显示和完成稳定性共 12 项浏览器检查通过。
- 最终标准 `npm run lint` 与 `npm run build` 均通过（lint 保留仓库已有 warnings）；补跑菜单、思考区和聊天工作台 8 项全部通过。已复查桌面／手机截图，截图产物保留在 gitignored 的 `frontend/test-results/`。
- 扩展运行原有 `thinking-panel` 后发现 6 项失败：2 项期望显示 `phase: initial` 摘要，但当前处理器明确忽略它们，已在独立干净 HEAD `774958a3`（仅隔离测试端口）复现；另外 4 项是摘要 16px 与工具标签 14px 不一致，来自任务开始前已有的 `components/tool-card.css` 修改，本轮未修改该文件。干净 HEAD 中这 4 项通过。保留这些已有行为差异，未通过放宽断言掩盖失败。
- 长会话有界挂载、消息操作栏与首屏样式成本尚未实施，需按上述第二、三批分别验证。

## 第二批 · 流式双重节流与发送气泡动效契约

- 流式 cadence：`frontend/src/render/streaming.ts` 的 `getStreamRenderInterval` 由旧档位 `[50, 80, 120]ms`（按长度递减到约 8–20 次每秒）改为 `[33, 50]ms`（<32000 字约 30 次每秒，≥32000 字约 20 次每秒保底）。`test/streaming.test.mjs` 与 `test/streamCadenceProperties.test.mjs` 同步为 `[33, 50]`。
- 实测（本地 puppeteer Chrome + Playwright 驱动，持续约 3.7k 字/秒 供给）：1.5k–40k 字区间可见更新间隔稳定在约 30 次每秒，单帧最大字符块从约 270 降到约 134，主线程无长任务。旧档位在长回复时约 8–12 次每秒、单帧约 270 字符，瓶颈是长度键控过度保守，而非渲染开销。
- 发送气泡动效契约：`polish/transcript.css` 的 `@keyframes msgUserIn` 曾用 `scale(0.96) translateY(6px)` 覆盖 legacy 的纯 opacity 版本，使刚发送的 prompt 自身带 transform，与 legacy `06-chat-transcript.css` 的 `transform:none` 及 `e2e/chat-send.spec.mjs` 的断言冲突。已移除 transform，恢复“位移只由 turnAnchor 滚动滑行负责”。
- 发送滑行目标：`chat/turnAnchor.ts` 的滑行目标把“视口内偏移”当成了 `scrollTop`（`anchorInList - targetOffset`），只有在读者已在顶部（`scrollTop` = 0）时数值才**碰巧**正确。从满屏会话底部发送时，它让滑行把整个滚动范围**反向**跑一遍再吸附（实测偏移从 682 单调增到 4158 后跳到 12，正是“刚发出的 prompt 先反向闪一下”）。已改为与 retry 一致、且逐帧从实时布局重算的绝对 `scrollTop`：“`scrollTop` + 视口内偏移 − 目标偏移”。`scrollTop + offset` 是 prompt 在内容中的位置，滚动不改变它，所以逐帧重算既稳定、又能在布局中途变化时弯曲到真实落点，不再落偏几像素后回弹。
- 验证（同一本地驱动，改动前 HEAD 为对照）：
  - `chat-send`：8/9 → **9/9**（移除气泡 transform）。
  - `chat-send-glide`：4/13 → 8/13（移除 transform）→ **13/13**（滑行目标修复）。此前失败集中在“满屏会话在底部”“深历史”两个场景。
  - `chat-autoscroll` + `chat-keyboard-anchor` 共 18 项：5 失败 → **3 失败**（滑行目标修复又修好“发送滑行而非瞬移”“抢跑中回合仍视觉稳定”两项）。
- 残留（改动前后均在干净 HEAD 失败，属其它子系统，未在本轮处理）：`chat-autoscroll` 的“固定读者跟随流式增长”（实测 `scrollTop` 采样极差为 0，流式增量未推动滚动）、`chat-keyboard-anchor` 的 visualViewport 抬升与 resizes-content 两项（键盘模拟环境相关）。
