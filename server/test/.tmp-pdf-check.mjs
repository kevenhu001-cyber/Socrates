export function buildPdf({ useXref = true } = {}) {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    '<</Length 39>>\nstream\nBT /F1 12 Tf 72 770 Td (Hello PDF) Tj ET\nendstream',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let body = '%PDF-1.4\n';
  const byteLen = (s) => Buffer.byteLength(s, 'binary');
  const offsets = [0];
  objs.forEach((o, i) => {
    offsets.push(byteLen(body));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  if (!useXref) {
    // no xref at all: startxref 0 pushes pdf.js into its recovery scanner
    body += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n0\n%%EOF`;
    return body;
  }
  const xrefStart = byteLen(body);
  let xref = `xref\n0 ${objs.length + 1}\n`;
  xref += '0000000000 65535 f \r\n';
  for (let i = 1; i <= objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \r\n`;
  }
  body += xref + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return body;
}

import pdfParse from 'pdf-parse';

for (const mode of ['xref', 'no-xref']) {
  const pdf = buildPdf({ useXref: mode === 'xref' });
  process.stdout.write(`--- ${mode} ---\n`);
  try {
    const r = await pdfParse(Buffer.from(pdf, 'binary'));
    process.stdout.write('TEXT: ' + JSON.stringify(r.text) + ' PAGES: ' + r.numpages + '\n');
  } catch (e) {
    process.stdout.write('FAILED: ' + e.message + '\n' + (e.stack || '') + '\n');
  }
}
