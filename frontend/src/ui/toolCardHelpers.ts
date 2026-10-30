export function trTool(key: string, fallback: string, vars?: Record<string, unknown>) {
  let text = fallback;
  try {
    if (typeof window !== "undefined" && typeof window.t === "function") {
      text = window.t(key) || fallback;
    }
  } catch (_) {
    text = fallback;
  }
  if (vars) {
    Object.keys(vars).forEach(function (name) {
      text = text.replace(new RegExp("\\{" + name + "\\}", "g"), String(vars[name]));
    });
  }
  return text;
}

export function copyText(text: unknown) {
  const value = String(text || "");
  if (!value) return Promise.reject(new Error("empty"));
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(value);
  }
  return import('../react/legacy-controls/clipboardTextarea.tsx').then(({ copyTextWithShadcnTextarea }) => copyTextWithShadcnTextarea(value));
}

export function setCopyFeedback(button: (HTMLElement & { _copyFeedbackTimer?: ReturnType<typeof setTimeout> }) | null, ok: boolean) {
  if (!button) return;
  const original = button.dataset.defaultLabel || button.textContent || "";
  button.dataset.defaultLabel = original;
  button.textContent = ok
    ? trTool("tool.copied", "Copied")
    : trTool("tool.copyFailed", "Copy failed");
  clearTimeout(button._copyFeedbackTimer);
  button._copyFeedbackTimer = setTimeout(function () { button.textContent = original; }, 1200);
}
