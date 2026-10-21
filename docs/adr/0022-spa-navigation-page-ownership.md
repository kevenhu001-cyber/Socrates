# ADR 0022 — SPA 导航与页面生命周期收敛

- 状态：Accepted
- 日期：2026-10-21
- 关联：ADR 0003、0012、0013；延续 F-002/F-009/F-010 的增量治理

## 背景

SPA 的路径、目的地与宿主映射分别维护；异步页面挂载还会自行取消隐藏，
导致离开页面后它可能重新出现。workspace 页面订阅整个 store，共享 loading
会让其他页面请求影响已挂载的页面。设置在首次打开时挂载全部八个分类。

## 决策

1. `frontend/src/sidebar/navigation.destinations.ts` 是路径与宿主元数据真源，
   不包含 UI、加载器或副作用。导航服务负责路径、选中项与视图切换；
   视图控制器执行显隐，懒加载挂载函数只负责内容。创建页面的宿主由异步模块
   插入，插入后须确认仍为当前目的地，再激活视图。
2. 浏览器返回首页时恢复原核心视图，保留会话和草稿；更多菜单、技能弹窗不改变
   当前页面的选中项。移动端抽屉通过现有 sidebar service 关闭。
3. workspace 页使用页面类型、局部 selector、稳定 actions 和独立 loading 标志。
   对未知页面直接返回，不再退化到插件页。保留现有加载与数据失败提示语义；
   删除没有消费者的旧 publish 接口、全局状态与 MCP 占位字段。
4. 设置分类首次访问才导入与挂载，已访问分类保持挂载及状态。局部 loading/error
   不替换整个弹窗。网络导入失败可重试；针对浏览器缓存的失败，重新请求错误中
   标识的同源 JS/TS 模块并附加尝试编号。无法识别的错误继续走原加载器并显示
   局部错误，不刷新页面或丢弃草稿。
5. 设置几何归入现有 `polish/overlays.css`，删除迁移后的 restore 与 legacy
   覆盖，使用现有颜色、尺寸与字体 token。删除无消费者的旧 `.settings-btn` 规则，
   保留当前 `.btn` 与 `.settings-btn-mini`。移除插件图标及模型标题的无职责包装。

## 边界与验证

- 保持现有路径、导航分类、兼容入口、React 宿主 ID 和 API。不改其他客户端、
  schema、部署和聊天流式机制。
- 验证页面局部渲染、历史返回、直达、刷新、异步加载竞态、设置草稿与失败重试；
  执行相关单测、Playwright、lint、build，并保存前后 UI 和体积证据。
- 截图与测试结果按当前 AGENTS 规则保存在 gitignored `frontend/test-results/`，
  不提交构建产物与测试报告。实测结果见下文。

## 回滚

按导航、workspace 订阅、设置/样式三个行为组分别恢复旧实现及其配套测试；
设置与其样式迁移一同回滚。没有持久化格式变更、迁移脚本或部署操作。

## 后续债务

聊天桥全局 revision 会触发消息列表重新筛选；后续须先量测，再单独优化。
其余 restore/legacy 样式按各自 owner 逐步迁移；本轮不全面改目录或引入路由框架。


## 验收证据（2026-10-21）

基线为原始 HEAD `129ee911`，在隔离目录重建；最终构建使用相同依赖与 WASM。
Chromium，桌面 1440×900、手机 390×844，API mock，无并发构建或测试干扰。
Browser 插件/技能未提供，使用仓库已有 Playwright。

| 指标 | 基线 | 本轮 |
| --- | ---: | ---: |
| 首屏 HTML gzip / B | 18,717 | 18,716 |
| 首屏静态 JS 闭包 gzip / B | 334,284 | 334,286 |
| 首屏关联 CSS gzip / B | 208,285 | 208,281 |
| 首屏总量 gzip / B | 561,286 | 561,283 |
| 设置初次挂载分类 | 8 | 1 |
| 设置子节点 / 最大内部深度 | 205 / 11 | 29 / 7 |
| 插件目录子节点 / 最大内部深度 | 124 / 12 | 119 / 11 |

首屏总量基本持平，满足现有 588,000 B 预算；不把几个字节的构建差异视为性能收益。
设置节点减少约 86%，且无额外面板包装；资料库与项目 DOM 结构保持原样。
CSS 债务基线收紧：`!important` −1、硬编码颜色 −21、固定圆角 −4、
固定字体尺寸 −8、旧 HSL 通道引用 −9，live 区域指标未增加。

各页面打开后等待可见内容及两个 rAF；每页一个冷样本、六个热样本，中位数如下。
耗时包含 Playwright 往返与浏览器帧等待，仅用于本地回归比较，不能外推生产收益。

| 热切换中位数 / ms | 桌面基线 → 本轮 | 手机基线 → 本轮 |
| --- | --- | --- |
| 资料库 | 61.6 → 35.7 | 60.5 → 60.2 |
| 项目 | 28.5 → 28.3 | 27.7 → 27.6 |
| 插件 | 28.6 → 28.5 | 43.7 → 40.0 |
| 设置 | 29.8 → 29.2 | 29.3 → 30.1 |

冷切换均约 44–98 ms；手机资料库冷样本从 90.6 到 97.1 ms，热样本未退化。
所有目标页没有持续的切换退化，正常流程控制台 error/warning 与 pageerror 均为 0，
页面标题为 Socrates，无空白页或框架错误遮罩。已人工查看桌面设置、手机设置与插件截图；
分类导航在手机端保留横向滚动，页面无横向溢出或控件遮挡。

验证命令与结果：

- `npm --prefix frontend run lint`、`npm --prefix frontend run build` 通过；
  lint 的既有 456 条 warning 保留，零 error。
- `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test test/mainViewController.test.mjs test/workspaceSubscriptions.test.mjs test/navigationDestinations.test.mjs test/entryGraph.test.mjs`
  在 frontend 内执行通过；覆盖局部渲染与稳定 actions、独立 loading、元数据、返回会话。
- 相关 Playwright 子集 72 项通过；新增创建页加载竞态后，受影响子集 37 项通过。
  最后删除死按钮 CSS 后，设置与加载预算子集 18 项再次通过；共 73 个不同用例通过。
  子集包含导航、资料库、项目、插件、设置、加载预算、聊天、主题、首页与移动端参考布局。
- 新用例覆盖浏览器返回首页/刷新、所有九个路由直达、更多菜单保留选中状态、
  两种异步页面加载竞态、只挂载已访问设置分类、草稿保留及连续失败后重试。
- 前后截图及原始测量位于 `frontend/test-results/structure-before/` 与
  `frontend/test-results/structure-after/`；回归 trace 位于 `structure-regression/`、
  `structure-final/`、`structure-settings-final/`（通过用例不保留 trace）。

没有执行全量单测或全量 Playwright；未做生产数据、Firefox/Safari 或真实设备性能测试。
前一次并发构建期间的测试超时已通过停止并发后串行重跑排除，没有放宽断言或超时。
