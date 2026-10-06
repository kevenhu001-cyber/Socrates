import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import XLSX from 'xlsx';
import { extractText, SUPPORTED_MIMES, PARSERS } from '../src/services/fileParsers/index.js';
import { extract as legacyDocExtract } from '../src/services/fileParsers/legacyDoc.js';
import { extract as legacyXlsExtract } from '../src/services/fileParsers/legacyXls.js';
import { extractOdt, extractOds, extractOdp } from '../src/services/fileParsers/odf.js';

/* New-format coverage: legacy .doc/.xls plus OpenDocument (.odt/.ods/.odp).
 * Fixtures are synthesized in tmp (BIFF8 via SheetJS itself, ODF zips via
 * jszip) so the suite needs no binary blobs and no DATABASE_URL. A real
 * OLE .doc cannot be synthesized by hand, so .doc asserts the graceful
 * PARSE_FAILED path on corrupt input rather than a crash. */

const ODF_MIMES = [
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
];

test('dispatcher maps the new formats and still leaves legacy .ppt unmapped', async () => {
  for (const m of ['application/msword', 'application/vnd.ms-excel', ...ODF_MIMES]) {
    assert.equal(typeof PARSERS[m], 'function', `${m} should have a parser`);
    assert.ok(SUPPORTED_MIMES.includes(m), `SUPPORTED_MIMES missing ${m}`);
  }
  // .ppt stays metadata-only: no pure-JS extractor, must not crash dispatch.
  assert.equal(PARSERS['application/vnd.ms-powerpoint'], undefined);
  await assert.rejects(
    extractText('application/vnd.ms-powerpoint', '/nonexistent'),
    /unsupported_mime/,
  );
});

test('legacy .xls (BIFF8) extracts sheets as tab-separated text', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'socrates-xls-'));
  try {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['Name', 'Age'], ['Alice', 30], ['Bob', 25]]),
      'People',
    );
    const fp = path.join(dir, 't.xls');
    XLSX.writeFile(wb, fp, { bookType: 'biff8' });

    const direct = await legacyXlsExtract(fp);
    assert.match(direct.text, /### Sheet: People/);
    assert.match(direct.text, /Alice\t30/);
    assert.equal(direct.meta.sheetCount, 1);

    const viaDispatch = await extractText('application/vnd.ms-excel', fp);
    assert.match(viaDispatch.text, /Bob\t25/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function writeOdf(kind, bodyInner, filename) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'socrates-odf-'));
  const z = new JSZip();
  z.file('mimetype', kind);
  z.file(
    'content.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
      'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
      'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0">' +
      bodyInner +
      '</office:document-content>',
  );
  const fp = path.join(dir, filename);
  await fs.writeFile(fp, await z.generateAsync({ type: 'nodebuffer' }));
  return { dir, fp };
}

test('odt extracts headings and paragraphs', async () => {
  const { dir, fp } = await writeOdf(
    ODF_MIMES[0],
    '<office:body><office:text>' +
      '<text:h>Hello ODT</text:h>' +
      '<text:p>First <text:span>para</text:span>.</text:p>' +
      '</office:text></office:body>',
    't.odt',
  );
  try {
    const r = await extractOdt(fp);
    assert.match(r.text, /## Hello ODT/);
    assert.match(r.text, /First para\./);
    const viaDispatch = await extractText(ODF_MIMES[0], fp);
    assert.equal(viaDispatch.text, r.text);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('ods extracts tables with repeated columns', async () => {
  const { dir, fp } = await writeOdf(
    ODF_MIMES[1],
    '<office:body><office:spreadsheet>' +
      '<table:table table:name="S1"><table:table-row>' +
      '<table:table-cell><text:p>A</text:p></table:table-cell>' +
      '<table:table-cell table:number-columns-repeated="2"><text:p>B</text:p></table:table-cell>' +
      '</table:table-row></table:table>' +
      '</office:spreadsheet></office:body>',
    't.ods',
  );
  try {
    const r = await extractOds(fp);
    assert.match(r.text, /### Sheet: S1/);
    assert.match(r.text, /A\tB\tB/);
    assert.equal(r.meta.sheetCount, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('odp extracts slide text in order', async () => {
  const { dir, fp } = await writeOdf(
    ODF_MIMES[2],
    '<office:body><office:presentation>' +
      '<draw:page draw:name="p1"><draw:frame><draw:text-box><text:p>Slide one</text:p></draw:text-box></draw:frame></draw:page>' +
      '<draw:page draw:name="p2"><draw:frame><draw:text-box><text:p>Slide two</text:p></draw:text-box></draw:frame></draw:page>' +
      '</office:presentation></office:body>',
    't.odp',
  );
  try {
    const r = await extractOdp(fp);
    assert.match(r.text, /### Slide 1[\s\S]*Slide one/);
    assert.match(r.text, /### Slide 2[\s\S]*Slide two/);
    assert.equal(r.meta.slideCount, 2);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('corrupt inputs fail with PARSE_FAILED instead of crashing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'socrates-corrupt-'));
  try {
    const badDoc = path.join(dir, 'bad.doc');
    await fs.writeFile(badDoc, Buffer.from('not an ole document at all'));
    await assert.rejects(legacyDocExtract(badDoc), (e) => e.code === 'PARSE_FAILED');

    const badOdt = path.join(dir, 'bad.odt');
    await fs.writeFile(badOdt, Buffer.from('not a zip'));
    await assert.rejects(extractOdt(badOdt), (e) => e.code === 'PARSE_FAILED');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
