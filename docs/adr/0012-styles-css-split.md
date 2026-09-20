# ADR 0012 — `frontend/src/styles.css` 拆分（按 `styles/` 子目录模块化）

- 状态：Accepted (ADR 层面；实施进入多 PR 路线图，**前置：视觉基线**)
- 日期：2026-09-20
- 决策者：项目所有者 + AI 协作会话
- 关联：`docs/adr/0003-structural-debt-categories.md` (P2.3)、`docs/audits/2026-09-20-structural-review.md` F-002/F-010

## 背景

`frontend/src/styles.css` 当前 11 708 行 / 675 KB；README 自述 `~3800 lines`、ADR 0001 line 13 引用 `main.js ~9,900 行` —— **两个数字都过时**。

但 styles.css 与 main.js 不同：它**已经开始按 `styles/` 子目录模块化**，`src/styles/index.css` 注释明文说这是 **M1 阶段产物**，而 styles.css 11 708 行要在 **M2 阶段按 `layout/`、`components/`、`vendor/` 切片迁出**（实际工作尚未启动）。

具体地说：

- `src/styles/index.css` 已聚合 `@import './tokens.css'`, `@import './themes.css'`, `@import '../styles.css'`。
- `src/styles/components/{button,chip,input,menu,popover,tool-card}.css` **已存在但仅含少部分代码**。
- `src/styles/layout/{app-shell,chat-view,modal}.css` **已存在但仅含少部分代码**。
- `src/styles/vendor/{highlight,katex}.css` 同样只是部分代码。
- 4 个继承自竞品的合并文件仍并列在 `styles/`：`chatgpt-ui.css`、`chatgpt-v2.css`、`lobe-overrides.css`、`ref-baseline.css`。
- styles.css 本体顶部有 26 处 `P_<feature>` 注释标记 —— 这是既有的"特性切片锚点"，可作为 M2 拆分的天然边界。

主文件保持 11k 行的具体风险：

1. **新增 CSS 与既有 specificity 冲突时无法定位**：11 708 行单文件中没有结构化导航，"为什么我的规则被覆盖"只能 grep。
2. **设计令牌 / 主题切换 / 组件样式三股力量混在一起**：tokens、themes、components 之间的边界被 styles.css 一笔抹掉，对 LobeChat 与 ChatGPT 风格的兼容层（`chatgpt-v2.css`、`lobe-overrides.css`）和 `ref-baseline.css` 之间的来源关系也搅在一起。
3. **构建时 Vite inline 整个 styles.css**：在 prod 不可分块，缓存命中率低；改动一行 chatview 颜色，hash 全变。

## 备选方案

### A. 不拆 + 改进 INDEX
- 给 styles.css 写一份 `sections.md` 标识每段的行号范围。
- **不采纳**原因：与 §"建立可被 CI 验证的结构边界"治理目标冲突；不解决 specificity 与 cache 问题。

### B. 一次性大迁移（激进）
- 一次性把 11 708 行按 5 大类（tokens/themes/components/layout/vendor）切片迁出，根 styles.css 只留 reset。
- **不采纳**原因：单 PR 视觉 diff 噪声过大；无法 regress 出错点；任何遗漏直接影响 prod。

### C. 按 `P_<feature>` 锚点逐片迁移，每片 PR 独立有视觉基线（采用本 ADR）
- **PR-0012.x**：每 PR 取一段连续的 `P_<feature>` 段（30-200 行起，500 行为上限），迁到 `styles/components/<feature>.css` 或 `styles/layout/<feature>.css`，更新 `styles/index.css` 的 `@import` 链。
- 每 PR 前置 capture：跑 Playwright + 视觉 snapshot diff（reference 现在 `frontend/e2e/__screenshots__/`）。
- **采纳**原因：与 P2 "每 PR 单一子目标、可视觉回归" 治理模板一致。

## 决策

采用 **C**。具体路线（多 PR；每个 PR 自身可 revert）：

**前置（不在本 ADR 范围内，作为 PR-0012.0 单独 PR）**：
- 增 `npm run lint:css:order` ：解析 `src/styles/index.css` 的 `@import` 顺序，与一个静态表 `styles/_order.lock.json` 比较 —— 阻断 `import` 顺序漂移。
- 视觉基线 capture：`frontend/e2e/__screenshots__/` 留 Light/Dark × 关键 surface（landing, chat-light, chat-dark, settings, exam, mobile）。

**PR-0012.1 — Tokens/Themes 锚定段迁出**
- 迁 styles.css 顶部 `P_*` 段（行号约 1-180）到 `styles/tokens.css` 与 `styles/themes.css`（已有空骨架）。
- 视觉 diff：landing/sidebar 必须 byte-near identical。

**PR-0012.2 — Sidebar 切片**
- 迁 sidebar 段（约 190-1500 行）到 `styles/layout/app-shell.css` 与 `styles/components/{button,chip,icon-btn}.css`。
- 视觉 diff：sidebar + recents 列。

**PR-0012.3 — Chat surface 切片**
- 迁聊天相关到 `styles/layout/chat-view.css` 与 `styles/components/{composer,message-bubble,tool-card}.css`。
- 视觉 diff：完整 chat-workbench Playwright spec + smoke-light-palette spec。

**PR-0012.4 — Exam/Tutor 切片**
- 迁考试与 tutor 段到 `styles/legacy/exam.css` 与 `styles/legacy/tutor.css`（新建 `legacy/` 子目录；命名表示已不复用但仍存在）。

**PR-0012.5 — 4 竞品继承文件去留决议**
- 对每个 `styles/{chatgpt-ui,chatgpt-v2,lobe-overrides,ref-baseline}.css` 单独走 ADR，决定删除/保留/合并。
- 本 ADR 不作决议，仅落"占位 ADR"——后续 4 个子 ADR 各自 rebase 引用本文件。

**PR-0012.6 — 根 styles.css 收敛**
- 把 styles.css 在 M2 完成时缩减到 ≤ 200 行 reset；其它全部 `@import` 自 `styles/index.css`。
- 视觉 diff：全站回归；Playwright 全 spec 绿。

## 影响

- **代码**：5+ PR 改动 `styles/` 目录结构 + styles.css 体积缩减；`frontend/src/styles.css` 主文件按每次 PR 切片逐渐变小。
- **构建**：Vite 仍然把整个 CSS bundle 成一个 hashed 文件（`styles/index.css` 的 `@import` 全部 inline）。仅做 source organization，不改产物形态。
- **CI**：`lint:css:order` 新增；视觉基线 capture 走 Playwright snapshot diff。
- **数据**：无 schema 变更。
- **依赖**：无新增 npm 包；仅自研 `lint:css:order` 脚本。
- **CSP / font URL**：vendored katex/fonts/ 仍走本仓库路径（PR-0011 同步治理），不引入 CDN 域名。

## 可逆性

- 回滚成本：低。每个 PR 是 squash 单 commit + 视觉基线留在 e2e/__screenshots__；revert 单一 PR 不影响其它 PR。
- 回滚步骤：`git revert <PR-sha>` 单 squash commit。
- 边界保护：每个 PR 都**自带 Playwright 视觉 capture diff**，不允许通过未观察视觉差异的"代码绿"。

## 相关链接

- `docs/audits/2026-09-20-structural-review.md` F-002（事实） / F-010（巨型单文件清单）
- `frontend/src/styles/index.css`（M1 已落地的子目录聚合 + M2 占位）
- ADR 0001（决定保留 SPA 作为 Web 客户端）
- ADR 0002（LobeHub 对齐范围，M1/M2/M3/M4 之一）
- ADR 0011（vendor-files 来源策略，影响 styles/vendor/* 边界）
