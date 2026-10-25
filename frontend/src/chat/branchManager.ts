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
  const idx = findMessageIndex(messageId);
  if (idx < 0) return false;
  const messages = stateStore.read('messages') as LegacyChatMessage[];
  const currentMsg = messages[idx];
  if (!currentMsg.branchInfo || !Array.isArray(currentMsg.branchInfo.variants)) return false;

  const { variants, currentIndex } = currentMsg.branchInfo;
  if (targetIndex < 0 || targetIndex >= variants.length || targetIndex === currentIndex) return false;

  const currentVariants = variants.map((v) => ({ ...v }));
  // Stash current active state into currentVariants[currentIndex]
  currentVariants[currentIndex] = {
    ...currentVariants[currentIndex],
    rawText: currentMsg.rawText,
    html: currentMsg.html,
    attachments: currentMsg.attachments ? currentMsg.attachments.slice() : [],
    toolCalls: currentMsg.toolCalls ? (currentMsg.toolCalls as unknown[]).slice() : [],
    turnRuntime: currentMsg.turnRuntime,
    reasoningContent: currentMsg.reasoningContent,
    followingMessages: messages.slice(idx + 1),
  };

  const target = currentVariants[targetIndex];
  const updatedBranchInfo: MessageBranchInfo = {
    currentIndex: targetIndex,
    variants: currentVariants,
  };

  const switchedMsg: LegacyChatMessage = {
    ...currentMsg,
    clientId: target.clientId || currentMsg.clientId,
    id: target.id || currentMsg.id,
    role: target.role || currentMsg.role,
    rawText: target.rawText || '',
    html: target.html || null,
    attachments: target.attachments || [],
    toolCalls: (target.toolCalls as LegacyChatMessage['toolCalls']) || [],
    turnRuntime: target.turnRuntime as LegacyChatMessage['turnRuntime'],
    reasoningContent: target.reasoningContent || null,
    branchInfo: updatedBranchInfo,
  };

  const prefix = messages.slice(0, idx);
  const suffix = Array.isArray(target.followingMessages) ? target.followingMessages : [];
  const nextMessages = [...prefix, switchedMsg, ...suffix];

  stateStore.dispatch({ type: 'session/replace-messages', payload: nextMessages });
  publishReactChatRuntime({ type: 'state-synced', reason: 'message-branch-switched' });
  try { saveCurrentSession(); } catch (error) { reportSwallow(error, 'branchManager.switchMessageBranch.save'); }
  return true;
}
