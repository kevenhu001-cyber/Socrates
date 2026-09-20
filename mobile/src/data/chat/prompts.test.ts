import {
  deleteCustomTemplate,
  filterPromptTemplates,
  findTemplateByShortcut,
  getCustomTemplates,
  getPromptTemplates,
  hydratePromptTemplates,
  MOBILE_PROMPT_TEMPLATES,
  upsertCustomTemplate,
  validateCustomTemplate,
  type MobilePromptTemplate,
} from './prompts';

const mockMemory = new Map<string, string>();
jest.mock('../../platform/secureStorage', () => ({
  getItem: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockMemory.set(key, value); }),
  deleteItem: jest.fn(async (key: string) => { mockMemory.delete(key); }),
}));

const custom = (overrides: Partial<MobilePromptTemplate>): MobilePromptTemplate => ({
  id: 'tpl-test1',
  title: 'My skill',
  description: 'Custom skill',
  icon: '✨',
  shortcut: '/my-skill',
  body: 'Body:\n',
  systemPrompt: 'Custom system prompt',
  isBuiltin: false,
  ...overrides,
});

describe('prompt template store', () => {
  beforeEach(async () => {
    mockMemory.clear();
    await hydratePromptTemplates();
  });

  it('serves only the six built-ins before any custom save', () => {
    expect(getPromptTemplates()).toHaveLength(MOBILE_PROMPT_TEMPLATES.length);
    expect(getCustomTemplates()).toHaveLength(0);
    expect(getPromptTemplates().every((template) => template.isBuiltin)).toBe(true);
  });

  it('hydrates persisted customs and merges them into the palette list', async () => {
    mockMemory.set('socrates-prompt-templates', JSON.stringify([custom({})]));
    await hydratePromptTemplates();
    const all = getPromptTemplates();
    expect(all).toHaveLength(MOBILE_PROMPT_TEMPLATES.length + 1);
    expect(getCustomTemplates()).toHaveLength(1);
    expect(findTemplateByShortcut('/my-skill')?.title).toBe('My skill');
    expect(filterPromptTemplates('my-skill')[0]?.id).toBe('tpl-test1');
  });

  it('a custom row overrides a built-in on shortcut collision (web merge rule)', async () => {
    await upsertCustomTemplate(custom({ id: 'tpl-mine', shortcut: '/summarize', title: 'Mine summarize' }));
    const all = getPromptTemplates();
    expect(all).toHaveLength(MOBILE_PROMPT_TEMPLATES.length);
    const hit = findTemplateByShortcut('/summarize');
    expect(hit?.title).toBe('Mine summarize');
    expect(hit?.isBuiltin).toBe(false);
  });

  it('upsert edits in place by id and delete removes it', async () => {
    await upsertCustomTemplate(custom({}));
    await upsertCustomTemplate(custom({ title: 'Renamed' }));
    expect(getCustomTemplates()).toHaveLength(1);
    expect(getCustomTemplates()[0].title).toBe('Renamed');

    const persisted = JSON.parse(mockMemory.get('socrates-prompt-templates') || '[]');
    expect(persisted).toHaveLength(1);
    expect(persisted[0].isBuiltin).toBe(false);

    await deleteCustomTemplate('tpl-test1');
    expect(getCustomTemplates()).toHaveLength(0);
    expect(findTemplateByShortcut('/my-skill')).toBeNull();
  });

  it('validates like the web editor: title, format, uniqueness', () => {
    expect(validateCustomTemplate({ title: '', shortcut: '/x' })).toBe('title-required');
    expect(validateCustomTemplate({ title: 'T', shortcut: 'my-skill' })).toBe('shortcut-invalid');
    expect(validateCustomTemplate({ title: 'T', shortcut: '/My_Skill' })).toBe('shortcut-invalid');
    /* /summarize collides with a built-in. */
    expect(validateCustomTemplate({ title: 'T', shortcut: '/summarize' })).toBe('shortcut-taken');
    /* Editing keeps the same id — self-collision is allowed. */
    expect(validateCustomTemplate({ id: 'tpl-summarize', title: 'T', shortcut: '/summarize' })).toBe('ok');
    expect(validateCustomTemplate({ title: 'T', shortcut: '/fresh-skill' })).toBe('ok');
  });
});
