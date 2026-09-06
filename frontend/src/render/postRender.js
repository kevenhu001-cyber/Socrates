import { esc } from './helpers.js';
import { openVizModalRaw } from './viz.js';

/** Add language labels and fullscreen controls to rendered code blocks. */
export function wireCodeBlockHeaders(body) {
  if (!body) return;
  const pres = body.querySelectorAll('.msg-body pre,.think-content pre');
  for (const pre of pres) {
    if (pre.previousElementSibling?.matches('.code-block-header')) continue;
    if (pre.closest?.('.exec-artifact,.agent-tool-card,.viz')) continue;
    const code = pre.querySelector('code');
    if (!code) continue;

    const match = (code.className || '').match(/language-(\w+)/);
    let lang = match?.[1] || '';
    if (!lang) {
      const text = (code.textContent || '').trimStart();
      if (/^</.test(text)) lang = 'html';
      else if (/^{/.test(text)) lang = 'json';
      else if (/^from\s|^import\s/.test(text)) lang = 'python';
      else if (/^function\s|^const\s|^let\s|^var\s/.test(text)) lang = 'js';
    }

    const header = document.createElement('div');
    header.className = 'code-block-header';
    const label = document.createElement('span');
    label.className = 'code-block-header-lang';
    label.textContent = lang || 'code';
    header.appendChild(label);

    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'code-block-expand';
    expand.setAttribute('aria-label', 'Expand code');
    expand.title = 'Expand';
    expand.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><path d="M9 21 3 21 3 15"/><path d="M21 3 14 10"/><path d="M3 21 10 14"/></svg>';
    expand.addEventListener('click', (event) => {
      event.stopPropagation();
      const rawCode = code.textContent || '';
      const html = `<pre style="margin:0;border:0;background:transparent;padding:18px 20px;font-family:var(--font-mono);font-size:13px;line-height:1.6;color:hsl(var(--text-200));white-space:pre-wrap;word-break:break-word;max-height:calc(100vh - 120px);overflow:auto"><code>${esc(rawCode)}</code></pre>`;
      openVizModalRaw(html, `${lang || 'code'} source`);
    });
    header.appendChild(expand);
    pre.parentNode.insertBefore(header, pre);
  }
}

/** Wire ordinary message images to the shared fullscreen image modal. */
export function wireMsgBodyImages(body) {
  if (!body) return;
  const images = body.querySelectorAll('.msg-body img:not(.exec-artifact-image)');
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
