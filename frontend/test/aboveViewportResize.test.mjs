import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mutationsCanMoveReadingBlock, readingBlocksOf } from '../src/react/message-list/aboveViewportResize.ts';

test('reading anchor ignores streamed DOM below it but keeps earlier and in-block corrections', () => {
  const dom = new JSDOM('<main><p id="before">Earlier</p><p id="anchor">Reading <b>here</b></p><p id="tail">Tail</p></main>');
  const doc = dom.window.document;
  const anchor = doc.getElementById('anchor');
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(doc.querySelector('main'), { subtree: true, childList: true, characterData: true, attributes: true });
  const affected = () => mutationsCanMoveReadingBlock(anchor, observer.takeRecords());
  try {
    doc.getElementById('tail').firstChild.data += ' grows';
    assert.equal(affected(), false, 'tail text cannot shift the earlier block');
    doc.getElementById('tail').style.height = '200px';
    assert.equal(affected(), false, 'later geometry cannot shift the earlier block');
    doc.getElementById('before').textContent += ' grows';
    assert.equal(affected(), true, 'earlier content still corrects the reading position');
    anchor.querySelector('b').textContent = 'changed';
    assert.equal(affected(), true, 'in-block updates retain the existing correction');
    doc.querySelector('main').className = 'new-layout';
    assert.equal(affected(), true, 'ancestor layout changes still correct');
    assert.equal(affected(), false, 'an unchanged DOM needs no measurement');
    anchor.remove();
    assert.equal(affected(), true, 'a replaced anchor must be resolved again');
  } finally {
    observer.disconnect();
    dom.window.close();
  }
});


test('reading anchors use settled paragraphs rather than the complete live answer', () => {
  const dom = new JSDOM('<div class="msg"><div class="msg-body"><div class="assistant-turn"><div class="tool-run-prose">First</div><div class="tool-run-prose">Second</div></div></div></div>');
  try {
    const row = dom.window.document.querySelector('.msg');
    assert.deepEqual([...readingBlocksOf(row)].map(block => block.textContent), ['First', 'Second']);
    row.querySelector('.msg-body').innerHTML = '<p>User text</p>';
    assert.equal(readingBlocksOf(row)[0].textContent, 'User text');
  } finally {
    dom.window.close();
  }
});
