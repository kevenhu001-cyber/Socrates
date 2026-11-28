import { reportSwallow } from '../util/reportSwallow.ts';

/** Local connector marks load only on first connector use. The navigation,
 * composer and workspace share one promise and one fallback implementation.
 * No global publication, and no static import of the brand SVG pack.
 */
function esc(value: string | null) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
type ConnectorIconModule = typeof import('../connector-icons.ts');
let _ciMod: ConnectorIconModule | null = null;
let _ciReady: Promise<ConnectorIconModule> | null = null;

export function ensureConnectorIcons() {
  if (!_ciReady) {
    _ciReady = import('../connector-icons.ts').then(function (m) {
      _ciMod = m;
      hydrateConnectorIcons();
      try {
        requestAnimationFrame(function () {
          hydrateConnectorIcons();
        });
      } catch (e) {
        reportSwallow(e, 'connectorIconLoader.ensureConnectorIcons.deferHydrate');
      }
      return m;
    });
    _ciReady.catch(function (err) {
      _ciReady = null;
      console.error('[icons] connector icon pack failed to load', err);
    });
  }
  return _ciReady;
}

function _connectorMonogram(provider: unknown) {
  return (
    '<span class="connector-logo-fallback" data-cicon="' +
    esc(String(provider || '?')) +
    '" style="display:flex" aria-hidden="true">' +
    esc(
      String(provider || '?')
        .slice(0, 2)
        .toUpperCase(),
    ) +
    '</span>'
  );
}

export function connectorIconWithFallback(provider: unknown): string {
  const markup = _ciMod && _ciMod.getConnectorIconMarkup(provider);
  if (markup) return markup;
  if (!_ciMod) ensureConnectorIcons();
  return _connectorMonogram(provider);
}

/* Swap pending monogram placeholders for real SVG marks once the icon
   pack resolves. Fallback spans carry data-cicon so the pass is
   idempotent and safe to re-run (also covers React-committed chips). */
function hydrateConnectorIcons(root?: ParentNode) {
  if (!_ciMod) return;
  const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
  scope
    .querySelectorAll<HTMLElement>('.connector-logo-fallback[data-cicon]')
    .forEach(function (el) {
      const markup = _ciMod!.getConnectorIconMarkup(el.dataset.cicon);
      if (markup) el.outerHTML = markup;
    });
}
