import { requestTutorExploration } from '../../tutor/policy.js';
import { getComposerMarkdown } from '../../composer/controller.ts';
import { selectedComposerPlugins } from '../../react/composer/pluginSelection.ts';
import { serializeSelectedPluginContext } from '../../react/composer/pluginCatalog.ts';
import { attachments, snapshotAttachments } from '../../attachments.js';
import { detectLanguage } from '../lang.ts';
import { isSlashCommandPaletteOpen } from '../templateSlash.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { getAppMode } from './runtime.ts';

/** Everything a new session needs, captured before the composer is cleared. */
export interface SessionStartContext {
  topic: string;
  topicForModel: string;
  activeTemplate: Record<string, unknown> | null;
  startAttachments: unknown[];
  immediateAttachments: unknown[];
  deepResearchOn: boolean;
  language: string;
  tutorExploration: unknown;
}

/** Legacy bridges read during capture. */
interface SessionStartWindow extends Window {
  _activeTemplate?: Record<string, unknown> | null;
  _currentLang?: string;
  deepResearchOn?: boolean;
}

function resolveSessionTopic(): string | null {
  let topic = getComposerMarkdown('topic').trim();
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!topic && !hasAttachments) return null;
  if (!topic) {
    const first = attachments[0] as { name?: unknown } | undefined;
    topic = String((first && first.name) || '').trim() || 'Attachment';
  }
  return topic;
}

function captureActiveTemplate(): Record<string, unknown> | null {
  let activeTemplate: Record<string, unknown> | null = null;
  try {
    const win = window as SessionStartWindow;
    if (win._activeTemplate) activeTemplate = Object.assign({}, win._activeTemplate);
  } catch (error) {
    reportSwallow(error, 'chat/sessionBootstrap.captureTemplate');
  }
  return activeTemplate;
}

async function captureTutorExploration(language: string, deepResearchOn: boolean): Promise<unknown> {
  if (getAppMode() !== 'tutor' || deepResearchOn) return { enabled: false, count: 0 };
  return requestTutorExploration({
    isZh: (window as SessionStartWindow)._currentLang === 'zh' || language === 'zh',
  });
}

export async function captureSessionStart(): Promise<SessionStartContext | null> {
  if (isSlashCommandPaletteOpen()) return null;
  const topic = resolveSessionTopic();
  if (!topic) return null;

  const activeTemplate = captureActiveTemplate();
  const plugins = selectedComposerPlugins('topic').slice();
  const topicForModel = serializeSelectedPluginContext(plugins, topic);
  const startAttachments: unknown[] = snapshotAttachments();
  const immediateAttachments = startAttachments.slice(0, 20)
    .map((attachment) => Object.assign({}, attachment));

  let deepResearchOn = false;
  try { deepResearchOn = Boolean((window as SessionStartWindow).deepResearchOn); }
  catch (error) { reportSwallow(error, 'chat/sessionBootstrap.captureDeepResearch'); }

  const language = detectLanguage(topic);
  const tutorExploration = await captureTutorExploration(language, deepResearchOn);
  if (!tutorExploration) return null;

  return {
    topic,
    topicForModel,
    activeTemplate,
    startAttachments,
    immediateAttachments,
    deepResearchOn,
    language,
    tutorExploration,
  };
}
