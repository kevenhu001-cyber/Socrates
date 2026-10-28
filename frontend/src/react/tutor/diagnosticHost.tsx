import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { DiagnosticView, type DiagnosticScreen } from './DiagnosticView';

let activeRoot: OwnedRootHandle | null = null;

/**
 * `#diagnosticView` is a single legacy view host: the loading screen, the
 * question card, the results screen and the failure card all take turns in it.
 * One React root owns it, and every writer goes through this module so no one
 * can `innerHTML` the tree out from under React.
 */
export function renderDiagnostic(screen: DiagnosticScreen): void {
  const host = document.getElementById('diagnosticView');
  if (!host) return;
  host.classList.remove('hidden');
  const element = <DiagnosticView screen={screen} />;
  if (activeRoot) {
    activeRoot.render(element);
    return;
  }
  activeRoot = mountOwnedRoot(host, 'diagnostic-view', element);
}

export function clearDiagnostic(): void {
  const root = activeRoot;
  activeRoot = null;
  if (root) root.destroy();
}
