import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const css = await readFile(new URL('../src/styles/components/chat.css', import.meta.url), 'utf8');

function autoSelectors(rules) {
  return [...rules].flatMap(rule => {
    const own = rule.style?.getPropertyValue('content-visibility') === 'auto' ? [rule.selectorText] : [];
    return [...own, ...(rule.cssRules ? autoSelectors(rule.cssRules) : [])];
  });
}

for (const tailRole of ['assistant', 'user']) {
  test(`size-skipping selectors exclude the ${tailRole} tail and previous row but retain older history`, () => {
    const dom = new JSDOM('<div id="appShell"><div id="msgList"></div></div>');
    try {
      const { document } = dom.window;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      const selectors = autoSelectors(style.sheet.cssRules);
      assert.ok(selectors.length > 0, 'history size-skipping remains enabled');
      const list = document.getElementById('msgList');
      for (const role of ['assistant', 'user', tailRole === 'assistant' ? 'user' : 'assistant', tailRole]) {
        const row = document.createElement('div');
        row.className = `msg ${role}`;
        if (role === 'assistant') row.dataset.streamSettled = 'true';
        list.appendChild(row);
      }
      const matchesAuto = row => selectors.some(selector => row.matches(selector));
      assert.equal(matchesAuto(list.lastElementChild), false, 'the tail must never start at an intrinsic height estimate');
      assert.equal(matchesAuto(list.children[2]), false, 'the previous prompt/answer must remain measured');
      assert.equal(matchesAuto(list.children[0]), true, 'older assistant history can still skip layout');
      assert.equal(matchesAuto(list.children[1]), true, 'older user history can still skip layout');
      list.children[0].classList.add('turn-viewport-anchor');
      assert.equal(matchesAuto(list.children[0]), false, 'viewport anchors must remain measured');
    } finally {
      dom.window.close();
    }
  });
}
