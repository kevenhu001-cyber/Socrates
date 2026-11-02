/* Must run before any react-native-web module evaluates (see rnwGlobal.ts). */
import '../rn/rnwGlobal';
import { useEffect, useLayoutEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import { NativeControl } from '../ui/NativeControl';
import { ComposerControls } from '@socrates/ui/composer';
import { WebUiTheme } from '../rn/WebUiTheme';
import { i18n } from '../legacy/gateway';
import { ComposerAttachmentChips } from '../attachments/AttachmentChipsRow';
import { useAttachments } from '../attachments/attachments.store';
import { useChatConfigurationSnapshot, openChatConfiguration } from '../chat-configuration/chatConfiguration.bridge';
import { useActiveModelLabel, useStoredReasoningEffort } from '../chat-configuration/useChatConfigurationLabels';
import { effortLabel } from '../chat-configuration/ChatConfigurationPanels';
import { RichComposer } from './RichComposer';
import { useComposerSurface } from './useComposerSurface';
import { readComposerSurface } from '../../composer/controller.ts';
import { composerLifecycleStore } from '../../composer/lifecycle.store.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { useSendGlyphStore } from '../../ui/sendGlyph.store.ts';
import { toggleComposerTools, useComposerToolsSnapshot } from '../composer/composerTools.store';
import { useStore } from 'zustand';
import { useIsChatStreaming } from '../useChatRuntime';
import { VoiceRecordingBar } from './VoiceRecordingBar';
import { useVoiceInputStore } from '../../ui/voiceInput.store.ts';

interface ComposerShellProps {
  placeholder: string;
  onSubmit: () => void;
  onPrimarySubmit: () => void;
  onStop: () => void;
  onEscape: () => void;
}

const FILE_ACCEPT = [
  'image/jpeg,image/png,image/gif,image/webp,image/bmp,image/avif,text/*,application/json,application/xml,application/javascript,application/x-javascript,application/typescript,application/x-typescript,application/yaml,application/x-yaml,application/x-sh,application/sql,application/toml,application/pdf,application/rtf,text/rtf,application/epub+zip,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/mp4,audio/x-m4a,audio/aac,audio/flac',
  '.txt,.md,.markdown,.csv,.tsv,.log,.json,.jsonl,.ndjson,.xml,.yaml,.yml,.toml,.ini,.cfg,.conf,.env,.tex,.bib,.py,.pyw,.js,.mjs,.cjs,.ts,.tsx,.jsx,.java,.c,.h,.cpp,.cc,.cxx,.hpp,.hh,.cs,.go,.rs,.rb,.php,.swift,.kt,.kts,.m,.mm,.scala,.sh,.bash,.zsh,.fish,.pl,.pm,.lua,.r,.jl,.sql,.css,.scss,.less,.vue,.svelte,.dart,.ex,.exs,.erl,.hrl,.clj,.cljs,.hs,.ml,.fs,.vb,.ps1,.bat,.cmd,.ipynb,.diff,.patch,.gitignore,.dockerignore,.proto,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.epub,.rtf,.odt,.ods,.odp,.mp4,.webm,.mov,.mp3,.wav,.m4a,.ogg,.flac,.aac',
].join(',');

/* The control rail follows the composer CSS breakpoint (<= 768px is the
   phone rail), not the sidebar's drawer breakpoint. */
const PHONE_QUERY = '(max-width: 768px)';
function subscribePhone(listener: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
function readPhone(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}
function useComposerPhone(): boolean {
  return useSyncExternalStore(subscribePhone, readPhone, () => false);
}

function anchor(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/**
 * React owns the complete composer shell. The stable outer host stays in the
 * document so the landing/chat transition can move it without rebuilding the
 * editor; legacy controllers keep targeting the same ids inside this tree.
 */
export function ComposerShell({ placeholder, onSubmit, onPrimarySubmit, onStop, onEscape }: ComposerShellProps) {
  const primaryClickGuard = useRef(false);
  const [languageRevision, refreshLanguage] = useReducer((value: number) => value + 1, 0);
  const composerTools = useComposerToolsSnapshot();
  const surface = useComposerSurface();
  const draft = useStore(composerLifecycleStore, (state) => state.drafts[surface]);
  const attachments = useAttachments();
  const streaming = useIsChatStreaming();
  const sending = useSendGlyphStore((state) => state.isSending);
  const voicePhase = useVoiceInputStore((state) => state.phase);
  const voiceActive = voicePhase !== 'idle';
  const phone = useComposerPhone();
  const configuration = useChatConfigurationSnapshot();
  const modelLabel = useActiveModelLabel();
  const effort = useStoredReasoningEffort();
  const effortValue = effortLabel(effort);
  const effortAccessibleLabel = modelLabel ? `${modelLabel} · ${effortValue}` : effortValue;
  const canSend = Boolean(draft.trim() || attachments.length > 0);
  const primaryLabel = streaming
    ? i18n('chat.stop', 'Stop generating')
    : i18n('chat.send', 'Send');
  const composerLabel = surface === 'chat'
    ? i18n('chat.placeholder', 'Ask Socrates')
    : i18n('topic.inputPlaceholder', placeholder);
  const toolsLabel = i18n('chrome.addToolsFiles', 'Add tools and files');
  const voiceLabel = i18n('chrome.voiceInput', 'Voice input');
  const handlePrimaryClick = () => {
    if (streaming) {
      onStop();
      return;
    }
    if (!canSend || primaryClickGuard.current) return;
    primaryClickGuard.current = true;
    const release = () => { primaryClickGuard.current = false; };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(release);
    else setTimeout(release, 16);
    onPrimarySubmit();
  };

  useEffect(() => {
    const onLanguageChange = () => refreshLanguage();
    document.addEventListener('socrates:langchange', onLanguageChange);
    return () => document.removeEventListener('socrates:langchange', onLanguageChange);
  }, []);

  useLayoutEffect(() => {
    const host = document.getElementById('composerInputWrap');
    if (!host) return;
    host.classList.toggle('voice-recording-active', voiceActive);
    if (voiceActive) host.setAttribute('data-voice-recording', 'true');
    else host.removeAttribute('data-voice-recording');
  }, [voiceActive]);

  useEffect(() => {
    /* Attachment wiring runs at DOMContentLoaded. The file input is created
       here, after the authenticated shell becomes visible, so ask that module
       to retry against the committed React tree. */
    document.dispatchEvent(new CustomEvent('socrates:composerready'));
  }, []);

  void languageRevision;

  return (
    <>
      <VoiceRecordingBar />
      <div className="attachment-chips hidden" id="composerAttachmentChips">
        <ComposerAttachmentChips />
      </div>
      <div id="composerRoot" className="composer-editor-root" aria-label={composerLabel}>
        <RichComposer placeholder={placeholder} onSubmit={onSubmit} onEscape={onEscape} />
      </div>
      <div className="composer-footer">
        <NativeControl type="file" id="composerAttachInput" multiple accept={FILE_ACCEPT} hidden />
        {/* RN-7: the control rail is a shared React Native component
            (packages/ui/src/composer); the rich editor above stays the web
            editor. Ids and aria are unchanged, so the legacy controllers
            and the tools / configuration popovers anchor exactly as before. */}
        <WebUiTheme>
          <ComposerControls
            compact={phone}
            tools={{
              label: toolsLabel,
              expanded: composerTools.isOpen && composerTools.triggerId === 'composerToolsBtn',
              onPress: () => {
                const trigger = anchor('composerToolsBtn');
                if (trigger) toggleComposerTools(trigger, readComposerSurface());
              },
            }}
            effort={{
              visible: phone && effort !== 'medium',
              caption: i18n('effort.label', 'Effort'),
              value: effortValue,
              level: effort,
              accessibilityLabel: effortAccessibleLabel,
              expanded: configuration.open && configuration.triggerId === 'effortTrigger',
              onPress: () => {
                const trigger = anchor('effortTrigger');
                if (trigger) openChatConfiguration(trigger);
              },
            }}
            mic={{
              label: voiceLabel,
              listening: voiceActive,
              onPress: () => {
                const target = readComposerSurface();
                void import('../../ui/voiceInput.ts')
                  .then(({ toggleSpeechInput }) => toggleSpeechInput(target))
                  .catch((error) => reportSwallow(error, 'react/composer-input.voiceInput'));
              },
            }}
            primary={{
              mode: streaming ? 'stop' : 'send',
              label: primaryLabel,
              ready: canSend,
              sending,
              onPress: handlePrimaryClick,
            }}
          />
        </WebUiTheme>
      </div>
    </>
  );
}
