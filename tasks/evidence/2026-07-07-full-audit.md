# 全面审计报告 — 2026-07-07

## 范围

| 维度 | 工具 | 状态 |
|---|---|---|
| Server 路由/服务/中间件 | agent + grep | 87 findings (6 HIGH, 11 MEDIUM) |
| Server deps CVE | OSV.dev API | 3 库共 21 CVE (multer 9, nodemailer 11, drizzle-orm 1) |
| Frontend 改动 vs HEAD | agent diff | 16 files reviewed, 0 critical, 2 medium |
| Bridge 完整性 (inline ↔ window.*) | grep + agent | **0 missing**, 83 dead exports (informational) |
| `var X = window.X` 模式 | agent | 29 patterns, 全部 bridge 已修,0 unguarded+unbridged |
| Build & deploy | curl + nginx inspect | CSP frame-ancestors 缺失(medium) |
| Runtime smoke | (workflow stopped,数据未生成) | — |

## 已完成修复(本会话前面部分)

- Fix 1: 移除未实现 Agent 模式 window 暴露
- Fix 2: refreshApiConfig 早退路径 markProvidersFetched
- Fix 4: 补回 skipDiagQuestion / clearActiveTemplate / BEAGLE_BUILT_IN 桥
- Fix 5: 补 isReasoningProvider / getCustomInstructionsString 桥 (解 d is not a function)

## 新发现 — Critical / High

### H1 — server deps 21 CVE
| 库 | 当前 | CVE 数 | 最高 | 修复版本 |
|---|---|---|---|---|
| multer | ^1.4.5-lts.2 | 9 | HIGH (DoS via malformed requests) | >= 2.2.0 |
| nodemailer | ^6.9.0 | 11 | HIGH (raw option bypass → 任意文件读 + SSRF) | >= 9.0.1 |
| drizzle-orm | ^0.40.0 | 1 | HIGH (SQL injection via identifiers) | >= 0.45.2 |

multer 路径:`server/src/routes/files.js:8`,`fileExtract.js:19` — 已 requireAuth + writeLimiter 前置,攻击成本较高但仍可达。
nodemailer 路径:`server/src/services/email.js:1`,subject 来自调用方字符串(目前 4 处全静态),raw option 漏洞需 future change 才会触发,但 OSV 仍判 HIGH。
drizzle-orm:核心 ORM,所有 service 都用,SQLi 风险面广。

**建议**:本周内升级,先在 staging 跑测试套件。

### H2 — server/src/services/email.js:31 console.log 打印邮件正文
- SMTP 未配置时,console.log 输出 `{to, subject, body}`
- body 内含 verify/reset/login code 等 token
- journalctl 默认 root 可读,泄漏面大
**fix**:production 强制 SMTP 配置,缺失则 startup error。

### H3 — server/src/services/loginLockout.js:35 进程内 Map
- Module-level Map 单进程计数
- cluster / PM2 多 worker 下每个 worker 独立计数
- 攻击者轮询 worker 可获 N×THRESHOLD 尝试次数
**fix**:迁移到 DB 持久化(verification_tokens.kind='login_failure')。

### H4 — server/src/routes/apiKeys.js:51 SSRF via apiKey.url
- POST /api/api-key 接受任意 `url`,原样转发到上游 LLM
- 攻击者可改成内网 / loopback / link-local,造成 SSRF
**fix**:https only,拒绝 RFC1918 / 127.0.0.0/8 / 169.254.0.0/16。

### H5 — server/src/routes/minimaxProxy.js:46 extra_body 未白名单
- 用户传入 `extra_body` 原样转发到 minimax 上游
- 可绕过 chat.js 的 sanitizeExtraBody
**fix**:复用 chat.js 的 `ALLOWED_EXTRA_BODY_KEYS` whitelist。

## 新发现 — Medium

### M1 — server/src/services/auth.js 密码无上限 (3 处)
- register:117 / resetPassword:470 / changePassword:502
- bcrypt 静默截断 72 字节 → 长密码后段丢失
**fix**:加 `MAX_PASSWORD_LENGTH = 64`,超过则 400。

### M2 — server/src/services/auth.js:486 resetPassword 无事务
- hashPassword 抛错时 token 已 lookup 但未删 → token 永久有效
**fix**:包 `db.transaction`。

### M3 — server/src/services/auth.js:535 deleteAccount 不删关联表
- 只删 users,留 authSessions/apiKeys/files/messages 孤儿
- sid cookie 仍指向已删 user,可能 reuse
**fix**:级联删除或 schema 加 `onDelete: 'cascade'`。

### M4 — server/src/middleware/rateLimit.js:82/94 key 含高基数
- codeLoginLimiter key = email|code|ip → 每个错码独立桶,绕开 5/hr
- resetLimiter key = token|ip → 同理
**fix**:key 改成 email|ip,token|ip。

### M5 — server/src/routes/auth.js:253 OAuth returnTo 白名单过宽
- `safeReturnTo` 允许 `/*`, `\\*` 等模式
- `//evil.com/path` 可绕过
**fix**:路径白名单 `/`、`/c/*` 等 SPA 已知路径。

### M6 — server/src/routes/share.js:41 visibility 无枚举
- POST 接受任意字符串存 DB
**fix**:zod enum `['unlisted', 'public', 'private']`。

### M7 — server/src/routes/account.js:220 导出端点无 re-auth
- GET /api/account/export 包含全部 messages / apiKeys / files
- CSRF 拿到 sid 即可导出
**fix**:要求密码或短期 confirm token。

### M8 — nginx CSP 缺 frame-ancestors
- 只有 frame-src 'none',缺 frame-ancestors
- 防御 clickjacking 不完整(IE11 / 老 Safari 不识别 frame-src)
**fix**:CSP 加 `frame-ancestors 'none'`。

### M9 — server/src/routes/messages.js:60 attachments 数组无 shape 校验
- `.slice(0,20)` 上限有,但每个元素的 dataUrl 大小 / 类型无校验
**fix**:zod schema 校验每项。

### M10 — server/src/routes/notifications.js:14 push token 无 size 限制
- platform / token / deviceId / channels 全部裸接
- 10MB body 全塞进去都接受
**fix**:zod schema,token <= 4KB,deviceId <= 200。

## 新发现 — Low (摘要)

- bcrypt cost=12 硬编码(无 BCRYPT_ROUNDS env)— **#75**
- generateShortToken 8 字节(64-bit entropy)— **#75** (OWASP 建议 128-bit)
- audit middleware 失败路径打印 email — **#75**
- express.json limit 2MB 与 chat payload 上限 700KB 不匹配 — **#75**
- csrfProtection 仅 cookie 时不严格 — **#75** (accepted trade-off)
- sessionIdFromQuery 不验证所有权 — **#75**
- helmet CSP 无 SRI — **#75**
- frontend var X = window.X 全部 29 处都 bridge=True — **#80/#81**(修复已完整)

## 已修复 vs 已确认无需修

- /api/shares/:token 附件 dataUrl 泄漏 — 历史曾有,目前显式投影,**已修复**
- /api/api-key GET 密文泄漏 — 历史曾有,目前 sql IS NOT NULL + boolean coerce,**已修复**
- inline handler 与 window.* 暴露不匹配 — **0 missing**

## 未跑完的审计维度

- Playwright 15 步交互 smoke (Cmd+K / cheatsheet / 模板 / 附件 / 项目切换 / 主题 / i18n / 拖侧栏 / 编辑 / 错题 / 考试 / 诊断 / 模板 / 分享 / 登出登入) — 工作流被中止,无截图证据。
- frontend dead imports / state shape mismatch — agent 未完整返回。

## 优先级建议

| 优先级 | 任务 | 估计工时 |
|---|---|---|
| P0 | H1 multer 2.x 升级 | 4h (含测试) |
| P0 | H1 nodemailer 9.x 升级 | 2h |
| P0 | H1 drizzle-orm 0.45+ 升级 | 3h |
| P1 | H2 email fallback 生产禁用 | 0.5h |
| P1 | H3 loginLockout 持久化 | 2h |
| P1 | H4 apiKey.url SSRF 白名单 | 1h |
| P1 | H5 minimaxProxy extra_body 白名单 | 0.5h |
| P2 | M1-M3 password + deleteAccount + resetPassword | 2h |
| P2 | M4-M7 rate limit + OAuth + share + export | 2h |
| P2 | M8 CSP frame-ancestors | 0.1h |
| P2 | M9-M10 attachments / notifications zod | 1h |
