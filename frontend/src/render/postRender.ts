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
/* Fence ids are lowercase tokens (`js`, `ts`, `py`), but the header is a
   human label. Map the common spellings once so the transcript does not
   show "Javascript" (which a naive capitalize would produce). */
const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  go: 'Go',
  html: 'HTML',
  java: 'Java',
  js: 'JavaScript',
  javascript: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  kotlin: 'Kotlin',
  md: 'Markdown',
  markdown: 'Markdown',
  php: 'PHP',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  ruby: 'Ruby',
  rust: 'Rust',
  sh: 'Shell',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  ts: 'TypeScript',
  tsx: 'TSX',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
};
function displayLanguage(lang: string): string {
  if (!lang) return 'Code';
  const key = lang.toLowerCase();
  const mapped = LANGUAGE_LABELS[key];
  if (mapped) return mapped;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function createCodeBlockHeader(lang: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'code-block-header';
  const label = document.createElement('span');
  label.className = 'code-block-header-lang';
  label.textContent = displayLanguage(lang);
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
  const isDirectContainer =
    typeof body.matches === 'function' &&
    body.matches('.msg-body, .think-content, .tool-run-prose');
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
