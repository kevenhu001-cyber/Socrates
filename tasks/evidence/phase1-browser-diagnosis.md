# Phase 1: 浏览器实测诊断报告

**时间**: 2026-07-07
**诊断工具**: Playwright Chromium 1228 (real DNS,真实 EdgeOne 路径)

## TL;DR

| 域名 | EdgeOne 拦截? | bundle 加载? | modelPicker 状态 |
|---|---|---|---|
| test.topodrive.top | **是** — Security Verification 中间页 | 未加载 | 不存在 (DOM 被替换) |
| app.topodrive.top | 否 | 已加载 (462324 bytes) | 空 (providers=[]) |

## test.topodrive.top — EdgeOne 实证

**返回 HTML 关键片段**:
```
<title>Security Verification</title>
<script src="https://captcha.eo.gtimg.com/TEOCaptchaWidget.js"></script>
Protected by Tencent Cloud EdgeOne
```

**Network 层**: 所有请求都是 captcha.eo.gtimg.com / captcha.eo.qq.com,**零请求到 /assets/index-*.js**。

**Origin 对照** (`--resolve test.topodrive.top:443:43.138.124.99`):
- HTTP 200, 61915 bytes
- 引用 `index-C70B2cdF.js` — 与 app 字节一致

→ Origin 干净,EdgeOne WAF 拦截了 test 子域名。

## app.topodrive.top — 代码 bug 实证

**bundle 完整加载**,但运行时发现:

1. `window.apiConfig = {activeId: null, providers: []}` 永远空
2. `GET /api/config` 响应只有 `{hasBeagleKey:true}` — **没有 providers**
3. `GET /api/auth/me` ×3 重试 401 (未登录预期)
4. **pageerror**: `exitAgentMode is not defined`
5. **手动注入 provider → syncModelPills 立即渲染按钮** → 确认 picker 函数健康,锅在数据源

## 根因判定

### test 域名问题
- **EdgeOne Bot 防御** (非代码 bug)
- 历史:test 子域名被风控标黑
- 修法:
  - EdgeOne 控制台:把 test.topodrive.top 从 WAF/Bot Challenge 改为 Monitor
  - 或 DNS:CNAME test.topodrive.top → 43.138.124.99 直指 origin (牺牲 CDN)
  - 或:让 test 用户先访问 app.topodrive.top 一次拿 `__tst_status` cookie (同一 l2domain)

### app 域名问题
- **代码 bug**:`/api/config` schema 变了,前端 `apiConfig.providers` 永远空
- 可能是最近的 api/config 响应 schema 改动里删了 providers 字段
- 修法:grep `/api/config` 调用链 → 看 schema 变更

### exitAgentMode
- bundle 里**有定义**(grep 证实),但页面抛 "exitAgentMode is not defined"
- 说明:bundle 没运行到那一行就抛错,或该函数引用上下文有问题
- 需 grep `exitAgentMode` 调用点,看是不是 inline handler 引用但 window.exitAgentMode 没暴露

## 待 Phase 2 解答
- server `routes/chat.js` / `services/auth.js` 改了什么?
- `pickers.js` 是否改过 boot 顺序?
- `exitAgentMode` 的调用方是谁?
