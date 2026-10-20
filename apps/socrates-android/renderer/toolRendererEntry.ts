import { mountVisualization } from '../../../frontend/src/render/visualization.js';
import { asVisualizationSpec } from '../../../frontend/src/render/visualizationSpec.ts';

type RenderPayload =
  | { kind: 'visualization'; spec: unknown }
  | { kind: 'artifact'; mimeType: string; content: string; name?: string };

function decodePayload(encoded: string): RenderPayload {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as RenderPayload;
}

function renderArtifact(root: HTMLElement, payload: Extract<RenderPayload, { kind: 'artifact' }>): void {
  const mime = payload.mimeType.toLowerCase();
  if (mime.startsWith('image/')) {
    const image = document.createElement('img');
    image.alt = payload.name || 'Generated image';
    image.src = `data:${payload.mimeType};base64,${payload.content}`;
    root.append(image);
    return;
  }
  if (mime === 'text/html' || mime === 'application/xhtml+xml') {
    const frame = document.createElement('iframe');
    frame.title = payload.name || 'Generated artifact';
    frame.setAttribute('sandbox', 'allow-scripts');
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline' data:; script-src 'unsafe-inline' data: blob:; connect-src 'none'; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'">`;
    frame.srcdoc = `<!doctype html><html><head>${csp}<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:16px/1.55 system-ui,sans-serif;color:#202124;margin:0;padding:16px;overflow-wrap:anywhere}img,svg,video,canvas{max-width:100%;height:auto}</style></head><body>${payload.content}</body></html>`;
    root.append(frame);
    return;
  }
  const pre = document.createElement('pre');
  pre.className = 'artifact-text';
  pre.textContent = payload.content;
  root.append(pre);
}

async function render(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-socrates-output]');
  if (!root) return;
  try {
    const payload = decodePayload(root.dataset.payload || '');
    if (payload.kind === 'visualization') {
      const spec = asVisualizationSpec(payload.spec);
      if (!spec) throw new Error('此可视化结果格式无法识别。');
      // GeoGebra is the one frontend renderer that downloads executable code
      // from a third-party CDN. Keep Android's artifact WebView fully local.
      if (spec.template === 'math_construction') {
        const fallback = document.createElement('pre');
        fallback.className = 'artifact-text';
        fallback.textContent = JSON.stringify(spec, null, 2);
        root.append(fallback);
        return;
      }
      const card = await mountVisualization(spec, root, { toolCallId: `android-${Date.now()}` });
      if (!card) throw new Error('此结果暂时无法渲染。');
      return;
    }
    renderArtifact(root, payload);
  } catch (error) {
    const fallback = document.createElement('pre');
    fallback.className = 'artifact-text';
    fallback.textContent = error instanceof Error ? error.message : '此结果暂时无法渲染。';
    root.replaceChildren(fallback);
  }
}

void render();
