import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import type { Coordinates } from '../../../../lib/travel';
import L, { type Map as LeafletMap, type LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  geometry: number[][];
  origin: Coordinates;
  destination: Coordinates;
  originName: string;
  destinationName: string;
};

export function TravelRouteMap({ geometry, origin, destination, originName, destinationName }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const boundsRef = useRef<LatLngBounds | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    setError('');

    try {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(element, {
        scrollWheelZoom: false,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
      });
      mapRef.current = map;

      const blue = '#2563EB';
      const surface = '#FFFFFF';
      const destinationColor = '#EF4444';

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const points: [number, number][] = geometry.flatMap((point) => {
        const [lng, lat] = point;
        return typeof lat === 'number' && typeof lng === 'number' ? [[lat, lng] as [number, number]] : [];
      });

      if (points.length > 0) {
        L.polyline(points, { color: surface, weight: 8, opacity: 0.9 }).addTo(map);
        L.polyline(points, { color: blue, weight: 5, opacity: 0.95 }).addTo(map);
      }

      L.circleMarker([origin.lat, origin.lng], {
        radius: 9, color: surface, weight: 3, fillColor: blue, fillOpacity: 1,
      }).bindTooltip(`<b>Start:</b> ${originName}`, { permanent: false, direction: 'top' }).addTo(map);

      L.circleMarker([destination.lat, destination.lng], {
        radius: 9, color: surface, weight: 3, fillColor: destinationColor, fillOpacity: 1,
      }).bindTooltip(`<b>Destination:</b> ${destinationName}`, { permanent: false, direction: 'top' }).addTo(map);

      const allPoints: [number, number][] = [
        ...points,
        [origin.lat, origin.lng],
        [destination.lat, destination.lng],
      ];
      const bounds = L.latLngBounds(allPoints);
      boundsRef.current = bounds;
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });

      observer = new ResizeObserver(() => {
        if (disposed) return;
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
      });
      observer.observe(element);
    } catch {
      if (!disposed) setError('Map preview unavailable.');
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      boundsRef.current = null;
    };
  }, [geometry, origin, destination, originName, destinationName]);

  return (
    <section aria-label="Journey route map" className="mt-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="font-bold text-sm text-black">OSRM Driving Route</h4>
        <button
          type="button"
          onClick={() => { if (mapRef.current && boundsRef.current) mapRef.current.fitBounds(boundsRef.current, { padding: [35, 35], maxZoom: 15 }); }}
          className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition-colors"
        >
          <LocateFixed size={16} />
        </button>
      </div>
      <div ref={container} className="relative z-0 h-72 sm:h-80 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm" />
      {error && <p role="alert" className="text-xs text-red-500 mt-2">{error}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2.5 text-xs text-zinc-500 font-medium">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Origin</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Destination</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full bg-blue-600" /> Blue Route (OSRM)</span>
      </div>
    </section>
  );
}

// ─── Multi-Route Map: shows up to 3 route alternatives with colour coding ───────
export type MultiRouteData = {
  geometry: number[][];
  color: string;
  label: string;
  active: boolean;
};

type MultiProps = {
  routes: MultiRouteData[];
  origin: Coordinates;
  destination: Coordinates;
  originName: string;
  destinationName: string;
  constructionPoints?: Array<{ lat: number; lng: number; title: string }>;
};

export function MultiRouteMap({
  routes, origin, destination, originName, destinationName, constructionPoints = [],
}: MultiProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(element, { scrollWheelZoom: false });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const allPts: [number, number][] = [[origin.lat, origin.lng], [destination.lat, destination.lng]];

    // Draw inactive (dimmed) routes first, active on top
    [...routes].reverse().forEach(route => {
      const pts: [number, number][] = route.geometry.flatMap(p => {
        const [lng, lat] = p;
        return typeof lat === 'number' && typeof lng === 'number' ? [[lat, lng] as [number, number]] : [];
      });
      pts.forEach(p => allPts.push(p));
      if (pts.length > 0) {
        L.polyline(pts, { color: '#fff', weight: route.active ? 9 : 7, opacity: route.active ? 0.9 : 0.5 }).addTo(map);
        L.polyline(pts, {
          color: route.color,
          weight: route.active ? 6 : 4,
          opacity: route.active ? 1 : 0.4,
          dashArray: route.active ? undefined : '8 6',
        }).addTo(map).bindTooltip(route.label, { sticky: true });
      }
    });

    // 🚧 Construction markers
    constructionPoints.forEach(cp => {
      const icon = L.divIcon({
        className: '', iconSize: [28, 28], iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#F59E0B;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:14px">🚧</div>`,
      });
      L.marker([cp.lat, cp.lng], { icon })
        .bindTooltip(`<b>🚧 Construction:</b> ${cp.title}`, { direction: 'top' }).addTo(map);
    });

    L.circleMarker([origin.lat, origin.lng], { radius: 10, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 })
      .bindTooltip(`<b>Start:</b> ${originName}`, { direction: 'top' }).addTo(map);

    L.circleMarker([destination.lat, destination.lng], { radius: 10, color: '#fff', weight: 3, fillColor: '#EF4444', fillOpacity: 1 })
      .bindTooltip(`<b>Destination:</b> ${destinationName}`, { direction: 'top' }).addTo(map);

    const bounds = L.latLngBounds(allPts);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });

    const obs = new ResizeObserver(() => {
      if (!disposed) { map.invalidateSize(); map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 }); }
    });
    obs.observe(element);

    return () => {
      disposed = true; obs.disconnect();
      mapRef.current?.remove(); mapRef.current = null;
    };
  }, [routes, origin, destination, originName, destinationName, constructionPoints]);

  return (
    <div
      ref={container}
      className="relative z-0 h-72 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm"
      aria-label={`Route comparison map from ${originName} to ${destinationName}`}
    />
  );
}
