import {
  deleteCustomTemplate,
  filterPromptTemplates,
  findTemplateByShortcut,
  getCustomTemplates,
  getPromptTemplates,
  hydratePromptTemplates,
  MOBILE_PROMPT_TEMPLATES,
  syncPromptTemplates,
  upsertCustomTemplate,
  validateCustomTemplate,
  type MobilePromptTemplate,
} from './prompts';
import { promptsApi } from '../api/client';

const mockMemory = new Map<string, string>();
jest.mock('../../platform/secureStorage', () => ({
  getItem: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockMemory.set(key, value); }),
  deleteItem: jest.fn(async (key: string) => { mockMemory.delete(key); }),
}));
jest.mock('../api/client', () => ({
  promptsApi: {
    listMine: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));
const mockPromptsApi = promptsApi as jest.Mocked<typeof promptsApi>;

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
    jest.clearAllMocks();
    mockPromptsApi.listMine.mockResolvedValue({ templates: [], nextCursor: null });
    mockPromptsApi.create.mockRejectedValue(new Error('offline'));
    mockPromptsApi.update.mockRejectedValue(new Error('offline'));
    mockPromptsApi.remove.mockRejectedValue(new Error('offline'));
    mockMemory.clear();
    await hydratePromptTemplates();
    await syncPromptTemplates(true);
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

  it('pulls account templates and maps server rows into the slash palette', async () => {
    mockPromptsApi.listMine.mockResolvedValue({
      templates: [{ id: '9b43572f-b3af-46f1-8a96-183798d5df72', title: 'Remote', description: 'Synced', body: 'Do the task', icon: '✨', category: 'work', shortcut: '/remote', systemPrompt: 'Stay focused' }],
      nextCursor: null,
    });
    await syncPromptTemplates(true);
    expect(getCustomTemplates()).toEqual([expect.objectContaining({ id: '9b43572f-b3af-46f1-8a96-183798d5df72', title: 'Remote', shortcut: '/remote', systemPrompt: 'Stay focused', isBuiltin: false })]);
    expect(findTemplateByShortcut('/remote')?.body).toBe('Do the task');
  });

  it('follows server cursors until all account pages are loaded', async () => {
    mockPromptsApi.listMine.mockClear();
    mockPromptsApi.listMine
      .mockResolvedValueOnce({
        templates: [{ id: '9b43572f-b3af-46f1-8a96-183798d5df72', title: 'First', shortcut: '/first', body: 'One' }],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        templates: [{ id: '2c8fe3a4-98b5-4e55-aa1d-b7b866d89cc0', title: 'Second', shortcut: '/second', body: 'Two' }],
        nextCursor: null,
      });
    await syncPromptTemplates(true);
    expect(mockPromptsApi.listMine).toHaveBeenNthCalledWith(1, null);
    expect(mockPromptsApi.listMine).toHaveBeenNthCalledWith(2, 'cursor-2');
    expect(getCustomTemplates().map((template) => template.id)).toEqual([
      '9b43572f-b3af-46f1-8a96-183798d5df72',
      '2c8fe3a4-98b5-4e55-aa1d-b7b866d89cc0',
    ]);
  });

  it('pushes a pending local custom once and adopts the server UUID', async () => {
    const local = custom({ id: 'tpl-offline', shortcut: '/offline' });
    mockMemory.set('socrates-prompt-templates', JSON.stringify([local]));
    mockPromptsApi.create.mockResolvedValue({ ...local, id: '2c8fe3a4-98b5-4e55-aa1d-b7b866d89cc0' });
    await hydratePromptTemplates();
    await syncPromptTemplates(true);
    expect(mockPromptsApi.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'My skill', shortcut: '/offline', body: 'Body:\n' }));
    expect(getCustomTemplates()[0].id).toBe('2c8fe3a4-98b5-4e55-aa1d-b7b866d89cc0');
  });
});
