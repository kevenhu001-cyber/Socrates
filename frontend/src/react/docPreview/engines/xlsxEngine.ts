/* XLSX preview engine — every sheet becomes a plain table behind a tab strip.
   Formulas are shown as their last cached value; styling and column widths
   come from the grid, not the workbook theme. */

import { parseXlsx, readArchive, type XlsxSheet } from './ooxml.ts';
import { i18n } from '../../../ui/legacyI18n.ts';
import type { PreviewEngine, PreviewEngineCallbacks } from '../types.ts';

function tableEl(sheet: XlsxSheet): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'xlsx-table';
  const body = document.createElement('tbody');
  sheet.rows.forEach((cells, rowIndex) => {
    const tr = document.createElement('tr');
    cells.forEach((value) => {
      const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
      cell.textContent = value;
      tr.appendChild(cell);
    });
    body.appendChild(tr);
  });
  table.appendChild(body);
  return table;
}

export async function loadXlsxEngine(
  data: ArrayBuffer,
  container: HTMLElement,
  callbacks: PreviewEngineCallbacks,
): Promise<PreviewEngine> {
  const parsed = parseXlsx(readArchive(data));
  if (!parsed || !parsed.sheets.length) {
    callbacks.onError('load', 'No worksheets found.');
    throw new Error('No worksheets found.');
  }

  const tabsEl = document.createElement('div');
  tabsEl.className = 'xlsx-tabs';
  tabsEl.setAttribute('role', 'tablist');
  tabsEl.setAttribute('aria-label', i18n('docPreview.sheets', 'Sheets'));
  const gridEl = document.createElement('div');
  gridEl.className = 'xlsx-grid';
  const host = document.createElement('div');
  host.className = 'doc-preview-xlsx';
  host.appendChild(tabsEl);
  host.appendChild(gridEl);
  container.replaceChildren(host);

  let activeTable: HTMLTableElement | null = null;

  const show = (index: number) => {
    activeTable?.remove();
    activeTable = tableEl(parsed.sheets[index]);
    gridEl.replaceChildren(activeTable);
    for (let at = 0; at < tabButtons.length; at++) {
      tabButtons[at].setAttribute('aria-selected', String(at === index));
    }
  };

  const tabButtons: HTMLButtonElement[] = parsed.sheets.map((sheet, index) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'xlsx-tab';
    tab.textContent = sheet.name;
    tab.setAttribute('role', 'tab');
    tab.addEventListener('click', () => show(index));
    tabsEl.appendChild(tab);
    return tab;
  });

  show(0);
  callbacks.onReady();
  return {
    destroy() {
      container.replaceChildren();
    },
  };
}
