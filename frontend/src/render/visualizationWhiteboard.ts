/* Whiteboard (tldraw) adapter, split from visualizationAdapters.js.
   Keep tldraw imports confined to this module: the Android tool renderer
   marks it external, and the web build loads it only on demand. */
import type { Editor, TLNoteShape, TLShapePartial } from 'tldraw';

interface WhiteboardSeed { label?: string; detail?: string }
interface WhiteboardSpec {
  title?: string;
  payload: { nodes?: WhiteboardSeed[]; items?: WhiteboardSeed[] };
}

const NOTE_COLORS = ['yellow', 'blue', 'green', 'violet'] as const;

function loadTldraw() {
  return Promise.all([
    import('react'),
    import('../react/lib/boot/ownedRoot.ts'),
    import('tldraw'),
    import('@tldraw/assets/imports.vite'),
    import('tldraw/tldraw.css'),
  ]);
}

let tldrawPromise: ReturnType<typeof loadTldraw> | null = null;

export async function mountWhiteboard(spec: WhiteboardSpec, stage: HTMLElement) {
  tldrawPromise ||= loadTldraw().catch((error: unknown) => { tldrawPromise = null; throw error; });
  const [React, rootRuntime, tldraw, assets] = await tldrawPromise;
  const seeds = spec.payload.nodes || spec.payload.items || [];
  const onMount = (editor: Editor) => {
    const shapes: TLShapePartial<TLNoteShape>[] = seeds.slice(0, 30).map((item, index) => ({
      id: tldraw.createShapeId(`seed-${index}`),
      type: 'note',
      x: 40 + (index % 3) * 230,
      y: 40 + Math.floor(index / 3) * 150,
      props: { richText: tldraw.toRichText(item.label || item.detail || `Idea ${index + 1}`), color: NOTE_COLORS[index % 4] },
    }));
    if (shapes.length) {
      editor.createShapes(shapes);
      editor.zoomToFit({ animation: { duration: 240 } });
    }
  };
  const root = rootRuntime.mountOwnedRoot(stage, 'whiteboard', React.createElement(tldraw.Tldraw, {
    persistenceKey: `socrates-${String(spec.title || 'whiteboard').replace(/\W+/g, '-').toLowerCase()}`,
    assetUrls: assets.getAssetUrlsByImport(),
    onMount,
  }));
  return { handled: true, chart: null, cleanup() { root.destroy(); } };
}
