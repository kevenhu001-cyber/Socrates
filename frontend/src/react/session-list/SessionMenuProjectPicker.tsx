import { getCurrentLang } from '../legacy/gateway.ts';
import type { RefObject } from 'react';
import type { FoundationMenuItem } from '../menu/FoundationMenu';
import type { SessionProjectOption } from './types';

interface SessionMenuProjectPickerProps {
  Item: typeof FoundationMenuItem;
  focusRef: RefObject<HTMLElement | null>;
  projects: SessionProjectOption[];
  saving: boolean;
  loading: boolean;
  error: string;
  onRetry?: () => void;
  onBack: () => void;
  onChoose: (projectId: string) => void;
}

export function SessionMenuProjectPicker({
  projects,
  Item,
  focusRef,
  saving,
  loading,
  error,
  onRetry,
  onBack,
  onChoose,
}: SessionMenuProjectPickerProps) {
  const copy = (zh: string, en: string) => getCurrentLang() === 'zh' ? zh : en;
  return (
    <>
      <Item ref={focusRef} className="recent-item-menu-row" closeOnClick={false} onClick={onBack}>{copy('返回', 'Back')}</Item>
      {loading ? <span role="status">{copy('正在加载项目…', 'Loading projects…')}</span> : projects.length
        ? projects.map((project) => (
          <Item
            key={project.id}
            className="recent-item-menu-row"
            closeOnClick={false}
            disabled={saving}
            onClick={() => onChoose(project.id)}
          ><span className="recent-item-action-text">{project.name}</span></Item>
        ))
        : !error && <span>{copy('暂无项目，请先创建项目', 'Create a project first')}</span>}
      {error && <span role="alert">{error}</span>}
      {saving && <span role="status">{copy('正在保存…', 'Saving…')}</span>}
      {onRetry && <Item className="recent-item-menu-row" closeOnClick={false} onClick={onRetry}>{copy('重试', 'Retry')}</Item>}
    </>
  );
}
