import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { RichBlock } from './RichBlock';

const mockInjectJavaScript = jest.fn();

jest.mock('react-native-webview', () => {
  const ReactNative = require('react');
  const Native = require('react-native');
  return {
    WebView: ReactNative.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      ReactNative.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }), []);
      return ReactNative.createElement(Native.View, {
        testID: 'richblock-test-webview',
        source: props.source,
        onMessage: props.onMessage,
        onLoadStart: props.onLoadStart,
      });
    }),
  };
});

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      text: '#111111', textSubtle: '#666666', background: '#ffffff', codeBg: '#f0f0f0',
      codeFg: '#111111', accent: '#2255cc', danger: '#cc2222', success: '#228844',
      statusBarStyle: 'dark', surfaceRaised: '#f7f7f7', border: '#dddddd',
    },
    typography: { body: 'System', mono: 'Monospace' },
  }),
}));
jest.mock('../i18n', () => ({ useT: () => (key: string) => key }));
jest.mock('../native/native', () => ({ native: { openBrowser: jest.fn() } }));
jest.mock('../components/Overlay', () => ({ Overlay: () => null }));

function element(body: string) {
  return (
    <RichBlock
      body={body}
      libs={['katex']}
      fallbackText={body}
      center={false}
      initialHeight={24}
      dynamicBody
    />
  );
}

describe('RichBlock dynamic body', () => {
  let tree: ReactTestRenderer | null = null;

  beforeEach(() => mockInjectJavaScript.mockClear());
  afterEach(async () => {
    if (tree) await act(async () => { tree?.unmount(); });
    tree = null;
  });

  it('keeps one stable WebView source while updating the math DOM in place', async () => {
    await act(async () => { tree = create(element('<span data-math="x">x</span>')); });
    const view = () => tree!.root.findByProps({ testID: 'richblock-test-webview' });
    const source = view().props.source;
    expect(source.html).toContain('<div id="root"></div>');
    expect(source.html).not.toContain('data-math="x"');

    await act(async () => {
      view().props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'ready' }) } });
    });
    expect(mockInjectJavaScript).toHaveBeenCalledWith(expect.stringContaining('window.__setRichBody'));

    await act(async () => { tree!.update(element('<span data-math="x+1">x+1</span>')); });
    expect(view().props.source).toBe(source);
    expect(view().props.source.html).not.toContain('data-math="x+1"');
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(expect.stringContaining('x+1'));
  });

  it('keeps the bridge argument safe when the HTML contains script delimiters', async () => {
    await act(async () => { tree = create(element('<span>before</span>')); });
    const view = tree!.root.findByProps({ testID: 'richblock-test-webview' });
    await act(async () => {
      view.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'ready' }) } });
    });
    mockInjectJavaScript.mockClear();
    await act(async () => { tree!.update(element('<span>\u2028</span><script>window.x=1</script>')); });
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockInjectJavaScript.mock.calls[0][0]).toContain('window.__setRichBody');
    expect(mockInjectJavaScript.mock.calls[0][0]).toContain('\\u2028');
  });
});
