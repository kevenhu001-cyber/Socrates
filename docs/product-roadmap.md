# Socrates 产品开发路线图

> 三阶段产品开发路线图，重点补齐核心对话基线能力并强化差异化教育特性。
> 本文档以**真实代码现状**为基准编写，明确区分"已实现"与"待新建"，避免重复造轮子。

---

## 战略定位

**核心原则：差异化竞争而非功能追赶。**

不在通用 AI 助手赛道与 ChatGPT 等产品正面竞争，而是采用双线策略：

- **补齐基线（P0）**：满足用户对 AI 对话产品的基本期望，避免被视为"功能不完整"。
- **强化教育护城河（P1）**：重点投资竞品无法结构性复制的教育功能。

**结构性护城河功能**（竞品难以复制）：

- 知识图谱（知识边界可视化）
- 苏格拉底教学法（引导式提问，见 `chat/socraticDirectives.js`、`prompts/teacher-mode.md`）
- 错题本（`ui/mistakeBook.js`）
- 诊断评估（`chat/diagnosticGenerator.js`、`chat/diagnosticParser.js`）
- 扎实的工程底座：视觉理解（多模态附件）、文档解析（PDF/文本）、可视化渲染（`render/viz.js`）

产品定位一句话：**一个把"教得会"作为第一目标的 AI 学习伙伴**，而非又一个通用问答机器人。

---

## 基线核对（当前代码现状）

在动工前必须认清哪些能力**已经存在**，防止把已完成的功能当成待开发项。

### 已实现（位于 `frontend/src/main.js`）

| 能力 | 函数 | 位置 | 说明 |
| --- | --- | --- | --- |
| 编辑用户消息 | `editUserMessage` | L4498 | textarea 替换消息体，Cmd/Ctrl+Enter 或失焦提交，Esc 取消 |
| 回滚后续消息 | `rollbackMessagesAfter` | L4583 | 编辑后 splice 掉该轮之后的 state + DOM |
| 重生成回答 | `regenerateAssistantMessage` | L4614 | 定位上一条 user 消息，splice 掉 assistant 气泡后重新 `askChatTurn` |
| 会话分支 | `branchFromMessage` | L4641 | 复制到分支点的消息，新建会话（当前**无** `branchedFrom` 指针、无教学化框架） |
| 消息工具栏 | `buildMessageToolbar` | L4284 | user 角色：copy/edit/delete；assistant 角色：copy/share/regenerate/thumbs/branch |

上下文重建：`frontend/src/chat/history.js` 的 `extractHistory`（三级来源：内存 `state.messages.rawText` → localStorage 镜像 → 实时 DOM 兜底），已支持编辑/重生成后的历史重建，并做了 `<think>` 剥离、多模态附件重建、超长会话压缩。

**结论**：P0.1 的"编辑 + 重生成"核心链路**已经打通**，编辑按钮已出现在每条用户消息的工具栏中，且复用了 `history.js` 上下文重建能力。因此 P0.1 重定为**"审计 + 补缺"**，而非从零开发。

### 待新建 / 待改造

| 能力 | 现状 | 目标 |
| --- | --- | --- |
| 会话内查找（Ctrl-F） | 不存在。仅有全局 Cmd-K（`ui/cmdK.js`） | 新建当前会话内查找面板 |
| 力导向知识图谱 | 线性 `.kb-node` 列表（`ui/knowledgeDetail.js`） | 升级为力导向图 |
| Agent 分屏视图 | Agent 内联渲染于 `#msgList`（`chat/agentStream.js`） | 左右分屏：对话 + 工具 Tab |
| 国际化收尾 | `t()`/`tr()` 基建已在 `i18n.js`（约 1100 行字典） | 替换残余硬编码英文 |

---

## P0 阶段 — 核心对话能力补全

**目标**：达到市场基线标准。**周期**：2-3 周。

### P0.1 历史消息编辑与重生成（审计 + 补缺）

**现状**：核心链路已实现（见上表）。本阶段不重写，而是系统性验证边界并补缺。

审计清单：

- [ ] 编辑作用域确认：`edit` 仅在 **user** 消息（符合产品预期；assistant 消息编辑无教学意义，保持现状）。
- [ ] **带附件消息**编辑：编辑含图片/PDF/文本附件的 user 消息后，`extractHistory` 是否正确重建多模态 content parts（`history.js` L75-97）。
- [ ] **流式进行中编辑**：编辑时若上一条回复仍在流式，`editUserMessage` 已 abort `_activeChatCtl`/`_activeChatAbort`（L4557-4558），验证无竞态。
- [ ] **移动端**：长按唤起工具栏、textarea 键盘弹出与视口（对照 `ui/keyboard/index.ts`）。
- [ ] **前后端一致性**：本地 `rollbackMessagesAfter` 与 `PATCH /api/messages/<id>?regenerate=true&discardFollowing=true`（L4541-4548）在离线/失败时的表现，硬刷新后不应出现残留旧回复。
- [ ] **重生成**：`regenerateAssistantMessage` 对"多轮工具调用后"的 assistant 消息重生成是否正确定位上一条 user 消息。

产出：把发现的具体边界问题登记为独立待办（bug 票），不做大规模重写。

**商业价值**：满足用户对 AI 对话产品的基本期望，避免被视为功能不完整。

### P0.2 会话内查找（Ctrl-F 面板）—— 新增

**现状**：不存在。仅有全局搜索 Cmd-K（`ui/cmdK.js`，跨会话 Fuse.js + 服务端 `/api/search`）。

实现要点：

1. **复用 UI 框架**：借鉴 `cmdK.js` 的浮层结构、键盘导航（`onCmdKKey` 的 ArrowUp/Down/Enter/Escape）与选中态管理模式。
2. **作用域限定当前会话**：新建独立模块（如 `ui/findInSession.js`），**不污染**全局 Cmd-K 索引，仅在当前会话 `#msgList` 的 `.msg` 元素内做文本匹配。
3. **头部入口**：在聊天头部添加"查找"按钮；绑定 `Ctrl-F`（拦截浏览器默认查找）。
4. **高亮与导航**：命中文本包裹高亮 `<mark>`，支持上/下导航滚动到命中项，显示"第 N / 共 M 条"计数。
5. **退出清理**：关闭时移除所有高亮，恢复原始 DOM。

**预估工作量**：约 1 天。

**验收**：新增 e2e 规格 `frontend/e2e/find-in-session.spec.mjs`（参照 `cmd-k.spec.mjs`）。

---

## P1 阶段 — 差异化教育功能增强

**目标**：强化教育优势，建立竞争壁垒。**周期**：3-4 周。

### P1.1 对话分支（教育场景特化）

**现状**：`branchFromMessage`（L4641）已能从某条消息分叉出新会话，但**缺少** `branchedFrom` 指针与教学化框架。

扩展要点：

1. **`branchedFrom` 元数据**：新会话记录来源会话 ID + 分支点消息 ID，便于回溯与在侧栏展示"分支于 XX"。
2. **"换个思路再讲一遍"入口**：在 assistant 消息工具栏（`buildMessageToolbar` 的 assistant 分支）新增教学化分支动作，创建分支时向系统提示注入"请换一种解释角度/教学方法重新讲解"的指令（参照 `chat/socraticDirectives.js`、`chat/systemPrompts.js`）。
3. **多角度解释**：针对辅导场景，支持从同一知识点生成不同讲法（类比 / 逐步推导 / 举例），沉淀为教育差异化能力。

**教育价值**：把"分支"从通用功能升级为辅导专属的"多角度重讲"，竞品难以直接照搬。

### P1.2 知识图谱可视化升级

**现状**：线性 5 节点列表，每个 `.kb-node` 携带 `status`（internalized/fuzzy/blank）、`confidence_score`（1-5）、`questions`（提问数）（`ui/knowledgeDetail.js` `kbNodeHtml` L7-13）。数据源 `state.kbNodes`。

升级要点：

1. **力导向图**：将线性列表升级为力导向布局。
   - **节点颜色** = 掌握程度：internalized / fuzzy / blank，叠加 `confidence_score` 的深浅。
   - **节点大小** = 提问数量（`questions`）。
2. **交互**：点击节点等价于当前 `jumpToNode(idx)`（设置 `state.currentNode` 并 `askNextQuestion`）；保留详情面板（confidence dots / 笔记 / 历史）。
3. **数据零改造**：完全沿用 `state.kbNodes` 现有字段，无需后端改动。

**渲染方案（技术决策见下）**：轻量 SVG + 简易力导向布局，直接渲染于知识面板 DOM。

**壁垒价值**：把"知识边界可视化"做成 Socrates 独有的招牌功能。

### P1.3 Agent 分屏视图

**现状**：Agent 模式内联渲染于 `#msgList`（`chat/agentStream.js` `beginAgentTextStream`），工具卡片（`ui/toolCards.js`）与运行时（`chat/toolRuntime.js`）嵌在消息气泡内，**无独立分屏**。

改造要点：

1. **左右分屏布局**：左侧对话区域，右侧工具面板。
2. **右侧工具 Tab**：文件 / Shell / Web 三类 Tab，复用现有工具卡片渲染（`toolCards.js` `TOOL_META`：Read/Bash/web_search/code_interpreter/render_visualization 等）与 `toolRuntime.js` 的生命周期（`tool_use` → `tool_progress` → `tool_result`，含 `/api/executions/<id>/stream` 执行流）。
3. **体验对齐**：对齐 Claude / Cursor 的分屏模式，让 Agent 的多工具执行更易读。
4. **兼容降级**：窄屏 / 移动端回退为堆叠或抽屉式，避免分屏挤压对话。

**验收**：扩展 `frontend/e2e/tool-cards.spec.mjs` 覆盖分屏布局。

---

## P2 阶段 — 产品打磨与规模化（持续进行）

### P2.1 微交互与无障碍优化

改动集中于 `frontend/src/styles.css`：

- 消息入场动画（尊重 `prefers-reduced-motion`，动画可关）。
- 全局 `:focus-visible` 样式（键盘可达性）。
- `prefers-reduced-motion` 媒体查询：降级所有非必要动画。
- 触摸目标最小 44px（工具栏按钮、导航项）。
- 执行 **U-L1 ~ U-L5** 无障碍审计项（对照 `docs/audit-report.md`）。

### P2.2 国际化收尾

**现状**：`t()`/`tr()` 基建已在 `frontend/src/i18n.js`（`en`/`zh` 字典），部分模块仍硬编码英文。

- 替换 **U-M6** 硬编码英文为 `t()`，典型示例（`ui/knowledgeDetail.js`）：
  - "Confidence"（L43）、"System note"（L49）、"Your note"（L52）、"→ go"（L39）、"No status changes yet." 等。
- 同步补齐 `en` / `zh` 两侧字典条目，确保切换语言无残留英文。

### P2.3 代码沙箱功能（可选，延后）

- 评估 **Pyodide** 客户端执行方案（浏览器内 Python）。
- 权衡投入产出比：与现有服务端 `code_interpreter`（`/api/executions/<id>/stream`）的关系，避免重复。
- 结论：低成本试水，非必需，可延后。

---

## 技术决策

### 知识图谱渲染方案

**推荐**：轻量 SVG + 简易力导向布局，直接渲染于知识面板 DOM。

**不采用** `render/viz.js` 沙箱 iframe 方案，原因：

- `viz.js` 通过 `sandbox="allow-scripts"` 的 iframe 隔离**用户代码**，适合渲染 LLM 生成的 HTML/SVG/Mermaid/Canvas。
- 但知识图谱是**原生应用 UI**，需要与主应用双向交互（点击节点跳转 `jumpToNode`、读取 `state.kbNodes`、共享主题 token），iframe 的跨源隔离反而成为障碍。
- 数据源沿用 `state.kbNodes`（`status` / `confidence_score` / `questions`），无需后端改动。

### 会话内查找（Ctrl-F）

- 新建独立模块，**不复用**全局 Cmd-K 的索引（避免污染跨会话搜索）。
- 仅在当前会话 `#msgList` DOM 内做高亮与导航，退出时完整清理。

---

## 里程碑与验收

| 阶段 | 交付物 | 预估工作量 | 验收标准（e2e / 现有规格） |
| --- | --- | --- | --- |
| P0.1 | 编辑/重生成边界审计报告 + bug 票 | 2-3 天 | 手动回归 + `frontend/e2e/chat-send.spec.mjs` |
| P0.2 | 会话内 Ctrl-F 查找 | 约 1 天 | 新增 `find-in-session.spec.mjs`（参照 `cmd-k.spec.mjs`） |
| P1.1 | 教育化分支（`branchedFrom` + 多角度重讲） | 3-5 天 | 手动辅导场景验证 |
| P1.2 | 力导向知识图谱 | 5-7 天 | 新增 / 扩展 `native-visualization.spec.mjs` |
| P1.3 | Agent 分屏视图 | 5-7 天 | 扩展 `tool-cards.spec.mjs` |
| P2.1 | 微交互 + 无障碍（U-L1~L5） | 持续 | 无障碍审计通过 |
| P2.2 | 国际化收尾（U-M6） | 持续 | 语言切换无残留英文 |
| P2.3 | Pyodide 沙箱（可选） | 待评估 | 视决策 |

---

## 执行顺序建议

1. **先 P0.2（Ctrl-F，约 1 天）**：见效快、纯新增、无既有代码依赖风险。
2. **并行 P0.1 审计**：登记边界问题，按严重度排期修复。
3. **P1.2 知识图谱优先于 P1.1/P1.3**：护城河价值最高，数据零改造，投入产出比最优。
4. **P1.3 分屏** 依赖较重，放在知识图谱之后。
5. **P2 持续推进**：每个功能上线时同步补齐无障碍与国际化，避免债务堆积。
