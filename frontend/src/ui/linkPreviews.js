/* ui/linkPreviews.js — URL reference cards shown beneath a user message.
 *
 * Kept separate from chat orchestration so the presentation of fetched pages
 * stays reusable and does not add more DOM-building code to main.js.
 */

import { esc } from '../render/helpers.js';
import { sanitizeUrl } from '../util/safe.js';

const LINK_ICON = '<svg class="icon-inline" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9q-.13 0-.25.031A2 2 0 0 1 7 10.5H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1z"/><path d="M9 5.5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6.5h3a2 2 0 1 1 0 4h-1.535a4 4 0 0 1-.82 1H12a3 3 0 1 0 0-6z"/></svg>';
const ERROR_ICON = '<svg class="icon-inline" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>';

export function renderNoUrlHint(targetEl) {
  if (!targetEl) return;
  const card = document.createElement('div');
  card.className = 'link-card err no-url-hint';
  card.innerHTML =
    '<div class="link-card-head">' +
      '<div class="link-card-host">' + LINK_ICON + ' No URL detected</div>' +
      '<div class="link-card-status err">awaiting full link</div>' +
    '</div>' +
    '<div class="link-card-excerpt">' +
      'You mentioned a site but the URL is missing or not in a form I can fetch. ' +
      'On your next turn, paste the full address including the <code>https://</code> prefix ' +
      '(for example, <code>https://www.topodrive.top/pricing</code>) and I\'ll read it for you.' +
    '</div>';
  const wrap = document.createElement('div');
  wrap.className = 'link-previews';
  wrap.appendChild(card);
  targetEl.appendChild(wrap);
}

export function renderLinkPreviews(targetEl, urls, results) {
  if (!targetEl || !Array.isArray(urls) || !urls.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'link-previews';
  for (let i = 0; i < urls.length; i++) {
    const url = sanitizeUrl(String(urls[i] || ''));
    const fetched = (results && results[i]) || null;
    const card = document.createElement('div');
    card.className = 'link-card ' + (fetched && fetched.ok ? 'ok' : 'err');
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { host = url; }
    const title = (fetched && fetched.title) || url;
    const excerpt = fetched && fetched.content
      ? (fetched.content.length > 220 ? fetched.content.slice(0, 217) + '…' : fetched.content)
      : '';
    const statusHtml = fetched && fetched.ok
      ? '<div class="link-card-status">' + esc(fetched.truncated ? 'excerpt · ' + fetched.chars + ' chars' : 'full · ' + fetched.chars + ' chars') + '</div>'
      : '<div class="link-card-status err">' + ERROR_ICON + ' ' + esc((fetched && fetched.reason) || 'fetch failed') + '</div>';
    card.innerHTML =
      '<div class="link-card-head"><div class="link-card-host">' + LINK_ICON + ' ' + esc(host) + '</div>' + statusHtml + '</div>' +
      '<a class="link-card-title" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + '</a>' +
      (excerpt ? '<div class="link-card-excerpt">' + esc(excerpt) + '</div>' : '');
    wrap.appendChild(card);
  }
  targetEl.appendChild(wrap);
}
