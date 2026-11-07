/**
 * XLSX text extractor — wraps exceljs.
 *
 * Each sheet becomes a markdown table under a `## Sheet: <name>` heading,
 * with its size, so the model can address a value by sheet/row/column:
 *
 *   ## Sheet: 成绩 (32 rows × 5 columns)
 *   | 姓名 | 数学 | 语文 | … |
 *   | --- | --- | --- | … |
 *
 * Columns are read by position (row.getCell(i)) rather than with
 * eachCell({includeEmpty:false}); the latter skipped blank cells, which
 * shifted every following value one column to the left. Formula cells show
 * their cached result, dates are ISO, rich text and hyperlinks show their
 * visible text. Output is capped inside the parser so a 25 MB workbook
 * never materializes in full; the cut is announced in the text.
 */
import ExcelJS from 'exceljs';
import { assertNotEncryptedOoxml, cleanExtractedText, markdownTable, parseError } from './text.js';

/* Output caps — a 25 MB upload can expand to several times that in
   memory once rows are materialized as strings. Truncate inside the
   parser (not only at the route layer) so we never pay the full cost. */
const MAX_OUTPUT_CHARS = 200 * 1024;
const MAX_SHEETS = 50;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_COLUMNS = 100;

function formatDate(d: Date): string {
  const iso = d.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ');
}

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((rt) => String(rt?.text ?? '')).join('');
    }
    // Formula — prefer the cached result; fall back to showing the formula.
    if ('formula' in v || 'sharedFormula' in v) {
      if (v.result !== undefined && v.result !== null) return cellValue(v.result);
      return `=${String(v.formula ?? v.sharedFormula ?? '')}`;
    }
    if ('result' in v) return cellValue(v.result);
    // Hyperlink — prefer displayed text over the URL
    if ('text' in v) return cellValue(v.text);
    if ('error' in v) return String(v.error ?? '');
    return '';
  }
  return String(value);
}

export async function extract(filepath: string) {
  await assertNotEncryptedOoxml(filepath, 'xlsx');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(filepath);
  } catch (e) {
    const em = e as Error;
    throw parseError('PARSE_FAILED', 'xlsx_parse_failed: ' + (em.message || em));
  }

  const parts: string[] = [];
  const sheetNames: string[] = [];
  let outChars = 0;
  let truncated = false;
  const omitted: string[] = [];
  const push = (s: string) => {
    if (outChars + s.length > MAX_OUTPUT_CHARS) {
      const room = MAX_OUTPUT_CHARS - outChars;
      if (room > 0) {
        /* Cut on a row boundary so the last table row is not half a row. */
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

  const worksheets = wb.worksheets;
  for (const worksheet of worksheets.slice(0, MAX_SHEETS)) {
    sheetNames.push(worksheet.name);
    const columnCount = Math.min(MAX_COLUMNS, Math.max(worksheet.actualColumnCount || 0, worksheet.columnCount || 0));
    const rows: string[][] = [];
    let dataRows = 0;
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      dataRows++;
      if (rows.length >= MAX_ROWS_PER_SHEET) return;
      const values: string[] = [];
      const width = Math.min(MAX_COLUMNS, Math.max(columnCount, row.cellCount || 0));
      for (let c = 1; c <= width; c++) values.push(cellValue(row.getCell(c).value));
      rows.push(values);
    });
    const shownCols = rows.reduce((m, r) => {
      let last = r.length;
      while (last > 0 && !r[last - 1]) last--;
      return Math.max(m, last);
    }, 0);
    const header = `## Sheet: ${worksheet.name || 'Untitled'} (${dataRows} rows × ${shownCols} columns)\n`;
    let body = rows.length ? markdownTable(rows) : '(empty sheet)';
    if (dataRows > rows.length) {
      truncated = true;
      omitted.push(`sheet "${worksheet.name}": rows ${rows.length + 1}–${dataRows}`);
      body += `\n[sheet truncated: showing the first ${rows.length} of ${dataRows} rows]`;
    }
    if (!push(`${header}${body}\n\n`)) {
      omitted.push(`output cap reached in sheet "${worksheet.name}"`);
      break;
    }
  }
  if (worksheets.length > MAX_SHEETS) {
    truncated = true;
    omitted.push(`${worksheets.length - MAX_SHEETS} more sheets`);
  }
  if (truncated && omitted.length) {
    parts.push(`\n[workbook truncated — omitted: ${omitted.join('; ')}]`);
  }

  const meta: Record<string, unknown> = {
    format: 'markdown-tables',
    sheetCount: worksheets.length,
    sheets: sheetNames.join(', ').slice(0, 300),
  };
  if (omitted.length) meta.omitted = omitted.join('; ');
  return {
    text: cleanExtractedText(parts.join('\n')),
    truncated,
    meta,
  };
}
