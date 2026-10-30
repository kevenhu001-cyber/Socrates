import { esc } from './helpers.ts';
import { openVizModalRaw } from './vizStubs.ts';
import { highlightCodeElement } from './highlight.ts';

function inferCodeLanguage(code: HTMLElement): string {
  const match = (code.className || '').match(/language-(\w+)/);
  if (match?.[1]) return match[1];
  const text = (code.textContent || '').trimStart();
  if (/^</.test(text)) return 'html';
  if (/^{/.test(text)) return 'json';
  if (/^from\s|^import\s/.test(text)) return 'python';
  if (/^function\s|^const\s|^let\s|^var\s/.test(text)) return 'js';
  return '';
}

function createCodeBlockHeader(lang: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'code-block-header';
  const label = document.createElement('span');
  label.className = 'code-block-header-lang';
  label.textContent = lang || 'code';
  header.appendChild(label);

  const actions = document.createElement('div');
  actions.className = 'code-block-actions';
  actions.setAttribute('data-code-block-actions-root', '');
  header.appendChild(actions);
  return header;
}

/** Add language labels and fullscreen controls to rendered code blocks. */
export function wireCodeBlockHeaders(body: Element | null): void {
  if (!body) return;
  const isDirectContainer = typeof body.matches === 'function' && body.matches('.msg-body, .think-content, .tool-run-prose');
  const pres = isDirectContainer
    ? body.querySelectorAll('pre')
    : body.querySelectorAll('.msg-body pre,.think-content pre,.tool-run-prose pre');
  for (const pre of pres) {
    if (pre.closest?.('.exec-artifact,.agent-tool-card,.viz')) continue;
    const code = pre.querySelector<HTMLElement>('code');
    if (!code) continue;
    highlightCodeElement(code);
    if (pre.previousElementSibling?.matches('.code-block-header')) continue;
    const lang = inferCodeLanguage(code);
    const header = createCodeBlockHeader(lang);
    (pre.parentNode as ParentNode).insertBefore(header, pre);
  }
}

/** Wire ordinary message images to the shared fullscreen image modal. */
export function wireMsgBodyImages(body: Element | null): void {
  if (!body) return;
  const images = body.querySelectorAll<HTMLElement>('.msg-body img:not(.exec-artifact-image)');
  for (const image of images) {
    if (image.dataset.lightboxWired) continue;
    image.dataset.lightboxWired = '1';
    image.addEventListener('click', (event) => {
      event.preventDefault();
      const src = image.getAttribute('src') || '';
      if (!src) return;
      const html = `<div class="img-lightbox"><img src="${esc(src)}" alt="" style="max-width:100%;max-height:calc(100vh - 140px);object-fit:contain;border-radius:6px"/></div>`;
      openVizModalRaw(html, 'Image');
    });
  }
}
