// Native capability adapters shared by the web UI and the Capacitor shell.
// Every method has a browser fallback so the same frontend remains the
// source of truth for desktop, mobile web, and Android.

function capacitor() {
  return typeof window !== 'undefined' ? window.Capacitor : null;
}

export function isNativeRuntime() {
  const cap = capacitor();
  return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

export function plugin(name) {
  const cap = capacitor();
  return cap && cap.Plugins ? cap.Plugins[name] : undefined;
}

export async function haptic(kind = 'light') {
  if (!isNativeRuntime()) return;
  try {
    const haptics = plugin('Haptics');
    if (!haptics) return;
    if (kind === 'success' && haptics.notification) {
      await haptics.notification({ type: 'SUCCESS' });
    } else if (kind === 'error' && haptics.notification) {
      await haptics.notification({ type: 'ERROR' });
    } else if (haptics.impact) {
      await haptics.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
    }
  } catch (_) {
    // Haptics are an enhancement; a missing plugin must never block a tap.
  }
}

export async function writeClipboard(text) {
  const value = String(text ?? '');
  if (isNativeRuntime()) {
    try {
      const clipboard = plugin('Clipboard');
      if (clipboard?.write) {
        await clipboard.write({ string: value });
        return true;
      }
    } catch (_) { /* fall through to the browser API */ }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) { /* try the legacy path below */ }
  try {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
  } catch (_) {
    return false;
  }
}

export async function shareContent({ title = 'Socrates', text = '', url = '' } = {}) {
  if (isNativeRuntime()) {
    try {
      const share = plugin('Share');
      if (share?.share) {
        await share.share({ title, text, url: url || undefined, dialogTitle: title });
        return true;
      }
    } catch (_) { /* the user may have cancelled the native sheet */ }
  }
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url: url || undefined });
      return true;
    }
  } catch (_) { /* cancellation is not an application error */ }
  return false;
}

export async function secureGet(key) {
  if (isNativeRuntime()) {
    try {
      const storage = plugin('SecureStorage');
      if (storage?.get) {
        const result = await storage.get(key, false);
        return typeof result === 'string' ? result : (result == null ? null : JSON.stringify(result));
      }
    } catch (_) { return null; }
  }
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

export async function secureSet(key, value) {
  if (isNativeRuntime()) {
    try {
      const storage = plugin('SecureStorage');
      if (storage?.set) {
        await storage.set(key, String(value), false);
        return;
      }
    } catch (_) { /* fall through to local fallback */ }
  }
  try { localStorage.setItem(key, String(value)); } catch (_) { /* quota/private mode */ }
}

export async function secureRemove(key) {
  if (isNativeRuntime()) {
    try {
      const storage = plugin('SecureStorage');
      if (storage?.remove) {
        await storage.remove(key);
        return;
      }
    } catch (_) { /* fall through to local fallback */ }
  }
  try { localStorage.removeItem(key); } catch (_) { /* quota/private mode */ }
}
