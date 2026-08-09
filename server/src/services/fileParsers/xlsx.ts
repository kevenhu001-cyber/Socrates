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

  wb.eachSheet((worksheet) => {
    sheetCount++;
    parts.push(SHEET_HEADER(worksheet.name));
    const rows: string[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        values.push(cellValue(cell.value));
      });
      if (values.length > 0) rows.push(values.join('\t'));
    });
    parts.push(rows.join('\n'));
    parts.push('');
  });

  return {
    text: parts.join('\n').replace(/\r\n/g, '\n'),
    truncated: false,
    meta: { sheetCount },
  };
}