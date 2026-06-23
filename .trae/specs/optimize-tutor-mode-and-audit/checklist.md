# Checklist

## 第一部分：Tutor 模式优化

### 模式默认值与渲染容错

* [x] `appMode` 默认值统一为 `"tutor"`，与注释及会话恢复逻辑一致（`main.js:9959`）

* [x] `<quiz>`/`<example>`/`<practice>`/`<mistake>` 块解析失败时回退渲染原始文本，不再静默丢弃留空 slot

* [x] 解析失败时向用户给出可见提示（如"该内容格式异常，已原样展示"）

* [x] Tutor 模式 UI 文案已 i18n 化（诊断加载、Quick check、Problem、Solution、Hint、Explain/Skip/Retry）

* [x] OpenAPI 与后端 zod 的 mode 枚举一致

### 客户端教学阶段状态机

* [x] `state.js` 新增 `teachingStage`、`currentExampleIdx`、`practiceAttempts`、`teachingPlan` 字段

* [x] `buildFollowUpMessages` 依据显式 `teachingStage` 推进，向 LLM 传递当前阶段指令

* [x] `buildSocraticMessages` 首次消息与后续消息均依据阶段状态构造

* [x] `handleQuizPick` 与 `submitChatMessage` 根据答题结果更新 `teachingStage` 与 `practiceAttempts`

* [x] 会话保存/恢复时持久化 `teachingStage` 等新字段

### 标准化教学计划模板

* [x] 教学计划 JSON 结构已定义（子主题、目标、示例数、练习数、考察类型、前置依赖）

* [x] `finishDiagnostic` 完成后基于 kbNodes 生成教学计划并按前置依赖排序

* [x] 侧边栏 Knowledge 视图渲染教学计划与当前进度

* [x] 教学计划视图样式已补充至 `styles.css`

### 后端加载 Tutor 系统提示词

* [x] `chat.js` 识别会话 mode 为 tutor 时读取 `prompts/teacher-mode.md` 作为系统提示词基础

* [x] 前端动态上下文与后端基础提示词组合，不重复拼接

* [x] 提示词文件加载含缓存与变更检测，避免每次请求读盘

### 错题本一等公民实体

* [x] `schema.js` 新增 `mistakes` 表（含 userId、sessionId、nodeName、isResolved 等字段）

* [x] 已生成 drizzle 迁移 SQL

* [x] `routes/mistakes.js` 提供 GET（含筛选）、POST、PATCH、DELETE 路由

* [x] `app.js` 挂载 mistakes 路由

* [x] 前端 `<mistake>` 块触发时调用 `/api/mistakes` 持久化

* [x] OpenAPI 中 mistake share 端点已实现或已移除

### 知识边界文件跨会话查询

* [x] `routes/knowledgeBoundary.js` 提供 `GET /api/knowledge-boundary`（支持 status 筛选）

* [x] sessions.kbNodes JSONB 查询已加 GIN 索引

* [x] `app.js` 挂载 knowledgeBoundary 路由

* [x] 前端 Knowledge 视图支持展示跨会话聚合节点状态

### classroom dashboard 聚合

* [x] `classroom.js` 返回真实 `hotspotMistakes`（错题频次 Top N）

* [x] `classroom.js` 返回真实 `topicCompletion`（各节点已内化比例）

* [x] `StudentSummary` 补全 progressPercent、streakDays、mistakeCount、lastActiveAt 字段

## 第二部分：项目审计

### 安全漏洞评估

* [x] 用户数据处理审计完成（token、cookie、API key、PII）

* [x] 权限控制审计完成（鉴权覆盖、越权、IDOR）

* [x] 输入验证审计完成（zod 覆盖率、SQL 注入、XSS、SSRF、路径穿越）

* [x] CSRF 与 CORS 配置审计完成

* [x] 每项漏洞记录风险等级与解决方案

### 性能测试与分析

* [x] 前端 main.js 拆分与懒加载机会分析完成

* [x] 数据库查询审计完成（N+1、JSONB 全表扫描、缺索引）

* [x] 流式渲染阻塞审计完成

* [x] rate limit 与缓存策略审计完成

* [x] 每项瓶颈记录影响与优化方案

### 可用性与交互体验评估

* [x] Tutor 模式发现性评估完成

* [x] 诊断阶段体验评估完成

* [x] 教学循环体验评估完成

* [x] 模式切换体验评估完成

* [x] 每项可用性问题记录严重度与改进建议

### 项目改进报告

* [x] `docs/audit-report.md` 已产出

* [x] 报告按风险等级与实施优先级排序

* [x] 每项含问题描述、风险等级、解决方案、实施优先级

