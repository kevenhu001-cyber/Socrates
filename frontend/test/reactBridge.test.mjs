// @ts-check
/**
 * Unit tests for ui/reactBridge.js — the cross-tree notification
 * channel between the legacy JS pipeline (main.js) and the React
 * tree. C5 island 1.
 *
 * Runs under the frontend `test:unit` runner which uses jsdom for
 * the window/document globals.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://app.example.test/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;

const { publishReactChatRuntime } = await import('../src/ui/reactBridge.js');

test('calls bridge.publish when the React bridge is mounted', () => {
  let received = null;
  window.__socratesReactChatBridge = { publish(ev) { received = ev; } };
  publishReactChatRuntime({ type: 'state-synced', reason: 'unit-test' });
  assert.deepEqual(received, { type: 'state-synced', reason: 'unit-test' });
  delete window.__socratesReactChatBridge;
});

test('fires the socrates:chat-runtime-changed CustomEvent on the window', () => {
  let captured = null;
  const handler = (ev) => { captured = ev.detail; };
  window.addEventListener('socrates:chat-runtime-changed', handler);
  publishReactChatRuntime({ type: 'state-synced', reason: 'event-test' });
  assert.deepEqual(captured, { type: 'state-synced', reason: 'event-test' });
  window.removeEventListener('socrates:chat-runtime-changed', handler);
});

test('survives a missing bridge — the CustomEvent leg still fires', () => {
  delete window.__socratesReactChatBridge;
  let captured = null;
  const handler = (ev) => { captured = ev.detail; };
  window.addEventListener('socrates:chat-runtime-changed', handler);
  publishReactChatRuntime({ type: 'state-synced', reason: 'no-bridge' });
  assert.deepEqual(captured, { type: 'state-synced', reason: 'no-bridge' });
  window.removeEventListener('socrates:chat-runtime-changed', handler);
});

test('swallows a throwing bridge subscriber without breaking the producer', () => {
  window.__socratesReactChatBridge = { publish() { throw new Error('subscriber exploded'); } };
  let captured = null;
  const handler = (ev) => { captured = ev.detail; };
  window.addEventListener('socrates:chat-runtime-changed', handler);
  // Must not throw — the producer's try/catch around the bridge
  // call is the contract the rest of main.js relies on.
  assert.doesNotThrow(() => publishReactChatRuntime({ type: 'x' }));
  assert.deepEqual(captured, { type: 'x' });
  window.removeEventListener('socrates:chat-runtime-changed', handler);
  delete window.__socratesReactChatBridge;
});

test('null / undefined event becomes an empty object on the CustomEvent', () => {
  let captured = 'not-an-object';
  const handler = (ev) => { captured = ev.detail; };
  window.addEventListener('socrates:chat-runtime-changed', handler);
  publishReactChatRuntime(null);
  assert.deepEqual(captured, {});
  window.removeEventListener('socrates:chat-runtime-changed', handler);
});
