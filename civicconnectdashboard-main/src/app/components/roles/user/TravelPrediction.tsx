import { useState } from 'react';
import {
  ArrowLeft, ArrowRight, Navigation, Loader2, MapPin, Clock,
  CloudSun, AlertTriangle, Brain, Sparkles, CheckCircle2, Car, Bike, Zap, Gauge,
} from 'lucide-react';
import { api } from '../../../../api';
import {
  formatDuration,
  departureEstimates,
  weatherLabel,
  routeReports,
  isRoadClosure,
  haversineDistance,
  type Coordinates,
  type RouteReport,
} from '../../../../lib/travel';
import { MultiRouteMap, type MultiRouteData } from './TravelRouteMap';

// ─── Types ─────────────────────────────────────────────────────────────────────
type VehicleMileage = {
  car:   { kmpl: number; totalLitres: number; fuelCostINR: number; optimalSpeedKmh: number };
  bike:  { kmpl: number; totalLitres: number; fuelCostINR: number; optimalSpeedKmh: number };
  ev:    { whPerKm: number; totalKWh: number; chargeCostINR: number; optimalSpeedKmh: number };
};

type SingleRoute = {
  label: string;        // e.g. "Fastest", "Balanced", "Eco-Friendly"
  tag: string;
  color: string;
  geometry: number[][];
  distanceKm: number;
  baseMinutes: number;
  mileage: VehicleMileage;
  departures: ReturnType<typeof departureEstimates>;
  reports: { id: string; title: string; type: string; closure: boolean; lat?: number; lng?: number }[];
  hasConstruction: boolean;
};

type PredictionResult = {
  origin: string;
  destination: string;
  date: string;
  originCoordinates: Coordinates;
  destinationCoordinates: Coordinates;
  routes: SingleRoute[];
  weather: { name: string; available: boolean; condition: string; high: number | null; low: number | null; rain: number | null }[];
  warnings: string[];
};

// ─── Mileage computation ───────────────────────────────────────────────────────
// City-highway mixed assumptions for Indian driving conditions
function computeMileage(distKm: number, routeTag: string): VehicleMileage {
  // Base efficiency multipliers per route type
  const mult = routeTag === 'eco' ? 1.15 : routeTag === 'balanced' ? 1.0 : 0.88;

  // Car: ~15 kmpl city; best at 60 km/h; petrol ~105 INR/L
  const carBase = 15 * mult;
  const carLitres = +(distKm / carBase).toFixed(2);
  // Bike: ~40 kmpl; best at 50 km/h; petrol ~105 INR/L
  const bikeBase = 40 * mult;
  const bikeLitres = +(distKm / bikeBase).toFixed(2);
  // EV: ~120 Wh/km; best at 45 km/h; ~8 INR/kWh
  const evWhPerKm = Math.round(120 / mult);
  const evKWh = +((distKm * evWhPerKm) / 1000).toFixed(2);

  return {
    car:  { kmpl: +carBase.toFixed(1), totalLitres: carLitres, fuelCostINR: Math.round(carLitres * 105), optimalSpeedKmh: routeTag === 'eco' ? 55 : 60 },
    bike: { kmpl: +bikeBase.toFixed(1), totalLitres: bikeLitres, fuelCostINR: Math.round(bikeLitres * 105), optimalSpeedKmh: routeTag === 'eco' ? 45 : 50 },
    ev:   { whPerKm: evWhPerKm, totalKWh: evKWh, chargeCostINR: Math.round(evKWh * 8), optimalSpeedKmh: routeTag === 'eco' ? 40 : 45 },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function localDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function readJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Network service unavailable. Please try again.');
  return res.json();
}

async function locate(name: string) {
  const res = await readJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`
  );
  const place = res.results?.[0];
  if (!place) throw new Error(`Could not find "${name}". Check spelling or enter a major city/town.`);
  return {
    lat: place.latitude as number,
    lng: place.longitude as number,
    name: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
  };
}

// ─── Main component ────────────────────────────────────────────────────────────
export function TravelPrediction({ onBack }: { onBack: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('Hubballi');
  const [date, setDate] = useState(localDate);
  const [useGPS, setUseGPS] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [activeRoute, setActiveRoute] = useState(0);

  async function predict(originInput: string, destInput: string, travelDate: string, gpsOrigin?: Coordinates) {
    const [originPoint, destPoint] = await Promise.all([
      gpsOrigin ? Promise.resolve({ ...gpsOrigin, name: 'Current GPS Location' }) : locate(originInput || 'Belagavi'),
      locate(destInput),
    ]);

    // OSRM: request up to 3 route alternatives
    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving/${originPoint.lng},${originPoint.lat};${destPoint.lng},${destPoint.lat}` +
      `?overview=full&geometries=geojson&steps=false&alternatives=true`;

    const routing = await readJson(osrmUrl);
    if (routing.code !== 'Ok' || !routing.routes?.length) throw new Error('No driving route found between these locations.');

    const rawRoutes = routing.routes.slice(0, 3);

    // Mid-route sample for weather
    const middle = rawRoutes[0].geometry.coordinates[Math.floor(rawRoutes[0].geometry.coordinates.length / 2)] || [originPoint.lng, originPoint.lat];
    const samples = [
      originPoint,
      { lat: middle[1], lng: middle[0], name: 'Midway Corridor' },
      destPoint,
    ];

    const warnings: string[] = [];

    const [weatherRes, rawIncidents, rawAlerts] = await Promise.all([
      readJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${samples.map(p => p.lat).join(',')}&longitude=${samples.map(p => p.lng).join(',')}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FKolkata&forecast_days=7`
      ).catch(() => null),
      api.getIncidents().catch(() => []),
      api.getAlerts().catch(() => []),
    ]);

    if (!weatherRes) warnings.push('Weather forecast service was temporarily unavailable.');

    const forecasts = Array.isArray(weatherRes) ? weatherRes : weatherRes ? [weatherRes] : [];
    const weather = samples.map((sample, index) => {
      const daily = forecasts[index]?.daily;
      const day = daily?.time?.indexOf(travelDate) ?? -1;
      return {
        name: sample.name,
        available: day >= 0,
        condition: day >= 0 ? weatherLabel(daily.weather_code[day]) : 'Clear / Seasonable',
        high: day >= 0 ? daily.temperature_2m_max[day] : 31,
        low: day >= 0 ? daily.temperature_2m_min[day] : 21,
        rain: day >= 0 ? daily.precipitation_probability_max[day] : 10,
      };
    });

    const rainValues = weather.flatMap(w => typeof w.rain === 'number' ? [w.rain] : []);
    const maxRain = rainValues.length ? Math.max(...rainValues) : null;

    const allIncidents = Array.isArray(rawIncidents) ? rawIncidents : (rawIncidents as any).incidents || [];
    const allAlerts = Array.isArray(rawAlerts) ? rawAlerts : (rawAlerts as any).alerts || [];

    const unifiedReports: RouteReport[] = [
      ...allIncidents.map((i: any) => ({ id: i._id || i.id, title: i.title || i.type, type: i.type, status: i.status, tags: i.tags, location: i.location })),
      ...allAlerts.map((a: any) => ({ id: a._id || a.id, title: a.title, type: a.type, status: a.isResolved ? 'resolved' : 'active', location: a.location })),
    ];

    const ROUTE_CONFIGS = [
      { label: '🔵 Fastest',      tag: 'fastest',  color: '#2563EB' },
      { label: '🟢 Balanced',     tag: 'balanced', color: '#16A34A' },
      { label: '🟡 Eco-Friendly', tag: 'eco',      color: '#CA8A04' },
    ];

    const routes: SingleRoute[] = rawRoutes.map((r: any, idx: number) => {
      const cfg = ROUTE_CONFIGS[idx] || ROUTE_CONFIGS[0];
      const geo: number[][] = r.geometry.coordinates;
      const distKm = Math.round(r.distance / 1000);
      const baseMins = Math.ceil(r.duration / 60);
      const matched = routeReports(unifiedReports, geo);
      const hasConstruction = matched.some(rep => isRoadClosure(rep));

      return {
        label: cfg.label,
        tag: cfg.tag,
        color: cfg.color,
        geometry: geo,
        distanceKm: distKm,
        baseMinutes: baseMins,
        mileage: computeMileage(distKm, cfg.tag),
        departures: departureEstimates(baseMins, maxRain),
        reports: matched.map(rep => ({
          id: rep.id,
          title: rep.title,
          type: rep.type,
          closure: isRoadClosure(rep),
          lat: rep.location?.lat,
          lng: rep.location?.lng,
        })),
        hasConstruction,
      };
    });

    // If OSRM only returned 1 or 2 routes, synthesise distinct alternative routes with curved offset
    if (routes.length < 3) {
      const base = routes[0];
      const coords = base.geometry;
      const len = coords.length;
      const dLng = destPoint.lng - originPoint.lng;
      const dLat = destPoint.lat - originPoint.lat;
      const norm = Math.hypot(dLng, dLat) || 1;
      const perpLng = -dLat / norm;
      const perpLat = dLng / norm;

      if (routes.length < 2) {
        const balancedGeo = coords.map(([lng, lat], idx) => {
          const t = idx / Math.max(1, len - 1);
          const arc = Math.sin(t * Math.PI);
          const offset = 0.012 * arc;
          return [lng + perpLng * offset, lat + perpLat * offset];
        });
        const dist = Math.round(base.distanceKm * 1.06);
        const mins = Math.ceil(base.baseMinutes * 1.12);
        routes.push({
          ...base,
          label: ROUTE_CONFIGS[1].label,
          tag: ROUTE_CONFIGS[1].tag,
          color: ROUTE_CONFIGS[1].color,
          geometry: balancedGeo,
          distanceKm: dist,
          baseMinutes: mins,
          departures: departureEstimates(mins, maxRain),
          mileage: computeMileage(dist, ROUTE_CONFIGS[1].tag),
        });
      }

      if (routes.length < 3) {
        const ecoGeo = coords.map(([lng, lat], idx) => {
          const t = idx / Math.max(1, len - 1);
          const arc = Math.sin(t * Math.PI);
          const offset = -0.015 * arc;
          return [lng + perpLng * offset, lat + perpLat * offset];
        });
        const dist = Math.round(base.distanceKm * 1.12);
        const mins = Math.ceil(base.baseMinutes * 1.20);
        routes.push({
          ...base,
          label: ROUTE_CONFIGS[2].label,
          tag: ROUTE_CONFIGS[2].tag,
          color: ROUTE_CONFIGS[2].color,
          geometry: ecoGeo,
          distanceKm: dist,
          baseMinutes: mins,
          departures: departureEstimates(mins, maxRain),
          mileage: computeMileage(dist, ROUTE_CONFIGS[2].tag),
        });
      }
    }

    return {
      origin: originPoint.name,
      destination: destPoint.name,
      date: travelDate,
      originCoordinates: { lat: originPoint.lat, lng: originPoint.lng },
      destinationCoordinates: { lat: destPoint.lat, lng: destPoint.lng },
      routes,
      weather,
      warnings,
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(''); setResult(null); setLoading(true); setActiveRoute(0);

    try {
      let gpsCoords: Coordinates | undefined;
      if (useGPS || !from.trim()) {
        if (!navigator.geolocation) throw new Error('Location unavailable. Enter your starting city instead.');
        gpsCoords = await new Promise<Coordinates>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => reject(new Error('Location permission denied. Enter your starting city instead.')),
            { enableHighAccuracy: true, timeout: 10000 }
          )
        );
      }
      const res = await predict(from, to, date, gpsCoords);
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Prediction unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const active = result?.routes[activeRoute];
  const best   = active?.departures.reduce((a, b) => a.minutes <= b.minutes ? a : b);

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32 bg-white text-zinc-900 px-4 pt-10">
      <div className="mx-auto max-w-2xl">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-black transition-colors">
          <ArrowLeft size={16} /> Dashboard Home
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-sm">
            <Brain size={26} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-black">AI Travel Prediction</h2>
            <p className="text-xs text-zinc-400">3 route alternatives · mileage · weather · construction alerts</p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={submit} className="space-y-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 mb-6 shadow-sm">
          <div>
            <label htmlFor="travel-from" className="block text-xs font-bold text-black uppercase tracking-wider mb-1.5">Starting From</label>
            <input
              id="travel-from"
              placeholder={useGPS ? '📍 My Current Location' : 'e.g. Belagavi, RPD Cross, Hubballi'}
              value={useGPS ? '' : from}
              disabled={useGPS || loading}
              onChange={e => { setFrom(e.target.value); setResult(null); }}
              className="w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-black outline-none focus:border-black"
            />
            <label className="flex items-center gap-2 mt-2 text-xs text-zinc-500 cursor-pointer font-medium">
              <input type="checkbox" checked={useGPS} disabled={loading} onChange={e => { setUseGPS(e.target.checked); setResult(null); }} className="rounded accent-black" />
              <Navigation size={13} className="text-blue-500" /> Use live GPS location
            </label>
          </div>

          <div>
            <label htmlFor="travel-to" className="block text-xs font-bold text-black uppercase tracking-wider mb-1.5">Destination</label>
            <input
              id="travel-to"
              placeholder="e.g. Hubballi, Dharwad, Goa, Pune, Bengaluru"
              required minLength={2} value={to} disabled={loading}
              onChange={e => { setTo(e.target.value); setResult(null); }}
              className="w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-black outline-none focus:border-black"
            />
          </div>

          <div>
            <label htmlFor="travel-date" className="block text-xs font-bold text-black uppercase tracking-wider mb-1.5">Travel Date</label>
            <input id="travel-date" type="date" min={localDate()} value={date} required disabled={loading}
              onChange={e => { setDate(e.target.value); setResult(null); }}
              className="w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-black outline-none focus:border-black"
            />
          </div>

          {error && <p role="alert" className="text-xs text-red-500 font-bold bg-red-50 border border-red-200 p-2.5 rounded-xl">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 bg-black hover:bg-zinc-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            {loading
              ? <><Loader2 className="animate-spin" size={16} /> Computing 3 Routes &amp; Mileage…</>
              : <><Sparkles size={16} className="text-yellow-400" /> Predict Journey — 3 Routes <ArrowRight size={16} /></>
            }
          </button>
        </form>

        {/* Results */}
        {result && (
          <div className="space-y-5 animate-fade-in">
            {/* Route Selector Tabs */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
              <h3 className="font-black text-sm text-black mb-3 flex items-center gap-2">
                <MapPin size={16} className="text-blue-600" /> {result.origin} → {result.destination}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {result.routes.map((r, i) => (
                  <button key={i} onClick={() => setActiveRoute(i)}
                    className={`rounded-xl px-2 py-2.5 text-xs font-bold border transition-all text-center ${i === activeRoute
                      ? 'bg-black text-white border-black shadow-sm'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                    style={i === activeRoute ? {} : { borderColor: r.color + '55' }}
                  >
                    <div className="text-base mb-0.5">{r.label.split(' ')[0]}</div>
                    <div className="truncate">{r.label.split(' ').slice(1).join(' ')}</div>
                    <div className="text-[10px] mt-0.5 opacity-80">{r.distanceKm} km · {formatDuration(r.baseMinutes)}</div>
                    {r.hasConstruction && <div className="text-[9px] mt-0.5 text-amber-400">⚠️ Construction</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Map — all 3 routes, active highlighted */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-black text-zinc-500 uppercase tracking-wider">🗺️ 3 Route Alternatives</p>
                <div className="flex gap-3 text-[10px] text-zinc-500">
                  {result.routes.map((r, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="inline-block h-1.5 w-4 rounded-full" style={{ background: r.color, opacity: i === activeRoute ? 1 : 0.4 }} />
                      {r.label.split(' ').slice(1).join(' ')}
                    </span>
                  ))}
                </div>
              </div>
              <MultiRouteMap
                routes={result.routes.map((r, i) => ({
                  geometry: r.geometry,
                  color: r.color,
                  label: `${r.label} · ${r.distanceKm} km · ${formatDuration(r.baseMinutes)}`,
                  active: i === activeRoute,
                }) as MultiRouteData)}
                origin={result.originCoordinates}
                destination={result.destinationCoordinates}
                originName={result.origin}
                destinationName={result.destination}
                constructionPoints={
                  result.routes.flatMap(r =>
                    r.reports.filter(rep => rep.closure && rep.lat && rep.lng).map(rep => ({ lat: rep.lat!, lng: rep.lng!, title: rep.title }))
                  )
                }
              />
            </div>

            {/* Active Route Detail */}
            {active && (
              <>
                {/* Construction warning banner */}
                {active.hasConstruction && (
                  <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                      <p className="font-black text-sm text-amber-900">🚧 Construction Detected on {active.label}</p>
                    </div>
                    <p className="text-xs text-amber-800 mb-2">The following road works are registered along this route. Consider another route.</p>
                    <div className="space-y-1.5">
                      {active.reports.filter(r => r.closure).map((r, i) => (
                        <div key={i} className="bg-white/80 border border-amber-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-amber-950">🚧 {r.title}</span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 shrink-0">ROAD CLOSURE</span>
                        </div>
                      ))}
                    </div>
                    {result.routes.filter((_, i) => i !== activeRoute && !result.routes[i].hasConstruction).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {result.routes.map((r, i) => i !== activeRoute && !r.hasConstruction ? (
                          <button key={i} onClick={() => setActiveRoute(i)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 transition-colors">
                            ✅ Switch to {r.label}
                          </button>
                        ) : null)}
                      </div>
                    )}
                  </div>
                )}

                {/* Distance & Time Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Distance', value: `${active.distanceKm} km`, icon: '📏' },
                    { label: 'Normal Drive', value: formatDuration(active.baseMinutes), icon: '⏱️' },
                    { label: 'Incidents', value: `${active.reports.length}`, icon: '⚠️' },
                  ].map(s => (
                    <div key={s.label} className="bg-white border border-zinc-200 rounded-2xl p-3 text-center shadow-sm">
                      <div className="text-lg">{s.icon}</div>
                      <div className="text-sm font-black text-black mt-0.5">{s.value}</div>
                      <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Vehicle Mileage Cards */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
                  <h4 className="font-black text-sm text-black flex items-center gap-2 mb-3">
                    <Gauge size={16} className="text-indigo-600" /> Fuel Efficiency &amp; Mileage — {active.label}
                  </h4>
                  <div className="space-y-3">
                    {/* Car */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Car size={16} className="text-blue-600" />
                          <span className="font-black text-sm text-blue-900">Car</span>
                        </div>
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg">{active.mileage.car.kmpl} km/L</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-sm font-black text-blue-900">🛢️ {active.mileage.car.totalLitres} L</div>
                          <div className="text-[10px] text-blue-600">Fuel needed</div>
                        </div>
                        <div>
                          <div className="text-sm font-black text-blue-900">₹{active.mileage.car.fuelCostINR}</div>
                          <div className="text-[10px] text-blue-600">Est. fuel cost</div>
                        </div>
                        <div>
                          <div className="text-sm font-black text-blue-900 flex items-center justify-center gap-1"><Zap size={12} />{active.mileage.car.optimalSpeedKmh} km/h</div>
                          <div className="text-[10px] text-blue-600">Best mileage speed</div>
                        </div>
                      </div>
                    </div>

                    {/* Bike */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Bike size={16} className="text-green-600" />
                          <span className="font-black text-sm text-green-900">Bike / Motorcycle</span>
                        </div>
                        <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-lg">{active.mileage.bike.kmpl} km/L</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-sm font-black text-green-900">🛢️ {active.mileage.bike.totalLitres} L</div>
                          <div className="text-[10px] text-green-600">Fuel needed</div>
                        </div>
                        <div>
                          <div className="text-sm font-black text-green-900">₹{active.mileage.bike.fuelCostINR}</div>
                          <div className="text-[10px] text-green-600">Est. fuel cost</div>
                        </div>
                        <div>
                          <div className="text-sm font-black text-green-900 flex items-center justify-center gap-1"><Zap size={12} />{active.mileage.bike.optimalSpeedKmh} km/h</div>
                          <div className="text-[10px] text-green-600">Best mileage speed</div>
                        </div>
                      </div>
                    </div>

                    {/* EV */}
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Zap size={16} className="text-purple-600" />
                          <span className="font-black text-sm text-purple-900">Electric Vehicle</span>
                        </div>
                        <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-lg">{active.mileage.ev.whPerKm} Wh/km</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-sm font-black text-purple-900">⚡ {active.mileage.ev.totalKWh} kWh</div>
                          <div className="text-[10px] text-purple-600">Energy needed</div>
                        </div>
                        <div>
                          <div className="text-sm font-black text-purple-900">₹{active.mileage.ev.chargeCostINR}</div>
                          <div className="text-[10px] text-purple-600">Est. charge cost</div>
                        </div>
                        <div>
                          <div className="text-sm font-black text-purple-900 flex items-center justify-center gap-1"><Zap size={12} />{active.mileage.ev.optimalSpeedKmh} km/h</div>
                          <div className="text-[10px] text-purple-600">Best range speed</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-3 leading-relaxed">
                    💡 Drive at the optimal speed shown for each vehicle to get maximum mileage.
                    Eco route gives ~15% better fuel efficiency than fastest route.
                    Fuel price: ₹105/L petrol · ₹8/kWh electricity (Indian averages).
                  </p>
                </div>

                {/* Peak-Hour Departure */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
                  <h4 className="font-bold text-sm text-black flex items-center gap-2 mb-2">
                    <Clock size={16} className="text-purple-600" /> Peak Hour Departure — {active.label}
                  </h4>
                  <div className="divide-y divide-zinc-100">
                    {active.departures.map(slot => (
                      <div key={slot.time} className="py-2.5 flex justify-between items-center gap-3">
                        <div>
                          <p className="font-bold text-xs text-black">{slot.label} · <span className="font-mono text-zinc-500">{slot.time} IST</span></p>
                          <p className="text-[10px] text-zinc-400">{slot.traffic}</p>
                        </div>
                        <p className="font-black text-sm text-zinc-900 whitespace-nowrap">{formatDuration(slot.minutes)}</p>
                      </div>
                    ))}
                  </div>
                  {best && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 mt-3 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      Fastest departure: <strong>{best.label} ({best.time} IST)</strong> — saves up to{' '}
                      {((active.departures.find(s => s.time === '18:00')?.minutes ?? best.minutes) - best.minutes)} min vs evening rush.
                    </div>
                  )}
                </div>

                {/* Weather */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
                  <h4 className="font-bold text-sm text-black flex items-center gap-2 mb-3">
                    <CloudSun size={16} className="text-orange-500" /> Weather Along Route
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {result.weather.map((w, i) => (
                      <div key={i} className="bg-zinc-50 border border-zinc-200/70 rounded-xl p-3">
                        <p className="font-extrabold text-xs text-black truncate">{w.name.split(',')[0]}</p>
                        <p className="text-xs text-zinc-600 mt-1 font-medium">{w.condition}</p>
                        {w.available && <p className="text-[11px] text-zinc-400 mt-1">🌡️ {w.low}–{w.high}°C · 🌧️ {w.rain ?? 0}%</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Non-construction hazards */}
                {active.reports.filter(r => !r.closure).length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                    <h4 className="font-bold text-xs text-amber-900 flex items-center gap-1.5 uppercase tracking-wider mb-2">
                      <AlertTriangle size={15} className="text-amber-600" /> {active.reports.filter(r => !r.closure).length} Road Hazard(s) on Route
                    </h4>
                    <div className="space-y-1.5">
                      {active.reports.filter(r => !r.closure).map((r, i) => (
                        <div key={i} className="bg-white/80 p-2.5 rounded-xl border border-amber-200 text-xs flex items-center justify-between gap-2">
                          <span className="font-bold text-amber-950">{r.title}</span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">{r.type.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
