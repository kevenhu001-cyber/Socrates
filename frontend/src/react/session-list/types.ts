import type { ComponentPropsWithRef, MouseEvent as ReactMouseEvent, ReactElement } from 'react';
import type { SessionItem } from '../../ui/sessionListState.ts';

export interface SessionProjectOption {
  id: string;
  name: string;
}

export interface SessionRowMenuProps {
  session: SessionItem;
  trigger: ReactElement<ComponentPropsWithRef<'button'>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: SessionProjectOption[] | null;
  loadingProjects: boolean;
  projectError: string;
  saveError: string;
  saving: boolean;
  onClose: () => void;
  onBack: () => void;
  onChooseProject: (projectId: string) => void;
  onRename: (event: ReactMouseEvent) => void;
  onTag: (event: ReactMouseEvent) => void;
  onPin: () => void;
  onArchive: (event: ReactMouseEvent) => void;
  onDelete: (event: ReactMouseEvent) => void;
  onMoveToProject: () => void;
}

declare global {
  interface Window {
    getRecents?: () => ReadonlyArray<{ id: string; title?: string; topic?: string; updated_at?: number; updatedAt?: number; created_at?: number; createdAt?: number; total_q?: number; totalQ?: number; mode?: string; phase?: string; kind?: string; pinned?: boolean; tags?: string[]; archivedAt?: number | null }>;
    getSessionLabel?: (id: string) => string;
    setRecentsSearch?: (q: string) => void;
    openTagEditor?: (id: string, e: MouseEvent) => void;
    actuallyDeleteSession?: (id: string, e: MouseEvent) => void;
    onSessionDragStart?: (event: DragEvent, sessionId: string) => void;
    onSessionDragEnd?: (event: DragEvent) => void;
    loadSession?: (id: string) => void;
    SERVER_SESSIONS_FETCH_FAILED?: boolean;
    retryRecentsFetch?: () => void;
  }
}
