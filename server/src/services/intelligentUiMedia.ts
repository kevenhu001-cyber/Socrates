import { BadRequest } from '../lib/errors.js';
import { imageSearch } from './webSearch.js';
import { createRemoteCache, remoteBytes, remoteJson, remoteUnavailable } from './intelligentUiRemote.js';

const PREFIX = '/api/v2/intelligent-ui';
const TILE_ORIGIN = 'https://tiles.openfreemap.org';
const text = (value: unknown, length = 300): string => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim().slice(0, length) : '';
export function queryText(value: unknown): string {
  if (typeof value !== 'string') throw new BadRequest('q must be 2–200 characters');
  const query = value.replace(/\s+/g, ' ').trim();
  if (query.length < 2 || query.length > 200) throw new BadRequest('q must be 2–200 characters');
  return query;
}
export function webLink(value: unknown): string | null {
  try {
    const u = new URL(String(value));
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && u.href.length <= 2048 ? u.href : null;
  } catch { return null; }
}
/** The image proxy is restricted to these providers' raster thumbnails. */
export function imageUrl(value: unknown): string | null {
  const link = webLink(value);
  if (!link) return null;
  const url = new URL(link);
  if (url.protocol !== 'https:' || url.port || url.hash) return null;
  if (url.hostname === 'upload.wikimedia.org' && url.pathname.startsWith('/wikipedia/') && !/\.svg(?:\/|$)/i.test(url.pathname)) return url.href;
  if (/^t(?:se|s)[1-4]\.mm\.bing\.net$/.test(url.hostname) && /^\/th(?:\/|$)/.test(url.pathname)) return url.href;
  return null;
}
/** Bing sometimes serves unrelated trending cards after blocking a search. */
export function matchesImageQuery(query: string, title: string): boolean {
  const latin = query.toLowerCase().match(/[a-z]{3,}/g)?.filter((word) => !['the', 'and', 'photo', 'photos', 'image', 'images', 'picture', 'pictures', 'for'].includes(word)) || [];
  const chinese = [...query.matchAll(/[\p{Script=Han}]{2,}/gu)].flatMap(([word]) => Array.from({ length: Math.min(12, word.length - 1) }, (_, i) => word.slice(i, i + 2)));
  const terms = [...new Set([...latin, ...chinese])];
  const text = title.toLowerCase();
  return terms.length > 0 && terms.filter((word) => text.includes(word)).length >= Math.min(2, terms.length);
}
export interface UiSearchImage { url: string; title: string; sourceUrl: string; author?: string; license?: string }
const imagesCache = createRemoteCache<UiSearchImage[]>(3600_000, 256);
export async function searchUiImages(query: string): Promise<UiSearchImage[]> {
  return imagesCache(query, async () => {
    const results: UiSearchImage[] = [];
    const add = (raw: unknown, title: unknown, source: unknown, author?: string, license?: string) => {
      const src = imageUrl(raw), sourceUrl = webLink(source);
      if (!src || !sourceUrl || results.some((image) => image.url.endsWith(encodeURIComponent(src)))) return;
      results.push({ url: `${PREFIX}/image?url=${encodeURIComponent(src)}`, title: text(title) || query, sourceUrl, ...(author ? { author } : {}), ...(license ? { license } : {}) });
    };
    // Wikimedia provides licensed originals. Public search providers are the
    // fallbacks for networks that cannot reach Wikimedia or queries with no files.
    try {
      const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '6', prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '960' });
      const data = await remoteJson(`https://commons.wikimedia.org/w/api.php?${params}`, 3500);
      if (data.error) throw remoteUnavailable();
      for (const page of Array.isArray(data.query?.pages) ? data.query.pages : []) {
        const info = page.imageinfo?.[0];
        if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(info?.mime || '')) continue;
        add(info.thumburl || info.url, page.title?.replace(/^File:/, ''), info.descriptionurl, text(info.extmetadata?.Artist?.value), text(info.extmetadata?.LicenseShortName?.value));
      }
    } catch { /* Provider fallback below also covers temporary Wikimedia failures. */ }
    if (!results.length) {
      try {
        const page = await remoteBytes(`https://duckduckgo.com/?${new URLSearchParams({ q: query, iax: 'images', ia: 'images' })}`, 200_000, 6000);
        const html = page.bytes.toString('utf8');
        const token = html.match(/vqd=['"]([\d-]+)['"]/)?.[1] || html.match(/vqd=([\d-]+)/)?.[1];
        if (token) {
          // This fixed endpoint serves JSON with a JavaScript content type; parse
          // its bounded bytes as JSON only, never evaluate a script.
          const response = await remoteBytes(`https://duckduckgo.com/i.js?${new URLSearchParams({ q: query, vqd: token, l: 'us-en', o: 'json', p: '1' })}`, 2_000_000, 6000);
          const found = JSON.parse(response.bytes.toString('utf8'));
          for (const item of Array.isArray(found.results) ? found.results.slice(0, 12) : []) add(item.thumbnail, item.title, item.url);
        }
      } catch { /* Bing remains a fallback if this public search endpoint changes. */ }
    }
    if (!results.length) {
      for (const result of await imageSearch(query, 8)) {
        if (matchesImageQuery(query, `${result.title} ${result.sourceUrl}`)) add(result.thumbnailUrl, result.title, result.sourceUrl);
      }
    }
    // Do not turn an upstream outage into an hour-long empty cache entry.
    if (!results.length) throw remoteUnavailable();
    return results.slice(0, 8);
  });
}

const assetsCache = createRemoteCache<Awaited<ReturnType<typeof remoteBytes>>>(24 * 3600_000, 512, (value) => value.bytes.length, 32 * 1024 * 1024);
export async function getUiImage(value: unknown) {
  const url = imageUrl(value);
  if (!url) throw new BadRequest('Only supported search-provider thumbnails are allowed');
  return assetsCache(url, async () => {
    const result = await remoteBytes(url, 5_000_000);
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(result.type)) throw remoteUnavailable();
    return result;
  });
}

export interface UiPlace { label: string; lat: number; lng: number; sourceUrl: string }
const placesCache = createRemoteCache<UiPlace[]>(24 * 3600_000, 512);
export async function lookupUiPlaces(query: string) {
  return placesCache(query, async () => {
    const data = await remoteJson(`https://photon.komoot.io/api/?${new URLSearchParams({ q: query, limit: '5' })}`);
    const places: UiPlace[] = [];
    for (const feature of Array.isArray(data.features) ? data.features.slice(0, 5) : []) {
      const [lng, lat] = feature.geometry?.coordinates || [];
      const props = feature.properties || {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const kind = { N: 'node', W: 'way', R: 'relation' }[props.osm_type as 'N' | 'W' | 'R'];
      if (!kind || !/^\d+$/.test(String(props.osm_id))) continue;
      places.push({ label: [...new Set([props.name, props.city, props.state, props.country].map((value) => text(value, 100)).filter(Boolean))].join(', '), lat, lng, sourceUrl: `https://www.openstreetmap.org/${kind}/${props.osm_id}` });
    }
    return places;
  });
}

export function parseRouteCoordinates(raw: unknown): [number, number][] {
  if (typeof raw !== 'string' || raw.length > 1500) throw new BadRequest('coords must contain 2–25 lng,lat pairs');
  const pairs = raw.split(';');
  if (pairs.length < 2 || pairs.length > 25) throw new BadRequest('coords must contain 2–25 lng,lat pairs');
  return pairs.map((pair) => {
    if (!/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(pair)) throw new BadRequest('Invalid route coordinate');
    const [lng, lat] = pair.split(',').map(Number);
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) throw new BadRequest('Invalid route coordinate');
    return [lng, lat];
  });
}
const routeCache = createRemoteCache<{ points: [number, number][]; distance: number; duration: number; profile: 'driving' }>(600_000, 128);
export async function lookupUiRoute(coords: [number, number][]) {
  const key = coords.map((pair) => pair.join(',')).join(';');
  return routeCache(key, async () => {
    const data = await remoteJson(`https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`);
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !Array.isArray(route?.geometry?.coordinates)) throw remoteUnavailable();
    const points = route.geometry.coordinates.filter((pair: unknown) => Array.isArray(pair) && pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]) && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90);
    if (points.length < 2 || points.length > 30000 || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) throw remoteUnavailable();
    return { points, distance: route.distance, duration: route.duration, profile: 'driving' };
  });
}

const planetCache = createRemoteCache<Record<string, unknown>>(3600_000, 1);
export function mapTileUrl(release: string, z: string, x: string, file: string) {
  if (!/^[\w-]{1,80}$/.test(release) || !/^\d{1,2}$/.test(z) || !/^\d{1,5}$/.test(x) || !/^\d{1,5}\.pbf$/.test(file)) throw new BadRequest('Invalid tile');
  const zoom = Number(z), column = Number(x), row = Number(file.slice(0, -4));
  if (zoom > 14 || column >= 2 ** zoom || row >= 2 ** zoom) throw new BadRequest('Invalid tile');
  return `${TILE_ORIGIN}/planet/${release}/${zoom}/${column}/${row}.pbf`;
}
export async function getMapPlanet() {
  return planetCache('planet', async () => {
    const data = await remoteJson(`${TILE_ORIGIN}/planet`);
    const urls = (Array.isArray(data.tiles) ? data.tiles : []).flatMap((value: unknown) => {
      if (typeof value !== 'string') return [];
      const match = /^https:\/\/tiles\.openfreemap\.org\/planet\/([\w-]{1,80})\/\{z\}\/\{x\}\/\{y\}\.pbf$/.exec(value);
      return match ? [`${PREFIX}/maps/tiles/${match[1]}/{z}/{x}/{y}.pbf`] : [];
    });
    if (!urls.length) throw remoteUnavailable();
    return { tilejson: '3.0.0', tiles: urls, minzoom: 0, maxzoom: 14, attribution: 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors' };
  });
}
export async function getMapTile(release: string, z: string, x: string, file: string) {
  const url = mapTileUrl(release, z, x, file);
  return assetsCache(url, async () => ({ ...(await remoteBytes(url)), type: 'application/x-protobuf' }));
}
export async function getMapGlyph(stack: string, range: string) {
  const match = /^(\d{1,5})-(\d{1,5})\.pbf$/.exec(range);
  if (stack !== 'Noto Sans Regular' || !match || Number(match[1]) % 256 || Number(match[2]) !== Number(match[1]) + 255 || Number(match[2]) > 65535) throw new BadRequest('Invalid glyph range');
  const url = `${TILE_ORIGIN}/fonts/${encodeURIComponent(stack)}/${range}`;
  return assetsCache(url, async () => ({ ...(await remoteBytes(url)), type: 'application/x-protobuf' }));
}
