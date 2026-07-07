/**
 * XLSX text extractor — wraps SheetJS (xlsx).
 *
 * XLSX is a ZIP of XML — SheetJS reads it into a workbook of named
 * sheets. For LLM consumption we want each sheet's tabular content
 * as plain text:
 *
 *   Sheet: <name>
 *   <header row, tab-separated>
 *   <data rows, tab-separated>
 *
 * Tab-separated keeps multi-space cell values intact (CSV quoting is
 * noisy for LLMs). We cap total output at the route's MAX_TEXT_BYTES.
 */
import fs from 'node:fs/promises';
import * as XLSX from 'xlsx';

const SHEET_HEADER = (name) => `### Sheet: ${name || 'Untitled'}\n`;

function sheetToTSV(sheet) {
  if (!sheet) return '';
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells = [];
    let anyValue = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      let v = '';
      if (cell !== undefined && cell !== null) {
        v = cell.w !== undefined ? String(cell.w)
          : cell.v !== undefined ? String(cell.v)
          : '';
        anyValue = anyValue || v.length > 0;
      }
      cells.push(v);
    }
    if (anyValue) rows.push(cells.join('\t'));
  }
  return rows.join('\n');
}

export async function extract(filepath) {
  let wb;
  try {
    /* The xlsx (SheetJS) ESM build doesn't expose readFile(). read()
       accepts a filename but only when type:'file' is explicit; without
       that hint it tries to parse the filename string as a workbook.
       Reading into a Buffer first and passing type:'buffer' is the
       most portable. */
    const buf = await fs.readFile(filepath);
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true, cellNF: false });
  } catch (e) {
    const err = new Error('xlsx_parse_failed: ' + (e.message || e));
    err.code = 'PARSE_FAILED';
    throw err;
  }
  const sheetNames = wb.SheetNames || [];
  const parts = [];
  for (const name of sheetNames) {
    parts.push(SHEET_HEADER(name));
    parts.push(sheetToTSV(wb.Sheets[name]));
    parts.push('');
  }
  return {
    text: parts.join('\n').replace(/\r\n/g, '\n'),
    truncated: false,
    meta: { sheetCount: sheetNames.length },
  };
}