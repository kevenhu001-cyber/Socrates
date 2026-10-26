import assert from 'node:assert/strict';
import test from 'node:test';
import { collectReactRootViolations } from '../scripts/check-react-roots.mjs';

test('root guard catches aliases, namespace calls and dynamic root imports', () => {
  for (const source of [
    "import { createRoot as mount } from 'react-dom/client';",
    "import ReactDOM from 'react-dom/client';",
    "const runtime = await import(`react-dom/client`);",
    "import * as ReactDOM from 'react-dom/client';",
    "const runtime = await import('react-dom/client');",
    "ReactDOM.hydrateRoot(host, node);",
  ]) assert.ok(collectReactRootViolations('feature.ts', source).length, source);
});

test('root guard permits type imports and the canonical creation owner', () => {
  assert.deepEqual(collectReactRootViolations('feature.ts', "import type { Root } from 'react-dom/client'; import { type Root as R } from 'react-dom/client';"), []);
  assert.deepEqual(collectReactRootViolations('react/lib/boot/ownedRoot.ts', "import { createRoot, hydrateRoot } from 'react-dom/client';"), []);
});

test('retired mount globals are rejected as code while comments and strings stay harmless', () => {
  assert.equal(collectReactRootViolations('feature.ts', 'window.__socratesReleaseMsgListReact();').length, 1);
  assert.equal(collectReactRootViolations('feature.ts', "window['__socratesMountAssistantTurn'] = mount;").length, 1);
  assert.deepEqual(collectReactRootViolations('feature.ts', "// window.__socratesReleaseMsgListReact()\nconst text = 'ReactDOM.createRoot(host)';"), []);
});
