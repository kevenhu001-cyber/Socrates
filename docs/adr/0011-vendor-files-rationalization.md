# ADR 0011 — `frontend/src/vendor-files/` 来源与文档对齐

- 状态：Accepted (ADR 层面；部分修订进入 PR 路线图)
- 日期：2026-09-20
- 决策者：项目所有者 + AI 协作会话
- 关联：`docs/adr/0003-structural-debt-categories.md` (P2.2)、`docs/audits/2026-09-20-structural-review.md` F-011

## 背景

`frontend/src/vendor-files/` 当前 5 个文件被实际使用：

| 文件 | 大小 | 注入入口 | 实际消费者 |
| --- | --- | --- | --- |
| `plotly.min.js` | 4.7 MB | `vendor/lazy.js:loadScriptOnce('plotly', …, 'Plotly')` | `src/react/tool-output/VisualizationOutput.tsx`、viz iframe |
| `mermaid.min.js` | 3.5 MB | lazy.js 同上 | `src/render/visualization.js`、`src/render/visualizationAdapters.js`、可视化卡片 |
| `echarts.min.js` | 1.1 MB | lazy.js 同上 | 同上 + `displayPrefs.js` |
| `katex/katex.min.js` + `katex.min.css` | 270 KB / 数十 KB | lazy.js 同上 | `src/render/markdown.ts`、`src/render/viz.js`、所有公式 |
| `highlight.min.js` | 120 KB | lazy.js 同上 | `src/render/markdown.ts`、代码块 |

**目前所有 5 个文件均被实际加载**。`deploy.sh:40-46` 也明确记录了"mermaid's 38 lazy diagram imports + 4 echarts sub-modules + 4.85 MB plotly bundle"的取舍记录。

所以审查记录中"三选一精减 plotly/mermaid/echarts"的提法是**不准确**的：删除任何一项都会破坏现有 viz 卡片。实际问题另有三个：

1. **README.md 与现状矛盾**：README "Tech stack / CDN deps" 一段说"`cdn.jsdelivr.net` (KaTeX, marked) — all SRI-pinned"，但仓库 `frontend/src/vendor-files/katex/` 也自带同名文件，且 `marked` 也不是 CDN 而是通过 npm bundled (`src/vendor/init.js`)。两份来源并存 = CDN 失效 fallback 行为不确定，SRI 真假无法验证。
2. **markdown.ts / viz.js 同时引用 vendor 与 npm 路径**：存在双源风险时一处 bundle 升，另一处失效。
3. **没有"新增 heavy 库"标准**：今天某个 PR 想加一张图表，到底落 vendor-files、npm、还是 CDN？需有 ADR 边界。

## 备选方案

### A. 把 vendor-files 全部保留 + 文档对齐（采用本 ADR）
- 行动：
  1. 修 README "Tech stack / CDN deps"段，明确说 KaTeX/highlight.js/Plotly/Mermaid/ECharts 是 `vendor-files/` 自带 UMD，marked/DOMPurify/fuse.js 走 npm bundle —— **均无 CDN 兜底**。
  2. 写一份 `frontend/src/vendor-files/README.md`，说明每个文件的来源（upstream URL + commit）、SRI hash（首版生成、锁进 vendor-files/）、以及"何时更新"的策略。
  3. 加 `docs/adr/0011-vendor-files-rationalization.md`（本 ADR）为"新增 heavy 库"的归口。
- 优：与实测选择一致；最小工程；不破坏 viz 卡片。
- 劣：`vendor-files/` 仍占 ~10 MB 仓库空间；但 git 大文件管控已在 .gitignore 周边可控。
- **采纳**原因：与"减少变更 + 约束文档"治理规则一致。

### B. 迁回 CDN + SRI pinned
- 行动：删 5 个 vendor-files，index.html 改成 SRI-pinned `<script>` 引用 cdn.jsdelivr.net；失败回落到自托管（nginx /var/www/app.topodrive.top/）。
- 优：仓库体积小（~10 MB）；CDN 维护上游版本。
- 劣：依赖外部网络；CSP/SRI 治理必须严格；katex/plotly/mermaid 体积大时冷启动延迟。
- **不采纳**原因：现有 viz iframe 启动顺序依赖 lazy.js 的本地文件，存在网络抖动 vs 本地稳定之间的明显权衡，本 ADR 范围不触达。

### C. 全部走 npm + Vite build
- 行动：删 vendor-files，把 5 个库改为 `package.json` deps 走 Vite dynamic import。
- 优：作为 ES modules 流入 Vite 优化（tree-shake、code-split）。
- 劣：mermaid `cytoscape/fcose/dagre`+ echarts 的 4 sub-modules + plotly bundle 让 Vite 在此历史上吃 4 GB heap；chunk graph 复杂度上升。`deploy.sh` line 40-46 明确写了"with those three heavy viz libs moved to the CDN… module count dropped from ~3,700 to ~1,100"。**反向走回 npm 会把已经下降的 build 复杂度翻倍**。
- **不采纳**原因：违反 deploy.sh 已记录的工程决策（"files are kept as verbatim UMD under src/vendor-files/"）。

## 决策

采用 **A**。具体改动（多 PR）：

1. **PR-0011.1 — 文档对齐（必须）**
   - `README.md` "Tech stack / CDN deps" 段改写为"vendored at `frontend/src/vendor-files/`，无 CDN 兜底"。
   - 新建 `frontend/src/vendor-files/README.md`，列出每个文件的 upstream + SRI + 最后同步日期。
   - 在 `frontend/src/vendor/init.js` 与 `src/render/markdown.ts` 顶部注释加 vendored 标注。

2. **PR-0011.2 — SRI 验证脚本（推荐）**
   - 写 `scripts/verify-vendor-sri.mjs`，对 `vendor-files/` 内每个文件计算 sha384，与 README 里登记的 hash 比对。CI 不强制阻断，仅 `npm run verify:vendor-sri`。
   - 目标：**任何对 vendor-files 的改动都需要在同一 PR 中更新 README 中登记的 hash**，否则本地 verify 失败。

3. **PR-0011.3 — 新增 heavy 库的归口（未来）**
   - 任何 PR 如果提议"新增 vendor minified bundle"或者"删除任一已 vendored bundle"，**必须先开 ADR**走 P0/P1/P2 治理路径（本审查的通用规则已覆盖）。

## 影响

- **代码**：1 PR 改 README + 1 PR 加 verify 脚本 + 同源码注释更新；不修改 `vendor/lazy.js` 或实际 viz 渲染路径。
- **Bundle**：不变（保留 vendor-files/）。
- **CI**：PR-0011.2 引入新 verify 脚本；为不影响主 gate，**仅作为手动可触发**（不绑 ci.yml 的必跑 job），未来如需绑再单独 ADR。
- **文档**：README "Tech stack"段重写；新增 `frontend/src/vendor-files/README.md`；更新 `docs/audits/2026-09-20-structural-review.md` F-011 状态。
- **AGENTS.md**：line 285-307 段"Tech stack"被新 README 同步覆盖；不必重写 AGENTS。

## 可逆性

- 回滚成本：极低。回退文档与 verify 脚本；不动 vendor-files 物理内容。
- 回滚步骤：`git revert <PR-sha>`。
- 边界保护：PR-0011.x 不修改 `vendor/lazy.js`、不修改任何 viz 渲染路径。

## 相关链接

- `docs/audits/2026-09-20-structural-review.md` F-011
- `frontend/src/vendor/lazy.js`（5 个 vendor 的注入入口）
- `deploy.sh:40-46`（build 决策来源）
