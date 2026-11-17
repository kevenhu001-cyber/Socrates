/* Document preview — the pure seams that don't need a browser:
   the attachment → kind routing, the OOXML archive readers behind the
   xlsx/pptx engines. jsdom only supplies DOMParser for the XML parts. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';
import { strToU8, zipSync } from 'fflate';

globalThis.DOMParser ??= new JSDOM('').window.DOMParser;

const { previewKindFor } = await import('../src/react/docPreview/kinds.ts');
const { readArchive, parseXlsx, parsePptx } =
  await import('../src/react/docPreview/engines/ooxml.ts');

test('previewKindFor routes extensions to engines or the server text fallback', () => {
  assert.equal(previewKindFor('论文.pdf'), 'pdf');
  assert.equal(previewKindFor('报告.DOCX'), 'docx');
  assert.equal(previewKindFor('deck.pptx'), 'pptx');
  assert.equal(previewKindFor('数据.xlsx'), 'xlsx');
  assert.equal(previewKindFor('旧文档.doc'), 'text');
  assert.equal(previewKindFor('slides.ppt'), 'text');
  assert.equal(previewKindFor('手册.epub'), 'text');
  assert.equal(previewKindFor('notes.txt'), 'unsupported');
  assert.equal(previewKindFor('archive.zip'), 'unsupported');
  assert.equal(previewKindFor(''), 'unsupported');
});

test('previewKindFor falls back to mime and docKind when the name is bare', () => {
  assert.equal(previewKindFor('', 'application/pdf'), 'pdf');
  assert.equal(
    previewKindFor('', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    'pptx',
  );
  assert.equal(previewKindFor('', undefined, 'xlsx'), 'xlsx');
  assert.equal(previewKindFor('', undefined, 'ppt'), 'text');
  assert.equal(previewKindFor('未知', 'application/msword'), 'text');
});

const XLSX_XML = {
  'xl/workbook.xml':
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="数据" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml':
    '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>项目</t></si><si><r><t>A</t></r><r><t>B</t></r></si></sst>',
  'xl/worksheets/sheet1.xml':
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1"><v>42</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>直接</t></is></c><c r="B2"><v>3.14</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml':
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
};

function archiveOf(files) {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, body]) => [name, strToU8(body)])),
  );
  const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
  return readArchive(buffer);
}

test('parseXlsx reads sheet order, shared strings, inline strings and gaps', () => {
  const parsed = parseXlsx(archiveOf(XLSX_XML));
  assert.ok(parsed);
  assert.deepEqual(
    parsed.sheets.map((sheet) => sheet.name),
    ['数据', 'Empty'],
  );
  const [first, second] = parsed.sheets[0].rows;
  assert.deepEqual(first, ['项目', 'AB', '', '42']);
  assert.deepEqual(second, ['直接', '3.14']);
  assert.deepEqual(parsed.sheets[1].rows, []);
});

test('readArchive decodes utf-8 part text and reports missing parts', () => {
  const archive = archiveOf(XLSX_XML);
  assert.equal(archive.text('xl/sharedStrings.xml').includes('项目'), true);
  assert.equal(archive.get('xl/nope.xml'), undefined);
  assert.equal(archive.text('xl/nope.xml'), undefined);
});

const PPTX_NS =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const PPTX_XML = {
  'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation ${PPTX_NS}><p:sldSz cx="12192000" cy="6858000"/><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>`,
  'ppt/_rels/presentation.xml.rels':
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>',
  'ppt/slides/_rels/slide1.xml.rels':
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>',
  'ppt/slides/slide1.xml':
    `<?xml version="1.0"?><p:sld ${PPTX_NS}><p:cSld><p:spTree>` +
    '<p:sp><p:spPr><a:xfrm><a:off x="380000" y="320000"/><a:ext cx="6000000" cy="1200000"/></a:xfrm></p:spPr><p:txBody>' +
    '<a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="4400" b="1" i="1"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:rPr><a:t>标题</a:t></a:r></a:p>' +
    '<a:p><a:r><a:t>副标题</a:t></a:r><a:br/><a:r><a:t>第二行</a:t></a:r></a:p>' +
    '</p:txBody></p:sp>' +
    '<p:pic><p:spPr><a:xfrm><a:off x="7000000" y="1000000"/><a:ext cx="4000000" cy="3000000"/></a:xfrm></p:spPr><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>' +
    '<p:graphicFrame><p:xfrm><a:off x="500000" y="4000000"/><a:ext cx="8000000" cy="2000000"/></p:xfrm><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:t>单元格</a:t></a:tc><a:tc><a:t>2</a:t></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>' +
    '<p:grpSp><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/><a:chOff x="0" y="0"/><a:chExt cx="6096000" cy="3429000"/></a:xfrm></p:grpSpPr>' +
    '<p:sp><p:spPr><a:xfrm><a:off x="1000000" y="1000000"/><a:ext cx="2000000" cy="500000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>组内文本</a:t></a:r></a:p></p:txBody></p:sp>' +
    '</p:grpSp>' +
    '</p:spTree></p:cSld></p:sld>',
  'ppt/slides/slide2.xml': `<?xml version="1.0"?><p:sld ${PPTX_NS}><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>末页</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
};

test('parsePptx reads slides in order with text runs, images, tables and groups', () => {
  const parsed = parsePptx(archiveOf(PPTX_XML));
  assert.ok(parsed);
  assert.equal(parsed.slideWidth, 12192000);
  assert.equal(parsed.slideHeight, 6858000);
  assert.equal(parsed.slides.length, 2);

  const [title, subtitle] = parsed.slides[0].shapes[0].paragraphs;
  assert.equal(parsed.slides[0].shapes[0].x, 380000);
  assert.equal(title.runs[0].text, '标题');
  assert.equal(title.runs[0].sizePt, 44);
  assert.equal(title.runs[0].bold, true);
  assert.equal(title.runs[0].italic, true);
  assert.equal(title.runs[0].color, '#1F3864');
  assert.equal(title.align, 'center');
  assert.deepEqual(
    subtitle.runs.map((run) => run.text),
    ['副标题', '\n', '第二行'],
  );

  const picture = parsed.slides[0].shapes[1];
  assert.equal(picture.kind, 'image');
  assert.equal(picture.imagePath, 'ppt/media/image1.png');

  const frame = parsed.slides[0].shapes[2];
  assert.equal(frame.kind, 'table');
  assert.deepEqual(frame.table, [['单元格', '2']]);

  /* The group's child space is half-scale, so the inner shape doubles. */
  const grouped = parsed.slides[0].shapes[3];
  assert.equal(grouped.x, 2000000);
  assert.equal(grouped.w, 4000000);
  assert.equal(grouped.paragraphs[0].runs[0].text, '组内文本');

  assert.equal(parsed.slides[1].shapes[0].paragraphs[0].runs[0].text, '末页');
});

test('parsePptx tolerates slides with no relationship target', () => {
  const files = { ...PPTX_XML };
  delete files['ppt/slides/slide2.xml'];
  const parsed = parsePptx(archiveOf(files));
  assert.equal(parsed.slides.length, 1);
});
