// Adapted from thesysdev/open-intelligent-ui map-utils.ts (MIT); see ../LICENSE.
export type LatLng = [number, number];
export function coordinate(lat: unknown, lng: unknown): LatLng | null {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}
export const lngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat];
export function boundsOf(points: LatLng[]): [[number, number], [number, number]] {
  const latitudes = points.map((point) => point[0]);
  const longitudes = points.map((point) => point[1]);
  return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
}
