import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBeaconMessages, buildBeaconPayload, readBeaconCsrf } from '../src/session/beacon.js';

describe('beacon payload builder (F3 extraction from main.js)', () => {
  it('skips streaming placeholders and caps attachments/toolCalls', () => {
    const msgs = [
      { type: 'streaming', role: 'assistant', rawText: 'partial' },
      {
        clientId: 'c1', role: 'user', rawText: 'hi',
        attachments: new Array(25).fill({ id: 1 }),
        toolCalls: new Array(30).fill({ name: 'x' }),
      },
    ];
    const out = buildBeaconMessages(msgs);
    assert.equal(out.length, 1);
    assert.equal(out[0].attachments.length, 20);
    assert.equal(out[0].toolCalls.length, 20);
  });

  it('preserves reasoningContent from snake_case fallback', () => {
    const out = buildBeaconMessages([{ role: 'assistant', rawText: 'a', reasoning_content: 'think' }]);
    assert.equal(out[0].reasoningContent, 'think');
  });

  it('topic/title fall back to each other (regression: duplicate topic read)', () => {
    const p1 = buildBeaconPayload({ sessionId: 's', topic: '', sessionTitle: 'T', appMode: 'chat', messages: [{ role: 'user', rawText: 'm' }] });
    assert.equal(p1.topic, 'T');
    assert.equal(p1.title, 'T');
    const p2 = buildBeaconPayload({ sessionId: 's', topic: 'Top', sessionTitle: '', appMode: 'chat', messages: [{ role: 'user', rawText: 'm' }] });
    assert.equal(p2.topic, 'Top');
    assert.equal(p2.title, 'Top');
  });

  it('returns null without sessionId or messages', () => {
    assert.equal(buildBeaconPayload({ sessionId: '', topic: 'a', sessionTitle: 'b', appMode: 'chat', messages: [{ role: 'user', rawText: 'm' }] }), null);
    assert.equal(buildBeaconPayload({ sessionId: 's', topic: 'a', sessionTitle: 'b', appMode: 'chat', messages: [] }), null);
  });

  it('reads csrf token from cookie string', () => {
    assert.equal(readBeaconCsrf('a=1; csrf=abc123; b=2'), 'abc123');
    assert.equal(readBeaconCsrf('nope'), null);
  });
});
