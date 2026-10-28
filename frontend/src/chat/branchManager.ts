/* chat/branchManager.ts — In-place message branching (ChatGPT-style < 1 / 2 > navigation).
 *
 * When a user edits a message or regenerates an assistant response, a new branch
 * is created at that turn instead of destroying previous turns. Users can navigate
 * across alternative branches using the < 1 / 2 > branch switcher in the message toolbar.
 */

import { stateStore } from '../state/store.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { saveCurrentSession } from '../session/persistence.ts';
import type { LegacyChatMessage } from '../react/types/domain.ts';

export interface MessageBranchVariant {
  clientId: string;
  id?: string;
  role?: string;
  rawText?: string;
  html?: string | null;
  type?: string | null;
  attachments?: unknown[];
  toolCalls?: unknown[];
  turnRuntime?: unknown;
  reasoningContent?: string | null;
  followingMessages?: LegacyChatMessage[];
}

export interface MessageBranchInfo {
  currentIndex: number;
  variants: MessageBranchVariant[];
}

interface BranchSwitchContext {
  index: number;
  messages: LegacyChatMessage[];
  currentMessage: LegacyChatMessage;
  variants: MessageBranchVariant[];
  currentIndex: number;
}

function getBranchSwitchContext(messageId: string, targetIndex: number): BranchSwitchContext | null {
  const index = findMessageIndex(messageId);
  if (index < 0) return null;
  const messages = stateStore.read('messages') as LegacyChatMessage[];
  const currentMessage = messages[index];
  if (!currentMessage.branchInfo || !Array.isArray(currentMessage.branchInfo.variants)) return null;

  const { variants, currentIndex } = currentMessage.branchInfo;
  if (targetIndex < 0 || targetIndex >= variants.length || targetIndex === currentIndex) return null;
  return { index, messages, currentMessage, variants, currentIndex };
}

function stashActiveBranchVariant(
  variants: MessageBranchVariant[],
  currentIndex: number,
  currentMessage: LegacyChatMessage,
  messages: LegacyChatMessage[],
  index: number,
): void {
  variants[currentIndex] = {
    ...variants[currentIndex],
    rawText: currentMessage.rawText,
    html: currentMessage.html,
    attachments: currentMessage.attachments ? currentMessage.attachments.slice() : [],
    toolCalls: currentMessage.toolCalls ? (currentMessage.toolCalls as unknown[]).slice() : [],
    turnRuntime: currentMessage.turnRuntime,
    reasoningContent: currentMessage.reasoningContent,
    followingMessages: messages.slice(index + 1),
  };
}

function createSwitchedMessage(
  currentMessage: LegacyChatMessage,
  target: MessageBranchVariant,
  branchInfo: MessageBranchInfo,
): LegacyChatMessage {
  return {
    ...currentMessage,
    clientId: target.clientId || currentMessage.clientId,
    id: target.id || currentMessage.id,
    role: target.role || currentMessage.role,
    rawText: target.rawText || '',
    html: target.html || null,
    attachments: (target.attachments as LegacyChatMessage['attachments']) || [],
    toolCalls: (target.toolCalls as LegacyChatMessage['toolCalls']) || [],
    turnRuntime: target.turnRuntime as LegacyChatMessage['turnRuntime'],
    reasoningContent: target.reasoningContent || null,
    branchInfo,
  };
}

function replaceBranchSubtree(
  messages: LegacyChatMessage[],
  index: number,
  switchedMessage: LegacyChatMessage,
  target: MessageBranchVariant,
): LegacyChatMessage[] {
  const prefix = messages.slice(0, index);
  const suffix = Array.isArray(target.followingMessages) ? target.followingMessages : [];
  return [...prefix, switchedMessage, ...suffix];
}

export function findMessageIndex(messageId: string): number {
  const messages = stateStore.read('messages');
  if (!Array.isArray(messages)) return -1;
  return messages.findIndex((m: LegacyChatMessage) => (m.clientId === messageId || m.id === messageId));
}

/** Prepare branch info when starting a new user edit branch */
export function prepareUserEditBranch(
  messageId: string,
  newText: string,
): { branchInfo: MessageBranchInfo; entry: LegacyChatMessage } | null {
  const idx = findMessageIndex(messageId);
  if (idx < 0) return null;
  const messages = stateStore.read('messages') as LegacyChatMessage[];
  const entry = messages[idx];
  const following = messages.slice(idx + 1);

  let variants: MessageBranchVariant[] = [];
  if (entry.branchInfo && Array.isArray(entry.branchInfo.variants)) {
    variants = entry.branchInfo.variants.map((v) => ({ ...v }));
    const currIdx = entry.branchInfo.currentIndex;
    if (variants[currIdx]) {
      variants[currIdx] = {
        ...variants[currIdx],
        rawText: entry.rawText,
        html: entry.html,
        attachments: entry.attachments ? entry.attachments.slice() : [],
        followingMessages: following,
      };
    }
  } else {
    variants.push({
      clientId: entry.clientId || entry.id || `msg-${Date.now()}-0`,
      id: entry.id,
      role: entry.role || 'user',
      rawText: entry.rawText,
      html: entry.html,
      attachments: entry.attachments ? entry.attachments.slice() : [],
      followingMessages: following,
    });
  }

  const newVariant: MessageBranchVariant = {
    clientId: `msg-edit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'user',
    rawText: newText,
    html: null,
    attachments: entry.attachments ? entry.attachments.slice() : [],
    followingMessages: [],
  };
  const nextIndex = variants.length;
  variants.push(newVariant);

  const branchInfo: MessageBranchInfo = {
    currentIndex: nextIndex,
    variants,
  };
  return { branchInfo, entry };
}

/** Prepare branch info when starting an assistant regenerate branch */
export function prepareAssistantRegenerateBranch(
  messageId: string,
): { branchInfo: MessageBranchInfo; assistantEntry: LegacyChatMessage; userEntry: LegacyChatMessage } | null {
  const assistantIdx = findMessageIndex(messageId);
  if (assistantIdx < 0) return null;
  const messages = stateStore.read('messages') as LegacyChatMessage[];
  const currentAssistant = messages[assistantIdx];

  let userIdx = assistantIdx - 1;
  while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx--;
  if (userIdx < 0) return null;
  const userEntry = messages[userIdx];
  const following = messages.slice(assistantIdx + 1);

  let variants: MessageBranchVariant[] = [];
  if (currentAssistant.branchInfo && Array.isArray(currentAssistant.branchInfo.variants)) {
    variants = currentAssistant.branchInfo.variants.map((v) => ({ ...v }));
    const currIdx = currentAssistant.branchInfo.currentIndex;
    if (variants[currIdx]) {
      variants[currIdx] = {
        ...variants[currIdx],
        rawText: currentAssistant.rawText,
        html: currentAssistant.html,
        toolCalls: currentAssistant.toolCalls ? (currentAssistant.toolCalls as unknown[]).slice() : [],
        turnRuntime: currentAssistant.turnRuntime,
        reasoningContent: currentAssistant.reasoningContent,
        followingMessages: following,
      };
    }
  } else {
    variants.push({
      clientId: currentAssistant.clientId || currentAssistant.id || `msg-${Date.now()}-0`,
      id: currentAssistant.id,
      role: 'assistant',
      rawText: currentAssistant.rawText,
      html: currentAssistant.html,
      toolCalls: currentAssistant.toolCalls ? (currentAssistant.toolCalls as unknown[]).slice() : [],
      turnRuntime: currentAssistant.turnRuntime,
      reasoningContent: currentAssistant.reasoningContent,
      followingMessages: following,
    });
  }

  const nextIndex = variants.length;
  const newVariant: MessageBranchVariant = {
    clientId: `msg-regen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'assistant',
    rawText: '',
    html: null,
    followingMessages: [],
  };
  variants.push(newVariant);

  const branchInfo: MessageBranchInfo = {
    currentIndex: nextIndex,
    variants,
  };
  return { branchInfo, assistantEntry: currentAssistant, userEntry };
}

/** Switch active branch version of a message */
export function switchMessageBranch(messageId: string, targetIndex: number): boolean {
  const context = getBranchSwitchContext(messageId, targetIndex);
  if (!context) return false;

  const { index, messages, currentMessage, variants, currentIndex } = context;
  const currentVariants = variants.map((variant) => ({ ...variant }));
  stashActiveBranchVariant(currentVariants, currentIndex, currentMessage, messages, index);

  const target = currentVariants[targetIndex];
  const updatedBranchInfo: MessageBranchInfo = {
    currentIndex: targetIndex,
    variants: currentVariants,
  };
  const switchedMessage = createSwitchedMessage(currentMessage, target, updatedBranchInfo);
  const nextMessages = replaceBranchSubtree(messages, index, switchedMessage, target);

  stateStore.dispatch({ type: 'session/replace-messages', payload: nextMessages });
  publishReactChatRuntime({ type: 'state-synced', reason: 'message-branch-switched' });
  try { saveCurrentSession(); } catch (error) { reportSwallow(error, 'branchManager.switchMessageBranch.save'); }
  return true;
}
