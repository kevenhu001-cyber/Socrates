import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { Button } from '../ui/shadcn/button';
import { NativeControl } from '../ui/NativeControl';
import { PrimaryButton } from '../lib/boot/indicatorComponents';
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

function ComposerEffortPicker() {
  const snapshot = useChatConfigurationSnapshot();
  const modelLabel = useActiveModelLabel();
  const effort = useStoredReasoningEffort();
  const selectedLabel = effortLabel(effort);
  const accessibleLabel = modelLabel ? `${modelLabel} · ${selectedLabel}` : selectedLabel;
  return (
    <div className="effort-picker" data-effort={effort}>
      <Button
        id="effortTrigger"
        className="effort-trigger"
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={snapshot.open && snapshot.triggerId === 'effortTrigger'}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        data-chat-config-trigger=""
        onClick={(event) => openChatConfiguration(event.currentTarget)}
      >
        <span className="effort-label">{i18n('effort.label', 'Effort')}</span>
        <span className="effort-value" aria-hidden="true">{selectedLabel}</span>
        <svg className="effort-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon="inline-end">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>
    </div>
  );
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
        <div className="footer-left-group">
          <Button
            className="attach-btn composer-tools-trigger"
            id="composerToolsBtn"
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-haspopup="menu"
            aria-expanded={composerTools.isOpen && composerTools.triggerId === 'composerToolsBtn'}
            aria-label={toolsLabel}
            title={toolsLabel}
            onClick={(event) => toggleComposerTools(event.currentTarget, readComposerSurface())}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon="inline-start">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Button>
          <NativeControl type="file" id="composerAttachInput" multiple accept={FILE_ACCEPT} hidden />
        </div>
        <ComposerEffortPicker />
        <Button
          className={`mobile-mic-btn${voiceActive ? ' is-listening' : ''}`}
          id="composerMicBtn"
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={voiceLabel}
          title={voiceLabel}
          aria-pressed={voiceActive}
          onClick={() => {
            const surface = readComposerSurface();
            void import('../../ui/voiceInput.ts')
              .then(({ toggleSpeechInput }) => toggleSpeechInput(surface))
              .catch((error) => reportSwallow(error, 'react/composer-input.voiceInput'));
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon="inline-start">
            <rect x="9" y="3.5" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M9 20.5h6" />
          </svg>
        </Button>
        <Button
          className={`composer-primary-btn${canSend ? ' active' : ''}${streaming ? ' chat-stop' : ''}${sending ? ' is-sending' : ''}`}
          id="composerPrimaryBtn"
          type="button"
          variant="default"
          size="icon-lg"
          disabled={!streaming && !canSend}
          data-stop={streaming ? '1' : '0'}
          aria-label={primaryLabel}
          title={primaryLabel}
          onClick={handlePrimaryClick}
        >
          <span id="composerPrimaryBtnContent"><PrimaryButton /></span>
        </Button>
      </div>
    </>
  );
}
