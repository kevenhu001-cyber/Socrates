// Landing greeting: one short line per mode, drawn at random from the
// greeting.{chat,tutor}.N pool so the home surface greets differently on
// each open. Time-of-day and name personalization stay removed — they made
// the hero read as two clauses ("下午好，Jiacheng。准备好开始了吗？") and
// fought the reference composition, which is a single calm line.

const POOL_SCAN = 16;
const _lastPick: Record<string, number> = { chat: -1, tutor: -1 };

function _t(key: string): string {
  const w = window as unknown as { t?: (k: string) => string };
  if (typeof w.t === 'function') {
    const s = w.t(key);
    if (s && s !== key) return s;
  }
  return '';
}

/* Collect every numbered variant the locale defines, then append the
   legacy single key so older locales still contribute their one line. */
function _pool(mode: string): string[] {
  const base = mode === 'tutor' ? 'greeting.tutor' : 'greeting.chat';
  const pool: string[] = [];
  for (let i = 0; i < POOL_SCAN; i++) {
    const v = _t(`${base}.${i}`);
    if (v && pool.indexOf(v) < 0) pool.push(v);
  }
  const single = _t(base);
  if (single && pool.indexOf(single) < 0) pool.push(single);
  return pool;
}

export function renderGreeting(): void {
  const el = document.getElementById('topicTitle');
  if (!el) return;
  const w = window as unknown as { appMode?: string };
  const mode = (typeof window !== 'undefined' && w.appMode) || 'chat';
  const pool = _pool(mode);
  let text = mode === 'tutor' ? "Let's explore." : 'Ready when you are';
  if (pool.length) {
    let idx = Math.floor(Math.random() * pool.length);
    /* Back-to-back duplicates read as a stuck render, not a fresh open —
       nudge the wheel once when the same slot comes up again. */
    if (pool.length > 1 && idx === _lastPick[mode]) idx = (idx + 1) % pool.length;
    _lastPick[mode] = idx;
    text = pool[idx];
  }
  el.textContent = text;
  el.classList.add('greeting');
}
