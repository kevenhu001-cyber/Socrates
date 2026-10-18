// Adapted from thesysdev/open-intelligent-ui basemap.ts (MIT); see ../LICENSE.
import type { StyleSpecification } from 'maplibre-gl';
import { MEDIA_API } from '../remoteData';

export async function loadMapLibre() {
  const [lib, { default: worker }] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')]);
  lib.setWorkerUrl(worker);
  return lib;
}

/** Geometry is OpenMapTiles; all requests and colors belong to Socrates. */
export function vectorStyle(element: HTMLElement): StyleSpecification {
  const computed = getComputedStyle(element);
  const color = (token: string) => computed.getPropertyValue(token).trim();
  return {
    version: 8,
    glyphs: new URL(`${MEDIA_API}/maps/fonts/{fontstack}/{range}.pbf`, location.href).href.replace(/%7B/g, '{').replace(/%7D/g, '}'),
    sources: { places: { type: 'vector', url: `${MEDIA_API}/maps/planet`, attribution: `<a href="${MEDIA_API}/attribution/openfreemap" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="${MEDIA_API}/attribution/openmaptiles" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="${MEDIA_API}/attribution/openstreetmap" target="_blank" rel="noopener">OpenStreetMap</a>` } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': color('--ui-bg-page') } },
      { id: 'land', type: 'fill', source: 'places', 'source-layer': 'landcover', paint: { 'fill-color': color('--ui-success'), 'fill-opacity': .12 } },
      { id: 'parks', type: 'fill', source: 'places', 'source-layer': 'park', paint: { 'fill-color': color('--ui-success'), 'fill-opacity': .2 } },
      { id: 'water', type: 'fill', source: 'places', 'source-layer': 'water', paint: { 'fill-color': color('--ui-info'), 'fill-opacity': .2 } },
      { id: 'buildings', type: 'fill', source: 'places', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': color('--ui-bg-control') } },
      { id: 'roads', type: 'line', source: 'places', 'source-layer': 'transportation', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color('--ui-border-strong'), 'line-width': ['interpolate', ['linear'], ['zoom'], 8, .5, 14, 2, 18, 8] } },
      { id: 'labels', type: 'symbol', source: 'places', 'source-layer': 'place', layout: { 'text-field': ['coalesce', ['get', 'name'], ['get', 'name_en']], 'text-font': ['Noto Sans Regular'], 'text-size': 12 }, paint: { 'text-color': color('--ui-text-secondary'), 'text-halo-color': color('--ui-bg-page'), 'text-halo-width': 1.5 } },
    ],
  };
}
