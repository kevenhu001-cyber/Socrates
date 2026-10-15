# `services/tools/` — Agent & Tool Runtime Core

本目录收敛 Socrates 的智能体运行态、工具注册表、工具调度与调用安全策略（依据 [ADR 0010](../../../../docs/adr/0010-services-subgroup-rename.md) PR-0010.4 治理规范）：

## 成员清单与职责

1. **工具注册与发现**：
   - `toolRegistry.ts`：定义面向 LLM 的统一工具集（Web 搜索、网络抓取、附件读取、记忆存储、图表可视化、连接器工具、智能体工具等）及其参数自校验声明。
2. **工具调用安全与参数自愈**：
   - `toolCallSafety.ts`：工具参数大小限制、参数安全清洗、结构校验与防御性修复。
   - `toolErrorFeedback.ts`：在工具参数校验失败时，自动提取 JSON Schema 结构与示例，生成结构化错误反馈提示，引导模型自纠错。
   - `toolTurnPolicy.ts`：跨轮次工具调用状态、参数哈希与重复执行拦截策略。
3. **调度与并发控制**：
   - `toolDispatch.ts`：多工具调用调度器，负责区分可并发执行的工具与须串行执行的注册敏感工具。
4. **工作区智能体运行态**：
   - `agentRuntime.ts`：持久化 Agent 任务生命周期（Run/Event/Approval/Workspace 状态机与恢复逻辑）。
   - `agentStepProjection.ts`：将智能体内部执行步骤映射为结构化、可阅读的统一事件流。
   - `piAgent.ts`：底层智能体子进程调度与事件流封装。

## 导入规范

新业务逻辑推荐直接通过 `import ... from '../services/tools/<name>.js'` 引用。`services/` 根目录保留了向后兼容的转发导出层。
