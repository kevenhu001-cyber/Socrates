export interface ProjectChip {
  kind: 'project';
  id: string;
  name: string;
  value: string;
}

export interface TagChip {
  kind: 'tag';
  value: string;
  label: string;
}

export interface AllChip {
  kind: 'all';
}

export type ChipDescriptor = (AllChip | ProjectChip | TagChip) & { active: boolean };

export function buildChips(
  currentFilter: string | null,
  projects: ReadonlyArray<{ id: string; name: string }>,
  knownTags: ReadonlyArray<string>,
): ChipDescriptor[] {
  const chips: ChipDescriptor[] = [{ kind: 'all', active: !currentFilter || currentFilter === 'all' }];

  projects.forEach((project) => {
    const value = `project:${project.id}`;
    chips.push({ kind: 'project', id: project.id, name: project.name, value, active: currentFilter === value });
  });

  const tags = knownTags.slice(0, 8);
  const tagSet = new Set(tags);
  if (currentFilter && !currentFilter.startsWith('project:') && !tagSet.has(currentFilter)) {
    tags.push(currentFilter);
  }
  tags.forEach((tag) => {
    chips.push({ kind: 'tag', value: tag, label: `#${tag}`, active: currentFilter === tag });
  });

  return chips;
}
