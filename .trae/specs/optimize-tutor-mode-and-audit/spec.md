# Tutor 模式优化与项目审计 Spec

## Why

当前 Socrates 项目的 Tutor 模式存在多处与设计文档（苏格拉底引擎 v3.0）背离的功能缺陷与体验问题：用户完成答题后缺乏系统性、结构化的教学引导；教学计划完全编码在一段 prompt 字符串中，没有客户端状态机，导致教学过程缺乏章法；提问模式与"授课+习题"核心教学模式存在渲染异常（解析器静默丢弃畸形块、默认模式不一致、Tutor UI 未国际化）；多项设计文档规划的功能（知识边界文件系统、错题本一等公民实体、教学计划、练习生成、SRS 复习队列等）未实际实现。需要在完成 Tutor 模式优化后，进一步对整个项目进行安全、性能、可用性审计并形成改进报告。

## What Changes

### 第一部分：Tutor 模式优化

- **重构教学引导流程**：引入客户端教学阶段状态机（motivate → define → develop → illustrate → exercise → check），替代当前"让 LLM 重读历史推断所处阶段"的脆弱方案；在 `state.js` 中新增 `teachingStage`、`currentExampleIdx`、`practiceAttempts` 等字段；`buildFollowUpMessages` 依据显式阶段推进而非依赖 LLM 自推断。
- **制定标准化教学计划模板**：将教学计划从纯 prompt 字符串升级为结构化数据模板（JSON），包含子主题列表、每个子主题的目标/示例数/练习数/考察类型；新增 `teachingPlan` 状态字段与渲染视图，让用户可见当前教学进度。
- **修复模式渲染问题**：
  - 修复 `appMode` 默认值不一致问题（line 9959 默认 `"chat"` 与注释/会话恢复默认 `"tutor"` 矛盾）。
  - 修复 `<quiz>`/`<example>`/`<practice>`/`<mistake>` 块解析失败时静默丢弃、留下空 slot 的问题，改为回退渲染原始文本并给出可见提示。
  - 为 Tutor 模式 UI 文案补充 i18n（诊断加载文案、Quick check、Problem、Solution、Hint、Explain/Skip/Retry 等）。
- **完成未实现功能的开发与集成**：
  - 后端加载 `prompts/teacher-mode.md` 作为 Tutor 模式系统提示词来源（当前后端从不读取该文件）。
  - 新增错题本一等公民支持：`mistakes` 表 + CRUD 路由 `/api/mistakes`，支持跨会话查询、标记攻克、按节点/时间筛选。
  - 新增知识边界文件查询路由 `/api/knowledge-boundary`，支持跨会话聚合查询节点状态。
  - 修复 OpenAPI 中 `mode` 枚举与后端 zod 不一致问题（OpenAPI 含 `agent`，后端拒绝）。
  - 实现 classroom dashboard 的 `hotspotMistakes` 与 `topicCompletion` 聚合（当前返回硬编码空数组）。

### 第二部分：项目审计

- **安全漏洞评估**：检查用户数据处理、权限控制、输入验证机制（SQL 注入、XSS、CSRF、鉴权绕过、敏感信息泄露）。
- **性能测试与分析**：识别并优化性能瓶颈（前端 550KB main.js、JSONB 全表扫描、缺索引、流式渲染阻塞等）。
- **可用性与交互体验评估**：对所有功能模块进行可用性评估，提出具体优化建议。
- **形成完整项目改进报告**：包含问题描述、风险等级、解决方案及实施优先级。

## Impact

- Affected specs: Tutor 模式核心教学流程、知识边界文件、错题本、教学计划、i18n、安全与性能基线
- Affected code:
  - 前端：`frontend/src/main.js`（教学状态机、渲染修复、i18n）、`frontend/src/state.js`（新增教学阶段状态）、`frontend/src/i18n.js`（Tutor 文案）、`frontend/src/styles.css`（教学计划视图样式）
  - 后端：`server/src/routes/sessions.js`（mode 枚举修复）、`server/src/routes/chat.js`（加载 teacher-mode 提示词）、`server/src/routes/mistakes.js`（新增）、`server/src/routes/knowledgeBoundary.js`（新增）、`server/src/routes/classroom.js`（实现聚合）、`server/src/db/schema.js`（新增 mistakes 表）、`server/src/app.js`（挂载新路由）
  - 审计：全项目安全/性能/可用性扫描，产出 `docs/audit-report.md`

## ADDED Requirements

### Requirement: 客户端教学阶段状态机

系统 SHALL 在前端维护显式的教学阶段状态机，跟踪当前子主题所处的教学阶段（motivate/define/develop/illustrate/exercise/check），不再依赖 LLM 重读聊天历史推断阶段。

#### Scenario: 用户回答后推进教学阶段
- **WHEN** 用户在 `exercise` 阶段提交练习且判定正确
- **THEN** 系统将阶段推进至 `check`，并在下一轮请求中向 LLM 显式传递当前阶段，LLM 据此生成下一阶段内容而非重新推断

#### Scenario: 用户练习未通过
- **WHEN** 用户在 `exercise` 阶段提交练习且判定错误
- **THEN** 系统保持阶段为 `exercise`，递增 `practiceAttempts`，向 LLM 传递"练习未通过，给出针对性讲解与替换题"的指令

### Requirement: 标准化教学计划模板

系统 SHALL 为每个 Tutor 会话生成结构化的教学计划（JSON），包含子主题列表、每个子主题的目标、示例数量、练习数量与考察类型，并在 UI 中以可见视图呈现当前进度。

#### Scenario: 诊断完成后生成教学计划
- **WHEN** 用户完成诊断阶段
- **THEN** 系统基于诊断结果（kbNodes 状态）生成教学计划，按前置依赖排序子主题，存入 `state.teachingPlan`，并在侧边栏 Knowledge 视图中展示计划与当前进度

### Requirement: 块解析容错与可见反馈

系统 SHALL 在 `<quiz>`/`<example>`/`<practice>`/`<mistake>` 块解析失败时回退渲染原始文本，并向用户给出可见提示，而非静默丢弃留下空 slot。

#### Scenario: LLM 输出畸形 quiz 块
- **WHEN** LLM 输出的 `<quiz>` 块缺少 `<correct>` 标签或结构不完整
- **THEN** 系统在原位置渲染该块的原始文本内容，并附加"该内容格式异常，已原样展示"提示，不产生空 div

### Requirement: 错题本一等公民实体

系统 SHALL 提供错题本的独立数据表与 CRUD 路由，支持跨会话查询、标记攻克、按知识节点与时间筛选，不再仅作为 session 上的 JSONB blob。

#### Scenario: 跨会话查询未攻克错题
- **WHEN** 用户请求 `GET /api/mistakes?resolved=false&nodeId=xxx`
- **THEN** 系统返回该用户所有会话中该节点下未攻克的错题列表，无需逐会话扫描 JSONB

### Requirement: 知识边界文件跨会话查询

系统 SHALL 提供知识边界文件的查询路由，支持跨会话聚合查询节点状态分布。

#### Scenario: 查询用户全部模糊节点
- **WHEN** 用户请求 `GET /api/knowledge-boundary?status=fuzzy`
- **THEN** 系统返回该用户所有会话中状态为 fuzzy 的节点聚合列表

### Requirement: 后端加载 Tutor 系统提示词

系统 SHALL 在后端 Tutor 模式请求中加载 `prompts/teacher-mode.md` 作为系统提示词来源，而非完全由前端拼接 prompt。

#### Scenario: Tutor 模式请求注入提示词
- **WHEN** 前端发起 Tutor 模式的 `/api/chat/stream` 请求
- **THEN** 后端识别会话 mode 为 tutor，读取 `prompts/teacher-mode.md` 内容并作为系统提示词注入（前端可补充动态上下文），保证提示词可服务端统一治理

### Requirement: 项目审计报告

系统 SHALL 产出完整的项目改进报告，覆盖安全漏洞、性能瓶颈、可用性问题，每项包含问题描述、风险等级、解决方案、实施优先级。

#### Scenario: 审计报告交付
- **WHEN** 审计工作完成
- **THEN** 在 `docs/audit-report.md` 产出结构化报告，按风险等级（高/中/低）与优先级排序，每项含可执行的解决方案

## MODIFIED Requirements

### Requirement: Tutor 模式默认值

系统 SHALL 将 Tutor 模式作为新会话的默认模式（与设计文档"以提问为核心"哲学一致），并消除 `appMode` 默认值与会话恢复默认值之间的矛盾。

**变更说明**：当前 `main.js:9959` 默认 `"chat"`，但 `main.js:1290` 会话恢复默认 `"tutor"`，且注释声称默认应为 tutor。统一为 tutor 默认。

### Requirement: mode 枚举一致性

系统 SHALL 保持 OpenAPI 规范与后端 zod 校验的 mode 枚举一致。

**变更说明**：当前 OpenAPI 含 `agent`，后端 zod 仅 `['tutor','chat']`。统一为后端接受 `agent` 或从 OpenAPI 移除 `agent`（视实现选择）。

### Requirement: classroom dashboard 聚合

系统 SHALL 在 classroom dashboard 路由返回真实的 `hotspotMistakes` 与 `topicCompletion` 聚合数据，而非硬编码空数组。

**变更说明**：当前 `classroom.js:82` 返回 `hotspotMistakes: [], topicCompletion: []`。改为基于班级学生的错题与节点状态聚合计算。

## REMOVED Requirements

（本次变更不移除任何现有需求，仅修复与补全。）
