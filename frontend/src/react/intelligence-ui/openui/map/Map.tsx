import { Button as UiButton } from '../../../ui/Button';
// Adapted from thesysdev/open-intelligent-ui map.tsx (MIT); see ../LICENSE.
import { defineComponent, reactive, useIsStreaming, useStateField } from '@openuidev/react-lang';
import { useEffect, useId, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { z } from 'zod/v4';
import { fetchRemote, MEDIA_API, useRemote } from '../remoteData';
import { useRemoteLabels } from '../remoteLabels';
import { webUrl } from '../style';
import { boundsOf, coordinate, type LatLng } from './geometry';
import { loadMapLibre, vectorStyle } from './basemap';

interface Place { key: string; label: string; lat: number; lng: number; category?: string; sourceUrl?: string; resolvedLabel?: string }
interface MarkerInput { type?: string; typeName?: string; partial?: boolean; props?: { label?: string; lat?: number; lng?: number; category?: string; place?: string } }
interface Route { points: [number, number][]; profile: 'driving'; distance: number; duration: number }

function markerInputs(value: unknown) {
  return (Array.isArray(value) ? value.flat() as MarkerInput[] : []).filter((item) => item?.typeName === 'MapMarker' && !item.partial && typeof item.props?.label === 'string').slice(0, 12);
}

function usePlaces(markers: unknown, streaming: boolean) {
  const inputs = markerInputs(markers);
  const signature = JSON.stringify(inputs.map((item) => item.props));
  const [resolved, setResolved] = useState<{ signature: string; places: Place[]; missing: boolean } | null>(null);
  useEffect(() => {
    if (streaming) return;
    let active = true;
    const records = JSON.parse(signature) as NonNullable<MarkerInput['props']>[];
    const timer = setTimeout(() => {
      Promise.all(records.map(async (props, index): Promise<Place | null> => {
        const base = { key: `${index}-${props.label}`, label: props.label!, category: props.category };
        const pair = coordinate(props.lat, props.lng);
        if (pair) return { ...base, lat: pair[0], lng: pair[1] };
        const query = (props.place || props.label || '').trim();
        if (query.length < 2 || query.length > 200) return null;
        try {
          const data = await fetchRemote<{ places: { lat: number; lng: number; label: string; sourceUrl: string }[] }>(`${MEDIA_API}/places?q=${encodeURIComponent(query)}`);
          const place = data.places?.find((candidate) => coordinate(candidate.lat, candidate.lng));
          return place ? { ...base, ...place, label: base.label, resolvedLabel: place.label } : null;
        } catch { return null; }
      })).then((places) => {
        if (active) setResolved({ signature, places: places.filter((place): place is Place => place !== null), missing: places.some((place) => place === null) });
      });
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [signature, streaming]);
  const direct = inputs.flatMap((item, index) => {
    const props = item.props!, pair = coordinate(props.lat, props.lng);
    return pair ? [{ key: `${index}-${props.label}`, label: props.label!, lat: pair[0], lng: pair[1], category: props.category }] as Place[] : [];
  });
  const current = resolved?.signature === signature ? resolved : null;
  return { places: current?.places ?? direct, loading: !streaming && !current && inputs.length > direct.length, missing: Boolean(current?.missing) || inputs.length === 0 };
}

export const MapMarker = defineComponent({
  name: 'MapMarker',
  props: z.object({ label: z.string(), lat: z.number().optional(), lng: z.number().optional(), category: z.string().optional(), icon: z.string().optional(), place: z.string().optional() }),
  description: 'A named place. Use place="landmark, city, country" to resolve real coordinates. Supply lat/lng only when verified; never guess. Max 12 markers per map.',
  component: () => null,
});

export const MapView = defineComponent({
  name: 'Map',
  props: z.object({ markers: z.array(MapMarker.ref), route: z.boolean().optional(), selected: reactive(z.string().optional()), height: z.number().optional() }),
  description: 'Interactive street map with category filters, selectable places and optional driving route in marker order. Bind selected to $place. This is a route overview, not walking or turn-by-turn navigation.',
  component: function MapViewComponent({ props, statementId }) {
    const labels = useRemoteLabels();
    const id = useId();
    const streaming = useIsStreaming();
    const selection = useStateField(statementId ?? `map-${id}`, props.selected);
    const selected = typeof selection.value === 'string' ? selection.value : '';
    const resolved = usePlaces(props.markers, streaming);
    const [group, setGroup] = useState('');
    const categories = [...new Set(resolved.places.map((place) => place.category).filter((value): value is string => Boolean(value)))];
    const activeGroup = categories.includes(group) ? group : '';
    const places = resolved.places.filter((place) => !activeGroup || place.category === activeGroup);
    const signature = JSON.stringify(places);
    const routingKey = places.map((place) => `${place.lng},${place.lat}`).join(';');
    const route = useRemote<Route>(props.route && !streaming && !resolved.loading && places.length > 1 ? `${MEDIA_API}/route?coords=${encodeURIComponent(routingKey)}` : null);
    const root = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLDivElement>(null);
    const map = useRef<MapLibreMap | null>(null);
    const pins = useRef<Marker[]>([]);
    const select = useRef(selection.setValue);
    select.current = selection.setValue;
    const [ready, setReady] = useState(false);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
      let active = true;
      let instance: MapLibreMap | null = null;
      let observer: ResizeObserver | null = null;
      let theme: MutationObserver | null = null;
      setReady(false); setError(false);
      loadMapLibre().then((lib) => {
        if (!active || !canvas.current || !root.current) return;
        instance = new lib.Map({ container: canvas.current, style: vectorStyle(root.current), center: [0, 20], zoom: 1, scrollZoom: false, dragRotate: false, pitchWithRotate: false, attributionControl: { compact: true }, cooperativeGestures: true,
          transformRequest: (url) => {
            const target = new URL(url, location.href);
            if (target.origin !== location.origin || !target.pathname.startsWith(`${MEDIA_API}/maps/`)) throw new Error('Blocked external map resource');
            return { url: target.href, credentials: 'same-origin' };
          },
        });
        instance.touchZoomRotate.disableRotation();
        instance.addControl(new lib.NavigationControl({ showCompass: false }), 'bottom-right');
        instance.on('style.load', () => { if (active) setReady(true); });
        instance.on('error', () => { if (active) setError(true); });
        map.current = instance;
        observer = new ResizeObserver(() => instance?.resize()); observer.observe(canvas.current);
        theme = new MutationObserver(() => {
          if (root.current && instance) { setReady(false); instance.setStyle(vectorStyle(root.current), { diff: false }); }
        });
        theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
      }).catch(() => { if (active) setError(true); });
      return () => { active = false; observer?.disconnect(); theme?.disconnect(); pins.current.forEach((pin) => pin.remove()); pins.current = []; instance?.remove(); map.current = null; };
    }, [attempt]);

    useEffect(() => {
      if (!ready || !map.current) return;
      const instance = map.current;
      let active = true;
      pins.current.forEach((pin) => pin.remove()); pins.current = [];
      loadMapLibre().then((lib) => {
        if (!active) return;
        (JSON.parse(signature) as Place[]).forEach((place, index) => {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'iui-map-pin';
          button.textContent = String(index + 1); button.title = place.label;
          button.setAttribute('aria-label', place.label); button.setAttribute('aria-pressed', String(selected === place.label));
          button.addEventListener('click', () => select.current(place.label));
          const pin = new lib.Marker({ element: button }).setLngLat([place.lng, place.lat]).addTo(instance);
          pins.current.push(pin);
        });
      }).catch(() => { if (active) setError(true); });
      return () => { active = false; pins.current.forEach((pin) => pin.remove()); pins.current = []; };
    }, [ready, signature, selected]);

    useEffect(() => {
      if (!ready || !map.current || !routingKey || streaming) return;
      const coordinates = routingKey.split(';').map((pair) => { const [lng, lat] = pair.split(',').map(Number); return [lat, lng] as LatLng; });
      map.current.fitBounds(boundsOf(coordinates), { padding: 60, maxZoom: 14, duration: 0 });
    }, [ready, routingKey, streaming]);

    useEffect(() => {
      const instance = map.current;
      if (!ready || !instance) return;
      const points = props.route && !route.error && route.data?.profile === 'driving' && Array.isArray(route.data.points) ? route.data.points.filter((point) => Array.isArray(point) && coordinate(point[1], point[0])) : [];
      const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: points.length > 1 ? points : [] } };
      const source = instance.getSource('socrates-route') as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        instance.addSource('socrates-route', { type: 'geojson', data });
        instance.addLayer({ id: 'socrates-route-line', type: 'line', source: 'socrates-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': getComputedStyle(root.current!).getPropertyValue('--ui-info').trim(), 'line-width': 4 } });
      }
    }, [ready, route.data, route.error, props.route]);

    const height = Math.min(560, Math.max(240, props.height ?? 360));
    return <section className="iui-map" ref={root} aria-label={labels.map} data-map-ready={ready ? 'true' : 'false'} data-route-state={route.data ? 'ready' : route.error ? 'error' : route.loading ? 'loading' : 'none'}>
      <div className="iui-map-frame" style={{ height }}>
        <div className="iui-map-surface" ref={canvas} />
        <div className="iui-map-controls">
          {categories.length > 1 ? <select aria-label={labels.filterPlaces} value={activeGroup} onChange={(event) => setGroup(event.target.value)}><option value="">{labels.allPlaces}</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select> : null}
          <UiButton type="button" className="iui-button iui-button-sm" onClick={() => { if (places.length) map.current?.fitBounds(boundsOf(places.map((place) => [place.lat, place.lng] as LatLng)), { padding: 60, maxZoom: 14 }); }}>{labels.recenter}</UiButton>
        </div>
        {!ready && !error ? <p className="iui-map-notice" role="status">{labels.mapLoading}</p> : null}
        {error ? <div className="iui-map-notice" role="status">{labels.mapUnavailable}<UiButton type="button" className="iui-button iui-button-sm" onClick={() => setAttempt((previous) => previous + 1)}>{labels.retry}</UiButton></div> : null}
      </div>
      {resolved.loading ? <p className="iui-caption" role="status">{labels.mapLoading}</p> : null}
      {resolved.missing ? <p className="iui-caption" role="status">{labels.placesUnavailable}</p> : null}
      <ol className="iui-map-places">{places.map((place) => <li key={place.key}><UiButton className="iui-button iui-button-outline" type="button" aria-pressed={selected === place.label} onClick={() => { selection.setValue(place.label); map.current?.easeTo({ center: [place.lng, place.lat], zoom: 14, duration: 0 }); }}>{place.label}</UiButton>{place.sourceUrl && webUrl(place.sourceUrl) ? <a href={webUrl(place.sourceUrl)!} target="_blank" rel="noopener noreferrer">{place.resolvedLabel}</a> : null}</li>)}</ol>
      {props.route && places.length > 1 ? <p className="iui-caption" role="status">{route.error ? labels.routeUnavailable : route.data ? labels.routeDriving : labels.routeLoading}</p> : null}
    </section>;
  },
});
