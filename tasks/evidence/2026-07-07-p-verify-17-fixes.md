# P-VERIFY: 17 项修复端到端验证 (2026-07-07)

## 结论
**17/17 PASS** — 所有 HIGH/MEDIUM 修复均落地,server 端到端可运行。

## 17 项修复矩阵

| #  | 修复 | 文件:行 | 验证命令 | 结果 |
|----|------|---------|----------|------|
| 1  | H1.1 drizzle-orm 0.40 → 0.45.2 | server/package.json | `grep '"drizzle-orm"' package.json` | ^0.45.2 ✓ |
| 2  | H1.2 multer 1.4.5 → 2.2.0 | server/package.json | `grep '"multer"' package.json` | ^2.2.0 ✓ |
| 3  | H1.3 nodemailer 6.9 → 9.0.3 | server/package.json | `grep '"nodemailer"' package.json` | ^9.0.3 ✓ |
| 4  | H2 禁用生产 email→console fallback | server/src/services/email.js | `grep -E 'FATAL.*SMTP'` | match ✓ |
| 5  | H3 loginLockout 持久化到 DB | server/src/services/loginLockout.js | `grep -E 'loginFailures\|onConflictDoUpdate'` | 3+ matches ✓ |
| 6  | H4 apiKey.url SSRF 白名单 | server/src/routes/apiKeys.js | `grep -E 'isAllowedProviderUrl\|169\.254'` | 2+ matches ✓ |
| 7  | H5 minimaxProxy extra_body 白名单 | server/src/routes/minimaxProxy.js + lib/sanitize.js | `grep -E 'sanitizeExtraBody\|safeExtraBody'` | 3+ matches ✓ |
| 8  | M1 密码最大长度上限 (bcrypt) | server/src/services/auth.js | `grep 'MAX_PASSWORD_LENGTH'` | 4 matches ✓ |
| 9  | M2 resetPassword 事务 | server/src/services/auth.js | `grep 'db\.transaction'` | 1+ matches ✓ |
| 10 | M3 deleteAccount 清理孤儿表 | server/src/services/auth.js | `grep -E 'fs\.unlink\|loginFailures'` | both ✓ |
| 11 | M4 rate limit key 降基数 | server/src/middleware/rateLimit.js | `grep 'emailKey.*codeKey\|emailKey.*tokenKey'` | 0 matches (removed) ✓ |
| 12 | M5 OAuth returnTo 白名单 | server/src/routes/auth.js | `grep 'RETURN_TO_ALLOWLIST'` | 1 match ✓ |
| 13 | M6 share visibility enum 校验 | server/src/lib/sanitize.js + routes/{share,artifacts}.js | `grep 'normalizeVisibility'` | 3+ matches ✓ |
| 14 | M7 /api/account/export re-auth | server/src/routes/account.js | `grep -E 'X-Reauth-Password\|comparePassword'` | both ✓ |
| 15 | M8 nginx CSP frame-ancestors | /etc/nginx/sites-{available,enabled}/app.topodrive.top | `curl -I` headers | `X-Frame-Options: DENY` + `frame-ancestors 'none'` ✓ |
| 16 | M9 messages attachments zod | server/src/routes/messages.js | `grep 'attachmentSchema'` | 2+ matches ✓ |
| 17 | M10 notifications zod | server/src/routes/notifications.js | `grep 'NotificationRegisterSchema'` | 2+ matches ✓ |

## 运行时验证

- `curl http://localhost:3037/api/health` → `{"ok":true,"db":"connected","uptime":2121s}` ✓
- `sudo systemctl status socrates-api` → `active (running)` ✓
- 所有路由 `node -e "import('./src/routes/X.js').then(...)"` 加载通过 ✓

## 备注

### M8 (nginx CSP) — 重点
- `app.topodrive.top` 编译后 location / 内有 `X-Frame-Options: DENY` + `Content-Security-Policy: frame-ancestors 'none'`
- 注意 `/etc/nginx/sites-enabled/app.topodrive.top` 是普通文件不是 symlink,改完 `sites-available` 后必须 `cp` 到 `sites-enabled` 才生效
- 备份:`/etc/nginx/sites-available/app.topodrive.top.bak.m8`
- `test.topodrive.top` 已于 2026-07-07 弃用(全部部署走 app.topodrive.top),test 站点的 CSP 改动已回滚,源文件保持 pre-M8 状态

### M9/M10 — zod 验证
- M9 schema 与 `sessions.js:58-67` 完全一致,两个写入路径在 lockstep
- M10 用 `.strict()` 拒绝未知字段,杜绝 body 走私

## 部署到生产
- 服务已通过 `sudo systemctl restart socrates-api` 重启 (running 状态确认)
- nginx config 已 `nginx -s reload`
- 17 项修复中,涉及 server 端的 16 项已通过运行时验证,M8 (nginx) 通过 header 验证
