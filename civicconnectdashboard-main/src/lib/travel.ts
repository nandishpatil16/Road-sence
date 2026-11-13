export type Coordinates = { lat: number; lng: number };

export type RouteReport = {
  id: string;
  title: string;
  type: string;
  status?: string;
  tags?: string[];
  location?: Coordinates | null;
};

// Haversine formula in kilometers
export function haversineDistance(a: Coordinates, b: Coordinates): number {
  const R = 6371; // Earth radius in km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const chord =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

// Check which reports fall within 0.8 km of the driving route geometry
export function routeReports(reports: RouteReport[], coordinates: number[][]): RouteReport[] {
  return reports.filter((report) => {
    if (['resolved', 'closed'].includes(report.status ?? '') || !report.location) return false;
    const { lat, lng } = report.location;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    // Check distance against sampled route coordinates (every 5th point for performance)
    const step = Math.max(1, Math.floor(coordinates.length / 100));
    for (let i = 0; i < coordinates.length; i += step) {
      const pt = coordinates[i];
      if (pt && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
        const d = haversineDistance({ lat, lng }, { lat: pt[1], lng: pt[0] });
        if (d <= 0.8) {
          return true;
        }
      }
    }
    return false;
  });
}

export function isRoadClosure(report: RouteReport): boolean {
  const t = (report.type || '').toLowerCase();
  const title = (report.title || '').toLowerCase();
  const tags = (report.tags || []).map((s) => s.toLowerCase());
  return (
    t === 'construction' ||
    tags.includes('road_block') ||
    title.includes('road block') ||
    title.includes('closure') ||
    title.includes('barricade')
  );
}

// Departure comparisons based on typical rush hour multipliers
export function departureEstimates(baseMinutes: number, rainChance: number | null) {
  const weatherFactor = rainChance !== null && rainChance >= 60 ? 1.1 : 1;
  return [
    { label: 'Early morning', time: '06:00', factor: 1.05, traffic: 'Lower assumed traffic' },
    { label: 'Morning peak', time: '09:00', factor: 1.25, traffic: 'Higher assumed traffic' },
    { label: 'Afternoon', time: '14:00', factor: 1.15, traffic: 'Moderate assumed traffic' },
    { label: 'Evening peak', time: '18:00', factor: 1.4, traffic: 'Higher assumed traffic' },
  ].map((slot) => ({
    ...slot,
    minutes: Math.ceil(baseMinutes * slot.factor * weatherFactor),
  }));
}

export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear Skies';
  if (code <= 3) return 'Partly cloudy / overcast';
  if (code <= 48) return 'Foggy / Hazy';
  if (code <= 67) return 'Drizzle / rain';
  if (code <= 77) return 'Snow';
  if (code <= 86) return 'Showers';
  return 'Thunderstorms';
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? `${hours}h ${rest}m` : `${rest} min`;
}
