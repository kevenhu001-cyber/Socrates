# ADR 0016 — 移除 capacitor/ 遗留 WebView 壳及其 CI workflow

- 状态：Accepted
- 日期：2026-10-15
- 决策者：项目所有者
- 关联：`docs/adr/0003-structural-debt-categories.md`、`docs/audits/2026-09-20-structural-review.md` (F-007)、`docs/adr/0009-ci-workflow-paths.md`、`docs/adr/0014-open-connector-removal-cloud-only.md`

## 背景

`capacitor/` 是一个 WebView 壳（Capacitor 运行时 + `expo prebuild` 之前手写的 Android 工程），最初被当作 `mobile/`（React Native + Expo）之前的过渡客户端。到 2026-09-20 的结构审计（F-007）时，它已经处于"半死半活"状态：

- `server/` 不 import 它；
- 但 `frontend/src/main.ts`、`frontend/index.html`、`frontend/src/native/capacitorBridge.js` 三处仍引用它；
- 且由 `.github/workflows/build-capacitor-apk.yml` 构建 debug APK 产物（`socrates-capacitor-debug-*`）—— 该 workflow 是 `workflow_dispatch`-only，从不进入 merge gate，也从不发布 release 或上传商店。

README 的仓库布局把它标为 "Legacy Capacitor WebView shell (frozen)"。产品路线图的 F-007 条目要求"定生死：决定删除还是正式支持，避免它继续被 CI 构建却无人使用"。2026-10-15 项目所有者确认删除。

## 备选方案

### A. 删除 `capacitor/` 与 `build-capacitor-apk.yml`（采用）
- 优：去掉无人使用、却仍需维护的 Android 工程树与手动 CI 入口；仓库布局、README 与 `AGENTS.md` 三者对齐。
- 劣：若将来仍需要一条"web-backed 壳"路径，需从历史提交恢复配置（或用 `npx cap add android` 重新生成）。

### B. 正式支持 `capacitor/`
- 优：保留一条不依赖 Expo 的原生封装路径。
- 劣：需要为其配备发布、测试、依赖升级与安全审计，成本远高于它当前的使用量；与"RN/Expo 是唯一 Android 发布客户端"（`release-clients.yml`）的既定方向冲突。

### C. 不动
- 优：零改动。
- 劣：F-007 继续悬置；CI 里保留一条无人验证、随时可能失效的 workflow；README 继续描述一个"冻结但存在"的目录。

## 决策

选择 **A**。理由：`capacitor/` 已被 `mobile/`（RN + Expo，经 `release-clients.yml` 发布）完全取代，且其唯一的 CI 消费者是 `workflow_dispatch`-only、不进 merge gate 的手动 job —— 删除它不改变任何合并门禁。

具体改动：

- 删除 `capacitor/`（60 个文件：生成的 Android 工程、`capacitor.config.js`、`package.json`、`scripts/apk.mjs`）。
- 删除 `.github/workflows/build-capacitor-apk.yml`。
- 清理引用：`.dockerignore`（`capacitor`、`capacitor/android`）、`scripts/clean-local-artifacts.sh`（`capacitor/node_modules`）、`AGENTS.md`、`README.md` / `README.zh.md` 仓库布局、`docs/adr/0009-ci-workflow-paths.md`、`docs/plans/product-roadmap.md`（F-007 标记完成）、`server/src/app.ts` 的 CORP 注释。
- `docs/audits/2026-09-20-structural-review.md` 是带日期的审计快照，**不改**（同 `AGENTS.md` 对 F-003 的处理方式）。

**有意保留（惰性）**：`frontend/src/native/capacitorBridge.js`（被 `frontend/src/main.ts` import）与 `frontend/index.html` 的 `window.Capacitor` 启动探测。删除 `capacitor/` 后已没有任何东西再注入 `window.Capacitor`，`isNativeApp()` 恒为 `false`，整段桥接 no-op。移除这段死代码需要改 `main.js` 入口与 `index.html` 的内联脚本（其哈希受 `ops/nginx/csp-spa.conf` 与 `npm run lint:csp-hashes` 门禁约束），属于独立的、可单独验证的改动，故不在本 ADR 内进行。

## 影响

- 代码：删除 `capacitor/` 与一个 workflow；`server/` / `frontend/` 运行时行为不变（前端桥保持惰性）。
- 数据：无 schema / 持久化变化。
- 部署：无。`deploy.sh` 与 nginx 配置不引用 capacitor。
- 文档：见上「具体改动」。
- CI：`build-capacitor-apk.yml` 从未参与 merge gate，删除后 required checks 集合不变。

## 可逆性

- 回滚成本：低。
- 回滚步骤：
  ```bash
  git revert <本 PR>
  # 如确实需要重新生成原生工程：
  npx cap add android
  ```

## 相关链接

- `docs/audits/2026-09-20-structural-review.md` F-007
- `docs/adr/0009-ci-workflow-paths.md`
- `docs/adr/0014-open-connector-removal-cloud-only.md`（同类的"删除死树"先例）
- `docs/plans/product-roadmap.md`（F-007 条目标记完成）
