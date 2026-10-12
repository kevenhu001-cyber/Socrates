import React from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { artifactsApi, filesApi } from '../data/api/client';
import { LibraryScreen } from './LibraryScreen';

const mockTranslate = (key: string) => key;
jest.mock('../data/api/client', () => ({
  filesApi: {
    list: jest.fn(), rawUrl: jest.fn((id: string) => `https://example.test/files/${id}`),
    authHeaders: jest.fn(), content: jest.fn(), upload: jest.fn(), rename: jest.fn(), remove: jest.fn(),
  },
  artifactsApi: { list: jest.fn(), get: jest.fn(), rename: jest.fn(), remove: jest.fn() },
}));
jest.mock('../i18n', () => ({ useT: () => mockTranslate }));
jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      text: '#fff', textMuted: '#ccc', textSubtle: '#888', textInverse: '#000', surface: '#111', surfaceRaised: '#222',
      surfaceHover: '#333', border: '#444', borderStrong: '#555', accent: '#0af', background: '#000', danger: '#f44',
    },
    radius: { sm: 6, md: 12, lg: 16, xl: 20, pill: 999 },
    typography: { body: 'body', medium: 'medium', semibold: 'semibold', display: 'display' },
  }),
}));
jest.mock('../theme/responsive', () => ({ useResponsive: () => ({ isCompact: true, isDesktop: false }) }));
jest.mock('../components/AppHeader', () => ({ AppHeader: () => null }));
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
jest.mock('../components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('../components/Overlay', () => {
  const mockReact = require('react');
  const mockRN = require('react-native');
  return { Overlay: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? mockReact.createElement(mockRN.View, null, children) : null };
});
jest.mock('../components/ZoomableImage', () => ({ ZoomableImage: () => null }));
jest.mock('../components/Toast', () => ({ toast: { show: jest.fn() } }));
jest.mock('../native/native', () => ({ native: { pickFile: jest.fn() } }));
jest.mock('../stores/appStore', () => ({ appStore: { startNewSession: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-svg', () => {
  const mockReact = require('react');
  const mockRN = require('react-native');
  const Svg = ({ children, ...props }: any) => mockReact.createElement(mockRN.View, props, children);
  return { __esModule: true, default: Svg, Circle: () => null, Path: () => null, Rect: () => null };
});
jest.mock('react-native-webview', () => ({ WebView: () => null }));

const mockFiles = filesApi as jest.Mocked<typeof filesApi>;
const mockArtifacts = artifactsApi as jest.Mocked<typeof artifactsApi>;

function content(node: { children?: unknown[] }): string {
  return (node.children || []).map((child) => {
    if (typeof child === 'string') return child;
    if (child && typeof child === 'object') return content(child as { children?: unknown[] });
    return '';
  }).join('');
}

function makeScreen() {
  return <LibraryScreen navigation={{ navigate: jest.fn() } as never} route={{ key: 'Library', name: 'Library' } as never} />;
}

const mountedTrees: Array<ReturnType<typeof create>> = [];

function mountScreen() {
  const tree = create(makeScreen());
  mountedTrees.push(tree);
  return tree;
}

const list = (tree: ReturnType<typeof create>) => tree.root.findByType(FlatList);
const containedKeys = (renderedList: ReturnType<typeof list>) => renderedList.props.data.flatMap(
  (row: { items: Array<{ item: { id?: string; __sourceTab?: string }; index: number }> }) => row.items.map(({ item, index }) => `${item.__sourceTab || 'files'}:${item.id || `item-${index}`}`),
);

describe('LibraryScreen', () => {
  beforeEach(() => {
    mountedTrees.length = 0;
    jest.clearAllMocks();
    mockFiles.list.mockResolvedValue({ files: [] });
    mockArtifacts.list.mockResolvedValue({ artifacts: [] });
  });

  afterEach(() => {
    act(() => { mountedTrees.splice(0).forEach((tree) => tree.unmount()); });
  });

  it('passes a large collection through the virtualized list with stable source-qualified keys', async () => {
    const files = Array.from({ length: 64 }, (_, index) => ({ id: `file-${index}`, name: index === 0 ? 'photo-0.png' : `document-${index}.txt`, kind: index === 0 ? 'image' : 'text' }));
    mockFiles.list.mockResolvedValue({ files });
    mockArtifacts.list.mockResolvedValue({ artifacts: [{ id: 'file-0', title: 'shared.png', kind: 'image' }] });
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = mountScreen(); });

    const renderedList = list(tree);
    expect(renderedList.props.data).toHaveLength(65);
    expect(renderedList.props.initialNumToRender).toBe(10);
    expect(renderedList.props.maxToRenderPerBatch).toBe(10);
    expect(renderedList.props.windowSize).toBe(9);
    expect(renderedList.props.numColumns).toBe(1);
    const keys = renderedList.props.data.map((row: { key: string }, index: number) => renderedList.props.keyExtractor(row, index));
    expect(new Set(keys).size).toBe(65);
    expect(keys).toContain('files:file-0');
    expect(keys).toContain('artifacts:file-0');
  });

  it('keeps list/grid content, selection, and filters without clearing selection or remounting the screen', async () => {
    const files = Array.from({ length: 24 }, (_, index) => ({ id: `file-${index}`, name: index === 0 ? 'photo-0.png' : `document-${index}.txt`, kind: index === 0 ? 'image' : 'text' }));
    mockFiles.list.mockResolvedValue({ files });
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = mountScreen(); });

    const initialList = list(tree);
    const stableKeys = containedKeys(initialList);
    const firstCheckbox = tree.root.findAllByProps({ accessibilityRole: 'checkbox' })[0];
    await act(async () => { firstCheckbox.props.onPress?.({} as never); });
    expect(tree.root.findAllByProps({ accessibilityRole: 'checkbox' }).some((button) => button.props.accessibilityState?.checked === true)).toBe(true);

    const gridButton = tree.root.findByProps({ accessibilityLabel: 'library.gridView' });
    await act(async () => { gridButton.props.onPress?.({} as never); });
    expect(containedKeys(list(tree))).toEqual(stableKeys);
    expect(list(tree).props.numColumns).toBe(1);
    expect(tree.root.findAllByProps({ accessibilityRole: 'checkbox' }).some((button) => button.props.accessibilityState?.checked === true)).toBe(true);

    const filterButton = tree.root.findByProps({ accessibilityLabel: 'library.filterByType' });
    await act(async () => { filterButton.props.onPress?.({} as never); });
    const imageFilter = tree.root.findAllByProps({ accessibilityRole: 'radio' }).find((option) => content(option).includes('library.filter.images'));
    await act(async () => { imageFilter?.props.onPress?.({} as never); });
    expect(containedKeys(list(tree))).toEqual(['files:file-0']);
    expect(tree.root.findAllByProps({ accessibilityRole: 'checkbox' }).some((button) => button.props.accessibilityState?.checked === true)).toBe(true);

    const search = tree.root.findByProps({ accessibilityLabel: 'library.filterPlaceholder' }) as unknown as TextInput;
    await act(async () => { (search.props as TextInput['props']).onChangeText?.('photo-0'); });
    expect(list(tree).props.data).toHaveLength(1);
    const listButton = tree.root.findByProps({ accessibilityLabel: 'library.listView' });
    await act(async () => { listButton.props.onPress?.({} as never); });
    expect(list(tree).props.data).toHaveLength(1);
    expect(tree.root.findAllByProps({ accessibilityRole: 'checkbox' }).some((button) => button.props.accessibilityState?.checked === true)).toBe(true);
    expect(tree.root.findAllByType(FlatList)).toHaveLength(1);
  });
});
