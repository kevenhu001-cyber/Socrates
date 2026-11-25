import { Icon } from '../../../legacy/Icon';
import { Button } from '../../ui/shadcn/button';
import { useMemo, useState, type ReactNode } from 'react';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { ProjectItem } from './types';
import { i18n, MoreIcon, projectMeta } from './workspaceUi';
import { PageEmptyState } from '../../ui/page/PageEmptyState';
import { PageFrame } from '../../ui/page/PageFrame';
import { PageHeader } from '../../ui/page/PageHeader';
import { PageSearchField } from '../../ui/page/PageSearchField';
import { PageTabs } from '../../ui/page/PageTabs';
import { PageToolbar } from '../../ui/page/PageToolbar';

type ProjectScope = 'all' | 'owned' | 'shared';

function ProjectRow({
  project,
  dispatch,
}: Readonly<{
  project: ProjectItem;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}>) {
  const color = /^#[0-9a-f]{3,8}$/i.test(project.color || '')
    ? project.color!
    : 'var(--ui-text-secondary)';
  return (
    <div className="ui-page-card project-card project-row" key={project.id}>
      <Button
        variant="ghost"
        type="button"
        className="project-main ui-page-card-main"
        onClick={() => dispatch.openProject(project.id)}
      >
        <span className="project-icon" style={{ color }}>
          <Icon name="folder" size={22} />
        </span>
        <span className="workspace-row-copy">
          <strong>{project.name}</strong>
          <span>{projectMeta(project)}</span>
        </span>
      </Button>
      <Button
        variant="ghost"
        type="button"
        size="icon-sm"
        className="workspace-row-action workspace-icon-action"
        aria-label={i18n('projects.edit', 'Edit')}
        title={i18n('projects.edit', 'Edit')}
        onClick={(e) => {
          e.stopPropagation();
          dispatch.editProject(project.id);
        }}
      >
        <MoreIcon />
      </Button>
    </div>
  );
}

function ProjectsView({
  projects,
  dispatch,
}: Readonly<{
  projects: ReadonlyArray<ProjectItem>;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}>) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ProjectScope>('all');
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped = projects.filter((project) => {
      if (scope === 'all') return true;
      /* APIs may expose either `shared`/`isShared` or a visibility marker;
         absent metadata stays in the owned bucket without inventing a
         sharing state for a real project. */
      const isShared =
        project.shared === true || project.isShared === true || project.visibility === 'shared';
      return scope === 'shared' ? isShared : !isShared;
    });
    if (!needle) return scoped;
    return scoped.filter((project) =>
      [project.name, project.description].filter(Boolean).join(' ').toLowerCase().includes(needle),
    );
  }, [projects, query, scope]);

  const scopeItems = [
    { value: 'all' as const, label: i18n('projects.all', 'All') },
    { value: 'owned' as const, label: i18n('projects.owned', 'Created by you') },
    { value: 'shared' as const, label: i18n('projects.shared', 'Shared with you') },
  ];

  let body: ReactNode;
  if (projects.length === 0) {
    body = (
      <PageEmptyState
        title={i18n('projects.empty', 'Make space for ongoing work')}
        description={i18n(
          'projects.emptyDesc',
          'Projects keep related chats, files, and instructions together.',
        )}
        action={
          <Button variant="default" type="button" onClick={() => dispatch.createProject()}>
            {i18n('projects.create', 'Create project')}
          </Button>
        }
      />
    );
  } else if (visibleProjects.length === 0) {
    body = (
      <PageEmptyState
        title={i18n('projects.noMatch', 'No matching projects')}
        description={i18n('projects.noMatchDesc', 'Try a different search.')}
      />
    );
  } else {
    body = (
      <>
        <div className="ui-page-section-head projects-list-heading">
          <h2>{i18n('projects.allProjects', 'All projects')}</h2>
          <span>{visibleProjects.length}</span>
        </div>
        <div className="ui-card-grid ui-project-grid projects-list">
          {visibleProjects.map((project) => (
            <ProjectRow key={project.id} project={project} dispatch={dispatch} />
          ))}
        </div>
      </>
    );
  }

  return (
    <PageFrame className="projects-directory" aria-labelledby="projects-directory-title">
      <PageHeader
        titleId="projects-directory-title"
        title={i18n('sidebar.spaces.title', 'Projects')}
        description={i18n(
          'projects.directoryDesc',
          'Keep related chats, files, and instructions together.',
        )}
        actions={
          <Button
            variant="default"
            type="button"
            className="projects-create-button"
            onClick={() => dispatch.createProject()}
          >
            <Icon name="plus" size={18} />
            <span>{i18n('projects.new', 'New')}</span>
          </Button>
        }
      />
      <PageToolbar>
        <PageSearchField
          label={i18n('projects.search', 'Search projects')}
          query={query}
          onQuery={setQuery}
        />
        <div className="ui-page-toolbar-end">
          <PageTabs
            items={scopeItems}
            value={scope}
            onChange={setScope}
            ariaLabel={i18n('projects.filter', 'Project filter')}
          />
        </div>
      </PageToolbar>
      {body}
    </PageFrame>
  );
}

export { ProjectsView };
