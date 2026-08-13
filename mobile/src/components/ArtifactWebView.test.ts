import { isSafeArtifactHtml, parseArtifactMessage, safeArtifactHtml } from './artifactBridge';

describe('artifact WebView bridge', () => {
  const artifactId = 'artifact-1';

  it('accepts only messages in the typed protocol', () => {
    expect(parseArtifactMessage(JSON.stringify({ type: 'ready', artifactId }), artifactId)).toEqual({ type: 'ready', artifactId });
    expect(parseArtifactMessage(JSON.stringify({ type: 'resize', height: 240.2 }), artifactId)).toEqual({ type: 'resize', height: 241 });
    expect(parseArtifactMessage(JSON.stringify({ type: 'openLink', url: 'https://example.com/path' }), artifactId)).toEqual({ type: 'openLink', url: 'https://example.com/path' });
  });

  it('rejects malformed, cross-artifact and dangerous messages', () => {
    expect(parseArtifactMessage('not json', artifactId)).toBeNull();
    expect(parseArtifactMessage(JSON.stringify({ type: 'ready', artifactId: 'other' }), artifactId)).toBeNull();
    expect(parseArtifactMessage(JSON.stringify({ type: 'openLink', url: 'javascript:alert(1)' }), artifactId)).toBeNull();
    expect(parseArtifactMessage(JSON.stringify({ type: 'resize', height: 60_000 }), artifactId)).toBeNull();
  });

  it('does not pass active generated markup through to the WebView', () => {
    expect(isSafeArtifactHtml('<svg><rect width="20" /></svg>')).toBe(true);
    expect(isSafeArtifactHtml('<script>alert(1)</script>')).toBe(false);
    expect(isSafeArtifactHtml('<img onerror="alert(1)" />')).toBe(false);
    expect(safeArtifactHtml('<script>alert(1)</script>')).toContain('&lt;script&gt;');
  });
});
