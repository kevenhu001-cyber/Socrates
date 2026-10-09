import { AnchoredMenu } from '../menu/AnchoredMenu';
import { SessionMenuActions } from './SessionMenuActions';
import { SessionMenuProjectPicker } from './SessionMenuProjectPicker';
import type { SessionRowMenuProps } from './types';

export function SessionRowMenu(props: SessionRowMenuProps) {
  if (!props.open) return null;
  return (
    <AnchoredMenu
      anchor={props.anchor}
      onClose={props.onClose}
      spill
      className="recent-item-menu is-open"
    >
      {props.projects
        ? <SessionMenuProjectPicker projects={props.projects} saving={props.saving} onBack={props.onBack} onChoose={props.onChooseProject} />
        : <SessionMenuActions {...props} />}
    </AnchoredMenu>
  );
}
