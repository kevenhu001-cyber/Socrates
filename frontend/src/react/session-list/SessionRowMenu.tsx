import { useRef } from 'react';
import { DeferredMenu } from '../menu/DeferredMenu';
import { t } from '../legacy/gateway';
import { SessionMenuActions } from './SessionMenuActions';
import { SessionMenuProjectPicker } from './SessionMenuProjectPicker';
import type { SessionRowMenuProps } from './types';

export function SessionRowMenu(props: SessionRowMenuProps) {
  const focusTarget = useRef<HTMLElement>(null);
  return (
    <DeferredMenu
      trigger={props.trigger}
      open={props.open}
      onOpenChange={props.onOpenChange}
      label={t('session.moreActions')}
      contentKey={props.projects === null ? 'actions' : props.loadingProjects ? 'loading' : props.saving ? 'saving' : 'projects'}
      focusTarget={focusTarget}
      spill
      className="recent-item-menu is-open"
    >
      {({ FoundationMenuItem }) => props.projects !== null
        ? <SessionMenuProjectPicker Item={FoundationMenuItem} focusRef={focusTarget} projects={props.projects}
          saving={props.saving} loading={props.loadingProjects} error={props.projectError || props.saveError}
          onRetry={props.projectError ? props.onMoveToProject : undefined}
          onBack={props.onBack} onChoose={props.onChooseProject} />
        : <SessionMenuActions {...props} Item={FoundationMenuItem} focusRef={focusTarget} />}
    </DeferredMenu>
  );
}
