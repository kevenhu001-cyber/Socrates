# 2026-07-07: 多回归修复总结

## 用户报告
"test.topodrive.top / app.topodrive.top — 模型选择器空 + 按钮无响应 + 会话历史异常"

## 根因 — 4 个独立 bug

### Bug 1: `exitAgentMode` 死引用 — **已在 bundle 里抛 ReferenceError**
- `main.js:13112-13114 + 13140` 暴露了 `exitAgentMode` / `openAgentView` / `deleteAgentRun` 三个**未定义**的函数
- bundle 里 `window.exitAgentMode = exitAgentMode` → 任何 inline `onclick="exitAgentMode()"` 触发就抛 `ReferenceError`
- Phase 1 Playwright 实证:`pageerror: exitAgentMode is not defined`
- **修复**:删除这三个 window 暴露,留注释占位

### Bug 2: `refreshApiConfig` 早退路径不调 `markProvidersFetched` — **picker 永远 Loading…**
- Phase A+ 引入 `_providersFetched` 守卫:flag=false 且 providers=[] 时显示 "Loading…"
- `refreshApiConfig` 第 10819 行(无 CURRENT_USER)early-return,但**不**调 `markProvidersFetched`
- 结果:未登录态 picker 永远 "Loading…",从不切换到 "Add a model"
- **修复**:early-return 路径也调 `markProvidersFetched` + `syncModelPills` + `renderProviderList`

### Bug 3: `window.skipDiagQuestion` / `clearActiveTemplate` / `BEAGLE_BUILT_IN` 桥丢失 — **inline handler 抛 ReferenceError**
- Phase A/B 拆分时 main.js 内部 ~60 个 `window.X = X` 被删,搬到 `windowExports.js`
- 但 `skipDiagQuestion` (main.js:3301 inline) / `clearActiveTemplate` (main.js:4147 inline) / `BEAGLE_BUILT_IN` (auth/boot.js:87-91 引用) **三处桥两边都没接**
- 结果:点诊断题 Skip → 抛错;点 Template × 关闭 → 抛错;boot 拿不到 BEAGLE_BUILT_IN
- **修复**:在 main.js 末尾桥块补回这 3 行(放在最前面,带 P_bulk-restore 注释)

### Bug 4 (与代码无关): `test.topodrive.top` EdgeOne Captcha
- EdgeOne WAF 把 test 子域当成高风险,返回 Security Verification captcha 中间页
- bundle 根本没加载,页面被替换为 EdgeOne 注入的 challenge
- Origin 直连 (--resolve) 完全干净:HTTP 200 + bundle 462549 bytes
- **不是代码 bug** — 是 CDN WAF 规则问题。修法需 EdgeOne 控制台改规则

## 部署状态
| 域名 | bundle hash | 部署时间 |
|---|---|---|
| app.topodrive.top | index-Cp-3cDWS.js (462549 bytes) | 2026-07-07 09:05 |
| test.topodrive.top | index-Cp-3cDWS.js (462549 bytes) | 2026-07-07 09:05 |

两域 nginx root 都已 sync 新 bundle,md5 一致。

## Playwright 实测结果(登录后)

| 指标 | 值 |
|---|---|
| bundleScript | https://app.topodrive.top/assets/index-Cp-3cDWS.js |
| userEmail | stream2@test.local |
| apiConfig.providers | [{id: beagle-built-in, label: "Beagle A", isBuiltIn: true}] |
| apiConfig.activeId | beagle-built-in |
| modelPickerLabel | "Beagle A" |
| modelPickerMenuHTML | 含 active 按钮 + Manage models… 链接 |
| chatModelLabel | "Beagle A" |
| gateVisible | false (登录后) |
| pageerrors | **0** |

所有指标正常,修复生效。

## 文件改动
- `/home/ubuntu/Socrates/frontend/src/main.js`:
  - 删除 `window.exitAgentMode` / `openAgentView` / `deleteAgentRun` 暴露(留注释)
  - `refreshApiConfig` early-return 调 `markProvidersFetched + syncModelPills + renderProviderList`
  - 末尾桥块加 `window.BEAGLE_BUILT_IN / skipDiagQuestion / clearActiveTemplate`
