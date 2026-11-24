# 提示类表面（note / callout）统一检查（2026-11-24）

## 背景与规范

旧的提示块是「左侧 2px 彩色竖线 + 同色 6% 淡底 + 标题染色」。这种写法在浅色下像一张便利贴，在深色下竖线又会抢走正文的注意力；同一句警告出现在不同宿主里，颜色深浅还不一致。

本轮统一到 Manus 的写法，规范只有四条：

1. **整块是一个浅灰填充的圆角块**（`--secondary`），不加边框、不加竖线、不加阴影。
2. **语气只由标题前的一枚 14px 图标承载**：信息是圆圈、完成是对勾、警告是三角、危险是八边形；没有语气就不放图标。
3. **标题保持墨色**（`--ui-text-primary`），正文用次级墨色（`--ui-text-secondary`）。整块不再按语气染色。
4. 深色模式沿用同一套规则，只换调色板，不另写一套提示样式。

规范落在 `frontend/src/styles/components/intelligent-ui.css` 的 `.intui-callout` 注释里；`UiCallout`（`react/intelligent-ui/IntelligentUiNodes.tsx`）负责按 `tone` 选图标。

## 排查方法

- 扫描 `frontend/src/styles` 下全部 88 个 CSS 文件，匹配 `border-left`、`border-inline-start`、`border-*-width`、`box-shadow: inset Npx 0`、伪元素宽度、`border-l-*` / `border-s-*` 工具类，以及内联 `style`。
- 扫描 `frontend/src` 下全部 `.ts` / `.tsx` / `.js`，确认没有字符串拼接出来的内联竖线。
- 检查 React Native Web 的 `borderLeftWidth` / `borderStartWidth` / `borderLeftColor`，结果为零。
- 顺带检查 `chat-demo/`、`site/`、`apps/socrates-android/.../renderer.css` 与 `server/` 模板，确认哪些属于产品 UI、哪些属于独立设计语言。

结论：产品 UI 内已经不存在「竖线 + 淡色底」的组合。剩下的左侧竖线只有三类——引用、错误行、工具活动时间线——其中只有错误行还带语气色。另外发现一条旧规则仍在给提示块标题染色，与规范第 3 条冲突。

## 清单

### A. 已符合新规范（不改）

| # | 表面 | 选择器 / 组件 | 现状 |
| --- | --- | --- | --- |
| 1 | 智能结果提示块 | `.intui-callout`（`UiCallout`） | 灰底、无边框、无竖线，图标承载语气 |
| 2 | 智能结果失败态 | `.intui-callout[data-intui-failure]` | 复用提示块，中性灰底 |
| 3 | 学习卡失败回退 | `.intui-callout`（`LearningFallback`） | 复用提示块 |
| 4 | OpenUI 提示条 | `.intui-openui .iui-notice` | 灰底、`border: 0` |
| 5 | 地图加载提示 | `.intui-openui .iui-map-notice` | 表面填充、无边框 |

### B. 本轮改掉

| # | 表面 | 选择器 | 改前 | 改后 |
| --- | --- | --- | --- | --- |
| 6 | 对话错误行 | `.msg-error` | 2px 危险色左侧竖线 + 左内边距 | 纯文本行：危险色文字 + Retry 轮廓按钮，无竖线、无底色 |
| 7 | 提示块标题 | `.msg-body.is-declarative .intui-callout:not([data-tone='neutral']) .intui-callout-title` | 标题按语气染色（琥珀/红/蓝/绿） | 规则删除，标题统一墨色，只有图标带色 |

第 6 项同时补了一条作用域规则，让 Retry 保持系统控件的轮廓样式，不被正文里「模型动作按钮」的蓝色胶囊覆盖；移动端触控高度同步到 `--ui-control-touch`。

### C. 本来就是纯文本（不改）

| # | 表面 | 选择器 | 现状 |
| --- | --- | --- | --- |
| 8 | 研究任务提示 | `.research-job-notice` | 一行文字 + 图标，无底无边 |
| 9 | 演示提示 / 错误 | `.demo-note`、`.demo-error` | 纯文本 |
| 10 | 测验反馈 | `.inline-quiz-feedback.ok/.bad` | 纯文本，只用文字色区分对错 |
| 11 | 媒体状态 | `.iui-media-status` | 居中的状态文案 |

### D. 保留的左侧竖线（不是提示块）

| # | 表面 | 选择器 | 为什么保留 |
| --- | --- | --- | --- |
| 12 | 正文引用 | `.msg-body blockquote` | 引用语法，中性细线、无底色；ChatGPT 与 Manus 同样用左线表示引用 |
| 13 | 工具活动时间线 | `.agent-run` | 1px 中性轨道，表示「这些步骤属于同一轮」，不是提示 |
| 14 | 设置导航选中 | `.settings-nav-item.active` | `inset 2px` 是选中指示，不是提示 |
| 15 | 抽屉与面板分隔 | `.detail-surface`、`.sources-panel` | 布局分隔线，不是提示 |

### E. 范围外（独立设计语言，本轮不改）

| # | 位置 | 例子 | 说明 |
| --- | --- | --- | --- |
| 16 | 营销站 `site/` | `.ed-article p.lede`、`.ed-method-note`、`.ed-toast` | 陶土色 + 纸色的编辑设计语言，与产品 UI 不是同一套 token；改动等于重做品牌视觉 |
| 17 | `chat-demo/` | `.ds-markdown blockquote` | 独立的 ChatGPT 复刻 demo，不随产品发版 |

## 验证

- 完整 `npm run lint` 链通过（`tsc --noEmit`、ESLint 与全部 CSS / i18n / e2e 产物守卫）。
- 相关 Playwright 28 项全部通过：`chat-terminal-state`、`chat-stop-resend`、`intelligent-ui-presentation`、`intelligent-ui-density`、`intelligent-ui-learning`。
- 新增两条回归断言：错误行的 `border-left-width` 必须为 0；提示块不得有边框，标题必须是 `--ui-text-primary`，图标必须与标题不同色。
- 截图覆盖桌面浅色、桌面深色、移动端三种视图。

## 后续可做（未在本轮）

1. 卡片底栏：来源说明与「在数据表中查看」这类文字动作仍没有固定位置。
2. 表格超过 8 行折叠为「显示全部」。
3. 学习卡（Quiz / Practice）的进度与反馈样式向新卡片靠拢。
结论：产品 UI 内已经不存在「竖线 + 淡色底」的组合。剩下的左侧竖线只有三类——引用、错误行、工具活动时间线——其中错误行是唯一带语气色的，本轮改为纯文本行。另外发现一条旧规则仍在给提示块标题染色，与规范第 3 条冲突。
