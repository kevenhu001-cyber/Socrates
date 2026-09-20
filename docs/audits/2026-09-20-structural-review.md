# Structural review — 2026-09-20

- **作者**：Mavis（结构性审查会话）
- **范围**：仓库 `C:\Users\Jiacheng\Desktop\Socrates` 全仓治理基线
- **日期**：2026-09-20
- **配套文档**：`docs/adr/0003-structural-debt-categories.md`（债务分类）、`docs/adr/README.md`（ADR 治理模板）、`docs/STRUCTURE.md`（文档/任务/证据的目录约定）
- **关联会话 ID**：`mvs_dc5465ecda8f4d6585c3ec2e6bbd5700`

## 0. 总览

本审查是 Socrates 项目进入 React/TS 化第二阶段（ADR 0001/0002 落地）之后，第一次全仓结构与技术债清点。结果发现 **15 个独立的技术债条目**，按 `docs/adr/0003-structural-debt-categories.md` 定义的规则分为 **P0（必须）/P1（应该）/P2（计划）** 三级，每级有独立的执行窗口与验证标准。

| 级别 | 数量 | 单条风险 | 总工作日估算 |
| --- | --- | --- | --- |
| P0 | 6 | 低（文档修订、gitignore、软删） | 0.5d |
| P1 | 6 | 中（workflow 调整、目录命名约定、scripts 分组） | 2d |
| P2 | 4 | 高（styles.css 拆分、目录合并、vendor 精减、services 子分组） | 1–2w |

**关键约束**（来自本次会话与项目所有者对齐）：

1. **执行窗口**：P0 立即在当前 PR；P1 在 3 个独立 PR；P2 在多 PR 推进，每 PR 都有视觉基线 + E2E 验证。
2. **capacitor 命运**：本次仅修文档至"现状如实表述"，不删 CI 不删 native 桥。
3. **回滚边界**：每个 PR 必须可独立回滚（git revert 单一 commit）；不得引入数据库 schema 变更；不得修改 `deploy.sh` 主流程。

---

## 1. 事实清单（Each entry has locator / impact / source）

### F-001 · `frontend/src/main.js` 实际 773 行 / 47 KB
- **描述**：README.md:317 自述 `~8k lines`、AGENTS.md:18 自述 `10k+ lines`、ADR 0001:13 自述 `~9,900 行`。
- **实测**：`Get-ChildItem frontend/src/main.js` 长度 47 110 字节，11 708 行风格相近的 `styles.css` 一并核对。
- **影响**：onboarding 路径严重误导，代码审查者会以为存在巨型 main.js 而避开该层。
- **根因**：2026-09 之前的 commit 大幅重写过 `main.js`（现已模块化为主），描述未同步。

### F-002 · `frontend/src/styles.css` 实际 11 708 行 / 675 KB
- **描述**：README.md:328 自述 `~3800 lines`。
- **实测**：675 KB / 11 708 行。`styles/` 已按主题切片（tokens, themes, components/*, layout/*, vendor/*）但旧根 CSS 仍在。
- **影响**：根 CSS 持续生长，缺乏导入序列控制；CDN 替换不易。

### F-003 · open-connector 集成拓扑与 AGENTS.md 不符
- **AGENTS.md 说法**（line 12）：`Nothing in frontend/src or server/src imports it`
- **实测**：
  - server/ 侧 10 个文件引用：`openConnectorChatTools.ts`、`openConnectorCatalog.ts`、`openConnectorSidecar.ts`、`openConnectorCloudAuth.generated.ts`、`openConnectorAppInventory.ts`、`toolRegistry.ts`、`routes/chat/pipeline/executors/openConnector.ts`、`routes/chat/pipeline/executors/registry.ts`、`routes/projectConnectors.ts`、`test/openConnectorCatalog.test.js`
  - frontend/ 侧 10 个文件引用：见 audit grep 结果（`connector-icons.ts`、`react/pages/workspace/*` 等）
- **影响**：AGENTS.md 误述导致 review 失焦，工程师向 open-connector/ 改实际生效的代码而绕过 review。

### F-004 · CI 覆盖范围与 AGENTS.md 不符
- **AGENTS.md 说法**（line 20）："CI does not currently cover mobile/, capacitor/, site/, packages/, tools-rust/, or open-connector/"
- **实测**：9 个 workflow 中：
  - `build-apk.yml`（728 行）、`mobile-apk.yml`（120 行）明确覆盖 mobile/
  - `agent-tooling-ci.yml`（134 行）覆盖 tools-rust/agents
  - `build-capacitor-apk.yml`（77 行）覆盖 capacitor/
  - `release-clients.yml`（121 行）覆盖多端
- **影响**：文档误导，影响"哪些路径改触发哪条 CI"的判断。

### F-005 · 散落产物与 .gitignore 漏补
| 路径 | 类型 | 状态 |
| --- | --- | --- |
| `.claude/worktrees/` | 工具产物（2 个 worktree）| 未跟踪、未忽略 |
| `%TEMP%/` | 字面量命名的目录（含 `socr-shots/`）| 未跟踪、未忽略 |
| `shots-tmp/` | 未跟踪，未忽略 |
| `audit-shots/` | 未跟踪，未忽略 |
| `tmp-shots/` | 未跟踪，未忽略 |
| `.shots/` | 未跟踪，未忽略 |
| `debug.log` | 5 735 字节文件 | 未跟踪，未忽略 |
| `graphify-out/` | 已 .gitignore 但物理有 60 个文件 | 已在 .gitignore |
| `desktop/dist/` | 残留 release 输出 | 未跟踪，未忽略 |
| `mobile/docs/qa-*.xml` ×10 | UI 探针 dumps | 未跟踪，未忽略 |

### F-006 · README 图片引用与实际不一致
- README.md:101 引用 `index-v2.png`、`pricing-v2.png`、`about-v2.png`
- 实际根目录只有 `screenshot_1_home.png`、`screenshot_2_product.png`、`screenshot_3_zh_home.png`、`screenshot_4_zh_product.png`
- 影响：README 在 GitHub 上看到 broken image link

### F-007 · capacitor 处于"半死半活"
- AGENTS.md 标"unmaintained, superseded by mobile/"
- 但 `.github/workflows/build-capacitor-apk.yml` 仍然在构建 debug APK
- `frontend/src/main.js`、`frontend/index.html`、`frontend/src/native/capacitorBridge.js` 三个文件 import capacitor
- 本次决议：**仅文档化现状，不动实现**

### F-008 · server/src/index.js 是 1 行 shim
- `server/src/index.js:11` 全文件 `import '../dist/index.runtime.js';` + 注释
- 注释承诺"待 systemd 单元更新后删除"
- 影响：长期保留路径掩盖 build 流程错误

### F-009 · 前端 27 个一级子目录
- 数字按 `Get-ChildItem frontend/src -Directory` 实测
- 详细分类见 ADR 0003 附录 A
- 主要疑点：`state/` vs `store/` vs `lib/` 重复，`chat/` vs `render/` 职责交叠

### F-010 · 巨型单文件列表
| 文件 | 行 | KB |
| --- | --- | --- |
| `frontend/src/styles.css` | 11 708 | 675 |
| `frontend/src/i18n.js` | 2 115 | 106 |
| `frontend/src/exam.js` | 1 057 | 55 |
| `frontend/src/attachments.js` | 760 | 35 |
| `frontend/src/main.js` | 773 | 47 |
| `frontend/src/tutorSocratic.js` | 694 | 33 |
| `frontend/src/connector-icons.ts` | 622 | 29 |
| `frontend/src/sidebar/nav.js` | ~1 800（71 KB）| 71 |
| `frontend/src/chat/streamingTurn.js` | ~1 600（65 KB）| 65 |
| `frontend/src/render/markdown.ts` | ~1 200（55 KB）| 55 |
| `frontend/src/render/viz.js` | ~1 200（51 KB）| 51 |

### F-011 · vendor-files 三套并存
| 文件 | MB |
| --- | --- |
| `vendor-files/plotly.min.js` | 4.7 |
| `vendor-files/mermaid.min.js` | 3.5 |
| `vendor-files/echarts.min.js` | 1.1 |
| `vendor-files/katex.min.js` | 0.27 |
| `vendor-files/highlight.min.js` | 0.12 |
- 同源 CSS：`styles/vendor/katex.css`、`styles/vendor/highlight.css`
- README 自称"marked, katex from cdn.jsdelivr.net, SRI-pinned"，但仓库同时自带相同文件 — **两套来源并存**

### F-012 · scripts/ 14 个文件无 INDEX
- 长期脚本：`backup-secrets.sh`、`rotate-secrets.sh`、`restart-server.sh`、`test-deploy-flow.sh`、`clean-local-artifacts.sh`、`search.sh`
- 一次性脚本：`audit-legacy-bag.mjs`、`audit-window-bridges.mjs`
- 孤立工具：`add_animate_text.py`、`dump-palette.py`、`verify-tokens.py`、`capture_site.js`、`gen-oc-cloud-auth.mjs`、`resolve-site-merge.ps1`

### F-013 · docs/ 与 tasks/evidence/ 文档命名重复
- `docs/` 根：8 篇 audit/analysis/migration doc
- `docs/plans/`：3 篇
- `docs/adr/`：2 篇
- `tasks/evidence/`：10 篇
- 无 `docs/STRUCTURE.md` 说明分工

### F-014 · server/src/services/ 60+ 文件混编
- 核心服务：llm.ts / auth.ts / webSearch.ts / codeInterpreter.ts / usageTracker.ts / scheduler.ts / email.ts
- Tool/agent 周边：agentRuntime.ts / agentStepProjection.ts / agentKeys.ts / piAgent.ts / toolRegistry.ts / toolCallSafety.ts / toolDispatch.ts / toolErrorFeedback.ts / toolTurnPolicy.ts
- 文档解析：fileParsers/、attachmentReader.ts / contentExtractor.ts / contentExtractorWorker.ts / chunkIndex.ts / embedding.ts / rag.ts
- 第三方 SaaS connector：arxivConnector.ts / feishuConnector.ts / giteeConnector.ts / githubConnector.ts / notionConnector.ts / oomolProjectConnector.ts / zoteroConnector.ts + 5 个 openConnector*
- 杂项：ttsCache.ts / ttsStore.ts / vision.ts / statusMonitor.ts / loginLockout.ts / scoring.ts / sessionCompressor.ts / fetchBatch.ts / planning.ts / cleanupDb.ts / oauthTokens.ts / artifactOwnership.ts / connectorTools.ts / fileArtifacts.ts / openConnectorCatalog.ts / workspacePaths.ts / workspaceResources.ts

### F-015 · packages/theme/ 缺文档与 CI
- README 只列 core、contracts
- theme 没有 README/CHANGELOG
- 没有独立 CI gate
- 用途：mobile 用 rn.ts；是否必需 vs mobile 自身的 theme/i18n 体系待评估

### F-016 · 后端测试源码 `.js` / `.ts` 扩展名不一致（**预先存在**，与本次审查改动无关）
- **描述**：`server/test/crypto.test.js` 等测试 `import 'src/lib/crypto.js'`，但实际源是 `server/src/lib/crypto.ts`（**整个目录所有文件都是 `.ts`，不存在 `.js` 副本**）。Node 24 ESM resolver 默认不允许扩展名 mismatch，导致 `node --test` 直接抛 `ERR_MODULE_NOT_FOUND`。
- **触发验证**：本次审查做最终验证时跑 `node --test` 一组 server test，5/5 全部 fail；追踪到不是 P0 改动回归，是同一 ESM 解析问题。
- **路径范围**：`server/test/*.test.js` 的 import 段（不仅 crypto，其它可能也踩同一坑；本次抽测 5 个全部 fail）。
- **修复方向（不在本次 PR 范围内）**：
  - 选项 A：用 `tsx --test` 跑测试（`tsx` 已安装在 server node_modules）。
  - 选项 B：把测试 import 的 `.js` 后缀去掉（`import '../src/lib/crypto'`）——仅 tsx/loader 下可解析，纯 Node ESM 要求显式扩展名，单独 `node --test` 仍会失败；选此项等于锁定"必须经 tsx 运行"。
  - 选项 C：迁测试到 `.test.ts` + 项目级 ts-node/tsx runner。
- **实际不影响 CI**：CI 用 `node scripts/run-tests.mjs` 等命令，可能已在内部跑 `tsx`/`ts-node`，所以 git history 里 CI 一直"绿"；本地 `node --test` 才暴露 mismatch。
- **下一步**：建议单独开 ADR（不在本次 P0/P1 范围）。F-016 不阻塞 P0/P1 PR 落地。

---

## 2. 治理原则（来源：`docs/adr/0003-structural-debt-categories.md`）

- **P0 ≤ 24h 处理**。回滚成本低（文档、gitignore）。
- **P1 ≤ 1 周处理**。涉及多文件但无破坏性改动；走 1 个独立 PR；必须 lint/typecheck/test:unit 全绿。
- **P2 走多 PR**。每个 PR 包含：基线 capture → 迁移 → 验证（E2E + 视觉 diff）→ 清理。每个 PR 单独可 revert。
- **不得引入**：数据库 schema 变更、`deploy.sh` 主流程重写、`server/src/index.js` 在 P0 阶段删除（待 systemd 同步）。
- **每个 P2 项先有 ADR 才动手**：ADR 记录 decision alternatives、chosen path、rollback plan。

---

## 3. 执行路线

### Phase 1 · P0（当前 PR — 状态：已完成 2026-09-20）

| ID | 动作 | 文件 | 验收 | 落地 |
| --- | --- | --- | --- | --- |
| P0-A | 修 AGENTS.md 事实：main.js / styles.css 行数、open-connector 集成拓扑、CI 实际覆盖 | `AGENTS.md` | grep 主线数字不再出现"10k+/9k+/~3800/未覆盖" | ✅ |
| P0-B | 修 README 图片引用 | `README.md` | 改用 `screenshot_*.png` 或补缺失文件，本会话选前者 | ✅（4 张实际截图分 EN/ZH × Landing/Product 矩阵） |
| P0-C | 补 .gitignore：`.claude/`、`.opencode/`、`.codex/`、`.kilo/`、`*.shots*`、`.shots/`、`%TEMP%`、`graphify-out/`、`desktop/dist*/`、`desktop/build/`、`desktop/.cache/`、`mobile/docs/qa-*.xml`、`debug.log`、`/-`、`/-*/` | `.gitignore` | `git check-ignore -v` 验证每条规则 | ✅ |
| P0-D | 软删散落产物：`.shots/`、`shots-tmp/`、`audit-shots/`、`tmp-shots/`、`%TEMP%/`（先 rename 到 `_TEMP_TRASH_TARGET`）、`.claude/`、`graphify-out/`、`debug.log`、`desktop/dist/`、`mobile/docs/qa-*.xml` ×10、root `-` | （执行 rm --） | 物理清理后 `Get-ChildItem` 不再返回 | ✅ |
| P0-D' | tracked 文件 git rm：`.claude/launch.json`、`debug.log`、`desktop/dist/*`（3 files）、`graphify-out/*`（60 files） — 全部走 `git rm -r --ignore-unmatch`，65 个 staged deletion | （git index） | `git status --short` 中 65 条以 `D ` 起头 | ✅ |
| P0-E | capacitor 命运文档化：在 AGENTS.md 增段落如实陈述现状 | `AGENTS.md` | AGENTS.md 含 "Status: dormant in server/, still referenced by frontend/native/capacitorBridge.js and build-capacitor-apk.yml; decision pending" | ✅（合并到 P0-A 同一节 edit） |
| P0-F | 建 ADR 模板 + 首份分类 ADR | `docs/adr/README.md`、`docs/adr/0003-structural-debt-categories.md` | 模板可用，新 ADR 引用模板 | ✅ |

### Phase 2 · P1（3 个 PR）

#### PR-P1.1 · CI workflow paths 触发优化 + ADR
| 动作 | 文件 |
| --- | --- |
| 给 `ci.yml`、`server-ci.yml`、`mobile-apk.yml`、`build-apk.yml`、`agent-tooling-ci.yml`、`build-capacitor-apk.yml`、`release-clients.yml` 加 `paths:` 过滤 | 7 个 workflow |
| 修正 AGENTS.md 关于 CI 覆盖的描述 | `AGENTS.md` |
| ADR 0009：CI workflow paths 决策 | `docs/adr/0009-ci-workflow-paths.md` |

#### PR-P1.2 · docs/ + tasks/evidence/ 结构化
| 动作 | 文件 |
| --- | --- |
| 写 `docs/STRUCTURE.md` 约定 docs/plans vs docs/adr vs docs/audits vs tasks/evidence 的分工 | `docs/STRUCTURE.md` |
| 把 `docs/` 根的 8 篇 audit/analysis/migration doc 移到 `docs/audits/` 或 `docs/plans/` | `docs/` |
| 把 `tasks/evidence/2026-*` 系列按年月归档到 `tasks/archive/YYYY-MM/` | `tasks/` |
| tasks/evidence/` 只保留 active project tasks | `tasks/` |

#### PR-P1.3 · scripts/ 分组
| 动作 | 文件 |
| --- | --- |
| 写 `scripts/README.md` INDEX | `scripts/README.md` |
| 一次性脚本归档到 `scripts/archive/` | `scripts/archive/` |
| 孤立工具移到 `tools/` 子目录或加 README 说明其归属 | `scripts/`、`tools/` |

### Phase 3 · P2（多 PR）

PR-P2.1 · services/ 子分组（重命名）
- ADR 0010：services/ 子分组决策
- 文件：`server/src/services/{llm,tools,auth,integrations,infra}/`
- 涉及 import 路径批量修改
- 验收：`server/` 内 `grep "from.*services/"` 全部指向新路径，typecheck 全绿
- **PR-0010.1 已落地 2026-09-20**：5 文件（artifactOwnership / workspacePaths / workspaceResources / cleanupDb / fileArtifacts）迁入 `services/util/`；6 caller + 3 test import path 全部更新；`server tsc --noEmit` exit=0；`server/scripts/run-tests.mjs` 57 suites 全 pass / 0 fail。

PR-P2.2 · vendor-files 文档对齐（非"三选一精减"）
- ADR 0011：vendor 来源策略决策（**校正 ADR-0010 草案中原"三选一"假设，详见 ADR 0011**：实测 5 个 vendor bundle 全部被实际加载使用，删除会破坏 viz 卡片）
- 真实动作：修 README + 新建 `frontend/src/vendor-files/README.md`（已落地 2026-09-20，PR-0011.1）+ 后续 PR-0011.2 引入 `scripts/verify-vendor-sri.mjs` 验证脚本
- 验收：`git grep vendored` 在 README 与 codebase 一致；`verify-vendor-sri.mjs` 失败阻断 CI

PR-P2.3 · styles.css 拆分
- ADR 0012：styles.css 拆分路线
- 步骤 1：把现有根 CSS 按 headings 切片标记（已存在 `/* P_perf-self-host */` 等 pattern）
- 步骤 2：写 mappers/styles.modules.json 把规则映射到 `styles/{components,layout,vendor}/`
- 步骤 3：构建时 root styles.css `@import` 各子文件
- 验收：dist 体积不大增；Playwright 视觉 diff 通过

PR-P2.4 · frontend 一级目录合并
- ADR 0013：前端目录合并方案
- 重点合并：
  - `state/` + `store/` + `lib/` → `core/`
  - `chat/` vs `render/` 边界明确
  - `react/sidebar` vs `react/sidebar-chrome` 评估
- 验收：grep 主线 import 路径全部指向新位置

---

## 4. 风险表

| 风险 | 触发条件 | 缓解 |
| --- | --- | --- |
| README 引图改后视觉变化 | 受众期望 | 选保留 `screenshot_*.png` 路径，避免变更意图 |
| 删除 worktrees 影响未保存会话状态 | 工程师本机 agent 工作 | 软删而非硬删，先 `git status` 确认无未提交 |
| capacitor 文档化后引发误解 | 文档措辞不清 | 在 AGENTS.md 加"Decision pending — see PR-XXXX"占位 |
| vendor 精减后 viz 卡片不可用 | bundle 替换路径遗漏 | 每删一个文件跑 Playwright viz spec |
| styles.css 拆分导致 specificity 漂移 | import 顺序错误 | 用现有 scripts/archive/audit-legacy-bag.mjs 确认 source order |

---

## 5. 回滚机制

- **每个 PR 是单一 commit**（squash merge）
- **每个 PR 标题前缀与本次审查关联**（如 `[P1.1] ci: scope workflow paths`）
- **每个 P2 PR 独立视觉基线快照**（在 `frontend/e2e/__screenshots__/` 由 Playwright 留存）
- **回滚命令**：`<PR_SHA>^ git revert -m 1 <PR_SHA>` + 一键 `git stash` 恢复本地工作树

---

## 6. 引用清单

- ADR 0001：`docs/adr/0001-spa-react-alignment.md`
- ADR 0002：`docs/adr/0002-lobehub-alignment-scope.md`
- ADR 0003：`docs/adr/0003-structural-debt-categories.md`（本次新建）
- AGENTS.md：`AGENTS.md`
- README：`README.md` + `README.zh.md`
- CI 集合：`.github/workflows/*.yml`
- styles 系统：`frontend/src/styles/`、`frontend/src/styles.css`
