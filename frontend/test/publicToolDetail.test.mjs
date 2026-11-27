import assert from 'node:assert/strict';
import test from 'node:test';
import { publicToolDetailOf } from '../src/react/tool-run/publicToolDetail.ts';

const base = { id: 't', name: 'code_interpreter', sections: [], tech: [] };
test('raw execution, error and approval data never create an empty public disclosure', () => {
  const view = { ...base, sections: [{ kind: 'output', text: 'private' }, { kind: 'error', text: 'private' }], tech: [{ kind: 'args', text: 'private' }], liveOutput: 'private', livePreview: 'private', approval: {} };
  assert.equal(publicToolDetailOf(view).expandable, false);
  assert.deepEqual(publicToolDetailOf(view).sections, []);
});
test('nonempty sources or files, images and actual agent data create a real disclosure', () => {
  for (const section of [{kind:'sources',items:[{url:'https://example.test'}]}, {kind:'files',paths:['result.txt']}]) {
    assert.equal(publicToolDetailOf({...base,sections:[section]}).expandable,true);
  }
  const img = publicToolDetailOf(base, {id:'t',artifacts:[{id:'a',mimeType:'image/png',name:'figure'}]});
  assert.equal(img.expandable,true);
  assert.equal(img.images[0].uri,'/api/files/a/raw');
  assert.equal(publicToolDetailOf({...base,agentRun:{steps:[{}]}}).expandable,true);
  assert.equal(publicToolDetailOf({...base,sections:[{kind:'sources',items:[]},{kind:'files',paths:[]}]}).expandable,false);
});
