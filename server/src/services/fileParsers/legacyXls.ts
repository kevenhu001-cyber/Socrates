/**
 * Legacy XLS text extractor — wraps the SheetJS `xlsx` reader.
 *
 * .xls is the pre-2007 BIFF binary format; exceljs only reads the
 * modern OOXML .xlsx. SheetJS parses BIFF2/5/8 in-process with no
 * native helpers. Output mirrors xlsx.ts (a markdown table per sheet
 * under `## Sheet:` headings) so the model sees one tabular dialect for
 * both spreadsheet generations.
 *
 * Same budget guards as xlsx.ts: sheet/row/output caps stop a huge
 * workbook materializing before truncation.
 */
import XLSX from 'xlsx';
import { readFile } from 'node:fs/promises';
import { cleanExtractedText, markdownTable, parseError } from './text.js';

const MAX_OUTPUT_CHARS = 200 * 1024;
const MAX_SHEETS = 50;
const MAX_ROWS_PER_SHEET = 5000;

export async function extract(filepath: string) {
  let wb: XLSX.WorkBook;
  try {
    // cellDates keeps date cells typed so they format as ISO below.
    // SheetJS 0.20.x no longer supports the filesystem helper in its ESM
    // build; read the file into a buffer so the parser works in Node and
    // remains independent of SheetJS' optional fs adapter.
    wb = XLSX.read(await readFile(filepath), {
      type: 'buffer',
      cellDates: true,
      sheetRows: MAX_ROWS_PER_SHEET,
    });
  } catch (e) {
    const em = e as Error;
    if (/password|encrypt/i.test(String(em?.message || ''))) {
      throw parseError('ENCRYPTED', 'xls_encrypted: this XLS workbook is password-protected. Remove the password and upload it again.');
    }
    throw parseError('PARSE_FAILED', 'xls_parse_failed: ' + (em.message || em));
  }

  const parts: string[] = [];
  let outChars = 0;
  let truncated = false;
  const omitted: string[] = [];
  const push = (s: string) => {
    if (outChars + s.length > MAX_OUTPUT_CHARS) {
      const room = MAX_OUTPUT_CHARS - outChars;
      if (room > 0) {
        const slice = s.slice(0, room);
        const nl = slice.lastIndexOf('\n');
        parts.push(nl > 0 ? slice.slice(0, nl) : slice);
      }
      outChars = MAX_OUTPUT_CHARS;
      truncated = true;
      return false;
    }
    parts.push(s);
    outChars += s.length;
    return true;
  };

  for (const name of wb.SheetNames.slice(0, MAX_SHEETS)) {
    let rows: unknown[][];
    try {
      const ws = wb.Sheets[name];
      rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
    } catch {
      rows = [];
    }
    const kept = rows.slice(0, MAX_ROWS_PER_SHEET);
    const width = kept.reduce<number>((m, r) => Math.max(m, Array.isArray(r) ? r.length : 1), 0);
    let body = kept.length ? (markdownTable(kept) || '(empty sheet)') : '(empty sheet)';
    if (rows.length >= MAX_ROWS_PER_SHEET) {
      truncated = true;
      omitted.push(`sheet "${name}": rows after ${MAX_ROWS_PER_SHEET}`);
      body += `\n[sheet truncated at ${MAX_ROWS_PER_SHEET} rows]`;
    }
    if (!push(`## Sheet: ${name || 'Untitled'} (${kept.length} rows × ${width} columns)\n${body}\n\n`)) {
      omitted.push(`output cap reached in sheet "${name}"`);
      break;
    }
  }
  if (wb.SheetNames.length > MAX_SHEETS) {
    truncated = true;
    omitted.push(`${wb.SheetNames.length - MAX_SHEETS} more sheets`);
  }
  if (truncated && omitted.length) parts.push(`\n[workbook truncated — omitted: ${omitted.join('; ')}]`);

  const meta: Record<string, unknown> = {
    format: 'xls',
    sheetCount: wb.SheetNames.length,
    sheets: wb.SheetNames.slice(0, MAX_SHEETS).join(', ').slice(0, 300),
  };
  if (omitted.length) meta.omitted = omitted.join('; ');
  return {
    text: cleanExtractedText(parts.join('\n')),
    truncated,
    meta,
  };
}
