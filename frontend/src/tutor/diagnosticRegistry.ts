type DiagnosticHandler = () => void;

let _cancelDiagnostic: DiagnosticHandler | null = null;
let _retryDiagnostic: DiagnosticHandler | null = null;
let _useBuiltinDiagnostic: DiagnosticHandler | null = null;

export function registerDiagnosticActions(actions: {
  cancel?: DiagnosticHandler | null;
  retry?: DiagnosticHandler | null;
  builtin?: DiagnosticHandler | null;
}): void {
  if (actions.cancel !== undefined) {
    _cancelDiagnostic = actions.cancel;
    if (typeof window !== 'undefined' && actions.cancel) {
      (window as unknown as { cancelDiagnostic?: DiagnosticHandler }).cancelDiagnostic = actions.cancel;
    }
  }
  if (actions.retry !== undefined) {
    _retryDiagnostic = actions.retry;
    if (typeof window !== 'undefined' && actions.retry) {
      (window as unknown as { retryDiagnostic?: DiagnosticHandler }).retryDiagnostic = actions.retry;
    }
  }
  if (actions.builtin !== undefined) {
    _useBuiltinDiagnostic = actions.builtin;
    if (typeof window !== 'undefined' && actions.builtin) {
      (window as unknown as { useBuiltinDiagnostic?: DiagnosticHandler }).useBuiltinDiagnostic = actions.builtin;
    }
  }
}

export function cancelDiagnosticAction(): void {
  if (typeof _cancelDiagnostic === 'function') {
    _cancelDiagnostic();
    return;
  }
  if (typeof window !== 'undefined') {
    const fn = (window as unknown as { cancelDiagnostic?: DiagnosticHandler }).cancelDiagnostic;
    if (typeof fn === 'function') fn();
  }
}

export function retryDiagnosticAction(): void {
  if (typeof _retryDiagnostic === 'function') {
    _retryDiagnostic();
    return;
  }
  if (typeof window !== 'undefined') {
    const fn = (window as unknown as { retryDiagnostic?: DiagnosticHandler }).retryDiagnostic;
    if (typeof fn === 'function') fn();
  }
}

export function useBuiltinDiagnosticAction(): void {
  if (typeof _useBuiltinDiagnostic === 'function') {
    _useBuiltinDiagnostic();
    return;
  }
  if (typeof window !== 'undefined') {
    const fn = (window as unknown as { useBuiltinDiagnostic?: DiagnosticHandler }).useBuiltinDiagnostic;
    if (typeof fn === 'function') fn();
  }
}
