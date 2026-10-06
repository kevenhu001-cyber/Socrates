/**
 * EmbeddedIslands — registry for surfaces that cannot be 100% native.
 *
 * These kinds NEVER get a native rewrite in the Universal App v1:
 *   - tiptap: rich-text composer extensions
 *   - tldraw: canvas / whiteboard
 *   - html / viz / chart: HTML artifacts + visualization cards
 *   - mermaid: diagram source → SVG
 *   - three: 3D scenes
 *
 * They render inside the platform `ArtifactIsland` WebView (Web /
 * Android fully supported; Windows/macOS show a bounded fallback until
 * a WebView2 adapter lands). Shared chat/sidebar/composer state stays in
 * `@socrates/chat` + `@socrates/core`; islands only receive serialized
 * HTML/SVG and post bridge messages back (`ArtifactBridgeMessage`).
 */

export type IslandKind = 'tiptap' | 'tldraw' | 'html' | 'viz' | 'chart' | 'mermaid' | 'three' | 'markdown' | 'code';

export const WEBVIEW_ISLAND_KINDS: ReadonlySet<IslandKind> = new Set([
  'tiptap',
  'tldraw',
  'html',
  'viz',
  'chart',
  'mermaid',
  'three',
]);

export function isWebViewIsland(kind: string): boolean {
  return (WEBVIEW_ISLAND_KINDS as Set<string>).has(kind);
}
