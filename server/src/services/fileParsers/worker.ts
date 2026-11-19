/**
 * worker.ts — Worker thread entry for document parsing.
 *
 * Runs CPU-heavy parsers in an isolated thread so the main Node.js
 * event loop never suffers latency or stalls while streaming SSE chat turns.
 */
import { parentPort } from 'node:worker_threads';
import { dispatchParser } from './dispatcher.js';

if (!parentPort) {
  throw new Error('fileParser worker must run inside a worker_thread');
}

parentPort.on('message', async (msg: { id: string; mimeType: string; filepath: string }) => {
  const { id, mimeType, filepath } = msg;
  try {
    const payload = await dispatchParser(mimeType, filepath);
    parentPort!.postMessage({ id, ok: true, payload });
  } catch (err: unknown) {
    let code = 'PARSE_FAILED';
    let message = String(err);
    if (err && typeof err === 'object') {
      if ('code' in err && typeof (err as { code: unknown }).code === 'string') {
        code = (err as { code: string }).code;
      }
      if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
        message = (err as { message: string }).message;
      }
    }
    parentPort!.postMessage({ id, ok: false, error: { code, message } });
  }
});

// Signal ready
parentPort.postMessage({ type: 'ready' });
