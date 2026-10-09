import { getCurrentLang } from '../legacy/gateway.ts';
import type { SessionProjectOption } from './types';

interface SessionMenuProjectPickerProps {
  projects: SessionProjectOption[];
  saving: boolean;
  onBack: () => void;
  onChoose: (projectId: string) => void;
}

export function SessionMenuProjectPicker({
  projects,
  saving,
  onBack,
  onChoose,
}: SessionMenuProjectPickerProps) {
  const copy = (zh: string, en: string) => getCurrentLang() === 'zh' ? zh : en;
  return (
    <>
      <button role="menuitem" onClick={onBack}>{copy('返回', 'Back')}</button>
      {projects.length
        ? projects.map((project) => (
          <button
            key={project.id}
            role="menuitem"
            disabled={saving}
            onClick={() => onChoose(project.id)}
          >{project.name}</button>
        ))
        : <span>{copy('暂无项目，请先创建项目', 'Create a project first')}</span>}
    </>
  );
}
