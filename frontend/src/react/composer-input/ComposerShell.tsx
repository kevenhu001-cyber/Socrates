import { useEffect } from 'react';
import { Button } from '../ui/shadcn/button';
import { NativeControl } from '../ui/NativeControl';
import { PrimaryButton } from '../lib/boot/indicatorComponents';
import { applyLegacyI18n } from '../legacy/gateway';
import { ComposerAttachmentChips } from '../attachments/AttachmentChipsRow';
import { RichComposer } from './RichComposer';

interface ComposerShellProps {
  placeholder: string;
  onSubmit: () => void;
  onEscape: () => void;
}

const FILE_ACCEPT = [
  'image/jpeg,image/png,image/gif,image/webp,image/bmp,image/avif,text/*,application/json,application/xml,application/javascript,application/x-javascript,application/typescript,application/x-typescript,application/yaml,application/x-yaml,application/x-sh,application/sql,application/toml,application/pdf,application/rtf,text/rtf,application/epub+zip,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/mp4,audio/x-m4a,audio/aac,audio/flac',
  '.txt,.md,.markdown,.csv,.tsv,.log,.json,.jsonl,.ndjson,.xml,.yaml,.yml,.toml,.ini,.cfg,.conf,.env,.tex,.bib,.py,.pyw,.js,.mjs,.cjs,.ts,.tsx,.jsx,.java,.c,.h,.cpp,.cc,.cxx,.hpp,.hh,.cs,.go,.rs,.rb,.php,.swift,.kt,.kts,.m,.mm,.scala,.sh,.bash,.zsh,.fish,.pl,.pm,.lua,.r,.jl,.sql,.css,.scss,.less,.vue,.svelte,.dart,.ex,.exs,.erl,.hrl,.clj,.cljs,.hs,.ml,.fs,.vb,.ps1,.bat,.cmd,.ipynb,.diff,.patch,.gitignore,.dockerignore,.proto,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.epub,.rtf,.odt,.ods,.odp,.mp4,.webm,.mov,.mp3,.wav,.m4a,.ogg,.flac,.aac',
].join(',');

/**
 * React owns the complete composer shell. The stable outer host stays in the
 * document so the landing/chat transition can move it without rebuilding the
 * editor; legacy controllers keep targeting the same ids inside this tree.
 */
export function ComposerShell({ placeholder, onSubmit, onEscape }: ComposerShellProps) {
  useEffect(() => {
    applyLegacyI18n();
    /* Attachment wiring runs at DOMContentLoaded. The file input is created
       here, after the authenticated shell becomes visible, so ask that module
       to retry against the committed React tree. */
    document.dispatchEvent(new CustomEvent('socrates:composerready'));
  }, []);

  return (
    <>
      <div className="attachment-chips hidden" id="composerAttachmentChips">
        <ComposerAttachmentChips />
      </div>
      <div id="composerRoot" className="composer-editor-root" aria-label="Message input">
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
            aria-expanded="false"
            aria-label="Add tools and files"
            title="Add tools and files"
            data-i18n-aria="chrome.addToolsFiles"
            data-i18n-title="chrome.addToolsFiles"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon="inline-start">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Button>
          <NativeControl type="file" id="composerAttachInput" multiple accept={FILE_ACCEPT} hidden />
        </div>
        <div className="effort-picker" data-open="false">
          <Button
            className="effort-trigger"
            type="button"
            variant="ghost"
            size="sm"
            aria-haspopup="dialog"
            aria-expanded="false"
            title="Reasoning effort"
            data-i18n-title="effort.label"
          >
            <span className="effort-label" data-i18n-key="effort.label">Effort</span>
            <span className="effort-value" aria-hidden="true" />
            <svg className="effort-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon="inline-end">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </Button>
        </div>
        <Button
          className="mobile-mic-btn"
          id="composerMicBtn"
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Voice input"
          title="Voice input"
          data-i18n-aria="chrome.voiceInput"
          data-i18n-title="chrome.voiceInput"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon="inline-start">
            <rect x="9" y="3.5" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M9 20.5h6" />
          </svg>
        </Button>
        <Button
          className="composer-primary-btn"
          id="composerPrimaryBtn"
          type="button"
          variant="default"
          size="icon-lg"
          disabled
          aria-label="Send"
          title="Send"
          data-i18n-aria="chat.send"
          data-i18n-title="chat.send"
        >
          <span id="composerPrimaryBtnContent"><PrimaryButton /></span>
        </Button>
      </div>
    </>
  );
}
