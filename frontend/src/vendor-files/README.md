# `frontend/src/vendor-files/` — vendored heavy renderers

> 本目录是 **PRD 性能边界内的不可被 CDN 替代的 vendored bundle**。任何调整请先读 ADR 0011。
> 当前治理规则由 `docs/adr/0011-vendor-files-rationalization.md` 维护。

## TL;DR

- 本目录下的 6 个文件（5 个库）均被 `frontend/src/vendor/lazy.js` 实际引用，删除任一都会破坏现有 viz 卡片 / 公式渲染 / 代码高亮。
- 来自 npm 的 `marked`、`DOMPurify`（eager bundle，见 `vendor/init.js`）与 `fuse.js`（lazy `import('fuse.js')`，见 `vendor/lazy.js`）走 npm 链路，**不进本目录**；`highlight.js` 的主题 CSS（`highlight.js/styles/atom-one-dark.css`，`init.js` eager import）同样走 npm —— 但 `highlight.min.js` 本体在本目录。
- **没有 CDN 兜底**：`deploy.sh:40-46` 记录的历史决策是把 mermaid/echarts/plotly 留在本目录而非 CDN，因为：
  1. mermaid 的 38 个 lazy diagram imports + echarts 4 个子模块 + plotly 4.85 MB 让 Vite `tree-shake` 阶段历史曾经吃到 4 GB heap；留在本地后 module count 从 ~3 700 → ~1 100。
  2. katex 通过经典 `<script>` 加载（见 `P_katex-retry` 注释）以避开 Chrome 对失败动态 import 的模块缓存。

## 文件清单

| 文件 | 大小 | 来源（upstream） | 注入入口 | 实际消费者 |
| --- | --- | --- | --- | --- |
| `plotly.min.js` | 4.7 MB | plotly.js（plot.ly） | `vendor/lazy.js:loadScriptOnce('plotly', …, 'Plotly')` | `frontend/src/react/tool-output/VisualizationOutput.tsx`、viz iframe |
| `mermaid.min.js` | 3.5 MB | mermaid-js（mermaid-js.github.io） | `lazy.js` | `frontend/src/render/visualization.js`、`visualizationAdapters.js`、可视化卡片 |
| `echarts.min.js` | 1.1 MB | ECharts（echarts.apache.org） | `lazy.js` | 同上 + `frontend/src/displayPrefs.js` |
| `katex/katex.min.js` | 270 KB | KaTeX（katex.org） | `lazy.js` | 所有公式渲染 `frontend/src/render/markdown.ts`、`render/viz.js` |
| `katex/katex.min.css` | 22 KB | KaTeX | `lazy.js`（作为 `<link>`） | 同上 |
| `highlight.min.js` | 120 KB | highlight.js（highlightjs.org） | `lazy.js` | 代码块：`frontend/src/render/markdown.ts` |

**合计 ~9.7 MB vendored**，全部以经典 UMD 形式（不解析成 ES modules）由 Vite 通过 `new URL(..., import.meta.url)` 透传到 dist/assets。

## 与 `frontend/src/vendor/` 的分工

| 路径 | 作用 | 内容形式 |
| --- | --- | --- |
| `frontend/src/vendor/` | 注入逻辑（`init.js`, `lazy.js`） | 项目自有 |
| `frontend/src/vendor-files/` | 不可被拆 / 不可被换源的 vendor bundle | UMD 静态文件 |

`init.js` 注释说明的是加载时机分工（eager / after-first-paint / stay lazy），与本目录归属对照如下：
- `marked + DOMPurify` 通过 npm 走 Vite bundled（**不在本目录**）；
- `KaTeX / highlight.js` 走本目录 lazy load；
- `fuse.js` 同在 first-paint 后加载，但走 npm `import('fuse.js')`（**不在本目录**）；
- heavy renderers（mermaid / echarts / plotly）走本目录 lazy load。

## 升级 / 更新规则

**何时升级**（未来 PR）：
1. 上游发布补丁版（bugfix / 兼容性）→ 用 PR 更新本目录中的 min.js + 同步刷新 [本 README §"上游同步记录"]；
2. 上游发布 major / breaking → 走 ADR 模板（`docs/adr/README.md`）开 ADR 决议后再升级。

**严禁**：
- 删除任一文件（被 `lazy.js` 直接 import，删除立即破坏 viz 卡片）；
- 仅修改 file 而不更新本 README 的 sync log（与 `scripts/verify-vendor-sri.mjs` — 未来 PR 引入 — 形成的 verify 流水线冲突）。

## 上游同步记录

| 上游版本 | 同步日期 | 同步到本目录哪个文件 | 验证 |
| --- | --- | --- | --- |
| 初次归档 | 2026-09-20 | 全部 6 文件 | — |

> 后续 PR 在同步时必须在此表追加一行；CI/PR 模板未来加 `[vendor-files/sync]` 标签时同步治理。

## 相关 ADR

- `docs/adr/0011-vendor-files-rationalization.md`（决策与未来 PR 路线）
- `docs/adr/0003-structural-debt-categories.md`（P0/P1/P2 三档分类，本目录属于 P2 实施）
- `docs/audits/2026-09-20-structural-review.md`（F-011 事实与本目录状态的来源）

## 关联实现入口

- `frontend/src/vendor/init.js`（marked + DOMPurify + highlight.js css 的 eager bundle）
- `frontend/src/vendor/lazy.js`（5 个 bundle 的 lazy load + retry 逻辑）
- `deploy.sh:40-46`（历史 perf 决策的来源注释）
- `frontend/index.html`（`<link>` 标签与 `data-theme`）
