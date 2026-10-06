import assert from 'node:assert/strict';
import test from 'node:test';

import { setGateVisible, showView, switchTab, setError, focusTab, getValue, isChecked, setValue, setText, setVisible, focusId, setButton } from '../src/auth/shell.ts';

function fakeEl() {
  const cls = new Set();
  return {
    classList: {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); },
      contains: (c) => cls.has(c),
    },
    attrs: {},
    getAttribute: function (k) { return this.attrs[k] ?? null; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    focus: function () { this.focused = true; },
    textContent: '',
    _cls: cls,
  };
}

function fakeRoot(map, tabs = []) {
  return {
    getElementById: (id) => map[id] ?? null,
    querySelectorAll: (sel) => (sel === '.auth-tab' ? tabs : []),
    documentElement: { dataset: {} },
  };
}

test('setGateVisible flips hidden on gate + shell', () => {
  const gate = fakeEl();
  const shell = fakeEl();
  const root = fakeRoot({ authGate: gate, appShell: shell });
  setGateVisible(root, true);
  assert.equal(gate.classList.contains('hidden'), true);
  assert.equal(shell.classList.contains('hidden'), false);
  setGateVisible(root, false);
  assert.equal(gate.classList.contains('hidden'), false);
  assert.equal(shell.classList.contains('hidden'), true);
});

test('showView hides siblings and reveals target', () => {
  const a = fakeEl();
  const b = fakeEl();
  const root = fakeRoot({ v1: a, v2: b });
  showView(root, 'v2', ['v1', 'v2']);
  assert.equal(a.classList.contains('hidden'), true);
  assert.equal(b.classList.contains('hidden'), false);
});

test('switchTab activates the matching tab', () => {
  const t1 = fakeEl();
  t1.attrs['data-tab'] = 'signin';
  const t2 = fakeEl();
  t2.attrs['data-tab'] = 'register';
  const v1 = fakeEl();
  const v2 = fakeEl();
  const root = fakeRoot({ authSigninView: v1, authRegisterView: v2 }, [t1, t2]);
  switchTab(root, 'register');
  assert.equal(t2.classList.contains('active'), true);
  assert.equal(t1.classList.contains('active'), false);
  assert.equal(v2.classList.contains('hidden'), false);
});

test('focusTab moves focus and returns acted', () => {
  const t1 = fakeEl();
  t1.attrs['data-tab'] = 'signin';
  const t2 = fakeEl();
  t2.attrs['data-tab'] = 'register';
  const root = fakeRoot({}, [t1, t2]);
  assert.equal(focusTab(root, t1, 'ArrowRight'), true);
  assert.equal(t2.focused, true);
  assert.equal(focusTab(root, t1, 'Enter'), false);
});

test('setError writes message text', () => {
  const node = fakeEl();
  const root = fakeRoot({ someError: node });
  setError(root, 'someError', 'bad');
  assert.equal(node.textContent, 'bad');
});

test('form helpers read/write fields without throwing on missing nodes', () => {
  const cls = new Set();
  const input = { value: '  a@b.c  ', checked: true, disabled: false, textContent: '', classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } };
  const root = {
    getElementById: (id) => (id === 'email' || id === 'btn' || id === 'box' ? input : null),
    querySelectorAll: () => [],
  };
  assert.equal(getValue(root, 'email'), '  a@b.c  ');
  assert.equal(getValue(root, 'missing'), '');
  assert.equal(isChecked(root, 'email'), true);
  assert.equal(isChecked(root, 'missing'), false);
  setValue(root, 'email', 'x@y.z');
  assert.equal(input.value, 'x@y.z');
  setText(root, 'email', 'hello');
  setButton(root, 'btn', true, 'Busy…');
  assert.equal(input.disabled, true);
  assert.equal(input.textContent, 'Busy…');
  setVisible(root, 'box', false);
  focusId(root, 'missing');
  assert.doesNotThrow(() => {
    setValue(root, 'missing', 'v');
    setText(root, 'missing', 't');
    setButton(root, 'missing', true);
    setVisible(root, 'missing', true);
  });
});
