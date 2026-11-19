import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { chunkText, type RagChunk } from './rag.js';

const INLINE_LIMIT = 16_384;
const MAX_PENDING = 32;
const TIMEOUT_MS = 15_000;

let worker: Worker | undefined;
let queue = Promise.resolve();
let pending = 0;
let closed = false;

function getWorker(): Worker {
  if (worker) return worker;
  const compiled = new URL('./chunkWorker.js', import.meta.url);
  const entry = existsSync(compiled) ? compiled : new URL('./chunkWorker.ts', import.meta.url);
  const instance = new Worker(entry, {
    execArgv: entry === compiled ? [] : ['--import', 'tsx'],
    resourceLimits: { maxOldGenerationSizeMb: 128 },
  });
  worker = instance;
  instance.on('error', (error) => {
    console.warn(
      '[rag] chunk worker error:',
      error instanceof Error ? error.message : String(error),
    );
  });
  instance.once('exit', () => {
    if (worker === instance) worker = undefined;
  });
  return instance;
}

function runChunking(text: string): Promise<RagChunk[]> {
  if (closed) throw new Error('RAG chunk worker is closed');
  const instance = getWorker();
  instance.ref();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      instance.off('message', onMessage);
      instance.off('error', onError);
      instance.off('exit', onExit);
      instance.unref();
    };
    const onMessage = (chunks: RagChunk[]) => {
      cleanup();
      resolve(chunks);
    };
    const onError = (error: Error) => {
      cleanup();
      if (worker === instance) worker = undefined;
      void instance.terminate().catch((reason: unknown) => {
        console.warn('[rag] could not terminate chunk worker:', reason);
      });
      reject(error);
    };
    const onExit = (code: number) => {
      cleanup();
      reject(new Error(`RAG chunk worker exited before replying (code ${code})`));
    };
    const timer = setTimeout(() => onError(new Error('RAG chunking timed out')), TIMEOUT_MS);
    instance.once('message', onMessage);
    instance.once('error', onError);
    instance.once('exit', onExit);
    try {
      instance.postMessage(text);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** Large messages slice off-thread. Keep the usual short turn allocation-free. */
export async function chunkMessageText(text: string): Promise<RagChunk[]> {
  if (text.length < INLINE_LIMIT) return chunkText(text);
  if (closed) throw new Error('RAG chunk worker is closed');
  if (pending >= MAX_PENDING) throw new Error('RAG chunk worker queue is full');
  pending += 1;
  const job = queue.then(() => runChunking(text));
  queue = job.then(
    () => {
      pending -= 1;
    },
    () => {
      pending -= 1;
    },
  );
  return job;
}

export async function stopRagChunkWorker(): Promise<void> {
  closed = true;
  await worker?.terminate();
  await queue;
}
