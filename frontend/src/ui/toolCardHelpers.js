export function trTool(key, fallback, vars) {
  var text = fallback;
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

export function copyText(text) {
  var value = String(text || "");
  if (!value) return Promise.reject(new Error("empty"));
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(value);
  }
  return new Promise(function (resolve, reject) {
    try {
      var area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand("copy");
      area.remove();
      if (ok) resolve(); else reject(new Error("copy failed"));
    } catch (err) { reject(err); }
  });
}

export function setCopyFeedback(button, ok) {
  if (!button) return;
  var original = button.dataset.defaultLabel || button.textContent;
  button.dataset.defaultLabel = original;
  button.textContent = ok
    ? trTool("tool.copied", "Copied")
    : trTool("tool.copyFailed", "Copy failed");
  clearTimeout(button._copyFeedbackTimer);
  button._copyFeedbackTimer = setTimeout(function () { button.textContent = original; }, 1200);
}
