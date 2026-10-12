import React from 'react';
import { FlatList, Image, Pressable, Text, TextInput, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { creationsApi, filesApi } from '../data/api/client';
import { CreationsScreen } from './CreationsScreen';

const mockTranslate = (key: string) => key;
jest.mock('../data/api/client', () => ({
  creationsApi: {
    listImages: jest.fn(),
    createImage: jest.fn(),
    editImage: jest.fn(),
    listAssistants: jest.fn(),
    createAssistant: jest.fn(),
    updateAssistant: jest.fn(),
    deleteAssistant: jest.fn(),
  },
  filesApi: { authHeaders: jest.fn(), rawUrl: jest.fn((id: string) => `https://example.test/files/${id}`) },
}));
jest.mock('../i18n', () => ({ useT: () => mockTranslate }));
jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      text: '#fff', textMuted: '#ccc', textSubtle: '#888', surface: '#111', surfaceRaised: '#222',
      border: '#444', accent: '#0af', background: '#000', danger: '#f44', success: '#4c4',
    },
    radius: { sm: 6, md: 12 },
    spacing: { md: 16 },
    typography: { body: 'body', medium: 'medium', semibold: 'semibold' },
  }),
}));
jest.mock('../components/AppHeader', () => {
  const mockReact = require('react');
  const mockRN = require('react-native');
  return { AppHeader: ({ title }: { title: string }) => mockReact.createElement(mockRN.Text, null, title) };
});
jest.mock('../components/Screen', () => {
  const mockReact = require('react');
  const mockRN = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => mockReact.createElement(mockRN.View, null, children) };
});
jest.mock('../components/AnimatedPressable', () => {
  const mockReact = require('react');
  const mockRN = require('react-native');
  return { AnimatedPressable: (props: any) => mockReact.createElement(mockRN.Pressable, props) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const mockCreations = creationsApi as jest.Mocked<typeof creationsApi>;
const mockFiles = filesApi as jest.Mocked<typeof filesApi>;
const mountedTrees: Array<ReturnType<typeof create>> = [];

function content(node: { children?: unknown[] }): string {
  return (node.children || []).map((child) => {
    if (typeof child === 'string') return child;
    if (child && typeof child === 'object') return content(child as { children?: unknown[] });
    return '';
  }).join('');
}

function buttonWithText(root: ReturnType<typeof create>['root'], label: string) {
  return root.findAllByProps({ accessibilityRole: 'button' }).find((button) => content(button).includes(label));
}

function mountScreen() {
  const tree = create(<CreationsScreen navigation={{ navigate: jest.fn() } as never} route={{ key: 'Creations', name: 'Creations' } as never} />);
  mountedTrees.push(tree);
  return tree;
}

describe('CreationsScreen', () => {
  beforeEach(() => {
    mountedTrees.length = 0;
    jest.clearAllMocks();
    mockCreations.listImages.mockResolvedValue({ images: [] });
    mockCreations.listAssistants.mockResolvedValue({ items: [] });
    mockFiles.authHeaders.mockResolvedValue({});
  });

  afterEach(() => {
    act(() => { mountedTrees.splice(0).forEach((tree) => tree.unmount()); });
  });

  it('submits an image request through the existing creation API', async () => {
    mockCreations.createImage.mockResolvedValue({ id: 'image-1', name: 'scene.png', url: '/api/files/image-1/raw' });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = mountScreen();
    });
    const prompt = tree.root.findByProps({ accessibilityLabel: 'creations.prompt' }) as unknown as TextInput;
    await act(async () => { (prompt.props as TextInput['props']).onChangeText?.('A blue mountain at dawn'); });
    const generate = buttonWithText(tree.root, 'creations.generate');
    expect(generate).toBeTruthy();
    await act(async () => { generate?.props.onPress?.({} as never); });
    expect(mockCreations.createImage).toHaveBeenCalledWith('A blue mountain at dawn', undefined);
    expect(mockCreations.listImages).toHaveBeenCalledTimes(2);
  });

  it('opens and saves an assistant using the server JSON source contract', async () => {
    mockCreations.createAssistant.mockResolvedValue({ id: 'assistant-1', title: 'Study guide', source: '{}' });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = mountScreen();
    });
    const assistantTab = tree.root.findAllByProps({ accessibilityRole: 'tab' })
      .find((tab) => content(tab).includes('creations.assistants'));
    expect(assistantTab).toBeTruthy();
    await act(async () => { assistantTab?.props.onPress?.({} as never); });
    const newAssistant = buttonWithText(tree.root, 'creations.createAssistant');
    expect(newAssistant).toBeTruthy();
    await act(async () => { newAssistant?.props.onPress?.({} as never); });

    const name = tree.root.findByProps({ accessibilityLabel: 'creations.name' });
    const description = tree.root.findByProps({ accessibilityLabel: 'creations.description' });
    const instructions = tree.root.findByProps({ accessibilityLabel: 'creations.instructions' });
    const starter = tree.root.findByProps({ accessibilityLabel: 'creations.starter' });
    await act(async () => {
      name.props.onChangeText('Study guide');
      description.props.onChangeText('Helps me review');
      instructions.props.onChangeText('Explain concepts, then quiz me.');
      starter.props.onChangeText('Start with chapter one.');
    });
    const save = buttonWithText(tree.root, 'common.done');
    expect(save).toBeTruthy();
    await act(async () => { save?.props.onPress?.({} as never); });
    expect(mockCreations.createAssistant).toHaveBeenCalledWith({
      title: 'Study guide',
      source: JSON.stringify({ description: 'Helps me review', instructions: 'Explain concepts, then quiz me.', starter: 'Start with chapter one.' }),
    });
  });

  it('virtualizes long image collections and keeps stable keys while filtering', async () => {
    const images = Array.from({ length: 72 }, (_, index) => ({ id: `image-${index}`, name: `scene-${index}.png` }));
    mockCreations.listImages.mockResolvedValue({ images });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = mountScreen();
    });

    const initialList = tree.root.findByType(FlatList);
    expect(initialList.props.data).toHaveLength(72);
    expect(initialList.props.initialNumToRender).toBe(6);
    expect(initialList.props.maxToRenderPerBatch).toBe(8);
    expect(initialList.props.windowSize).toBe(7);
    expect(initialList.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
    expect(tree.root.findAllByType(Image).length).toBeLessThan(images.length);
    const keys = initialList.props.data.map((item: { id: string }, index: number) => initialList.props.keyExtractor(item, index));
    expect(new Set(keys).size).toBe(72);
    expect(keys[0]).toBe('images:image-0');

    const search = tree.root.findByProps({ accessibilityLabel: 'creations.search' }) as unknown as TextInput;
    await act(async () => { (search.props as TextInput['props']).onChangeText?.('scene-71'); });
    const filteredList = tree.root.findByType(FlatList);
    expect(filteredList.props.data).toHaveLength(1);
    expect(filteredList.props.keyExtractor(filteredList.props.data[0], 0)).toBe('images:image-71');
  });

  it('keeps the loaded collection and image fallback steady after a refresh error', async () => {
    const images = Array.from({ length: 18 }, (_, index) => ({ id: `loaded-${index}`, name: `loaded-${index}.png` }));
    mockCreations.listImages.mockResolvedValue({ images });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = mountScreen();
    });

    const firstImage = tree.root.findAllByType(Image)[0];
    await act(async () => { firstImage.props.onError?.({ nativeEvent: {} }); });
    expect(tree.root.findAllByType(Text).some((node) => content(node) === 'creations.loadFailed')).toBe(true);

    mockCreations.listImages.mockRejectedValueOnce(new Error('offline'));
    const list = tree.root.findByType(FlatList);
    await act(async () => { await list.props.refreshControl.props.onRefresh(); });
    const refreshedList = tree.root.findByType(FlatList);
    expect(refreshedList.props.data).toHaveLength(18);
    expect(tree.root.findAllByType(Text).some((node) => content(node) === 'creations.loadFailed')).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => content(node) === 'common.retry')).toBe(true);
  });

  it('shows the initial loading state and then the localized empty state without replacing the list', async () => {
    let resolveImages!: (result: { images: Array<{ id: string; name: string }> }) => void;
    mockCreations.listImages.mockReturnValue(new Promise((resolve) => { resolveImages = resolve; }));
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = mountScreen();
      await Promise.resolve();
    });
    const listBeforeResolve = tree.root.findByType(FlatList);
    expect(tree.root.findAllByType(Text).some((node) => content(node) === 'app.loading')).toBe(true);
    expect(listBeforeResolve.props.data).toHaveLength(0);

    await act(async () => { resolveImages({ images: [] }); });
    const listAfterResolve = tree.root.findByType(FlatList);
    expect(listAfterResolve.props.data).toHaveLength(0);
    expect(tree.root.findAllByType(Text).some((node) => content(node) === 'creations.emptyImages')).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => content(node) === 'app.loading')).toBe(false);
  });

  it('virtualizes a long assistant collection with namespaced stable keys', async () => {
    mockCreations.listAssistants.mockResolvedValue({
      items: Array.from({ length: 44 }, (_, index) => ({ id: `assistant-${index}`, title: `Assistant ${index}`, source: '{}' })),
    });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = mountScreen();
    });
    const assistantTab = tree.root.findAllByProps({ accessibilityRole: 'tab' })
      .find((tab) => content(tab).includes('creations.assistants'));
    await act(async () => { assistantTab?.props.onPress?.({} as never); });
    const list = tree.root.findByType(FlatList);
    expect(list.props.data).toHaveLength(44);
    const keys = list.props.data.map((item: { id: string }, index: number) => list.props.keyExtractor(item, index));
    expect(new Set(keys).size).toBe(44);
    expect(keys[0]).toBe('assistants:assistant-0');
    expect(tree.root.findAllByType(View).length).toBeGreaterThan(0);
  });
});
