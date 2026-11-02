import { createRootSlot } from '../lib/boot/ownedRoot';
import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import type { DiagnosticCommandHandler, DiagnosticScreen } from './DiagnosticView';

const DiagnosticView = lazy(() => import('./DiagnosticView').then((module) => ({ default: module.DiagnosticView })));

const root = createRootSlot('diagnostic-view');
let onCommand: DiagnosticCommandHandler = () => undefined;

export function setDiagnosticCommandHandler(handler: DiagnosticCommandHandler): void {
  onCommand = handler;
}

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
  const loadingText = screen.kind === 'loading' ? screen.loadingText
    : screen.kind === 'question' ? screen.numberLabel : screen.title;
  const element = (
    <ErrorBoundary>
      <Suspense fallback={<div role="status">{loadingText}</div>}>
        <DiagnosticView screen={screen} onCommand={onCommand} />
      </Suspense>
    </ErrorBoundary>
  );
  root.mount(host, element);
}

export function clearDiagnostic(): void {
  root.destroy();
}
