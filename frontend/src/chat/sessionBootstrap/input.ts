import { requestTutorExploration } from '../../tutor/policy.ts';
import { getComposerMarkdown } from '../../composer/controller.ts';
import { selectedComposerPlugins } from '../../composer/pluginSelection.ts';
import { serializeSelectedPluginContext } from '../../composer/pluginCatalog.ts';
import { attachments, snapshotAttachments } from '../../attachments.ts';
import { detectLanguage } from '../lang.ts';
import { isSlashCommandPaletteOpen } from '../templateSlash.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { getAppMode } from './runtime.ts';
import { getCurrentLanguage } from '../../i18n/languageState.ts';

/** Everything a new session needs, captured before the composer is cleared. */
export interface SessionStartContext {
  topic: string;
  topicForModel: string;
  activeTemplate: Record<string, unknown> | null;
  startAttachments: import('../../attachments/types.ts').PendingAttachment[];
  immediateAttachments: import('../../attachments/types.ts').PendingAttachment[];
  deepResearchOn: boolean;
  language: string;
  tutorExploration: { enabled: boolean; count: number };
}

/** Legacy bridges read during capture. */
interface SessionStartWindow extends Window {
  _activeTemplate?: Record<string, unknown> | null;
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

async function captureTutorExploration(language: string, deepResearchOn: boolean): Promise<{ enabled: boolean; count: number } | null> {
  if (getAppMode() !== 'tutor' || deepResearchOn) return { enabled: false, count: 0 };
  return requestTutorExploration({
    isZh: getCurrentLanguage() === 'zh' || language === 'zh',
  });
}

export async function captureSessionStart(): Promise<SessionStartContext | null> {
  if (isSlashCommandPaletteOpen()) return null;
  const topic = resolveSessionTopic();
  if (!topic) return null;

  const activeTemplate = captureActiveTemplate();
  const plugins = selectedComposerPlugins('topic').slice();
  const topicForModel = serializeSelectedPluginContext(plugins, topic);
  const startAttachments = snapshotAttachments();
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
