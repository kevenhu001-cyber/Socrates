import { haptic } from './services.js';

const isMobileViewport = () => typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(max-width: 640px)').matches
  : false;

function setOfflineState() {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  try { document.body.toggleAttribute('data-offline', offline); } catch (_) {}
  const banner = document.getElementById('mobileOfflineBanner');
  if (banner) banner.classList.toggle('hidden', !offline);
}

function showMobileVoiceHint() {
  haptic('light');
  if (typeof window.showToast === 'function') window.showToast('语音输入即将上线');
}

function closeMobileLayer(event) {
  if (!isMobileViewport()) return;
  const mode = document.getElementById('mobileMode');
  if (mode?.getAttribute('data-open') === 'true') {
    window.toggleMobileModeMenu?.();
    event.preventDefault();
    return;
  }
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !sidebar.classList.contains('collapsed')) {
    window.toggleSidebar?.();
    event.preventDefault();
    return;
  }
  const popover = document.querySelector('.display-prefs-popover:not(.hidden), .sidebar-more-popover:not(.hidden), .model-picker-menu:not(.hidden), .effort-menu:not(.hidden)');
  if (popover) {
    popover.classList.add('hidden');
    event.preventDefault();
  }
}

function setupEdgeSwipe() {
  let start = null;
  document.addEventListener('touchstart', (event) => {
    if (!isMobileViewport() || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const sidebar = document.getElementById('sidebar');
    const sidebarOpen = sidebar && !sidebar.classList.contains('collapsed');
    if (touch.clientX <= 28 || sidebarOpen) start = { x: touch.clientX, y: touch.clientY, sidebarOpen };
  }, { passive: true });
  document.addEventListener('touchend', (event) => {
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = Math.abs(touch.clientY - start.y);
    const shouldOpen = !start.sidebarOpen && dx > 72 && dy < 56;
    const shouldClose = start.sidebarOpen && dx < -72 && dy < 56;
    start = null;
    if ((shouldOpen || shouldClose) && typeof window.toggleSidebar === 'function') {
      haptic('light');
      window.toggleSidebar();
    }
  }, { passive: true });
}

function setupButtonHaptics() {
  document.addEventListener('pointerup', (event) => {
    if (!isMobileViewport()) return;
    const button = event.target?.closest?.('button,[role="button"]');
    if (button && !button.disabled) haptic(button.classList.contains('start-btn') || button.classList.contains('send-btn') ? 'medium' : 'light');
  }, { passive: true });
}

export function setupMobileUx() {
  if (typeof document === 'undefined') return;
  window.showMobileVoiceHint = showMobileVoiceHint;
  setOfflineState();
  window.addEventListener('online', setOfflineState);
  window.addEventListener('offline', setOfflineState);
  window.addEventListener('socrates:back', closeMobileLayer);
  setupEdgeSwipe();
  setupButtonHaptics();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupMobileUx, { once: true });
  else setupMobileUx();
}
