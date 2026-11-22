/* Reviewed chat tool allow-list for OpenConnector apps.
 *
 * Each entry exposes one reviewed provider action to the model. The list
 * was originally generated from the OpenConnector catalog (121 providers,
 * 2026-09-09) by keeping only query-style actions (search/list/get/fetch/…)
 * and was hand-reviewed to exclude state-changing actions, with the sole
 * exception
 * of the bounded Jimeng AI 4.6 image-generation submit action below and its
 * matching result lookup. Bots that can only
 * send messages (dingtalk_bot, wecom_bot, feishu_custom_bot), mail-sending
 * (encharge) and model-calling actions (cohere chat/embed) are deliberately
 * absent: they are write oracles, not context tools.
 *
 * Registry rule: a tool is offered to the model only when the user has a
 * connected oc_<service> row (see toolCapabilityCatalog.ts). Execution re-validates
 * arguments Socrates-side and the OOMOL-hosted runtime enforces its own
 * provider JSON schema. */

import type { OpenConnectorChatTool } from './openConnectorChatToolCatalog.types.js';
import { OPEN_CONNECTOR_CHAT_TOOLS_PART_1 } from './openConnectorChatToolCatalog.part1.js';
import { OPEN_CONNECTOR_CHAT_TOOLS_PART_2 } from './openConnectorChatToolCatalog.part2.js';
import { OPEN_CONNECTOR_CHAT_TOOLS_PART_3 } from './openConnectorChatToolCatalog.part3.js';
import { OPEN_CONNECTOR_CHAT_TOOLS_PART_4 } from './openConnectorChatToolCatalog.part4.js';
import { OPEN_CONNECTOR_CHAT_TOOLS_PART_5 } from './openConnectorChatToolCatalog.part5.js';
import { OPEN_CONNECTOR_CHAT_TOOLS_PART_6 } from './openConnectorChatToolCatalog.part6.js';
import { OPEN_CONNECTOR_CHAT_TOOLS_PART_7 } from './openConnectorChatToolCatalog.part7.js';

export type { OpenConnectorChatTool } from './openConnectorChatToolCatalog.types.js';

export const OPEN_CONNECTOR_CHAT_TOOLS: OpenConnectorChatTool[] = [
  ...OPEN_CONNECTOR_CHAT_TOOLS_PART_1,
  ...OPEN_CONNECTOR_CHAT_TOOLS_PART_2,
  ...OPEN_CONNECTOR_CHAT_TOOLS_PART_3,
  ...OPEN_CONNECTOR_CHAT_TOOLS_PART_4,
  ...OPEN_CONNECTOR_CHAT_TOOLS_PART_5,
  ...OPEN_CONNECTOR_CHAT_TOOLS_PART_6,
  ...OPEN_CONNECTOR_CHAT_TOOLS_PART_7,
];

const byTool = new Map(OPEN_CONNECTOR_CHAT_TOOLS.map((item) => [item.tool, item]));

export function getOpenConnectorChatTool(toolName: unknown): OpenConnectorChatTool | null {
  return byTool.get(String(toolName || '')) || null;
}
