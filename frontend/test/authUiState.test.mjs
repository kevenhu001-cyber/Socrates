import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAuthUiState,
  setAuthButtonState,
  setAuthErrorState,
  setAuthField,
  setAuthTab,
  setAuthVisibility,
  subscribeAuthUi,
} from '../src/auth/uiState.ts';

test('auth state updates React-owned tab, field, error, visibility, and request status', () => {
  let notifications = 0;
  const unsubscribe = subscribeAuthUi(() => { notifications += 1; });

  setAuthTab('register');
  setAuthField('authRegisterEmail', 'learner@example.test');
  setAuthErrorState('authRegisterError', 'Check your email.');
  setAuthVisibility('authCodeCodeWrap', true);
  setAuthButtonState('authRegisterBtn', true, 'Sending…');

  const state = getAuthUiState();
  assert.equal(state.view, 'authRegisterView');
  assert.equal(state.activeTab, 'register');
  assert.equal(state.fields.authRegisterEmail, 'learner@example.test');
  assert.equal(state.errors.authRegisterError, 'Check your email.');
  assert.equal(state.visibility.authCodeCodeWrap, true);
  assert.deepEqual(state.buttons.authRegisterBtn, { disabled: true, label: 'Sending…' });
  assert.equal(notifications, 5);
  unsubscribe();
});
