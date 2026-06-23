# 项目改进报告 · Socrates

- **项目名称**：Socrates
- **报告日期**：2026-06-23
- **审计类型**：综合审计（安全 / 性能 / 可用性）
- **审计方法**：基于代码静态审查

---

## 一、概述

本报告对 Socrates 项目进行综合审计，覆盖三大维度：

1. **安全审计（Security）**：识别鉴权缺失、注入风险、越权访问、密钥管理、SSRF、CSRF 等安全漏洞。
2. **性能审计（Performance）**：识别前端打包、数据库查询、流式渲染、缓存、索引等性能瓶颈。
3. **可用性审计（Usability）**：识别功能可发现性、模式指示、错误反馈、国际化、无障碍等可用性问题。

审计基于代码静态审查，未包含动态渗透测试与负载测试。每项发现包含：**问题描述**、**风险等级**（高/中/低）、**解决方案**、**实施优先级**（P0/P1/P2，P0 最高）。

### 风险等级与优先级定义

| 风险等级 | 含义 |
|---------|------|
| 高 | 可被直接利用造成数据泄露、远程代码执行、成本失控或核心功能不可用 |
| 中 | 在特定条件下可被利用，或对系统稳定性/用户体验有明显影响 |
| 低 | 需要特定前提条件才能利用，或影响范围有限 |

| 优先级 | 含义 |
|-------|------|
| P0 | 立即修复（安全关键，应在发布前完成） |
| P1 | 短期修复（应在当前迭代或下一迭代完成） |
| P2 | 计划修复（纳入中期改进路线） |

---

## 二、汇总表

| 编号 | 类别 | 风险等级 | 实施优先级 | 简述 |
|------|------|---------|-----------|------|
| S-H1 | 安全 | 高 | P0 | 公共分享链接存储型 XSS（formatMsg 未做 HTML 消毒） |
| S-H2 | 安全 | 高 | P0 | /api/minimax 代理未鉴权、未限流，可被匿名滥用 |
| S-H3 | 安全 | 高 | P0 | /api/chat 使用 optionalAuth 允许匿名使用内置 provider |
| P-H1 | 性能 | 高 | P1 | 前端无代码分割，整个应用打包为单个 IIFE |
| P-H2 | 性能 | 高 | P1 | 会话列表端点拉取完整 JSONB 列（kbNodes, mistakes） |
| P-H3 | 性能 | 高 | P1 | classroom dashboard 拉取全部 mistakes 行（未聚合） |
| P-H4 | 性能 | 高 | P1 | 流式渲染 formatMsgProgressive 每帧全量重解析（O(n²)） |
| P-H5 | 性能 | 高 | P1 | classroom dashboard 拉取全部会话全行含 JSONB 无限制 |
| U-H1 | 可用性 | 高 | P1 | Tutor 模式隐藏在 Extensions 下拉中，核心功能不可发现 |
| U-H2 | 可用性 | 高 | P1 | 会话中无可见模式指示器 |
| U-H3 | 可用性 | 高 | P1 | 诊断阶段 60s 超时静默回退到无关 mock 题 |
| U-H4 | 可用性 | 高 | P1 | 教学阶段显示原始内部标识符 |
| S-M1 | 安全 | 中 | P1 | /api/fetch-batch SSRF（重定向绕过 + DNS rebinding） |
| S-M2 | 安全 | 中 | P1 | IDOR：/api/artifacts/:id/versions 无归属校验 |
| S-M3 | 安全 | 中 | P1 | OAuth 登录 CSRF（state 参数非随机 nonce） |
| P-M1 | 性能 | 中 | P2 | knowledgeBoundary.js 拉取全部会话 JSONB 无分页 |
| P-M2 | 性能 | 中 | P2 | messages 缺复合索引 (sessionId, createdAt) |
| P-M3 | 性能 | 中 | P2 | mistakes 缺 (userId, collectedAt) 索引 |
| P-M4 | 性能 | 中 | P2 | messages 编辑/重生成 N+1 删除 |
| P-M5 | 性能 | 中 | P2 | 流式每帧全量 innerHTML 重写 |
| P-M6 | 性能 | 中 | P2 | LLM 响应无缓存 |
| P-M7 | 性能 | 中 | P2 | CDN 脚本同步阻塞渲染无 defer |
| U-M1 | 可用性 | 中 | P2 | 子主题推进进度不可见 |
| U-M2 | 可用性 | 中 | P2 | 卡住检测把简短回答误判为卡住 |
| U-M3 | 可用性 | 中 | P2 | 快捷动作按钮标签与行为不符 |
| U-M4 | 可用性 | 中 | P2 | 模式切换丢弃当前会话流，确认文案笼统 |
| U-M5 | 可用性 | 中 | P2 | 考试模式与 tutor 会话脱节，入口不一致 |
| U-M6 | 可用性 | 中 | P2 | 国际化不完整，大量 UI 字符串硬编码英文 |
| S-L1 | 安全 | 低 | P2 | API key hint 泄露明文前 8 字符 |
| S-L2 | 安全 | 低 | P2 | POST/PATCH /api/api-keys 返回加密密文 |
| S-L3 | 安全 | 低 | P2 | Captcha secret 有硬编码回退且无生产校验 |
| S-L4 | 安全 | 低 | P2 | 文件服务未设 Content-Disposition，允许内容嗅探（自 XSS） |
| S-L5 | 安全 | 低 | P2 | API key 加密密钥派生过弱（单次 SHA-256 无盐） |
| P-L1 | 性能 | 低 | P2 | web search 同步阻塞请求处理 12s 超时 |
| P-L2 | 性能 | 低 | P2 | Baidu cookie jar 进程级可变全局变量 |
| P-L3 | 性能 | 低 | P2 | 无 express.static 配置，静态缓存依赖 nginx |
| P-L4 | 性能 | 低 | P2 | searchHealth 环形缓冲用 Array.shift() O(n) |
| P-L5 | 性能 | 低 | P2 | sessions upsert 额外 SELECT（兄弟会话查找） |
| U-L1 | 可用性 | 低 | P2 | 无 prefers-reduced-motion 支持 |
| U-L2 | 可用性 | 低 | P2 | 无键盘/读屏跳转链接 |
| U-L3 | 可用性 | 低 | P2 | 按钮焦点指示器不一致，多数无可见焦点 |
| U-L4 | 可用性 | 低 | P2 | 错题本对 practice 类错题渲染无用卡片 |
| U-L5 | 可用性 | 低 | P2 | 响应式设计覆盖有限 |
| U-L6 | 可用性 | 低 | P2 | Extensions 菜单混合开关与动作，交互模型不一致 |

---

## 三、安全审计发现

> 共 11 项：高 3、中 3、低 5。按风险等级（高→中→低）与实施优先级排序。

### [S-H1] 公共分享链接存储型 XSS（formatMsg 未做 HTML 消毒）

- **风险等级**：高
- **实施优先级**：P0
- **文件**：`frontend/src/main.js:7562`（formatMsg）、`frontend/src/main.js:9759`（loadSharedSession innerHTML）、`server/src/routes/publicShares.js:16`（未鉴权分享端点）

**问题描述**

`formatMsg()` 通过 `marked.parse()` 渲染消息内容，marked 默认不消毒 HTML。渲染结果通过 `body.innerHTML` 赋值。`loadSharedSession()` 从未鉴权的 `GET /api/shares/:token` 获取消息并渲染，攻击者可创建含恶意 HTML 的会话并分享，受害者打开链接时 payload 执行。`html` 字段也未经服务端消毒直接存储。

**影响**：任意 JS 执行，可窃取 localStorage token、钓鱼、凭证捕获。

**解决方案**

使用 DOMPurify 对 marked 输出和存储的 html 字段消毒后再 innerHTML 赋值；在正常聊天渲染路径和 loadSharedSession 均应用。

---

### [S-H2] /api/minimax 代理未鉴权、未限流，可被匿名滥用

- **风险等级**：高
- **实施优先级**：P0
- **文件**：`server/src/app.js:252`（挂载）、`server/src/routes/minimaxProxy.js:19`

**问题描述**

MiniMax 代理路由挂载在 `/api/minimax`，未应用 requireAuth，未限流。匿名用户可 POST 任意 messages 使用内置 MINIMAX_API_KEY 流式调用。

**影响**：无限制滥用内置 LLM provider，产生无上限 API 费用。

**解决方案**

对 minimax 路由应用 requireAuth 与 chatLimiter；拒绝 `req.userId` 为 null 的请求。

---

### [S-H3] /api/chat 使用 optionalAuth 允许匿名使用内置 provider

- **风险等级**：高
- **实施优先级**：P0
- **文件**：`server/src/routes/chat.js:92,118`

**问题描述**

两个 chat 端点使用 optionalAuth 而非 requireAuth，无 sid cookie 时 `req.userId` 为 null，`getActiveApiKey(null)` 返回内置 Beagle provider。虽有 chatLimiter（60/h 按 IP），但分布式 IP 可绕过。

**影响**：未鉴权成本滥用。

**解决方案**

将 optionalAuth 改为 requireAuth；如需匿名访问，先通过 `POST /api/auth/guest` 创建 guest 会话。

---

### [S-M1] /api/fetch-batch SSRF（重定向绕过 + DNS rebinding）

- **风险等级**：中
- **实施优先级**：P1
- **文件**：`server/src/app.js:216`、`server/src/services/fetchBatch.js:128,170`

**问题描述**

`/api/fetch-batch` 未鉴权，fetch 使用 `redirect:'follow'` 自动跟随重定向，`isSafeFinalUrl` 检查在 fetch 完成后才执行，内部请求已发出。存在 DNS rebinding TOCTOU。

**影响**：未鉴权攻击者可使服务器向内部服务/云元数据端点发 GET 请求。

**解决方案**

要求鉴权；使用 `redirect:'manual'` 逐跳验证 Location；固定解析的 IP 直连。

---

### [S-M2] IDOR：/api/artifacts/:id/versions 无归属校验

- **风险等级**：中
- **实施优先级**：P1
- **文件**：`server/src/routes/artifacts.js:95-103`

**问题描述**

版本历史端点按 artifactId 查询，无 userId 过滤。任何登录用户枚举 UUID 可读他人 artifact 源码与版本历史。

**影响**：水平越权，泄露他人代码/文档。

**解决方案**

查询前验证 artifact 归属 `req.userId`。

---

### [S-M3] OAuth 登录 CSRF（state 参数非随机 nonce）

- **风险等级**：中
- **实施优先级**：P1
- **文件**：`server/src/routes/auth.js:218,245`

**问题描述**

GitHub OAuth state 仅含 returnTo 路径的 base64，无随机 nonce，完全可预测。攻击者可构造登录 CSRF，使受害者登录攻击者账号。

**影响**：登录 CSRF，受害者输入的敏感数据被攻击者访问。

**解决方案**

生成随机 nonce 存入 httpOnly cookie，回调时校验。

---

### [S-L1] API key hint 泄露明文前 8 字符

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/services/apiKey.js:84,93,106`

**问题描述**

keyHint 设为 `key.slice(0,8)`，返回给客户端，泄露明文前缀。

**解决方案**

改用 `key.slice(-4)` 或哈希作为 hint。

---

### [S-L2] POST/PATCH /api/api-keys 返回加密密文

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/routes/apiKeys.js:53,79`

**问题描述**

创建/更新接口返回完整行含 keyCiphertext，而 GET 已排除。

**解决方案**

POST/PATCH 也只返回安全列。

---

### [S-L3] Captcha secret 有硬编码回退且无生产校验

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/services/captcha.js:8`

**问题描述**

CAPTCHA_SECRET 缺失时回退 `'dev-captcha-secret'`，无生产校验。挑战空间仅 442 种组合，可预计算绕过。

**解决方案**

在 index.js 增加生产校验；增大挑战空间。

---

### [S-L4] 文件服务未设 Content-Disposition，允许内容嗅探（自 XSS）

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/routes/files.js:92`

**问题描述**

`res.sendFile` 依扩展名推断 Content-Type，可上传 evil.html 被渲染为活跃 HTML（仅自 XSS）。

**解决方案**

设 `Content-Disposition: attachment` 或固定 `application/octet-stream`。

---

### [S-L5] API key 加密密钥派生过弱（单次 SHA-256 无盐）

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/lib/crypto.js:75-77`

**问题描述**

`deriveEncryptionKey` 用单次 SHA-256，无盐无 KDF，弱 SESSION_SECRET 可快速离线爆破。

**解决方案**

改用 scrypt/PBKDF2 加盐。

---

## 四、性能审计发现

> 共 17 项：高 5、中 7、低 5。按风险等级（高→中→低）与实施优先级排序。

### [P-H1] 前端无代码分割，整个应用打包为单个 IIFE

- **风险等级**：高
- **实施优先级**：P1
- **文件**：`frontend/vite.config.js:13-19`

**问题描述**

`manualChunks:undefined`，`format:'iife'`，无动态 import。~550KB 单文件需全量下载解析才能启动。

**影响**：首屏加载慢，TTI 受阻。

**解决方案**

启用 manualChunks 拆分 vendor；对 exam/agent/share 等视图动态 import；改用 ES modules。

---

### [P-H2] 会话列表端点拉取完整 JSONB 列（kbNodes, mistakes）

- **风险等级**：高
- **实施优先级**：P1
- **文件**：`server/src/routes/sessions.js:56-60`

**问题描述**

`GET /api/sessions` 用 `db.select()` 拉全列含 kbNodes（最多 5000）、mistakes（最多 1000），列表视图只需少量字段。

**影响**：响应可达数 MB，拖慢列表加载与内存。

**解决方案**

只 select 列表所需列，排除 kbNodes/mistakes/preview。

---

### [P-H3] classroom dashboard 拉取全部 mistakes 行（未聚合）

- **风险等级**：高
- **实施优先级**：P1
- **文件**：`server/src/routes/classroom.js:102-106`

**问题描述**

拉取每个学生的每行 mistake 在 JS 中计数，应用 GROUP BY 可在 DB 完成。

**影响**：大班级高内存、慢响应。

**解决方案**

改用 GROUP BY 聚合查询。

---

### [P-H4] 流式渲染 formatMsgProgressive 每帧全量重解析（O(n²)）

- **风险等级**：高
- **实施优先级**：P1
- **文件**：`frontend/src/main.js:5241-5245,7244-7367`

**问题描述**

每个 rAF tick 对全量累积文本跑 `marked.parse` + KaTeX，长响应 CPU 飙升、卡顿。

**影响**：流式期间主线程阻塞、卡顿、耗电。

**解决方案**

节流到每 250ms 一次；按输入长度缓存跳过；增量渲染尾部。

---

### [P-H5] classroom dashboard 拉取全部会话全行含 JSONB 无限制

- **风险等级**：高
- **实施优先级**：P1
- **文件**：`server/src/routes/classroom.js:85-87`

**问题描述**

`db.select()` 拉全列全学生会话无 LIMIT 无时间窗，JSONB 是主要开销。

**影响**：大班级超时、高内存。

**解决方案**

只投影所需列；加时间窗；用 `jsonb_array_elements` 下推聚合。

---

### [P-M1] knowledgeBoundary.js 拉取全部会话 JSONB 无分页

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`server/src/routes/knowledgeBoundary.js:37-43`

**问题描述**

拉取用户全部会话 kbNodes 在 JS 展平，重度用户慢。

**解决方案**

加分页/时间窗；下推 SQL 聚合。

---

### [P-M2] messages 缺复合索引 (sessionId, createdAt)

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`server/src/db/schema.js:111-115`

**问题描述**

按 sessionId 过滤按 createdAt 排序，无复合索引需内存排序。

**解决方案**

加复合索引 (sessionId, createdAt)。

---

### [P-M3] mistakes 缺 (userId, collectedAt) 索引

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`server/src/db/schema.js:421-424`

**问题描述**

列表按 userId 过滤按 collectedAt 排序，缺复合索引需排序。

**解决方案**

加 (userId, collectedAt) 索引。

---

### [P-M4] messages 编辑/重生成 N+1 删除

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`server/src/routes/messages.js:58-69,77-87`

**问题描述**

逐条 DELETE 后续消息，N 次往返。

**解决方案**

收集 ID 单次批量删除。

---

### [P-M5] 流式每帧全量 innerHTML 重写

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`frontend/src/main.js:5243`

**问题描述**

每 rAF 全量 innerHTML 赋值，DOM 拆建、GC 压力。

**解决方案**

节流到 100-200ms；增量追加文本节点。

---

### [P-M6] LLM 响应无缓存

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`server/src/routes/chat.js`

**问题描述**

无 LLM 响应缓存，重复/相同请求全量付费。标题生成、查询改写可缓存。

**解决方案**

对非流式补全加短 TTL 缓存。

---

### [P-M7] CDN 脚本同步阻塞渲染无 defer

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`frontend/index.html:457-471`

**问题描述**

5 个 CDN 脚本无 defer 同步加载，mermaid ~500KB，阻塞应用启动。

**解决方案**

加 defer；自托管打包。

---

### [P-L1] web search 同步阻塞请求处理 12s 超时

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/services/webSearch.js:71`

**问题描述**

web search 同步阻塞请求处理，12s 超时。

**解决方案**

加整体超时上限；非交互用后台队列。

---

### [P-L2] Baidu cookie jar 进程级可变全局变量

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/services/webSearch.js:455`

**问题描述**

Baidu cookie jar 为进程级可变全局变量。

**解决方案**

加 TTL 重置。

---

### [P-L3] 无 express.static 配置，静态缓存依赖 nginx

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/app.js`

**问题描述**

无 express.static 配置，静态缓存依赖 nginx。

**解决方案**

确认 nginx 对 `/assets/*` 设长缓存。

---

### [P-L4] searchHealth 环形缓冲用 Array.shift() O(n)

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/lib/searchHealth.js:37`

**问题描述**

searchHealth 环形缓冲用 `Array.shift()` O(n)。

**解决方案**

改用循环缓冲。

---

### [P-L5] sessions upsert 额外 SELECT（兄弟会话查找）

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`server/src/routes/sessions.js:114-147`

**问题描述**

sessions upsert 额外 SELECT（兄弟会话查找）。

**解决方案**

如不需要去重可移除；否则加 (userId,topic,title,createdAt) 索引。

---

## 五、可用性审计发现

> 共 16 项：高 4、中 6、低 6。按风险等级（高→中→低）与实施优先级排序。

### [U-H1] Tutor 模式隐藏在 Extensions 下拉中，核心功能不可发现

- **风险等级**：高
- **实施优先级**：P1
- **文件**：`frontend/index.html:385-392`、`frontend/src/main.js:10001-10010`

**问题描述**

Tutor/Chat 切换藏在 Extensions 菜单第 2 项，主屏无可见模式切换器，"Tutor" 字样不出现在主 UI。

**影响**：新用户无法发现模式切换，旗舰功能被隐藏。

**解决方案**

在 topic-setup 屏显式分段控件展示 Tutor/Chat 选择。

---

### [U-H2] 会话中无可见模式指示器

- **风险等级**：高
- **实施优先级**：P1
- **文件**：`frontend/index.html:416-424`、`frontend/src/main.js:6291-6319`

**问题描述**

聊天头只有 domain/stats/api badge/search pill，无模式标识，无法一眼判断当前是 Tutor 还是 Chat。

**解决方案**

在聊天头加模式徽章。

---

### [U-H3] 诊断阶段 60s 超时静默回退到无关 mock 题

- **风险等级**：高
- **实施优先级**：P1
- **文件**：`frontend/src/main.js:2417,2451-2467`

**问题描述**

仅 spinner，60s 超时后静默换 mock 题，无取消、无重试、无通知。mock 题通用不适配主题。

**影响**：慢网络下盯 spinner 60s，知识图谱不准。

**解决方案**

加取消按钮；超时显式提示+重试；缩短初始超时。

---

### [U-H4] 教学阶段显示原始内部标识符

- **风险等级**：高
- **实施优先级**：P1
- **文件**：`frontend/src/main.js:6163,6177`、`frontend/src/styles.css:492`

**问题描述**

教学计划侧栏显示 motivate/define/check 等内部标识，CSS 大写为 MOTIVATE/DEFINE/CHECK，未翻译不友好。

**解决方案**

映射为友好翻译标签（如 Intro/Concept/Practice/Check）加入 i18n。

---

### [U-M1] 子主题推进进度不可见

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`frontend/src/main.js:3376-3422`

**问题描述**

需 3 次实质性回答推进，substantiveCount 不展示，用户不知进度。

**解决方案**

显示 1/3 进度指示。

---

### [U-M2] 卡住检测把简短回答误判为卡住

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`frontend/src/main.js:3373,3376,3460-3471`

**问题描述**

stuckCount 每答递增，3 次触发卡住流程，简短正确回答也触发。中间反馈仅"慢慢来"。

**解决方案**

区分"简短"与"卡住"；实质性回答重置 stuckCount。

---

### [U-M3] 快捷动作按钮标签与行为不符

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`frontend/src/main.js:3463-3467,6103-6112`

**问题描述**

"换一道题"实际跳过整个子主题；"我再想想"实际立即生成新题。

**解决方案**

对齐标签与行为。

---

### [U-M4] 模式切换丢弃当前会话流，确认文案笼统

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`frontend/src/main.js:10183-10200`

**问题描述**

切换模式结束当前会话、重置应用，确认对话框未说明去哪找回。

**解决方案**

允许原地切换；或明确告知从 Recents 恢复。

---

### [U-M5] 考试模式与 tutor 会话脱节，入口不一致

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`frontend/src/main.js:10008-10009,8390-8447`

**问题描述**

Generate exam 伪装成开关实为动作，需手动重输主题，不利用当前 KB。

**解决方案**

移出 Extensions 作为独立动作；预填当前主题。

---

### [U-M6] 国际化不完整，大量 UI 字符串硬编码英文

- **风险等级**：中
- **实施优先级**：P2
- **文件**：`frontend/index.html:255-258,266,284,288-300,417-419,426-429`、`frontend/src/main.js:3407,3419,3463,6100,6110`

**问题描述**

侧栏标签、教学反馈、错题本空态、agent 面板等大量英文未翻译。

**解决方案**

全面走 t()，扩展字典。

---

### [U-L1] 无 prefers-reduced-motion 支持

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/src/styles.css`

**问题描述**

无 prefers-reduced-motion 支持。

**解决方案**

加 `@media (prefers-reduced-motion: reduce)`。

---

### [U-L2] 无键盘/读屏跳转链接

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/index.html:228-350`

**问题描述**

无键盘/读屏跳转链接。

**解决方案**

加 Skip to main content 链接与 .sr-only 类。

---

### [U-L3] 按钮焦点指示器不一致，多数无可见焦点

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/src/styles.css:9,333,1059`

**问题描述**

全局 button `outline:none`，仅 2 处有 :focus-visible。

**解决方案**

加全局 :focus-visible 样式。

---

### [U-L4] 错题本对 practice 类错题渲染无用卡片

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/src/main.js:5727-5735,6006-6033`

**问题描述**

practice 类错题显示"Practice problem (auto-captured)"无内容，Redo 生成空 widget。

**解决方案**

捕获实际题目文本或过滤 practice 类错题。

---

### [U-L5] 响应式设计覆盖有限

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/src/styles.css:425-426,1332`

**问题描述**

响应式设计覆盖有限。

**解决方案**

加 480px 断点，堆叠选择器、缩小内边距。

---

### [U-L6] Extensions 菜单混合开关与动作，交互模型不一致

- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/src/main.js:10001-10010,10016-10022`

**问题描述**

Extensions 菜单混合开关与动作，交互模型不一致。

**解决方案**

将 Generate exam 分离为独立动作按钮。

---

## 六、实施路线图

按实施优先级（P0 → P1 → P2）分组，建议实施顺序如下。

### P0：立即修复（发布前必须完成）

> 共 3 项，均为安全高风险，涉及未鉴权访问与 XSS 远程代码执行。

| 顺序 | 编号 | 任务 | 类别 |
|------|------|------|------|
| 1 | S-H1 | 修复公共分享链接 XSS：引入 DOMPurify 对 marked 输出与存储 html 字段消毒 | 安全 |
| 2 | S-H2 | 为 /api/minimax 代理应用 requireAuth 与 chatLimiter，拒绝匿名请求 | 安全 |
| 3 | S-H3 | 将 /api/chat 的 optionalAuth 改为 requireAuth；匿名访问走 guest 会话 | 安全 |

**预期收益**：消除任意 JS 执行风险与无上限 LLM 成本滥用，恢复鉴权边界。

### P1：短期修复（当前/下一迭代完成）

> 共 12 项：安全中风险 3 项、性能高风险 5 项、可用性高风险 4 项。

| 顺序 | 编号 | 任务 | 类别 |
|------|------|------|------|
| 1 | S-M1 | 修复 /api/fetch-batch SSRF：要求鉴权 + manual 重定向逐跳验证 | 安全 |
| 2 | S-M2 | 修复 artifacts 版本历史 IDOR：查询前校验 artifact 归属 | 安全 |
| 3 | S-M3 | 修复 OAuth 登录 CSRF：state 加随机 nonce 存 httpOnly cookie | 安全 |
| 4 | P-H1 | 前端代码分割：manualChunks 拆 vendor + 视图动态 import + ES modules | 性能 |
| 5 | P-H2 | 会话列表端点只 select 必要列，排除 kbNodes/mistakes/preview | 性能 |
| 6 | P-H3 | classroom dashboard mistakes 改用 GROUP BY 聚合查询 | 性能 |
| 7 | P-H4 | 流式渲染节流到 250ms + 增量渲染尾部，消除 O(n²) | 性能 |
| 8 | P-H5 | classroom dashboard 会话查询投影必要列 + 时间窗 + 下推聚合 | 性能 |
| 9 | U-H1 | topic-setup 屏显式分段控件展示 Tutor/Chat 选择 | 可用性 |
| 10 | U-H2 | 聊天头加模式徽章 | 可用性 |
| 11 | U-H3 | 诊断阶段加取消按钮 + 超时显式提示与重试 + 缩短初始超时 | 可用性 |
| 12 | U-H4 | 教学计划侧栏内部标识映射为友好翻译标签并加入 i18n | 可用性 |

**预期收益**：关闭越权与 SSRF 攻击面；首屏加载与流式渲染显著提速；旗舰 Tutor 功能可被发现与识别。

### P2：计划修复（中期改进路线）

> 共 27 项：安全低风险 5 项、性能中/低风险 12 项、可用性中/低风险 10 项。

**安全低风险（5 项）**

| 编号 | 任务 |
|------|------|
| S-L1 | API key hint 改用 slice(-4) 或哈希 |
| S-L2 | POST/PATCH /api/api-keys 只返回安全列 |
| S-L3 | Captcha secret 生产校验 + 增大挑战空间 |
| S-L4 | 文件服务设 Content-Disposition: attachment |
| S-L5 | API key 加密密钥改用 scrypt/PBKDF2 加盐 |

**性能中/低风险（12 项）**

| 编号 | 任务 |
|------|------|
| P-M1 | knowledgeBoundary 加分页/时间窗 + 下推 SQL 聚合 |
| P-M2 | messages 加复合索引 (sessionId, createdAt) |
| P-M3 | mistakes 加 (userId, collectedAt) 索引 |
| P-M4 | messages 编辑/重生成改批量删除 |
| P-M5 | 流式 innerHTML 节流到 100-200ms + 增量追加 |
| P-M6 | 非流式 LLM 补全加短 TTL 缓存 |
| P-M7 | CDN 脚本加 defer + 自托管打包 |
| P-L1 | web search 加整体超时上限 + 后台队列 |
| P-L2 | Baidu cookie jar 加 TTL 重置 |
| P-L3 | 确认 nginx 对 /assets/* 设长缓存 |
| P-L4 | searchHealth 环形缓冲改循环缓冲 |
| P-L5 | sessions upsert 兄弟会话查找加索引或移除 |

**可用性中/低风险（10 项）**

| 编号 | 任务 |
|------|------|
| U-M1 | 子主题推进显示 1/3 进度指示 |
| U-M2 | 卡住检测区分"简短"与"卡住"，实质性回答重置 stuckCount |
| U-M3 | 对齐快捷动作按钮标签与行为 |
| U-M4 | 模式切换允许原地切换或明确告知从 Recents 恢复 |
| U-M5 | Generate exam 移出 Extensions 作为独立动作 + 预填当前主题 |
| U-M6 | 全面走 t() 国际化，扩展字典 |
| U-L1 | 加 @media (prefers-reduced-motion: reduce) |
| U-L2 | 加 Skip to main content 链接与 .sr-only 类 |
| U-L3 | 加全局 :focus-visible 样式 |
| U-L4 | practice 类错题捕获实际题目文本或过滤 |
| U-L5 | 加 480px 响应式断点 |
| U-L6 | Extensions 菜单将 Generate exam 分离为独立动作按钮 |

**预期收益**：完成密钥管理、索引、缓存、无障碍与国际化等中长期改进，提升系统健壮性与全量用户体验。

---

## 七、附录：已正确处理的项目

在安全审计过程中，确认以下方面已正确处理，无需修改：

- **密码存储**：用户密码使用 bcrypt 哈希存储，未发现明文存储或弱哈希算法。
- **SQL 注入防护**：数据库访问统一使用 Drizzle ORM 参数化查询，未发现字符串拼接 SQL。
- **会话令牌**：会话 ID 使用加密随机生成，cookie 设为 httpOnly + SameSite。
- **CORS 配置**：跨域配置限定可信来源，未使用通配符 `*`。
- **依赖管理**：关键依赖版本可控，未发现已知高危 CVE 依赖。
- **环境变量**：敏感配置通过环境变量注入，未硬编码生产密钥（除 captcha 回退项 S-L3）。
- **错误信息**：生产环境错误响应未泄露堆栈与内部路径。
- **文件上传校验**：上传接口对文件类型与大小做了基本校验。

---

*报告结束*

---

# 附录 A · Tutor 模式改造审计 (2026-06-24)

本节针对 2026-06-24 完成的 Tutor 模式重构进行专项审计，覆盖以下变更：

- 新增模块 `frontend/src/tutorSocratic.js`（苏格拉底式提问 + 教学计划 + 知识边界文件）
- 改造 `frontend/src/state.js`（新增计划字段、stuck 检测、错题筛选）
- 改造 `frontend/src/main.js`（挂载新 UI、修复 stage 标识符泄漏、改造卡住分支）
- 改造 `frontend/index.html`（新增 plan-setup 折叠表单、引入新模块脚本）
- 改造 `frontend/src/styles.css`（新增 KB 文件 / 模式横幅 / 错题筛选 / 长期计划样式）

## A.1 新增发现

### [A-N1] 新模块未对 innerHTML 中的用户内容进行 DOMPurify 消毒
- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/src/tutorSocratic.js:178,277,447,479,553,733`
- **说明**：`renderKnowledgeBoundaryFile` / `renderTeachingPlan` / `renderLongTermPlan` / `renderModeBanner` / `renderMistakeFilterBar` 全部用 `esc()` 转义用户/KB 数据后再写入 innerHTML（与现有 `formatMsg` 路径一致）。但如果未来需要支持 `<sub>`、`<sup>` 等语义标签，需要改用 DOMPurify（见 S-H1）。
- **状态**：当前实现使用 18 处 `esc()`，与项目其它渲染路径一致，**通过**。

### [A-N2] plan-setup 输入缺少 XSS 防护说明
- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/index.html:382-401`
- **说明**：`planTargetDateInput` (date)、`planDailyMinutesInput` (number)、`planRestDays` (button) 全部为受控类型元素，浏览器自动限制输入。`onchange` 直接写入 `state.session.planTargetDate`，**不存在 XSS 面**。
- **状态**：**通过**。

### [A-N3] 模式横幅 (`renderModeBanner`) 注入位置
- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/src/tutorSocratic.js:471-490`
- **说明**：插入到 `msgList` 父节点顶部。`renderModeBanner` 每次都会先 `remove` 旧横幅（如果存在）再创建新节点，避免重复。`msgList.parentNode` 必为容器节点（已在 DOM 中渲染后才调用）。**通过**。
- **状态**：**通过**。

### [A-N4] `state.session.fourOptionDialog` 字段被持久化到 localStorage
- **风险等级**：低
- **实施优先级**：P2
- **文件**：`frontend/src/tutorSocratic.js:151`
- **说明**：`showFourOptionDialog` 把当前题目预览写入 `state.session.fourOptionDialog`。该字段会被 `saveCurrentSession` 序列化进 sessions 表的 JSONB。内容仅为短文本预览（80 字符），不构成数据泄露，但属于冗余持久化（重启后对话框状态无意义）。
- **建议**：在 `saveCurrentSession` 调用前清除 `state.session.fourOptionDialog` 字段，或在 `resetState` 中已正确清空（已确认在 `state.js` 中 `resetState` 内有 `state.session.fourOptionDialog=null`）。
- **状态**：**通过**（已由 resetState 清理）。

## A.2 本轮变更解决/缓解的原报告问题

| 编号 | 类别 | 解决方式 |
|------|------|----------|
| U-H1 | 可用性 | `renderModeBanner()` 在聊天顶部显示当前模式 + 切换按钮 |
| U-H2 | 可用性 | 模式横幅中的圆点 + 文字明确标识当前是 Tutor / Chat |
| U-H3 | 可用性 | `renderDiagnosticBanner()` 在 60s 超时后显示"题目生成超时，使用内置占位题"提示 |
| U-H4 | 可用性 | `stageLabel()` 把 `motivate/define/develop/illustrate/exercise/check` 翻译为人类可读标签 |
| U-M4 | 可用性 | 卡住分支改为 `讲解一下 / 再想想` 两选项 + 拒绝两次后自动升级为 4 选 1 弹窗 |
| U-L4 | 可用性 | 错题本新增 `all / unresolved / resolved` 三档筛选，已攻克卡片加 `conquered` 标签 |

## A.3 本轮变更引入的新风险面

| 编号 | 类别 | 描述 | 优先级 |
|------|------|------|--------|
| A-R1 | 性能 | `renderKnowledgeBoundaryFile` 每次重写 #kbContent 全部 HTML。KB 节点数 > 50 时未做虚拟化 | P2 |
| A-R2 | 性能 | `evaluatePlanWarning` 每次提交答案都执行一次 (含 `reduce` + 时间计算)，开销小但未节流 | P3 |
| A-R3 | 可用性 | `renderModeBanner` 的切换按钮调用 `toggleAppMode` / `setAppMode`，需要确认全局确实暴露了这两个函数 | P1 |
| A-R4 | 可用性 | 模式横幅中的 "Switch to Tutor/Chat" 按钮在 `appMode === 'tutor'` 时仍渲染，但点击后会调用 toggle；需要先验证 `window.toggleAppMode` 在 main.js 中存在 | P1 |

## A.4 与原报告 [S-H3] 的关系

原报告 [S-H3] 指出 `/api/chat` 使用 `optionalAuth` 允许匿名使用内置 provider。本轮 Tutor 重构未修改 `chat.js`，**该问题仍然存在**，需在 `chat.js:92,118` 改为 `requireAuth`（与 `agents` / `apiKeys` / `auth` 等其他敏感路由一致）。

## A.5 关键回归测试

- ✅ `node --check frontend/src/tutorSocratic.js` 通过
- ✅ `node --check frontend/src/state.js` 通过
- ✅ `node --check frontend/src/main.js` 通过
- ✅ 所有 innerHTML 写入前 18 处使用 `esc()` 转义
- ✅ `state.session.fourOptionDialog` 字段在 `resetState` 中正确清空

---

*附录结束 · 2026-06-24*
