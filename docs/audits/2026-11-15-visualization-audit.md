# 可视化工具逐项检查（2026-11-15）

## 范围与方法

检查入口为 `render_intelligent_ui`、`patch_intelligent_ui`，覆盖 28 种 visualization 模板、OpenUI Visualization、数学演示的 plot/field/trajectory/scene/metrics/controls、6 个 physics 模型及旧版 Mermaid/plot/html/viz/svg 围栏。

核对模型所见参数说明、共享规范化、服务端结构/语义校验、客户端渲染器映射、加载失败恢复、增量修改及资源清理。已有未提交的编辑消息/输入框修复保留。本轮不修改 API 字段、数据库或部署状态。

## 已修复问题

| 问题 | 影响 | 修复与证据 |
| --- | --- | --- |
| 外层缓存保留已拒绝的 ECharts/Plotly/Mermaid 加载 Promise | 底层 loader 已支持恢复，卡片 Retry 仍重复失败 | 加载拒绝时清空外层缓存；逐引擎失败→恢复单测 |
| 自托管脚本等待没有截止时间 | 无 load/error 的连接让卡片一直加载 | 每次请求 15s 截止、最多三次，清除失败标签、计时器和旧回调；假时钟测试 |
| 专用渲染器只比较 data-mode | 同为亮/暗模式但更换配色后颜色不更新 | 同时比较 data-mode/data-theme，释放观察器；Plotly 主题与卸载单测 |
| 热力图把 null 纳入颜色范围并保留为数据点 | 正数图的色阶被拉到 0，缺失值看起来像真实测量 | 只用有限数字计算色阶，省略缺失格；全缺失矩阵在服务端拒绝 |
| 雷达图接受全缺失系列 | 成功返回但没有有效图形 | 每个系列至少一个数字，与普通数值图表一致 |
| 数轴对字符串使用删末尾 0 的正则 | 10000 / -10000 显示成 1 / -1 | 数值化有效位格式化结果，单测与浏览器断言保留整数零 |
| Mermaid 标签中语法字符未转义，长公式被截断，竖线被删除 | 合法标签导致语法错误或数学含义改变 | 字符实体编码并在 SVG 文本恢复字符、复用保留公式的截断器、设置全局 htmlLabels:false；标签单测与公式浏览器用例 |
| 白板持久存储以标题为键 | 同标题、不同中文标题可能打开同一存储 | 每张卡片独立内存白板，不再按标题共享 IndexedDB。刷新后以模型提供的原始 notes 重建；本地手动编辑不跨重挂载保存 |
| 白板只画前 30 个已接受 notes | 服务端最多接受 200 个，后面的内容静默消失 | 显示全部已接受 notes；说明中区分建议 30 与上限 200；31 notes 浏览器回归 |
| 3D 固定相机只看原点 | 合法远端坐标物体在视野外 | 对实际物体包围球定相机中心、距离和裁剪面；远端物体像素回归 |
| 3D 卸载只清 Scene | 几何体、材质和 WebGL 上下文占用未释放 | 遍历释放几何/材质并释放上下文；上下文丢失浏览器断言 |
| GeoGebra 只移除 DOM，超时后回调仍执行旧指令 | 残留运行时及过期绘图 | 可用时调用 remove，超时后回调只清理，不执行指令；回归单测 |
| 通用修复提示强制所有模板使用 series | function/graph/geometry 等可能在不同错误格式间反复重试 | 服务端与客户端提示按函数/数值图/关系图/几何/教学示意各自契约修复 |
| 原始正文没有 HTML 快照，或在消息行之后延迟挂载 | 旧版 Mermaid/html 等停在 Rendering 占位；正文只绑定代码块按钮 | 流式与已完成正文统一在实际挂载后初始化；Mermaid 队列遇到未挂载卡片保留源码，等待挂载重启，避免提前消费；单测与既有浏览器回归通过 |
| 图表原位更新直接抛出无效数据异常 | 临时缺失值可能让 React 上层报错 | 更新失败返回 false，由现有失败卡片路径承接，保留原内容到切换；全缺失热力图更新回归 |

## 28 种模板逐项核对

所有行均有服务端契约样例校验和浏览器模板用例。GeoGebra 浏览器用例替换外部 applet，仅证明接入流程；其命令返回 false、超时及清理由单测覆盖。

| 模板 | 渲染器 | 重点检查 |
| --- | --- | --- |
| function | Plotly | 安全表达式解析、区间、断点、有限样本、加载恢复、纠错语法 |
| line | ECharts | 分类与长度对齐、null 缺口、全缺失拒绝 |
| area | ECharts | 折线与填充、分类轴、缺口 |
| bar | ECharts | 数值/分类兼容、加载恢复 |
| scatter | ECharts | 元组/对象坐标、拒绝 category、数据表 |
| pie | ECharts | 单系列、非负值、至少一个正值 |
| histogram | ECharts | 预计算分箱、非负计数 |
| heatmap | ECharts | 矩阵轴维度、缺失格、色阶、全缺失拒绝 |
| radar | ECharts | 轴数、上界、系列长度、全缺失拒绝 |
| boxplot | ECharts | 五数摘要有序、分类匹配 |
| flowchart | Mermaid | 节点/边引用、标签转义、加载恢复 |
| sequence | Mermaid | participant 与消息、标签转义 |
| state | Mermaid | 状态声明与转移、标签转义 |
| tree | Mermaid | 单根、单亲、连通与无环 |
| mindmap | Mermaid | 层级树约束与显示 |
| network | Mermaid | 图引用、任意关系 |
| timeline | 原生 SVG | 2–12 项、手机布局 |
| comparison | 原生 SVG | 2–8 项、文字与数值 |
| process | 原生 SVG | 2–12 步、箭头与手机布局 |
| number_line | 原生 SVG | 有限/不同数值、±1e9、标签数字 |
| geometry | 原生 SVG | 点/线/圆/多边形、坐标范围、等比例投影 |
| concept_map | Mermaid | 概念节点与关系标注 |
| svg_illustration | 沙箱 iframe | 完整 SVG 根、静态资源限制、可访问摘要与尺寸 |
| interactive_simulation | 沙箱 iframe | 内联脚本、无外网、消息来源/nonce、异常反馈 |
| paper_chart | Plotly | line/bar/scatter 混合系列、分类长度与加载恢复 |
| math_construction | GeoGebra | commands、拒绝指令、CDN/app 超时、迟到回调与卸载 |
| geometry_3d | Three.js | 四种几何体、范围、相机视野、卸载释放 |
| whiteboard | tldraw | 独立卡片、全部种子、卸载 root |

## 其他可视化入口

- `demonstration`：共享 DSL 解析器/归一化、表达式与求值预算、ODE 步长/时长上限、运行时发散反馈；plot、field、trajectory、scene、metrics、controls 由现有数学演示单测和浏览器样例覆盖。
- `physics`：rayleigh、wave-interference、electric-field、harmonic-oscillator、pendulum、projectile；现有测试覆盖默认值、参数边界、运行时及滑块联动。未发现需要改写的物理模型契约。
- `chart/table/metric/progress` 及交互控件：共享校验负责字段与动作，已有控件/交互测试；OpenUI 继续使用已登记组件，不执行任意 React/JS。
- `patch_intelligent_ui`：核对版本冲突、原子性、禁止修改身份、移除子树，服务端会再次校验修改后的全部可视化。保留原有回归用例。
- 旧版 Mermaid/plot/html/viz/svg 围栏：核对沙箱、握手、报错、离屏停车/恢复；修复原始正文挂载后缺少可视化初始化的问题。
- `code_interpreter` 的 matplotlib PNG：核对 Agg/savefig 指引、大小上限、文件持久化及归属校验；10 项输入/产物防护测试通过。未启动实际 Pyodide/WASM 作图任务。

## 验证记录

统一在实现结束后运行；发现失败后修复并只重跑受影响检查。

| 检查 | 结果 |
| --- | --- |
| 前端 lint 完整链 | 通过；后续改动经 build 内的 tsc、定向 ESLint 和相关架构守卫验证 |
| 最终前端 build | 通过 |
| 最终包体积门禁 | 通过（JS 17,870,777 / 18,600,000 B） |
| 服务端 typecheck | 通过 |
| 前端可视化、OpenUI、数学演示、物理、旧版围栏、loader 单测 | 初轮 131 项通过；新发现边界与正文挂载测试另行定向通过 |
| 后端可视化/Intelligent UI/数学演示测试 | 121 项通过 |
| 增量编辑、流式 UI 与模型契约复验 | 服务端 51 项通过（含与上一行重叠用例）；客户端 turnRuntime 5 项通过 |
| code_interpreter/产物输入防护 | 10 项通过，未启动 Pyodide |
| 最终加载恢复/实体还原测试 | 6 项通过 |
| 最终挂载时序/视口门控/正文测试 | 定向用例通过，包括 render 先于 DOM commit 的情况 |
| 浏览器 | 覆盖 73 个不同场景：28 模板、数学/物理/控件、白板/3D、旧版围栏和公式。按组执行，发现的两处失败修复后定向复验通过 |
| 图像检查 | 人工查看 3D 相机、物理示意和最终 Mermaid 公式截图 |

浏览器使用项目 Playwright + Chromium，`http://127.0.0.1:4173`；覆盖的现有场景含明/暗主题、桌面/390px 手机布局。Browser 插件未提供。ESLint 对扩展后的 `processPendingMermaid` 有一条非阻断复杂度警告（17，配置建议上限 15），没有错误。

## 验证边界

- 不调用真实 LLM；不能据此承诺供应商永不截断或永不输出错误参数。仍保留失败校验和模型重试。
- 没有执行真实 Python/WASM 绘图或真实图像生成供应商调用；代码解释器只验证输入/产物契约。
- GeoGebra CDN 的真实可达性和完整第三方 applet 未做联网验收；超时/降级提示继续保留。
- 浏览器验证以本机 Chromium 为准，不能替代 Android WebView、iOS 或所有 GPU 驱动的设备验收。
- 本轮无数据库迁移；回滚涉及代码与构建产物，不涉及数据变更。白板不再按标题读取以前共享的本地存储。
