>import { addFiles, attachments, __resetUploadQueueForTests } from '../src/attachments.ts';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class FakeXHR {
  static instances = [];
  constructor() { FakeXHR.instances.push(this); this.upload = {}; this.headers = {}; }
  open() {}
  setRequestHeader() {}
  send() {}
  abort() {}
  progress(loaded, total) {
    if (typeof this.upload.onprogress === 'function') {
      this.upload.onprogress({ lengthComputable: true, loaded, total });
    }
  }
}
globalThis.XMLHttpRequest = FakeXHR;

let progressCalls = 0;
const pending = addFiles([new File(['body-of-p.txt'], 'p.txt', { type: 'text/plain' })], () => {}, () => { progressCalls += 1; }, () => {});
await sleep(60);
const t0 = Date.now();
FakeXHR.instances[0].progress(40, 100);
let elapsed = -1;
for (let i = 0; i < 200; i++) {
  await sleep(5);
  if (progressCalls > 0) { elapsed = Date.now() - t0; break; }
}
console.log('progressCalls =', progressCalls, 'after', elapsed, 'ms');
console.log('entry.progress =', attachments[0]?.progress, 'loaded =', attachments[0]?.loaded, 'stage =', attachments[0]?.stage);
FakeXHR.instances[0].status = 201;
FakeXHR.instances[0].responseText = JSON.stringify({ id: 'f1', kind: 'text', mimeType: 'text/plain', size: 10 });
FakeXHR.instances[0].onload?.();
await pending;
__resetUploadQueueForTests();
