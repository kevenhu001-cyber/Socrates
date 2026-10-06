# 手机参考 UI 验收记录

本次保留 Socrates 名称、标志、真实套餐及服务数据。代码与交互检查通过；视觉验收尚缺原始图片的最终并排比较，不能据此声明逐像素一致。

## 证据与状态

- Source visual truth：用户提供的六张参考图，原路径为 `/tmp/paseo-attachments-u3yMUL/`。此目录在当前环境已不存在，原始图片无法重新打开。
- 原先记录的参考尺寸：1200 × 2670 像素；剔除顶部 306px 浏览器区域，再归一化到 390 × 769 CSS px。该裁剪需要恢复原图后复核。
- Implementation：本地 Vite 生产构建，通过 Playwright Chromium 渲染；390 × 769 CSS px，deviceScaleFactor=1，截图为390 × 769 像素。
- 状态：中文、暗色；首页/免费账户侧栏/会话菜单/插件/资料库/付费账户菜单。仅浏览器测试使用参考中的名称、文件和连接器；生产数据来自现有 API。
- 额外检查：320 × 568 短屏、1440 × 900 桌面、浅色模式、字体缩放、键盘焦点。

| 状态 | 实现截图 |
| --- | --- |
| 首页 | `/tmp/socrates-final-home.png` |
| 免费账户侧栏 | `/tmp/socrates-final-sidebar.png` |
| 会话操作菜单 | `/tmp/socrates-final-session-menu.png` |
| 插件目录 | `/tmp/socrates-final-plugins.png` |
| 资料库 | `/tmp/socrates-final-library.png` |
| 付费账户菜单 | `/tmp/socrates-final-account-menu.png` |
| 桌面 | `/tmp/socrates-final-desktop.png` |

实现全景汇总保存在 `docs/ref/mobile-implementation-2026-10-04.png`，便于直接查看。所有实现截图已打开检查。**Full-view comparison evidence 尚不完整**：当前只能复核之前记录的参考尺寸，不能把源图和最终实现放在同一个比较输入中。Focused region comparison 同样等待原图恢复；需要重点复核顶栏、输入框、两种弹出菜单以及文件/连接器图标。

## 修正历史

| 优先级 | 发现 | 修正 | 修正后证据 |
| --- | --- | --- | --- |
| P1 | 侧栏关闭按钮的伪元素点击区域覆盖“更多” | 给手机侧栏按钮明确设置定位上下文 | incognito 用例重跑通过，更多及设置可点击 |
| P2 | 首页动画最终状态覆盖标题的 translateY，中心落在359.75px | 手机标题取消旧入场动画 | 标题中心344.75px；输入框仍位于y660，高85px |
| P2 | 插件名称受兼容层16px/500强制样式影响，第一行图标落在448.5px | 旧字体规则限定桌面；手机目录统一控制名称与节奏 | 名称15px/400；第一行y408，图标y423 |
| P2 | 会话菜单锚点偏下且条目间隙累积 | 手机菜单锚点和行间隙统一 | x201、y413.5、宽158、高288px |
| P2 | 首页/对话输入框左右留白不同 | 对话容器使用相同16px页面边距 | 手机明暗两种composer-parity用例通过 |
| P2 | 返回新聊天后，旧目录仍呈选中状态 | 重置页面时同步现有侧栏导航桥 | plugin-directory 回归检查新聊天清除旧选中状态 |

## 必需视觉面检查

- **字体**：本地引入 Inter、Noto Sans SC 的400/500/600字重，避免中文回退到衬线体；手机标题23px、导航14px、插件名15px/400。Android系统字体轮廓与Chromium抗锯齿差异仍需原图核对。
- **间距**：顶栏56px、抽屉254px、导航及历史行40px；首页输入框x16/宽358/高85/底部24px。资料库行60px，菜单通过视口约束避免短屏溢出。
- **色彩**：唯一活动调色板仍由最后导入的 `themes.css` 提供。暗色画布黑色，输入框#212121，圆形控制#383838，弹出层#353535，选中行#1a1a1a；需要恢复原图才能重新采样对比。
- **图像与图标**：Socrates现有logo保留，两个favicon与对应logo字节一致。连接器使用已有本地品牌资产；语音和置顶使用Lucide。第三方品牌资产版本、文件类型图标与参考的细微轮廓差异待逐区核对。
- **文案与内容**：固定文案保持Socrates产品语义；账号名、文件、历史和安装状态来自实际数据。保留实际套餐名称，不把付费账户改成ChatGPT Plus；不重画Android或Chrome界面。

## 交互与工程验证

- lint（含TypeScript、现有CSS归属检查、新手机CSS检查、i18n及CSP）通过；生产构建通过。
- 2项输入框相关单元测试通过。
- 37项不同的定向浏览器用例通过（早期失败项修复后重跑；最终两个子集分别10/10和7/7通过）。检查覆盖首页/对话输入框、录音转写与发送状态、菜单键盘导航/焦点恢复、会话重命名/置顶/移至项目、资料库筛选/选择、连接器搜索/连接管理、明暗模式、字体设置和侧栏导航。
- 最终截图运行未捕获未处理的浏览器运行异常。录音测试使用浏览器能力模拟；没有新增实时语音服务。
- 样式归属及测量契约见 `docs/ref/mobile-reference-2026-10-04.md`。未发布、部署或提交生成文件。

## 剩余项

1. 恢复六张原始参考图。
2. 以同一尺寸、主题和账户状态制作全图及局部并排比较，复核裁剪、字体、图标、菜单和安装列表；当前实现截图不能替代这一步。
3. 修正比较发现的P0/P1/P2差异后再次截图，再决定是否通过视觉验收。

P3候选：Android字形/抗锯齿与品牌资产版本造成的轻微轮廓差异，须有原图证据后再分类。

final result: blocked

阻塞原因：原始参考图片临时文件已失效，无法完成同输入中的最终视觉对照；这不是构建或交互测试失败。

## 后续局部验收：资料库标题与操作按钮对齐

用户要求资料库与插件等目录页对齐，此要求取代原参考图中的资料库固定顶栏布局。本项比较目标为当前插件页，而不是缺失的原始图片。

- 比较输入：`docs/ref/library-heading-alignment-2026-10-04.png` 将中文暗色插件页与资料库页放在同一输入中；每页390×769 CSS px，deviceScaleFactor=1，无密度缩放。
- 原问题：手机资料库标题位于x56/y12、按钮位于y9，占据应用顶栏；插件标题位于x16/y76。桌面资料库存在15px横向偏移及不同的顶栏高度。
- 修正：手机目录使用共同的20px顶部及16px侧边距，资料库标题和操作按钮参与内容区正常布局；桌面去除额外偏移并共用插件页的紧凑应用顶栏、标题字号及内容边距。
- 复查：390px与320px的两页标题起点均为x16/y76，行高32px；1440px两页均为x498/y129，字号28px、行高36px。资料库操作区与标题顶边对齐，320px宽度下仍完整可用。
- 完整截图及局部标题区域已打开检查。调色板、品牌资产与文案没有因本项修改而改变；目录内容继续使用实际API数据。
- 构建、lint及4项资料库浏览器用例通过，涵盖对齐、新建菜单、设置、文件筛选和行选择。

本项局部验收：passed。上面的总体参考图验收仍待原图恢复。

## 2026-10-06 后续验收：Summary 与桌面 UI 质感

本轮使用当前会话中恢复的四张参考图，针对聊天 Summary、侧栏/目录、composer 与插件目录做实现和视觉复核。保留 Socrates 品牌资源、主题变量及现有页面结构。

| 参考与实现对照 | 文件 |
| --- | --- |
| 图四：思考与工具调用 Summary | `frontend/test-results/visual-qa-current/summary-reference-comparison.png` |
| 图二：插件目录 | `frontend/test-results/visual-qa-current/plugin-directory-reference-comparison.png` |
| 图三：添加菜单 | `frontend/test-results/visual-qa-current/composer-menu-reference-comparison.png` |
| 当前暗色桌面对话、Summary 展开 | `frontend/test-results/inline-summary-dark-desktop-open.png`（1280 × 720） |
| 当前暗色桌面对话、Summary 收起 | `frontend/test-results/inline-summary-dark-desktop.png`（1280 × 720） |
| 当前浅色窄屏对话、Summary 展开/收起 | `frontend/test-results/inline-summary-light-mobile-open.png`、`frontend/test-results/inline-summary-light-mobile.png`（390 × 844） |
| 当前插件目录 | `frontend/test-results/plugin-directory-reference-desktop.png`（1280 × 720） |

### 视觉与交互复核

- 图四的层级化样式用于消息流内 Summary：阶段提示和工具组按发生顺序呈现；工具行继续使用原来的展开、审批、错误及结果交互。生成时卡片展开，完成后自动收起，用户仍可手动切换。展开时标题显示简洁的思考状态，避免和最新阶段重复；收起后显示最近阶段。
- 内部进度标记会在流解析、断线恢复和正文保存时剔除；原始 reasoning 不渲染。阶段提示来自主模型，不增加摘要模型请求。没有阶段提示时沿用已有状态和工具名称。
- Summary 数据作为可选字段增量保存并恢复；旧会话没有该字段时仍按已有消息展示，旧客户端省略字段也不会覆盖服务器上已有摘要。
- 图一、图二参考的黑色画布、克制的边界层次与紧凑图标细节用于侧栏、插件目录、输入区和工具 SVG；SVG 圆角有微调，品牌图标文件未改。图三添加菜单的条目、边框和图标细节已打磨；菜单仍沿用 Socrates 当前竖向结构，未改成参考图的宽浮层。
- 桌面暗色 Summary、桌面插件目录和浅色窄屏 Summary 截图已打开检查。Summary 卡片和页面在390px视口无横向溢出。

### 工程验证

- Frontend：`npm run lint`（TypeScript 与架构检查通过；0 errors，627 warnings）、`npm run build` 通过。
- Server：`npm run typecheck` 通过；`node --import dotenv/config --import tsx --test test/sessionSanitizer.test.js` 通过。
- Focused unit：阶段提示解析、Summary 排序、流断开续传及增量保存相关单测通过。
- Summary、工具生命周期、会话持久化浏览器用例：最终回归37/37通过；工具突发调用用例会先展开自动收起的 Summary，再核对三条持久化工具记录。
- 侧栏/首页、composer 菜单、插件目录、Summary 桌面与窄屏明暗主题：27/27通过。截图复核12/12通过；标题微调后 Summary/插件截图重拍3/3通过。
- `git diff --check` 通过。构建仍打印已有的依赖 `use client`、混合静态/动态导入和大 chunk 警告；没有构建错误。

本轮视觉与功能验收：passed。

final result: passed

## 2026-10-06 后续迭代：思考 Summary 卡片重设计

- **Source visual truth**：用户提供的图四，`/tmp/paseo-attachments-ySXqVm/e55347c2f901d36b76af7ddc53ac0522928d629a607b556ea6ee330ace747b36.png`，原始尺寸 1690 × 1115 像素。
- **Implementation**：Playwright Chromium 静态构建截图，桌面 1280 × 720 CSS px、deviceScaleFactor=1；浅色窄屏 390 × 844 CSS px、deviceScaleFactor=1。
- **对照图**：全景并排 `frontend/test-results/summary-design-qa-full-comparison.png`；Summary 卡片局部并排 `frontend/test-results/summary-design-qa-comparison.png`。局部对照把源卡片 1482 × 340 区域缩放到 760 × 174，实现在同状态下裁为 762 × 205 再缩至 760 × 205。源图与实现的整屏比例不同；局部对照用于核对卡片层级、描边、文字和工具行。Socrates 的 768px 阅读列按现有转录区规范保留，没有扩成源图中的宽内容列。
- **实现截图**：桌面暗色展开 `frontend/test-results/inline-summary-dark-desktop-open.png`、桌面暗色收起 `frontend/test-results/inline-summary-dark-desktop.png`；浅色窄屏展开 `frontend/test-results/inline-summary-light-mobile-open.png`、收起 `frontend/test-results/inline-summary-light-mobile.png`。
- **状态**：完成态、摘要为中文、一个成功网页搜索工具；另检查生成中阶段更新、手动折叠/展开、窄屏和浅色主题。

### 发现与修正

- [P1] 上一版把多个阶段状态堆成时间线，完成后没有清楚的思考内容摘要。将主模型的一到两句高层工作摘要通过独立标记输出，在回答正文之外解析，并作为完成态收起标题；展开后以简短正文呈现摘要，工具行放在轻边框卡片下方。提示明确禁止输出私有逐步推理，不调用额外摘要模型。缺少模型摘要时才退回阶段状态和工具标签。
- [P2] 摘要数据已进入消息，但优化过的 React 消息行未感知该字段更新。发布活动更新事件并在消息 memo 比较中检查摘要数组，使完成态标题即时刷新；新增桥接单测与 Summary E2E 覆盖。
- [P2] 窄屏收起标题曾将摘要单行截断。改为最多两行显示，长文仍可展开阅读。

### 必需视觉面复核

- **字体与层级**：继续用 Inter 与 Noto Sans SC。桌面摘要正文 15px、阶段行 14px，窄屏正文 14px；进度标题采用中等字重，摘要正文以正常字重显示。中文摘要在 390px 下完整换行至两行。
- **间距与布局**：进度标题在卡片外；展开后只有一层细边框，16px 大圆角和 16 × 18px 内边距，工具区用一条分隔线。面板填充已有阅读列，避免额外嵌套边框和时间线装饰。
- **颜色与 token**：暗色使用黑底、中性文字和主题提供的 10% 细边框；浅色沿用白底与 6% 细边框。未加入新调色板或字面颜色。
- **图像与图标**：Summary 本身不需要图片；展开控件继续使用现有 Lucide chevron，不替换品牌素材。
- **文案与内容**：卡片摘要只包含面向用户的高层工作概括，阶段提示只在流式期间作简短状态；工具调用继续复用现有可展开行、审批、错误和结果交互。摘要标记、摘要文字及 `<think>` 私有内容均不进入回答正文或其 rawText。

### 工程与浏览器验证

- `npm run lint` 通过：0 errors、627 warnings（既有 warning 数量）；主题键、CSS 归属、消息层和 CSP 检查均通过。
- `npm run build` 通过；保留已有的依赖 `use client`、混合静态/动态导入和大 chunk 提示。
- 前端定向单测 6/6 通过，含 marker 分段解析、摘要排序/恢复/增量保存和 activity 更新桥接；Server `typecheck` 与 `sessionSanitizer` 测试通过。
- Summary、会话增量保存、工具卡片/分组、工具输出生命周期 Playwright 回归 37/37 通过；最终 Summary 桌面与窄屏复跑 2/2 通过。
- 浏览器检查确认路由为 `/`、`#appShell` 可见、没有 Vite 错误层；桌面和窄屏流程的 `console.error` 与 `pageerror` 均为空。Playwright 实际流程覆盖模型阶段提示、工具摘要、完成态收起、手动展开，以及正文不泄漏内部标记和 `<think>`。
- Browser 插件在本次会话不可用；使用项目 Playwright Chromium 静态服务验证，已获本任务 E2E 计划授权。

本轮 Summary 视觉与交互验收：passed。

final result: passed
