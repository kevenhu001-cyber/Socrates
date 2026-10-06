/**
 * Legacy XLS text extractor — wraps the SheetJS `xlsx` reader.
 *
 * .xls is the pre-2007 BIFF binary format; exceljs only reads the
 * modern OOXML .xlsx. SheetJS parses BIFF2/5/8 in-process with no
 * native helpers. Output mirrors the xlsx.ts shape (tab-separated
 * rows under `### Sheet:` headers) so the model sees one tabular
 * dialect for both spreadsheet generations.
 *
 * Same budget guards as xlsx.ts: sheet/row/output caps stop a huge
 * workbook materializing before truncation.
 */
import XLSX from 'xlsx';

const SHEET_HEADER = (name: string) => `### Sheet: ${name || 'Untitled'}\n`;

const MAX_OUTPUT_CHARS = 200 * 1024;
const MAX_SHEETS = 50;
const MAX_ROWS_PER_SHEET = 5000;

export async function extract(filepath: string) {
  let wb: XLSX.WorkBook;
  try {
    // cellDates keeps date cells typed so they format as ISO below.
    wb = XLSX.readFile(filepath, { cellDates: true, sheetRows: MAX_ROWS_PER_SHEET });
  } catch (e) {
    const em = e as Error;
    const err = new Error('xls_parse_failed: ' + (em.message || em)) as Error & { code: string };
    err.code = 'PARSE_FAILED';
    throw err;
  }

  const parts: string[] = [];
  let sheetCount = 0;
  let outChars = 0;
  let truncated = false;
  const push = (s: string) => {
    if (outChars + s.length > MAX_OUTPUT_CHARS) {
      const room = MAX_OUTPUT_CHARS - outChars;
      if (room > 0) parts.push(s.slice(0, room));
      outChars = MAX_OUTPUT_CHARS;
      truncated = true;
      return false;
    }
    parts.push(s);
    outChars += s.length;
    return true;
  };

  for (const name of wb.SheetNames.slice(0, MAX_SHEETS)) {
    sheetCount++;
    if (!push(SHEET_HEADER(name))) break;
    let rows: string[][];
    try {
      const ws = wb.Sheets[name];
      rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
    } catch {
      rows = [];
    }
    const body = rows
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((r) => (Array.isArray(r) ? r : [r]).map((c) => String(c ?? '')).join('\t'))
      .filter((line) => line.trim().length > 0)
      .join('\n') + '\n\n';
    if (rows.length >= MAX_ROWS_PER_SHEET) truncated = true;
    if (!push(body)) break;
  }
  if (wb.SheetNames.length > MAX_SHEETS) truncated = true;

  return {
    text: parts.join('\n').replace(/\r\n/g, '\n'),
    truncated,
    meta: { sheetCount, format: 'xls' },
  };
}
