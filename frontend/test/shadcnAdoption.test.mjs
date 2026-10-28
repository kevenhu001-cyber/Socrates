import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectSource } from '../scripts/check-shadcn-adoption.mjs';

test('the adoption guard finds native JSX controls and permits adapted components', () => {
  const source = 'export const Form = () => <><input /><textarea /><select /><label /><hr /><button /><Input /><Button /></>;';
  const found = inspectSource(source, 'src/react/settings/Test.tsx');
  assert.equal(found.length, 6);
  assert.ok(found.every((item) => item.kind === 'rawControls' && item.line === 1));
});

test('embedded preview markup is data and is not mistaken for app controls', () => {
  assert.deepEqual(inspectSource('const preview = `<input /><button>Run</button>`;', 'preview.tsx'), []);
});

test('new Base UI imports must pass through the adapted component boundary', () => {
  const source = "import { Input } from '@base-ui/react/input';";
  assert.equal(inspectSource(source, 'src/react/settings/Test.tsx')[0]?.kind, 'unadaptedPrimitives');
  assert.deepEqual(inspectSource("import { Menu } from '@base-ui/react/menu';", 'src/react/menu/FoundationMenu.tsx'), []);
  assert.equal(inspectSource(source, 'src/react/menu/FoundationMenu.tsx').length, 1);
});
