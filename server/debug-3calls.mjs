import { extractArticle } from './src/services/contentExtractor.ts';

(async () => {
  const html = '<html><body>' + 'x'.repeat(300) + '</body></html>';
  const t = Date.now();
  console.log(`[${Date.now()-t}] start`);
  await extractArticle(html, 'http://a.test/1');
  console.log(`[${Date.now()-t}] 1 done`);
  await extractArticle(html, 'http://a.test/2');
  console.log(`[${Date.now()-t}] 2 done`);
  await extractArticle(html, 'http://a.test/3');
  console.log(`[${Date.now()-t}] 3 done`);
  console.log(`[${Date.now()-t}] exit`);
  process.exit(0);
})();