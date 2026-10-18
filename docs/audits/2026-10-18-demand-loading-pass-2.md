# SPA 性能第二轮：移除无条件预取

本轮承接 [首屏依赖审计](2026-10-18-entry-dependency-audit.md)。比较基线是上一轮已验证的工作区，静态 JS 为 359,881 B gzip；并非将本轮 diff 与干净 HEAD 的全部变化混为一轮收益。

## 改动

`app/bootstrap.js` 不再在 `load` 后的 idle 回调中主动加载 KaTeX、highlight、Fuse、考试和 streamingTurn。原有消费入口继续加载相应模块：公式内容、带语言的代码块、搜索面板、考试入口、首次发送/恢复流式回复。

单独删除 idle 队列还不够：原有 `formatMsg` 和 `formatMsgProgressive` 每次都会调用触发加载的 `getKatex()`，普通文本也会下载公式库。本轮将原文交给检测器，忽略三反引号代码块、普通行内代码和转义美元符号；只有潜在数学分隔符才触发加载。检测是保守启发式，未转义的美元金额仍可能触发加载，并不宣称完整解析所有 Markdown/LaTeX 语法。

KaTeX ready 事件由 `katexRefresh` 单独维护 repaint revision，删除 getter 中的重复订阅。加载失败时保留文本，现有经典脚本 loader 继续重试，后续绘制也可重试。

新增 `render/highlight.ts` 作为代码高亮消费入口，接入 Markdown post-render 和旧工具卡的终态代码。请求按现有 loader 去重；加载完成时核对节点仍连接且源码未变，再写入高亮。未知语言转为纯文本；失败不影响复制、展开或源码阅读。已经完成的源码不重复高亮，流式工具参数继续只在终态高亮。删除此前只在库尚未加载时运行的全局 highlighter monkey-patch。

搜索直接调用 `ensureFuse`，移除 `window.__socratesEnsureFuse` 中转。Fuse 加载后读取输入框的最新查询，合并本地与已返回的远程结果并去重，不再发一次服务器搜索；关闭的面板和已退出登录的账户不恢复搜索视图。

## 测量方法

生产 dist、本地静态服务器、全新 Chromium 页面、相同模拟账户和一条普通 assistant 正文。强制启动 idle 回调立即执行，再等待网络空闲，收集唯一的 `/assets/*.js|css` 请求。按每个最终磁盘文件独立 gzip 后求和，排除 HTML、字体、图片、API；此值包含登录后的挂载与运行时下载，与静态入口预算不同。

上一轮该场景实测 **904,336 B gzip**，KaTeX、highlight、Fuse、考试与 streamingTurn 均已下载。原始测量暂存在 gitignored `frontend/node_modules/.cache/socrates-entry/round2/before-runtime.json`。新规格 `e2e/demand-loading.spec.mjs` 固定上述普通页面的可选模块“不下载”契约，并将当前资源清单写入 `frontend/test-results/round2-runtime-assets.json` 与 Playwright 附件；这些均不提交。

| 同一普通聊天场景 | 上一轮 | 第二轮 |
| --- | ---: | ---: |
| 实际 JS/CSS 请求的独立 gzip 总量 | 904,336 B | 747,940 B |
| 唯一 JS/CSS 请求数 | 36 | 30 |
| KaTeX / highlight / Fuse 全局对象 | 均已加载 | 均未加载 |
| 考试与 streamingTurn chunk | 已下载 | 未下载 |

减少 **156,396 B（17.3%）**；六个请求分别是 KaTeX JS/CSS、highlight、Fuse、考试和 streamingTurn 的独立资源。新旧版本使用同一套样本和强制 idle 的加载流程，此比较是本地构建资源数量/字节，不是用户群体的性能统计。

静态预算中的 JS 从 **359,881 B** 到 **359,859 B**，HTML 为 **18,442 B**、引用 CSS 为 **207,658 B**，三项合计 **585,959 B gzip**。静态 JS 只少 22 B，没有借此宣称显著入口瘦身，也没有放宽上一轮预算。

构建的静态闭包仍使用上一轮生成的 `dist/.vite/entry-graph.json` 和已有预算测试。本轮主要目标是削减启动后的无用下载，不以几乎不变的静态 JS 数字代表运行时收益，也不以本地 gzip 大小推算生产 FCP、LCP 或模型 TTFT。

## 权衡与剩余工作

首次需要相应功能时会承担冷加载时间。普通正文立即可读；代码在库到达前保留源码，公式到达后重绘，搜索先保留远程结果再补充本地结果。首次发送仍走上一轮已验证的取消边界。

登录后的 mount registry 仍会加载多个隐藏 overlay、工作流和完整 TipTap 输入框。下一阶段可以拆分轻量状态注册和 surface 挂载，但必须先解决 bridge 尚未安装时的状态发布，以及 registry 提前标记 ownership 导致异步 mount 被自身跳过的问题。没有在本轮直接把这些 mount 改成 Promise。

多 Root 收敛、会话/导师运行时分离、真正有界的消息虚拟化仍是后续独立工作。本轮不修改 CSS owner、API、数据库或部署流程。

## 验证

- 最终生产构建、完整 lint、`git diff --check` 通过；静态预算未放宽，报告中各 chunk 的 gzip 与最终磁盘文件逐一一致。
- `demandRendering`、`mathMarkdownBoundary`、`mathHeadingRepair`、`codeBlockCopy` 定向单元测试 **43 项通过**。覆盖延迟高亮去重、节点脱离/源码变化、未知语言和失败后再绘制，以及普通文字/代码不加载 KaTeX。
- 13 组 Playwright 规格共 **49 个独立场景通过**（48 个首轮通过，剩余 1 个调整异步等待后单独复跑通过）：`demand-loading`、`performance-loading`、`katex-retry`、`code-copy-visual`、`cmd-k`、`cmd-k-compat`、`cold-transport-loading`、`send-feedback`、`chat-send`、`chat-stop-resend`、`streaming-render`、`message-list-compat`、`exam-regressions`。
- 新增的五个场景断言：登录/未登录页面经过 idle 后可选库仍未下载；KaTeX 首次失败后重试且只触发一次 repaint revision；代码在库未到达时可读，之后正确高亮且源码不变；Fuse 慢加载前输入的最新查询会补回本地结果，不增加远程搜索请求。
- `chat-send:535` 原先在调用异步 `askChatTurn` 后同一任务中读取 streaming message。移除预热后它会在 chunk 尚未到达时读到空值；trace 确认实际请求仍正常。规格现等待真实占位回复和传输就绪，再保持原有的可见、单一 DOM 行、逐 delta 更新和终态文本断言，没有添加固定延时或放宽断言。
- 已复查公式与代码截图，分别由规格写入 gitignored `test-results/round2-math-ready.png`、`round2-code-ready.png`。Playwright 的后续独立运行会清理默认 output 目录；需要保留这些产物时一次运行相关规格或指定独立 output 目录。

验证使用本地 production dist 与模拟 API，没有发布或测量生产网络/中端 Android 的真实延迟。
