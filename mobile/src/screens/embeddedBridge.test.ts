import { isEmbeddedTarget, parseBridgeMessage } from './embeddedBridge';

describe('embedded WebView bridge', () => {
  it('accepts only typed first-party messages', () => {
    expect(parseBridgeMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseBridgeMessage('{"type":"navigate","target":"knowledge"}')).toEqual({ type: 'navigate', target: 'knowledge' });
    expect(parseBridgeMessage('{"type":"download","url":"https://app.topodrive.top/file","filename":"notes.pdf"}')).toEqual({ type: 'download', url: 'https://app.topodrive.top/file', filename: 'notes.pdf' });
    expect(parseBridgeMessage('{"type":"navigate","target":"https://evil.example"}')).toBeNull();
    expect(parseBridgeMessage('{"type":"openExternal","url":42}')).toBeNull();
    expect(parseBridgeMessage('not-json')).toBeNull();
  });

  it('keeps target routing constrained to the allow-list', () => {
    expect(isEmbeddedTarget('projects')).toBe(true);
    expect(isEmbeddedTarget('api-settings')).toBe(true);
    expect(isEmbeddedTarget('../projects')).toBe(false);
    expect(isEmbeddedTarget(null)).toBe(false);
  });
});
