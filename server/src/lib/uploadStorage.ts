import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Private, stable storage for user uploads and generated image attachments. */
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === 'production'
    ? '/var/lib/socrates/uploads'
    : path.join(os.homedir(), '.socrates', 'uploads'));

let directoryReady: Promise<void> | null = null;

/**
 * Ensure uploaded bytes cannot be listed or read by another local account.
 * Reject a symlink at the configured root rather than chmod'ing its target.
 */
export function ensureUploadDirectory(): Promise<void> {
  if (!directoryReady) {
    directoryReady = (async () => {
      await fs.mkdir(UPLOAD_DIR, { recursive: true, mode: 0o700 });
      const info = await fs.lstat(UPLOAD_DIR);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error('Upload storage must be a real directory');
      }
      await fs.chmod(UPLOAD_DIR, 0o700);
    })();
  }
  return directoryReady;
}
