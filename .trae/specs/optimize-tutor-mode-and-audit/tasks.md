# Tasks

## 第一部分：Tutor 模式优化

- [x] Task 1: 修复模式默认值与渲染容错
  - [x] SubTask 1.1: 统一 `appMode` 默认值为 `"tutor"`（修改 `frontend/src/main.js:9959`，与注释及会话恢复逻辑一致）
  - [x] SubTask 1.2: 修复 `<quiz>`/`<example>`/`<practice>`/`<mistake>` 块解析失败时的静默丢弃问题，改为回退渲染原始文本并给出可见提示（`renderAssistantHTML` 及 `parseQuizInner`/`parseExampleInner`/`parsePracticeInner`）
  - [x] SubTask 1.3: 为 Tutor 模式 UI 文案补充 i18n（诊断加载文案、Quick check、Problem、Solution、Hint、Explain/Skip/Retry 等），在 `frontend/src/i18n.js` 新增 `tutor.*` 命名空间并在 main.js 中替换硬编码英文
  - [x] SubTask 1.4: 修复 OpenAPI 与后端 zod 的 mode 枚举不一致（统一 `['tutor','chat']` 或纳入 `agent`）

- [x] Task 2: 引入客户端教学阶段状态机
  - [x] SubTask 2.1: 在 `frontend/src/state.js` 的 `session` 命名空间新增 `teachingStage`（motivate/define/develop/illustrate/exercise/check）、`currentExampleIdx`、`practiceAttempts`、`teachingPlan` 字段
  - [x] SubTask 2.2: 重构 `buildFollowUpMessages`（`main.js:11927`）与 `buildSocraticMessages`（`main.js:11848`），依据显式 `teachingStage` 推进，向 LLM 传递当前阶段指令而非让其自推断
  - [x] SubTask 2.3: 在 `handleQuizPick`（`main.js:5767`）与 `submitChatMessage`（`main.js:3254`）中根据答题结果更新 `teachingStage` 与 `practiceAttempts`
  - [x] SubTask 2.4: 在会话保存/恢复时持久化 `teachingStage` 等新字段（`sessions.js` payload 与 schema 已支持 passthrough/JSONB，确认前端 saveCurrentSession 传递）

- [x] Task 3: 制定标准化教学计划模板
  - [x] SubTask 3.1: 定义教学计划 JSON 结构（子主题列表、目标、示例数、练习数、考察类型、前置依赖），在 `state.js` 中定型
  - [x] SubTask 3.2: 在 `finishDiagnostic`（`main.js:2496`）完成后基于 kbNodes 状态生成教学计划，按前置依赖排序
  - [x] SubTask 3.3: 在侧边栏 Knowledge 视图中渲染教学计划与当前进度（当前节点、已完成节点、阶段标识）
  - [x] SubTask 3.4: 在 `styles.css` 中为教学计划视图补充样式

- [x] Task 4: 后端加载 Tutor 系统提示词
  - [x] SubTask 4.1: 在 `server/src/routes/chat.js` 中识别会话 mode（通过请求体或会话查询），当 mode 为 tutor 时读取 `prompts/teacher-mode.md` 内容作为系统提示词基础
  - [x] SubTask 4.2: 允许前端传递动态上下文（topic/level/stage）与后端基础提示词组合，避免重复拼接
  - [x] SubTask 4.3: 为提示词文件加载增加缓存与文件变更检测，避免每次请求读盘

- [x] Task 5: 错题本一等公民实体
  - [x] SubTask 5.1: 在 `server/src/db/schema.js` 新增 `mistakes` 表（id, userId, sessionId, questionId, nodeName, questionContent, userAnswer, correctAnswer, source, isResolved, resolvedAt, collectedAt）
  - [x] SubTask 5.2: 生成 drizzle 迁移 SQL
  - [x] SubTask 5.3: 新增 `server/src/routes/mistakes.js`，提供 `GET /api/mistakes`（支持 resolved/nodeId 筛选）、`POST /api/mistakes`、`PATCH /api/mistakes/:id`（标记攻克）、`DELETE /api/mistakes/:id`
  - [x] SubTask 5.4: 在 `server/src/app.js` 挂载 mistakes 路由
  - [x] SubTask 5.5: 前端 `handleQuizPick`/`renderAssistantHTML` 中 `<mistake>` 块触发时调用 `/api/mistakes` 持久化，同时保留 session.mistakes 兼容
  - [x] SubTask 5.6: 实现 OpenAPI 中 `POST /api/mistakes/{mistakeId}/share` 或从 OpenAPI 移除该未实现端点

- [x] Task 6: 知识边界文件跨会话查询
  - [x] SubTask 6.1: 新增 `server/src/routes/knowledgeBoundary.js`，提供 `GET /api/knowledge-boundary`（支持 status 筛选），从 sessions.kbNodes 聚合查询
  - [x] SubTask 6.2: 为 sessions.kbNodes JSONB 查询增加 GIN 索引迁移
  - [x] SubTask 6.3: 在 `server/src/app.js` 挂载 knowledgeBoundary 路由
  - [x] SubTask 6.4: 前端 Knowledge 视图支持展示跨会话聚合的节点状态

- [x] Task 7: classroom dashboard 聚合实现
  - [x] SubTask 7.1: 在 `server/src/routes/classroom.js` 中基于班级学生的 sessions.mistakes 与 kbNodes 计算 `hotspotMistakes`（错题频次 Top N 节点）与 `topicCompletion`（各节点已内化比例）
  - [x] SubTask 7.2: 补全 `StudentSummary` 返回字段（progressPercent、streakDays、mistakeCount、lastActiveAt）

## 第二部分：项目审计

- [x] Task 8: 安全漏洞评估
  - [x] SubTask 8.1: 审计用户数据处理（session token、cookie、API key 明文存储、PII 暴露）
  - [x] SubTask 8.2: 审计权限控制（鉴权中间件覆盖、越权访问、IDOR）
  - [x] SubTask 8.3: 审计输入验证（zod 覆盖率、SQL 注入、XSS、SSRF、路径穿越）
  - [x] SubTask 8.4: 审计 CSRF 防护与 CORS 配置
  - [x] SubTask 8.5: 记录每项漏洞的风险等级与解决方案

- [x] Task 9: 性能测试与分析
  - [x] SubTask 9.1: 分析前端 550KB main.js 的拆分与懒加载机会
  - [x] SubTask 9.2: 审计数据库查询（N+1、JSONB 全表扫描、缺失索引）
  - [x] SubTask 9.3: 审计流式渲染阻塞（formatMsg、widget 挂载时机）
  - [x] SubTask 9.4: 审计 rate limit 与缓存策略
  - [x] SubTask 9.5: 记录每项瓶颈的影响与优化方案

- [x] Task 10: 可用性与交互体验评估
  - [x] SubTask 10.1: 评估 Tutor 模式发现性（模式切换入口隐藏在 Extensions 菜单）
  - [x] SubTask 10.2: 评估诊断阶段体验（加载文案、错误恢复、超时处理）
  - [x] SubTask 10.3: 评估教学循环体验（阶段反馈、卡住处理、进度感知）
  - [x] SubTask 10.4: 评估 chat 模式与 tutor 模式切换体验
  - [x] SubTask 10.5: 记录每项可用性问题的严重度与改进建议

- [x] Task 11: 形成完整项目改进报告
  - [x] SubTask 11.1: 汇总安全、性能、可用性审计结果至 `docs/audit-report.md`
  - [x] SubTask 11.2: 按风险等级（高/中/低）与实施优先级排序
  - [x] SubTask 11.3: 每项含问题描述、风险等级、解决方案、实施优先级

# Task Dependencies

- Task 2 依赖 Task 1（状态机需在渲染容错修复后集成）
- Task 3 依赖 Task 2（教学计划需配合阶段状态机）
- Task 5 依赖 Task 1（错题本前端触发需在渲染容错修复后稳定）
- Task 7 依赖 Task 5、Task 6（classroom 聚合依赖 mistakes 表与 kbNodes 查询）
- Task 8-11（审计）依赖 Task 1-7（审计在优化完成后进行，以审计最终状态）
- Task 11 依赖 Task 8、9、10
