import http from 'node:http';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { listen } from './_http.js';
import { ApiError } from '../src/lib/errors.js';
import { createIntelligentUiMediaRouter } from '../src/routes/intelligentUiMedia.js';
import { createRemoteCache, remoteBytes } from '../src/services/intelligentUiRemote.js';
import { matchesImageQuery, imageUrl, queryText, parseRouteCoordinates, mapTileUrl, searchUiImages, getUiImage, getMapPlanet, getMapGlyph, lookupUiPlaces, lookupUiRoute } from '../src/services/intelligentUiMedia.js';
import { parseBingImageHtml } from '../src/services/webSearch.js';

const localGet = (url, options = {}) => new Promise((resolve, reject) => {
  http.get(url, { headers: options.headers }, (res) => {
    const parts = [];
    res.on('data', (part) => parts.push(part));
    res.on('end', () => resolve(new Response(Buffer.concat(parts), { status: res.statusCode, headers: res.headers })));
    res.on('error', reject);
  }).on('error', reject);
});
const json = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

test('remote inputs reject arbitrary hosts, credentials, redirects and invalid coordinates', () => {
  for (const value of ['javascript:alert(1)', 'https://127.0.0.1/a', 'https://upload.wikimedia.org.evil.test/wikipedia/a.png', 'https://user:pass@upload.wikimedia.org/wikipedia/a.png', 'https://upload.wikimedia.org:444/wikipedia/a.png', 'https://upload.wikimedia.org/wikipedia/a.svg', 'http://ts1.mm.bing.net/th?id=x']) assert.equal(imageUrl(value), null);
  assert.equal(imageUrl('https://upload.wikimedia.org/wikipedia/commons/a/ab/test.jpg'), 'https://upload.wikimedia.org/wikipedia/commons/a/ab/test.jpg');
  assert.equal(imageUrl('https://ts1.mm.bing.net/th?id=OIP.test'), 'https://ts1.mm.bing.net/th?id=OIP.test');
  assert.equal(queryText('  Eiffel  Tower Paris  '), 'Eiffel Tower Paris');
  for (const value of ['', ['Paris'], 'x'.repeat(201)]) assert.throws(() => queryText(value));
  for (const value of ['0,0', ',;1,2', '1,2;3,', '1,91;2,3', '181,1;2,3', '1,2;3,4;5,6,7', '1e100,0;0,0', ';'.repeat(25)]) assert.throws(() => parseRouteCoordinates(value));
  assert.deepEqual(parseRouteCoordinates('2.2945,48.8584;2.3376,48.8606'), [[2.2945,48.8584],[2.3376,48.8606]]);
  assert.throws(() => mapTileUrl('../escape', '1', '0', '0.pbf'));
  assert.throws(() => mapTileUrl('release', '15', '0', '0.pbf'));
  assert.throws(() => mapTileUrl('release', '2', '4', '0.pbf'));
});

test('bounded caches coalesce concurrent misses, evict entries and retry failures', async () => {
  const cache = createRemoteCache(10000, 2);
  let calls = 0;
  const read = async () => { calls++; return calls; };
  assert.deepEqual(await Promise.all([cache('one', read), cache('one', read)]), [1, 1]);
  await cache('two', read); await cache('three', read); await cache('one', read);
  assert.equal(calls, 4);
  await assert.rejects(cache('bad', async () => { throw new Error('offline'); }));
  assert.equal(await cache('bad', async () => 42), 42);
  const bytesCache = createRemoteCache(10000, 10, (value) => value.length, 4);
  await bytesCache('large', async () => '12345');
  let refreshed = false;
  await bytesCache('large', async () => { refreshed = true; return 'x'; });
  assert.equal(refreshed, true);
});

test('upstream reads are byte bounded and disallow automatic redirect following', async (t) => {
  let options;
  t.mock.method(globalThis, 'fetch', async (_url, opts) => { options = opts; return new Response('12345', { headers: { 'content-type': 'image/png' } }); });
  await assert.rejects(remoteBytes('https://tiles.openfreemap.org/planet', 4));
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
});

test('Bing parser handles HTML entity and URL encoded metadata without substituting unrelated URLs', () => {
  const record = { murl: 'https://example.test/original.jpg', turl: 'https://ts1.mm.bing.net/th?id=OIP.test', purl: 'https://example.test/place', t: 'Eiffel Tower Paris' };
  const html = `<a class="iusc" m="${JSON.stringify(record).replaceAll('"', '&quot;')}"></a>`;
  assert.deepEqual(parseBingImageHtml(html), [{ title: record.t, url: record.murl, thumbnailUrl: record.turl, sourceUrl: record.purl }]);
  assert.equal(parseBingImageHtml(`<a class="iusc" mad="${encodeURIComponent(JSON.stringify(record))}"></a>`).length, 1);
});

test('Commons search returns attributed same-origin raster images and skips unsafe media', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ query: { pages: [
    { title: 'File:Paris photo.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/paris.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Paris_photo.jpg', extmetadata: { Artist: { value: '<a>Photographer</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
    { title: 'Script', imageinfo: [{ mime: 'image/svg+xml', url: 'javascript:alert(1)' }] },
  ] } }));
  const results = await searchUiImages('Paris media unit fixture');
  assert.equal(results.length, 1);
  assert.match(results[0].url, /^\/api\/v2\/intelligent-ui\/image\?url=/);
  assert.equal(results[0].author, 'Photographer');
  assert.equal(results[0].license, 'CC BY-SA 4.0');
});

test('image search falls back to Bing and image proxy rejects HTML responses', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('commons.wikimedia.org')) return new Response('Unavailable', { status: 503 });
    if (String(url).includes('duckduckgo.com')) return new Response('Unavailable', { status: 503 });
    if (String(url).includes('bing.com/images/search')) return new Response('<a class="iusc" m="{&quot;murl&quot;:&quot;https://source.test/tower.jpg&quot;,&quot;turl&quot;:&quot;https://ts2.mm.bing.net/th?id=OIP.fixture&quot;,&quot;purl&quot;:&quot;https://source.test/tower&quot;,&quot;t&quot;:&quot;Bing fallback unit fixture&quot;}"></a>');
    return new Response('<html>not an image</html>', { headers: { 'content-type': 'text/html' } });
  });
  const result = await searchUiImages('Bing fallback unit fixture');
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceUrl, 'https://source.test/tower');
  await assert.rejects(getUiImage('https://ts2.mm.bing.net/th?id=OIP.fixture'));
  await assert.rejects(getUiImage('https://127.0.0.1/private'));
});

test('maps rewrite tile URLs, validate glyph ranges, and preserve geographic coordinate order', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('/planet')) return json({ tiles: ['https://tiles.openfreemap.org/planet/20261011_080001_pt/{z}/{x}/{y}.pbf', 'https://evil.test/{z}/{x}/{y}'] });
    if (String(url).includes('photon.komoot.io')) return json({ features: [{ geometry: { coordinates: [2.2945, 48.8584] }, properties: { osm_type: 'W', osm_id: 5013364, name: 'Eiffel Tower', city: 'Paris' } }, { geometry: { coordinates: [0, 100] } }] });
    return json({ code: 'Ok', routes: [{ distance: 4300, duration: 600, geometry: { coordinates: [[2.2945, 48.8584], [2.3376,48.8606]] } }] });
  });
  assert.deepEqual((await getMapPlanet()).tiles, ['/api/v2/intelligent-ui/maps/tiles/20261011_080001_pt/{z}/{x}/{y}.pbf']);
  const places = await lookupUiPlaces('Eiffel Tower Paris unit fixture');
  assert.equal(places.length, 1);
  assert.equal(places[0].lat, 48.8584);
  assert.match(places[0].sourceUrl, /openstreetmap.org\/way\/5013364/);
  const route = await lookupUiRoute([[2.2945, 48.8584],[2.3376,48.8606]]);
  assert.equal(route.profile, 'driving');
  assert.deepEqual(route.points[0], [2.2945,48.8584]);
  await assert.rejects(getMapGlyph('arbitrary font', '0-255.pbf'));
  await assert.rejects(getMapGlyph('Noto Sans Regular', '1-256.pbf'));
});

test('HTTP endpoints require auth, validate before network access, and return bounded binary content', async () => {
  let calls = 0;
  const services = await import('../src/services/intelligentUiMedia.js');
  const app = express();
  app.use('/api/intelligent-ui', createIntelligentUiMediaRouter((req, res, next) => { if (!req.headers['x-test-auth']) return res.status(401).end(); req.userId = 'test-user'; next(); }, { ...services, searchUiImages: async (query) => { calls++; if (query === 'Unavailable query') throw new Error('Provider offline'); return []; }, getUiImage: async (url) => { if (!services.imageUrl(url)) throw new ApiError(400, 'BAD_REQUEST', 'Invalid image'); return { bytes: Buffer.from([137,80,78,71]), type: 'image/png' }; } }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code }));
  const server = await listen(app);
  try {
    assert.equal((await localGet(`${server.url}/api/intelligent-ui/images?q=Paris`)).status, 401);
    const headers = { 'x-test-auth': 'yes' };
    assert.equal((await localGet(`${server.url}/api/intelligent-ui/images?q=x`, { headers })).status, 400);
    assert.equal(calls, 0);
    assert.equal((await localGet(`${server.url}/api/intelligent-ui/images?q=Paris`, { headers })).status, 200);
    assert.equal(calls, 1);
    const unavailable = await localGet(`${server.url}/api/intelligent-ui/images?q=Unavailable%20query`, { headers });
    assert.equal(unavailable.status, 502);
    assert.equal(unavailable.headers.get('cache-control'), 'no-store');
    const image = await localGet(`${server.url}/api/intelligent-ui/image?url=${encodeURIComponent('https://ts1.mm.bing.net/th?id=OIP.fixture')}`, { headers });
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await image.arrayBuffer()).byteLength, 4);
    assert.equal((await localGet(`${server.url}/api/intelligent-ui/image?url=http://localhost/private`, { headers })).status, 400);
  } finally { await server.close(); }
});


test('DuckDuckGo fallback resolves matching real search thumbnails and rejects Bing trending content', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('commons.wikimedia.org')) return new Response('Unavailable', { status: 503 });
    if (String(url).includes('duckduckgo.com/?')) return new Response("<script>vqd='4-123456789'</script>");
    return json({ results: [{ title: 'Eiffel Tower Paris', thumbnail: 'https://tse4.mm.bing.net/th/id/OIP.realfixture?r=0&pid=Api', url: 'https://source.test/eiffel-tower' }] });
  });
  const result = await searchUiImages('Eiffel Tower Paris duck fixture');
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Eiffel Tower Paris');
  assert.equal(matchesImageQuery('Eiffel Tower Paris', 'The Content Marketing Funnel'), false);
  assert.equal(matchesImageQuery('Eiffel Tower Paris', 'Eiffel Tower at night'), true);
});
