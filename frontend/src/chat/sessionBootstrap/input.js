import { requestTutorExploration } from '../../tutor/policy.js';
import { getComposerMarkdown } from '../../composer/controller.ts';
import { selectedComposerPlugins } from '../../react/composer/pluginSelection.ts';
import { serializeSelectedPluginContext } from '../../react/composer/pluginCatalog.ts';
import { attachments, snapshotAttachments } from '../../attachments.js';
import { detectLanguage } from '../lang.js';
import { isSlashCommandPaletteOpen } from '../templateSlash.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { getAppMode } from './runtime.js';

function resolveSessionTopic() {
  let topic = getComposerMarkdown('topic').trim();
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!topic && !hasAttachments) return null;
  if (!topic) topic = String((attachments[0] && attachments[0].name) || '').trim() || 'Attachment';
  return topic;
}

function captureActiveTemplate() {
  let activeTemplate = null;
  try {
    if (window._activeTemplate) activeTemplate = Object.assign({}, window._activeTemplate);
  } catch (error) {
    reportSwallow(error, 'chat/sessionBootstrap.captureTemplate');
  }
  return activeTemplate;
}

async function captureTutorExploration(language, deepResearchOn) {
  if (getAppMode() !== 'tutor' || deepResearchOn) return { enabled: false, count: 0 };
  return requestTutorExploration({
    isZh: window._currentLang === 'zh' || language === 'zh',
  });
}

export async function captureSessionStart() {
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
  try { deepResearchOn = Boolean(window.deepResearchOn); }
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
