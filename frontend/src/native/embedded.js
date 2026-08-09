const params = new URLSearchParams(window.location.search);
const enabled = params.get('embedded') === '1';
const target = params.get('target') || '';
const targets = new Set(['projects', 'scheduled', 'plugins', 'knowledge', 'mistakes', 'skills', 'api-settings']);

function post(message) {
  try { window.ReactNativeWebView?.postMessage(JSON.stringify(message)); } catch (_) { /* native bridge is optional in normal browsers */ }
}

function activate() {
  if (!enabled || !targets.has(target)) return false;
  const gate = document.getElementById('authGate');
  if (gate && !gate.classList.contains('hidden')) return false;

  document.body.dataset.embedded = 'true';
  document.body.dataset.embeddedTarget = target;
  if (target === 'projects' || target === 'scheduled' || target === 'plugins') {
    window.openNav?.(target, { fromRoute: true });
  } else if (target === 'knowledge' || target === 'mistakes') {
    window.toggleSidebarView?.(target);
  } else if (target === 'skills') {
    window.openPromptTemplatesModal?.();
  } else if (target === 'api-settings') {
    window.openSettings?.();
  }
  post({ type: 'ready' });
  return true;
}

if (enabled) {
  document.documentElement.dataset.embedded = 'true';
  let entered = false;
  const attempt = () => { if (!entered) entered = activate(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
  else attempt();

  const timer = window.setInterval(() => {
    attempt();
    if (entered) window.clearInterval(timer);
  }, 80);
  window.setTimeout(() => window.clearInterval(timer), 10000);

  const gateObserver = new MutationObserver(() => {
    const gate = document.getElementById('authGate');
    if (entered && gate && !gate.classList.contains('hidden')) post({ type: 'authExpired' });
    else attempt();
  });
  const gate = document.getElementById('authGate');
  if (gate) gateObserver.observe(gate, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin === window.location.origin) return;
    event.preventDefault();
    post({ type: 'openExternal', url: url.toString() });
  }, true);
}

export { activate as activateEmbeddedMode };
