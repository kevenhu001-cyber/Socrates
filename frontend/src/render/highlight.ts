import { ensureHighlight } from '../vendor/lazy.js';

interface Highlighter {
  getLanguage(name: string): unknown;
  highlightElement(code: HTMLElement): void;
}

const pending = new WeakMap<HTMLElement, string>();
const painted = new WeakMap<HTMLElement, string>();

/** Highlight stable, labelled code without blocking prose or streaming. */
export function highlightCodeElement(code: HTMLElement): void {
  const language = [...code.classList].find((name) => name.startsWith('language-'));
  if (!language || !code.isConnected) return;
  const source = code.textContent || '';
  if (pending.get(code) === source || painted.get(code) === source) return;
  pending.set(code, source);
  void ensureHighlight().then((runtime: Highlighter) => {
    if (pending.get(code) === source) pending.delete(code);
    // A session swap or streamed update can replace the host during loading.
    if (!code.isConnected || code.textContent !== source) return;
    if (!runtime.getLanguage(language.slice('language-'.length))) {
      code.classList.remove(language);
      code.classList.add('language-plaintext');
    }
    delete code.dataset.highlighted;
    runtime.highlightElement(code);
    code.dataset.hljsDone = '1';
    painted.set(code, source);
  }).catch(() => {
    if (pending.get(code) === source) pending.delete(code);
    // Copy/expand and plain source remain usable; the next pass may retry.
  });
}
