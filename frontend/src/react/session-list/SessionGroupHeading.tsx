import { ConversationGroupHeading } from '@socrates/ui/shell';
import { webClass } from '../rn/webHost';

/* RN-10 — the heading over a run of history rows, drawn by the shared shell
   (packages/ui/src/shell/ConversationRow.tsx). The class hooks keep the
   sidebar CSS (spacing, phone-drawer hiding) on it. */
const TIME = webClass('recents-time-label');
const PROJECT = webClass('recents-project-label');

export function SessionGroupHeading({ label, project }: { label: string; project?: boolean }) {
  return <ConversationGroupHeading label={label} kind={project ? 'project' : 'time'} hostStyle={project ? PROJECT : TIME} />;
}
