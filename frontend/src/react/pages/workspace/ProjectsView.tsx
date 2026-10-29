import { Button } from '../../ui/shadcn/button';
import { ToggleGroup, ToggleGroupItem } from '../../ui/shadcn/toggle-group';
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
    <ToggleGroup className="projects-filter-tabs" value={[scope]} aria-label={i18n('projects.filter', 'Project filter')}
      onValueChange={(values) => {
        const nextScope = values[0];
        if (nextScope === 'all' || nextScope === 'owned' || nextScope === 'shared') setScope(nextScope);
      }}>
      <ToggleGroupItem type="button" value="all">{i18n('projects.all', 'All')}</ToggleGroupItem>
      <ToggleGroupItem type="button" value="owned">{i18n('projects.owned', 'Created by you')}</ToggleGroupItem>
      <ToggleGroupItem type="button" value="shared">{i18n('projects.shared', 'Shared with you')}</ToggleGroupItem>
    </ToggleGroup>
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
        <div className="workspace-empty"><strong>{i18n('projects.empty', 'Make space for ongoing work')}</strong><span>{i18n('projects.emptyDesc', 'Projects keep related chats, files, and instructions together.')}</span><Button variant="default" type="button" onClick={() => dispatch.createProject()}>{i18n('projects.create', 'Create project')}</Button></div>
      ) : (
        <div className="projects-list">
          <div className="projects-list-heading">{i18n('projects.name', 'Name')}</div>
          {visibleProjects.map((project) => {
            const color = /^#[0-9a-f]{3,8}$/i.test(project.color || '') ? project.color! : 'hsl(var(--accent-000))';
            return (
              <div className="workspace-row project-row" key={project.id}>
                <Button variant="ghost" type="button" className="project-main" onClick={() => dispatch.openProject(project.id)}>
                  <span className="project-icon" style={{ color }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17z" /></svg></span>
                  <span className="workspace-row-copy">
                    <strong>{project.name}</strong>
                    <span>{projectMeta(project)}</span>
                  </span>
                </Button>
                <Button variant="ghost" type="button" size="icon-sm" className="workspace-row-action workspace-icon-action" aria-label={i18n('projects.edit', 'Edit')} title={i18n('projects.edit', 'Edit')} onClick={(e) => { e.stopPropagation(); dispatch.editProject(project.id); }}><MoreIcon /></Button>
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
