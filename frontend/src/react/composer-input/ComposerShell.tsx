import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { NativeControl } from '../ui/NativeControl';
import { ComposerFrame } from '@socrates/ui/composer';
import { WebUiTheme } from '../rn/WebUiTheme';
import { i18n } from '../../ui/legacyI18n.ts';
import { ComposerAttachmentChips } from '../attachments/AttachmentChipsRow';
import { useAttachments } from '../attachments/attachments.store';
import {
  useChatConfigurationSnapshot,
  openChatConfiguration,
} from '../chat-configuration/chatConfiguration.bridge';
import {
  useActiveModelLabel,
  useStoredReasoningEffort,
} from '../chat-configuration/useChatConfigurationLabels';
import { effortLabel } from '../chat-configuration/ChatConfigurationPanels';
import { RichComposer } from './RichComposer';
import { useComposerSurface } from './useComposerSurface';
import { readComposerSurface } from '../../composer/controller.ts';
import { composerLifecycleStore } from '../../composer/lifecycle.store.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { useSendGlyphStore } from '../../legacy/sendGlyph.store.ts';
import { toggleComposerTools, useComposerToolsSnapshot } from '../composer/composerTools.store';
import { useStore } from 'zustand';
import { useIsChatStreaming } from '../useChatRuntime';
import { VoiceSpectrum } from './VoiceSpectrum';
import { useVoiceInputStore } from '../../legacy/voiceInput.store.ts';
import { voiceInputUnavailableReason } from '../../legacy/voiceInputAvailability.ts';

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

const FIELD_SHADOWS = {
  /* RN-9: the lit recipes put a 1px top-edge highlight over the same
     outward shadow, so the sheet reads as a surface catching light from
     above instead of a flat cut-out. */
  field: 'var(--ui-elevation-lit-field)',
  fieldHover: 'var(--ui-elevation-lit-field-hover)',
  fieldFocus: 'var(--ui-elevation-lit-field-focus)',
};

/* On phones, moving from the editor to a control keeps the control in place. */
function useEditorFocus(keepControlsInPlace: boolean): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const host = document.getElementById('composerInputWrap');
    if (!host) return undefined;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.matches('.rich-composer-editor') ||
          (keepControlsInPlace && target.id === 'effortTrigger'))
      ) {
        setFocused(true);
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      if (keepControlsInPlace && host.contains(event.relatedTarget as Node | null)) return;
      setFocused(false);
    };
    host.addEventListener('focusin', onFocusIn);
    host.addEventListener('focusout', onFocusOut);
    return () => {
      host.removeEventListener('focusin', onFocusIn);
      host.removeEventListener('focusout', onFocusOut);
    };
  }, [keepControlsInPlace]);
  return focused;
}

function anchor(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** 控件栏图标按钮的已翻译名称（同时用作 aria-label 与 title）。 */
function controlLabels(streaming: boolean): { primaryLabel: string; toolsLabel: string } {
  return {
    primaryLabel: streaming ? i18n('chat.stop', 'Stop generating') : i18n('chat.send', 'Send'),
    toolsLabel: i18n('chrome.addToolsFiles', 'Add tools and files'),
  };
}

/**
 * react-native-web 不转发 `title`，提问框的图标按钮由宿主补上悬停提示，
 * 与 aria-label 用同一份已翻译文案（RN-7 前每个按钮都有 title）。
 */
function useControlTitles(tools: string, effort: string, voice: string, primary: string): void {
  useLayoutEffect(() => {
    const titles: ReadonlyArray<readonly [string, string]> = [
      ['composerToolsBtn', tools],
      ['effortTrigger', effort],
      ['composerMicBtn', voice],
      ['composerPrimaryBtn', primary],
    ];
    for (const [id, title] of titles) anchor(id)?.setAttribute('title', title);
  }, [tools, effort, voice, primary]);
}

function useComposerVoiceState() {
  const voicePhaseRaw = useVoiceInputStore((state) => state.phase);
  const voiceSeconds = useVoiceInputStore((state) => state.elapsedSeconds);
  const voiceAnalyser = useVoiceInputStore((state) => state.analyser);
  const voicePhase: 'idle' | 'recording' | 'transcribing' =
    voicePhaseRaw === 'idle'
      ? 'idle'
      : voicePhaseRaw === 'processing'
        ? 'transcribing'
        : 'recording';
  const voiceActive = voicePhase !== 'idle';
  const voiceRecording = voicePhase === 'recording';
  const voiceUnavailable = voiceInputUnavailableReason();
  const voiceLabel =
    voiceUnavailable === 'https'
      ? i18n('voice.requiresHttps', 'Voice input requires HTTPS')
      : voiceUnavailable === 'unsupported'
        ? i18n('voice.unsupported', 'Voice input is not supported in this browser.')
        : voicePhase === 'recording'
          ? i18n('voice.stop', 'Stop voice input')
          : voicePhase === 'transcribing'
            ? i18n('voice.cancel', 'Cancel voice input')
            : i18n('chrome.voiceInput', 'Voice input');
  const voiceTimerLabel =
    voicePhase === 'recording'
      ? i18n('voice.timer', 'Recording {seconds}s').replace('{seconds}', String(voiceSeconds))
      : '';
  return {
    voicePhase,
    voiceActive,
    voiceRecording,
    voiceUnavailable,
    voiceLabel,
    voiceTimerLabel,
    voiceAnalyser,
  };
}

function usePrimaryClickHandler(
  streaming: boolean,
  canSend: boolean,
  onStop: () => void,
  onPrimarySubmit: () => void,
) {
  const primaryClickGuard = useRef(false);
  return () => {
    if (streaming) {
      onStop();
      return;
    }
    if (!canSend || primaryClickGuard.current) return;
    primaryClickGuard.current = true;
    const release = () => {
      primaryClickGuard.current = false;
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(release);
    else setTimeout(release, 16);
    onPrimarySubmit();
  };
}

function buildComposerControls(opts: {
  toolsLabel: string;
  composerTools: { isOpen: boolean; triggerId: string | null };
  phone: boolean;
  effortValue: string;
  effort: string;
  effortAccessibleLabel: string;
  configuration: { open: boolean; triggerId: string | null };
  voiceLabel: string;
  voicePhase: 'idle' | 'recording' | 'transcribing';
  voiceTimerLabel: string;
  voiceUnavailable: string | null;
  streaming: boolean;
  primaryLabel: string;
  canSend: boolean;
  sending: boolean;
  handlePrimaryClick: () => void;
}) {
  return {
    tools: {
      label: opts.toolsLabel,
      i18nKey: 'chrome.addToolsFiles',
      expanded: opts.composerTools.isOpen && opts.composerTools.triggerId === 'composerToolsBtn',
      onPress: () => {
        const trigger = anchor('composerToolsBtn');
        if (trigger) toggleComposerTools(trigger, readComposerSurface());
      },
    },
    effort: {
      visible: opts.phone,
      caption: i18n('effort.label', 'Effort'),
      value: opts.effortValue,
      level: opts.effort,
      accessibilityLabel: opts.effortAccessibleLabel,
      expanded: opts.configuration.open && opts.configuration.triggerId === 'effortTrigger',
      onPress: () => {
        const trigger = anchor('effortTrigger');
        if (trigger) openChatConfiguration(trigger);
      },
    },
    mic: {
      label: opts.voiceLabel,
      i18nKey: 'chrome.voiceInput',
      listening: opts.voicePhase === 'recording',
      phase: opts.voicePhase,
      timerLabel: opts.voiceTimerLabel,
      showTimer: !opts.phone,
      disabled: opts.voiceUnavailable !== null,
      onPress: () => {
        const target = readComposerSurface();
        void import('../../legacy/voiceInput.ts')
          .then(({ toggleSpeechInput }) => toggleSpeechInput(target))
          .catch((error) => reportSwallow(error, 'react/composer-input.voiceInput'));
      },
    },
    primary: {
      mode: (opts.streaming ? 'stop' : 'send') as 'stop' | 'send',
      label: opts.primaryLabel,
      ready: opts.canSend,
      sending: opts.sending,
      onPress: opts.handlePrimaryClick,
    },
  };
}

/**
 * React owns the complete composer shell. The stable outer host stays in the
 * document so the landing/chat transition can move it without rebuilding the
 * editor; legacy controllers keep targeting the same ids inside this tree.
 */
export function ComposerShell({
  placeholder,
  onSubmit,
  onPrimarySubmit,
  onStop,
  onEscape,
}: ComposerShellProps) {
  const [languageRevision, refreshLanguage] = useReducer((value: number) => value + 1, 0);
  const composerTools = useComposerToolsSnapshot();
  const surface = useComposerSurface();
  const hasDraft = useStore(composerLifecycleStore, (state) =>
    Boolean(state.drafts[surface].trim()),
  );
  const attachments = useAttachments();
  const streaming = useIsChatStreaming();
  const sending = useSendGlyphStore((state) => state.isSending);
  const {
    voicePhase,
    voiceActive,
    voiceRecording,
    voiceUnavailable,
    voiceLabel,
    voiceTimerLabel,
    voiceAnalyser,
  } = useComposerVoiceState();
  const phone = useComposerPhone();
  const focused = useEditorFocus(phone);
  const configuration = useChatConfigurationSnapshot();
  const effortOpen = configuration.open && configuration.triggerId === 'effortTrigger';
  const expanded = focused || hasDraft || attachments.length > 0 || voiceActive || effortOpen;
  const modelLabel = useActiveModelLabel();
  const effort = useStoredReasoningEffort();
  const effortValue = effortLabel(effort);
  const effortAccessibleLabel = `${modelLabel ? `${modelLabel} · ` : ''}${i18n('chatconfig.effort', 'Reasoning effort')} · ${effortValue}`;
  /* Dictation owns the microphone while it runs; the primary stays a send
     control and cannot submit a half-transcribed turn. */
  const canSend = !voiceActive && (hasDraft || attachments.length > 0);
  const { primaryLabel, toolsLabel } = controlLabels(streaming);
  const composerLabel =
    surface === 'chat'
      ? i18n('chat.placeholder', 'Ask Socrates')
      : i18n('topic.inputPlaceholder', placeholder);
  const handlePrimaryClick = usePrimaryClickHandler(streaming, canSend, onStop, onPrimarySubmit);

  useEffect(() => {
    const onLanguageChange = () => refreshLanguage();
    document.addEventListener('socrates:langchange', onLanguageChange);
    return () => document.removeEventListener('socrates:langchange', onLanguageChange);
  }, []);

  useLayoutEffect(() => {
    const host = document.getElementById('composerInputWrap');
    if (!host) return;
    host.classList.toggle('voice-recording-active', voiceRecording);
    if (voiceRecording) host.setAttribute('data-voice-recording', 'true');
    else host.removeAttribute('data-voice-recording');
  }, [voiceRecording]);

  useControlTitles(toolsLabel, effortAccessibleLabel, voiceLabel, primaryLabel);

  /* The React composer exposes readiness as `data-ready` on the disc, but two
     older contracts still read the DOM classes: chat/turn/composer.ts uses
     `#composerPrimaryBtn.active` when it decides `disabled` after a turn, and
     the composer shell keys `#composerInputWrap.has-text` off having something
     to send (draft *or* attachment). RN Web renders its own className, so the
     web shell mirrors both from the committed tree, exactly like the titles
     above. Without this the button stayed `disabled` after every turn and the
     "has content" state never reached CSS. */
  useLayoutEffect(() => {
    anchor('composerPrimaryBtn')?.classList.toggle('active', canSend);
    anchor('composerInputWrap')?.classList.toggle('has-text', canSend);
  }, [canSend]);

  useEffect(() => {
    /* Attachment wiring runs at DOMContentLoaded. The file input is created
       here, after the authenticated shell becomes visible, so ask that module
       to retry against the committed React tree. */
    document.dispatchEvent(new CustomEvent('socrates:composerready'));
  }, []);

  void languageRevision;

  return (
    <>
      {/* RN-7: the question box is the shared RN frame (packages/ui/src/composer).
          The web supplies two slots — the attachment row and the rich editor
          (paste, shortcuts, IME, tokens unchanged); the frame draws the rest. */}
      <WebUiTheme>
        <ComposerFrame
          focused={focused}
          expanded={expanded}
          compact={phone}
          layout="inline"
          surface="var(--ui-bg-ask)"
          shadows={FIELD_SHADOWS}
          topVisible={attachments.length > 0}
          top={
            <div className="attachment-chips hidden" id="composerAttachmentChips">
              <ComposerAttachmentChips />
            </div>
          }
          body={
            <div id="composerRoot" className="composer-editor-root" aria-label={composerLabel}>
              {phone && voiceRecording ? <VoiceSpectrum analyser={voiceAnalyser} /> : null}
              <RichComposer placeholder={placeholder} onSubmit={onSubmit} onEscape={onEscape} />
            </div>
          }
          hidden={
            <NativeControl
              type="file"
              id="composerAttachInput"
              multiple
              accept={FILE_ACCEPT}
              hidden
            />
          }
          controls={buildComposerControls({
            toolsLabel,
            composerTools,
            phone,
            effortValue,
            effort,
            effortAccessibleLabel,
            configuration,
            voiceLabel,
            voicePhase,
            voiceTimerLabel,
            voiceUnavailable,
            streaming,
            primaryLabel,
            canSend,
            sending,
            handlePrimaryClick,
          })}
        />
      </WebUiTheme>
    </>
  );
}
