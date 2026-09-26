// Debug: self-contained PDF build + parse to isolate the pdf.js failure.
function buildPdf() {
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
  const xrefStart = byteLen(body);
  let xref = `xref\n0 ${objs.length + 1}\n`;
  xref += '0000000000 65535 f \r\n';
  for (let i = 1; i <= objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \r\n`;
  }
  body += xref + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return body;
}

const workerPath = new URL('../node_modules/pdf-parse/lib/pdf.js/v1.10.100/build/pdf.worker.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const mod = await import(workerPath);
const PDFJS = globalThis.PDFJS || mod?.PDFJS;
console.log('PDFJS found:', !!PDFJS, PDFJS ? Object.keys(PDFJS).filter(k => /xref/i.test(k)) : '');
if (PDFJS?.XRef) {
  const orig = PDFJS.XRef.prototype.fetchUncompressed;
  PDFJS.XRef.prototype.fetchUncompressed = function (ref, xrefEntry, suppressEncryption) {
    try {
      return orig.call(this, ref, xrefEntry, suppressEncryption);
    } catch (e) {
      console.log(`PATCHED: fetchUncompressed failed ref=${ref?.toString?.()} offset=${xrefEntry?.offset} gen=${xrefEntry?.gen} start=${this.stream?.start} err=${e.message}`);
      if (this.stream) {
        const sub = this.stream.makeSubStream(xrefEntry.offset + this.stream.start);
        const bytes = new Uint8Array(64);
        const n = sub.getBytes ? 0 : 0; // avoid API mismatch; read via bytes
        console.log('peek:', JSON.stringify(Buffer.from(sub.bytes || [], sub.start, 48).toString('binary')));
      }
      throw e;
    }
  };
}

const pdfParse = (await import('pdf-parse')).default;
try {
  const r = await pdfParse(Buffer.from(buildPdf(), 'binary'));
  console.log('TEXT:', JSON.stringify(r.text), 'PAGES:', r.numpages);
} catch (e) {
  console.log('FAILED:', e.message);
}
