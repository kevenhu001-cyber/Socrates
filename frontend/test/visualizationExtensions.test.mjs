import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchExtensionRepair,
  renderExtension,
} from '../src/render/visualizationExtensions.js';

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>\'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

function spec(template, source) {
  return {
    template,
    title: 'Extension demo',
    accessibilitySummary: 'A contained visualization',
    payload: { source },
  };
}

test('static SVG extensions reject script and dangerous URL payloads', () => {
  assert.throws(() => renderExtension(spec('svg_illustration', '<svg><script>alert(1)</script></svg>'), 'card-a', escapeHtml), /extension_security_check_failed/);
  assert.throws(() => renderExtension(spec('svg_illustration', '<svg><a href="javascript:alert(1)"></a></svg>'), 'card-b', escapeHtml), /extension_security_check_failed/);
  assert.throws(() => renderExtension(spec('svg_illustration', '<svg><image href="https://example.com/image.png"/></svg>'), 'card-c', escapeHtml), /extension_security_check_failed/);
  assert.throws(() => renderExtension(spec('svg_illustration', '<svg><style>@import url(https://example.com/x.css)</style></svg>'), 'card-d', escapeHtml), /extension_security_check_failed/);
});

test('interactive extensions execute only in an opaque-origin sandbox', () => {
  const html = renderExtension(
    spec('interactive_simulation', '<script>window.simulationReady = true</script>'),
    'card-safe',
    escapeHtml,
  );

  assert.match(html, /sandbox="allow-scripts"/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.match(html, /connect-src &#39;none&#39;/);
  assert.match(html, /font-src data:/);
  assert.match(html, /<iframe/);
});

test('extension failures route a bounded repair prompt through tool-retry', () => {
  const previous = globalThis.CustomEvent;
  let dispatched;
  globalThis.CustomEvent = class CustomEventMock {
    constructor(type, options) {
      this.type = type;
      Object.assign(this, options);
    }
  };
  try {
    dispatchExtensionRepair({ dispatchEvent(event) { dispatched = event; } }, spec('math_construction', ''), 'GeoGebra CDN unavailable');
  } finally {
    if (previous === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previous;
  }

  assert.equal(dispatched.type, 'tool-retry');
  assert.equal(dispatched.bubbles, true);
  assert.equal(dispatched.detail.tool, 'render_visualization');
  assert.match(dispatched.detail.prompt, /switch to a simpler built-in template/);
  assert.match(dispatched.detail.prompt, /math_construction cannot work right now/);
});

test('a GeoGebra applet runtime error is not mislabeled as a CDN outage', () => {
  const previous = globalThis.CustomEvent;
  let dispatched;
  globalThis.CustomEvent = class CustomEventMock {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
  };
  try {
    dispatchExtensionRepair({ dispatchEvent(event) { dispatched = event; } }, spec('math_construction', ''), 'GeoGebra applet did not finish loading.');
  } finally {
    if (previous === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previous;
  }

  assert.match(dispatched.detail.prompt, /failed locally/);
  assert.doesNotMatch(dispatched.detail.prompt, /CDN is unreachable/);
});
