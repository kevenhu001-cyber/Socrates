/**
 * XLSX text extractor — wraps exceljs.
 *
 * ExcelJS reads the workbook into a structured model. For LLM consumption
 * we want each sheet's tabular content as plain text:
 *
 *   Sheet: <name>
 *   <header row, tab-separated>
 *   <data rows, tab-separated>
 *
 * Tab-separated keeps multi-space cell values intact (CSV quoting is
 * noisy for LLMs). We cap total output at the route's MAX_TEXT_BYTES.
 */
import ExcelJS from 'exceljs';

const SHEET_HEADER = (name: string) => `### Sheet: ${name || 'Untitled'}\n`;

/* Output caps — a 25 MB upload can expand to several times that in
   memory once rows are materialized as strings. Truncate inside the
   parser (not only at the route layer) so we never pay the full cost. */
const MAX_OUTPUT_CHARS = 200 * 1024;
const MAX_SHEETS = 50;
const MAX_ROWS_PER_SHEET = 5000;

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  // Dates — format as ISO date string
  if (value instanceof Date) return value.toISOString().split('T')[0];
  // Rich text — extract plain text
  if (typeof value === 'object' && 'richText' in (value as Record<string, unknown>)) {
    return ((value as Record<string, unknown>).richText as Array<{ text: string }>)
      .map((rt: { text: string }) => rt.text).join('');
  }
  // Hyperlink — prefer displayed text over the URL
  if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).text ?? '');
  }
  // Result object (e.g. formula result)
  if (typeof value === 'object' && 'result' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).result ?? '');
  }
  return String(value);
}

export async function extract(filepath: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filepath);

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

  for (const worksheet of wb.worksheets.slice(0, MAX_SHEETS)) {
    sheetCount++;
    if (!push(SHEET_HEADER(worksheet.name))) break;
    let rowCount = 0;
    let sheetTruncatedNote = '';
    const rows: string[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (truncated || rowCount >= MAX_ROWS_PER_SHEET) return;
      const values: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        values.push(cellValue(cell.value));
      });
      if (values.length > 0) {
        rows.push(values.join('\t'));
        rowCount++;
      }
    });
    if (rowCount >= MAX_ROWS_PER_SHEET) {
      truncated = true;
      sheetTruncatedNote = `\n[sheet truncated at ${MAX_ROWS_PER_SHEET} rows]\n`;
    }
    const body = rows.join('\n') + '\n' + sheetTruncatedNote + '\n';
    if (!push(body)) break;
  }
  if (wb.worksheets.length > MAX_SHEETS) truncated = true;

  return {
    text: parts.join('\n').replace(/\r\n/g, '\n'),
    truncated,
    meta: { sheetCount },
  };
}