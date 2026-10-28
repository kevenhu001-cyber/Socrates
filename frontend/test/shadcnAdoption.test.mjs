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

test('migrated features cannot return to compatibility buttons, native selects or surface variants', () => {
  const source = "import { Button } from '../ui/Button'; import { NativeSelect } from '../ui/shadcn/native-select'; export const View = () => <Button variant=\"surface\" />;";
  for (const feature of ['settings', 'profileModal', 'adminModal']) {
    assert.deepEqual(inspectSource(source, `src/react/${feature}/View.tsx`).map(p => p.kind), Array(3).fill('compatibilityControls'));
  }
  assert.deepEqual(inspectSource(source, 'src/react/composer/Existing.tsx'), []);
  assert.deepEqual(inspectSource("import { Button } from '../ui/shadcn/button'; export const View = () => <Button variant=\"outline\" />;", 'src/react/settings/View.tsx'), []);
});

test('migrated workspace controls cannot return to compatibility buttons or surface variants', () => {
  const source = "import { Button } from '../../ui/Button'; export const View = () => <Button variant=\"surface\" />;";
  for (const feature of ['LibraryToolbar', 'PluginDetailHeader', 'PluginDirectory', 'PluginDirectoryCard', 'ProjectsView', 'workspaceUi']) {
    assert.deepEqual(inspectSource(source, `src/react/pages/workspace/${feature}.tsx`).map(p => p.kind), Array(2).fill('compatibilityControls'));
  }
});
