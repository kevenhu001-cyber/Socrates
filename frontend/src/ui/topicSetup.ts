// src/ui/topicSetup.ts — Phase C-2.3 extraction
import { getComposerMarkdown, getVisibleComposerSurface } from '../composer/controller.ts';
import type { ComposerSurface } from '../composer/controller.ts';
// Small helpers for the single composer:
//
//   autoResize(el)        — retained for older secondary textareas.
//   updateComposerBtn()   — toggle the composer primary button's active
//                            state based on the visible surface's draft
//                            value AND any pending attachments.
//
// Called from RichComposer change notifications and the flows that
// mutate attachments, so it is also exposed on `window` via
// src/windowExports.ts (see C-2.3 mirror block).

/* autoResize — the chat composer is capped at 120px (≈6 lines),
   the topic setup textarea at 160px (≈8 lines). Reset height to
   "auto" first so shrinking text reflows correctly. */
export function autoResize(el: HTMLElement): void {
  const maxH = 160;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, maxH) + "px";
}

function currentComposerSurface(): ComposerSurface {
  try { return getVisibleComposerSurface(); }
  catch { /* empty-catch: intentional — keep topic as the safe fallback surface */ }
  return 'topic';
}

function currentComposerDraft(surface: ComposerSurface): string {
  try { return getComposerMarkdown(surface).trim(); }
  catch { /* empty-catch: intentional — an unreadable draft should not enable Send */ }
  return '';
}

function hasPendingAttachments(): boolean {
  const legacyWindow = window as Window & { attachments?: unknown[] };
  return Array.isArray(legacyWindow.attachments) && legacyWindow.attachments.length > 0;
}

function syncPrimaryButton(button: HTMLButtonElement, canSend: boolean): void {
  const streaming = button.dataset.stop === '1'
    || button.classList.contains('chat-stop')
    || button.classList.contains('agent-stop');
  const label = typeof window.t === 'function'
    ? window.t(streaming ? 'chat.stop' : 'chat.send')
    : (streaming ? 'Stop generating' : 'Send');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  /* P_composer-primary-split — the primary is submit-only, so it is
     disabled until there is a draft or an attachment to send. The markup
     ships it disabled and the 30% disabled style lives in
     parity/composer-unified.css. */
  button.disabled = streaming ? false : !canSend;
}

/* The primary action follows the draft: the arrow sends text/attachments,
   Stop always remains enabled while a turn streams, and the button stays
   disabled (at 30%) until there is something to send. The microphone is the
   one and only dictation entry point. */
export function updateComposerBtn(): void {
  const surface = currentComposerSurface();
  const canSend = Boolean(currentComposerDraft(surface) || hasPendingAttachments());
  const button = document.getElementById('composerPrimaryBtn') as HTMLButtonElement | null;
  if (!button) return;
  button.classList.toggle('active', canSend);
  /* A live turn owns the button as Stop, so "nothing to send" must not
     disable it out from under the one action that can end the turn. */
  syncPrimaryButton(button, canSend);
  document.getElementById('composerInputWrap')?.classList.toggle('has-text', canSend);
}
