import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeIslandFrameAttributes } from '../src/ui/nativeIslandFrame.ts';

test('native island frame keeps each preview in its existing opaque sandbox', () => {
  assert.deepEqual(
    nativeIslandFrameAttributes({ kind: 'visualization', title: 'Chart', html: '<canvas />' }),
    { title: 'Chart', sandbox: 'allow-scripts', srcDoc: '<canvas />' },
  );
  assert.deepEqual(
    nativeIslandFrameAttributes({ kind: 'creation', title: 'Draft', html: '<body>Draft</body>' }),
    { title: 'Draft', sandbox: '', srcDoc: '<body>Draft</body>' },
  );
  assert.deepEqual(
    nativeIslandFrameAttributes({ kind: 'artifact', title: 'Preview', url: '/api/v2/files/file' }),
    {
      title: 'Preview',
      sandbox: 'allow-scripts allow-forms allow-modals allow-popups',
      src: '/api/v2/files/file',
    },
  );
});
