import { useMemo, useState } from 'react';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { ProjectItem } from './types';
import { i18n, MoreIcon, projectMeta, WorkspacePageHeader } from './workspaceUi';

function ProjectsView({ projects, dispatch }: {
  projects: ReadonlyArray<ProjectItem>;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'owned' | 'shared'>('all');
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped = projects.filter((project) => {
      if (scope === 'all') return true;
      /* APIs may expose either `shared`/`isShared` or a visibility marker;
         absent metadata stays in the owned bucket without inventing a
         sharing state for a real project. */
      const isShared = project.shared === true || project.isShared === true || project.visibility === 'shared';
      return scope === 'shared' ? isShared : !isShared;
    });
    if (!needle) return scoped;
    return scoped.filter((project) => [project.name, project.description].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [projects, query, scope]);

  const projectTabs = (
    <div className="projects-filter-tabs" role="tablist" aria-label={i18n('projects.filter', 'Project filter')}>
      <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>{i18n('projects.all', 'All')}</button>
      <button type="button" role="tab" aria-selected={scope === 'owned'} className={scope === 'owned' ? 'active' : ''} onClick={() => setScope('owned')}>{i18n('projects.owned', 'Created by you')}</button>
      <button type="button" role="tab" aria-selected={scope === 'shared'} className={scope === 'shared' ? 'active' : ''} onClick={() => setScope('shared')}>{i18n('projects.shared', 'Shared with you')}</button>
    </div>
  );

  return (
    <section className="workspace-surface projects-directory" aria-labelledby="projects-directory-title">
      <WorkspacePageHeader
        title={i18n('sidebar.spaces.title', 'Projects')}
        description={i18n('projects.directoryDesc', 'Keep related chats, files, and instructions together.')}
        query={query}
        onQuery={setQuery}
        actionLabel={i18n('projects.new', 'New')}
        onAction={() => dispatch.createProject()}
        compactAction
      />
      {projectTabs}
      {projects.length === 0 ? (
        <div className="workspace-empty"><strong>{i18n('projects.empty', 'Make space for ongoing work')}</strong><span>{i18n('projects.emptyDesc', 'Projects keep related chats, files, and instructions together.')}</span><button className="workspace-primary" onClick={() => dispatch.createProject()}>{i18n('projects.create', 'Create project')}</button></div>
      ) : (
        <div className="projects-list">
          <div className="projects-list-heading">{i18n('projects.name', 'Name')}</div>
          {visibleProjects.map((project) => {
            const color = /^#[0-9a-f]{3,8}$/i.test(project.color || '') ? project.color! : 'hsl(var(--accent-000))';
            return (
              <div className="workspace-row project-row" key={project.id}>
                <button className="project-main" onClick={() => dispatch.openProject(project.id)}>
                  <span className="project-icon" style={{ color }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17z" /></svg></span>
                  <span className="workspace-row-copy">
                    <strong>{project.name}</strong>
                    <span>{projectMeta(project)}</span>
                  </span>
                </button>
                <button className="workspace-row-action workspace-icon-action" aria-label={i18n('projects.edit', 'Edit')} title={i18n('projects.edit', 'Edit')} onClick={(e) => { e.stopPropagation(); dispatch.editProject(project.id); }}><MoreIcon /></button>
              </div>
            );
          })}
          {visibleProjects.length === 0 ? <div className="workspace-empty"><strong>{i18n('projects.noMatch', 'No matching projects')}</strong><span>{i18n('projects.noMatchDesc', 'Try a different search.')}</span></div> : null}
        </div>
      )}
    </section>
  );
}

export { ProjectsView };
