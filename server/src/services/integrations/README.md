# `services/integrations/` — Third-Party SaaS & Connector Services

本目录收敛 Socrates 对接的所有外部 SaaS、学术源与目录应用集成（依据 [ADR 0010](../../../../docs/adr/0010-services-subgroup-rename.md) 与 [ADR 0014](../../../../docs/adr/0014-open-connector-removal-cloud-only.md) 治理规范）：

## 成员清单与职责

1. **学术与知识管理**：
   - `arxivConnector.ts`：arXiv 论文检索与元数据解析。
   - `zoteroConnector.ts`：Zotero 文献库授权与条目读取。
2. **代码仓库与企业协同**：
   - `githubConnector.ts`：GitHub OAuth 与代码库列表。
   - `giteeConnector.ts`：Gitee OAuth 与代码库/Issue 读取。
   - `feishuConnector.ts`：飞书/Lark OAuth 与在线文档集成。
   - `notionConnector.ts`：Notion OAuth 与页面检索。
3. **平台与云目录连接**：
   - `oomolProjectConnector.ts`：OOMOL Project Connector 网关适配器与静态目录定义。
   - `openConnectorCatalog.ts`：OpenConnector 目录映射与应用状态呈现。
   - `openConnectorChatTools.ts`：面向 Agent / LLM 的只读工具清单与执行器。
   - `openConnectorAppInventory.ts`：应用中英文名称与就绪状态映射。
   - `openConnectorCloudAuth.generated.ts`：OOMOL 云端 Provider 认证字段快照（手控冻结）。
4. **工具封装与令牌体系**：
   - `connectorTools.ts`：为 LLM 提供的统一连接器工具定义与分发。
   - `projectConnectorTools.ts`：为 LLM 提供的 ProjectConnector 工具定义。
   - `oauthTokens.ts`：RFC 6749 / 自描述 OAuth2 访问令牌（`at_*` / `rt_*`）生命周期管理。

## 导入规范

新业务逻辑推荐直接通过 `import ... from '../services/integrations/<name>.js'` 引用。`services/` 根目录保留了向后兼容的转发导出层。
