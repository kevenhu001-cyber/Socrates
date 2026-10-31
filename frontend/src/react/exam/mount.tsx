import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { ExamView } from './ExamView';

export function mountExamView(): boolean {
  const host = document.getElementById('examViewReactRoot');
  if (!host) return false;
  mountOwnedRoot(host, 'exam-view', <ExamView />);
  return true;
}
