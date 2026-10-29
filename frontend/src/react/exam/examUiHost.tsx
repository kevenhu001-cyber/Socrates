import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { ExamActionFooter, type ExamAction } from './ExamActionFooter';
import { ExamResults, type ExamResultsSnapshot } from './ExamResults';
import { ExamStatus, type ExamStatusSnapshot } from './ExamStatus';
import { ExamSetupBody, ExamSetupFooter, type ExamSetupSnapshot } from './ExamSetup';

let bodyRoot: OwnedRootHandle | null = null;
let footerRoot: OwnedRootHandle | null = null;

export function renderExamSetup(
  bodyHost: HTMLElement,
  footerHost: HTMLElement,
  commandHost: HTMLElement,
  snapshot: ExamSetupSnapshot,
) {
  const body = <ExamSetupBody key={snapshot.key} snapshot={snapshot} commandHost={commandHost} />;
  const footer = <ExamSetupFooter snapshot={snapshot} />;
  if (bodyRoot) bodyRoot.render(body);
  else bodyRoot = mountOwnedRoot(bodyHost, 'exam-setup-body', body);
  if (footerRoot) footerRoot.render(footer);
  else footerRoot = mountOwnedRoot(footerHost, 'exam-setup-footer', footer);
}

export function renderExamStatus(bodyHost: HTMLElement, snapshot: ExamStatusSnapshot) {
  const body = <ExamStatus snapshot={snapshot} />;
  if (bodyRoot) bodyRoot.render(body);
  else bodyRoot = mountOwnedRoot(bodyHost, 'exam-status', body);
}

export function renderExamResultsView(bodyHost: HTMLElement, snapshot: ExamResultsSnapshot) {
  const body = <ExamResults snapshot={snapshot} />;
  if (bodyRoot) bodyRoot.render(body);
  else bodyRoot = mountOwnedRoot(bodyHost, 'exam-results', body);
}

export function renderExamActions(footerHost: HTMLElement, actions: ExamAction[]) {
  const footer = <ExamActionFooter actions={actions} />;
  if (footerRoot) footerRoot.render(footer);
  else footerRoot = mountOwnedRoot(footerHost, 'exam-actions', footer);
}

export function clearExamSetup() {
  bodyRoot?.render(null);
  footerRoot?.render(null);
}
