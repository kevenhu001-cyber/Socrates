/**
 * RTF text extractor — wraps rtf2text.
 *
 * rtf2text.string(content, cb) takes the entire RTF as a string and
 * returns plain text via callback. RTF is a 7-bit format so the file
 * can be read as utf-8 without corruption; multi-byte chars appear as
 * \'e9 escapes that rtf2text resolves.
 */
import fs from 'node:fs/promises';
import rtf2text from 'rtf2text';

export async function extract(filepath: string) {
  const raw = await fs.readFile(filepath, 'utf-8');
  const text = await new Promise<string>((resolve, reject) => {
    rtf2text.string(raw, (err: unknown, result: string | undefined) => {
      if (err) return reject(err);
      resolve(result || '');
    });
  });
  return {
    text: String(text || '').replace(/\r\n/g, '\n'),
    truncated: false,
    meta: {},
  };
}