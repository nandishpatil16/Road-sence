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
        // Outline halo
        L.polyline(points, { color: surface, weight: 8, opacity: 0.9 }).addTo(map);
        // Blue driving route line
        L.polyline(points, { color: blue, weight: 5, opacity: 0.95 }).addTo(map);
      }

      // Origin Marker
      L.circleMarker([origin.lat, origin.lng], {
        radius: 9,
        color: surface,
        weight: 3,
        fillColor: blue,
        fillOpacity: 1,
      })
        .bindTooltip(`<b>Start:</b> ${originName}`, { permanent: false, direction: 'top' })
        .addTo(map);

      // Destination Marker
      L.circleMarker([destination.lat, destination.lng], {
        radius: 9,
        color: surface,
        weight: 3,
        fillColor: destinationColor,
        fillOpacity: 1,
      })
        .bindTooltip(`<b>Destination:</b> ${destinationName}`, { permanent: false, direction: 'top' })
        .addTo(map);

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
    } catch (err: any) {
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
          aria-label="Show entire route"
          title="Show entire route"
          onClick={() => {
            if (mapRef.current && boundsRef.current) {
              mapRef.current.fitBounds(boundsRef.current, { padding: [35, 35], maxZoom: 15 });
            }
          }}
          className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition-colors"
        >
          <LocateFixed size={16} />
        </button>
      </div>

      <div
        ref={container}
        className="relative z-0 h-72 sm:h-80 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm"
        role="img"
        aria-label={`Driving route from ${originName} to ${destinationName}`}
      />
      {error && <p role="alert" className="text-xs text-red-500 mt-2">{error}</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2.5 text-xs text-zinc-500 font-medium">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Origin
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Destination
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-5 rounded-full bg-blue-600" /> Blue Route (OSRM)
        </span>
      </div>
    </section>
  );
}
