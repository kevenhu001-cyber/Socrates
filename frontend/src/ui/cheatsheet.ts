/**
 * Lightweight facade for the keyboard-shortcut cheatsheet.
 * The UI is fully rendered by React (frontend/src/react/cheatsheet/Cheatsheet.tsx)
 * through FoundationDialog.
 */
import { installCheatsheetBridge } from '../react/cheatsheet/cheatsheet.bridge';

export function openCheatsheet(): void {
  installCheatsheetBridge().publish({ open: true });
}

export function closeCheatsheet(): void {
  installCheatsheetBridge().publish({ open: false });
}

export function buildCheatsheetSection(_title: string, _rows: Array<[string, string[]]>): Promise<string> {
  return Promise.resolve('');
}

export function loadCheatsheetImpl(): Promise<typeof import('./cheatsheet')> {
  return Promise.resolve({
    openCheatsheet,
    closeCheatsheet,
    buildCheatsheetSection,
    loadCheatsheetImpl,
  });
}
