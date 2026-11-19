import { parentPort } from 'node:worker_threads';
import { chunkText } from './rag.js';

const port = parentPort;
if (!port) throw new Error('RAG chunk worker must run in a worker thread');

port.on('message', (text: string) => {
  port.postMessage(chunkText(text));
});
