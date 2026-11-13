import { useState } from 'react';
import { ArrowLeft, ArrowRight, Navigation, Loader2, MapPin, Clock, CloudSun, AlertTriangle, Brain, Sparkles, CheckCircle2 } from 'lucide-react';
import { api } from '../../../../api';
import {
  formatDuration,
  departureEstimates,
  weatherLabel,
  routeReports,
  isRoadClosure,
  type Coordinates,
  type RouteReport,
} from '../../../../lib/travel';
import { TravelRouteMap } from './TravelRouteMap';

type PredictionResult = {
  origin: string;
  destination: string;
  date: string;
  routeGeometry: number[][];
  originCoordinates: Coordinates;
  destinationCoordinates: Coordinates;
  distanceKm: number;
  baseMinutes: number;
  departures: { label: string; time: string; factor: number; traffic: string; minutes: number }[];
  weather: { name: string; available: boolean; condition: string; high: number | null; low: number | null; rain: number | null }[];
  reports: { id: string; title: string; type: string; closure: boolean }[];
  warnings: string[];
};

function localDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function TravelPrediction({ onBack }: { onBack: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('Hubballi');
  const [date, setDate] = useState(localDate);
  const [useGPS, setUseGPS] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PredictionResult | null>(null);

  async function predictJourney(originInput: string, destInput: string, travelDate: string, gpsOrigin?: Coordinates) {
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
      if (!place) throw new Error(`Could not find "${name}". Please check the spelling or enter a major city/town.`);
      return {
        lat: place.latitude as number,
        lng: place.longitude as number,
        name: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
      };
    }

    // 1. Geocode Origin & Destination
    const [originPoint, destPoint] = await Promise.all([
      gpsOrigin ? Promise.resolve({ ...gpsOrigin, name: 'Current GPS Location' }) : locate(originInput || 'Belagavi'),
      locate(destInput),
    ]);

    // 2. Fetch OSRM real driving route
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originPoint.lng},${originPoint.lat};${destPoint.lng},${destPoint.lat}?overview=full&geometries=geojson&steps=false`;
    const routing = await readJson(osrmUrl);
    const route = routing.routes?.[0];
    if (routing.code !== 'Ok' || !route || route.distance < 100) {
      throw new Error('No driving route found between these locations.');
    }

    const geometry: number[][] = route.geometry.coordinates;
    const middle = geometry[Math.floor(geometry.length / 2)] || [originPoint.lng, originPoint.lat];
    const samples = [
      originPoint,
      { lat: middle[1], lng: middle[0], name: 'Midway Highway Corridor' },
      destPoint,
    ];

    const warnings: string[] = [];

    // 3. Fetch Weather & Incidents concurrently
    const [weatherRes, rawIncidents, rawAlerts] = await Promise.all([
      readJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${samples.map((p) => p.lat).join(',')}&longitude=${samples.map((p) => p.lng).join(',')}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FKolkata&forecast_days=7`
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

    const rainValues = weather.flatMap((w) => (typeof w.rain === 'number' ? [w.rain] : []));
    const maxRain = rainValues.length ? Math.max(...rainValues) : null;

    // 4. Map MongoDB active incidents & alerts along route
    const allIncidents = Array.isArray(rawIncidents) ? rawIncidents : rawIncidents.incidents || [];
    const allAlerts = Array.isArray(rawAlerts) ? rawAlerts : rawAlerts.alerts || [];

    const unifiedReports: RouteReport[] = [
      ...allIncidents.map((i: any) => ({
        id: i._id || i.id,
        title: i.title || i.type,
        type: i.type,
        status: i.status,
        tags: i.tags,
        location: i.location,
      })),
      ...allAlerts.map((a: any) => ({
        id: a._id || a.id,
        title: a.title,
        type: a.type,
        status: a.isResolved ? 'resolved' : 'active',
        location: a.location,
      })),
    ];

    const matchedReports = routeReports(unifiedReports, geometry);

    return {
      origin: originPoint.name,
      destination: destPoint.name,
      date: travelDate,
      routeGeometry: geometry,
      originCoordinates: { lat: originPoint.lat, lng: originPoint.lng },
      destinationCoordinates: { lat: destPoint.lat, lng: destPoint.lng },
      distanceKm: Math.round(route.distance / 1000),
      baseMinutes: Math.ceil(route.duration / 60),
      departures: departureEstimates(route.duration / 60, maxRain),
      weather,
      reports: matchedReports.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        closure: isRoadClosure(r),
      })),
      warnings,
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setResult(null);
    setLoading(true);

    try {
      let gpsCoords: Coordinates | undefined;
      if (useGPS || !from.trim()) {
        if (!navigator.geolocation) {
          throw new Error('Location is unavailable. Enter your starting city instead.');
        }
        gpsCoords = await new Promise<Coordinates>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => reject(new Error('Location permission denied. Enter your starting city instead.')),
            { enableHighAccuracy: true, timeout: 10000 }
          )
        );
      }

      const res = await predictJourney(from, to, date, gpsCoords);
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Prediction unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const best = result?.departures.reduce((a, b) => (a.minutes <= b.minutes ? a : b));

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32 bg-white text-zinc-900 px-4 pt-10">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-black transition-colors"
        >
          <ArrowLeft size={16} /> Dashboard Home
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-sm">
            <Brain size={26} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-black">AI Travel Prediction</h2>
            <p className="text-xs text-zinc-400">Multi-scenario route & weather optimization</p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={submit} className="space-y-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 mb-6 shadow-sm">
          <div>
            <label htmlFor="travel-from" className="block text-xs font-bold text-black uppercase tracking-wider mb-1.5">
              Starting From
            </label>
            <input
              id="travel-from"
              placeholder={useGPS ? '📍 My Current Location' : 'e.g. Belagavi, RPD Cross'}
              value={useGPS ? '' : from}
              disabled={useGPS || loading}
              onChange={(e) => {
                setFrom(e.target.value);
                setResult(null);
              }}
              className="w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-black outline-none focus:border-black"
            />
            <label className="flex items-center gap-2 mt-2 text-xs text-zinc-500 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={useGPS}
                disabled={loading}
                onChange={(e) => {
                  setUseGPS(e.target.checked);
                  setResult(null);
                }}
                className="rounded accent-black"
              />
              <Navigation size={13} className="text-blue-500" /> Use live GPS location
            </label>
          </div>

          <div>
            <label htmlFor="travel-to" className="block text-xs font-bold text-black uppercase tracking-wider mb-1.5">
              Destination City / Town
            </label>
            <input
              id="travel-to"
              placeholder="e.g. Hubballi, Dharwad, Goa, Pune"
              required
              minLength={2}
              value={to}
              disabled={loading}
              onChange={(e) => {
                setTo(e.target.value);
                setResult(null);
              }}
              className="w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-black outline-none focus:border-black"
            />
          </div>

          <div>
            <label htmlFor="travel-date" className="block text-xs font-bold text-black uppercase tracking-wider mb-1.5">
              Travel Date
            </label>
            <input
              id="travel-date"
              type="date"
              min={localDate()}
              value={date}
              required
              disabled={loading}
              onChange={(e) => {
                setDate(e.target.value);
                setResult(null);
              }}
              className="w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-black outline-none focus:border-black"
            />
          </div>

          {error && <p role="alert" className="text-xs text-red-500 font-bold bg-red-50 border border-red-200 p-2.5 rounded-xl">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-black hover:bg-zinc-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={16} /> Computing Route & Weather Forecast…
              </>
            ) : (
              <>
                <Sparkles size={16} className="text-yellow-400" /> Predict Journey Route & Delays <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Prediction Results */}
        {result && (
          <div className="space-y-5 animate-fade-in">
            {/* Header Card */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start gap-2.5">
                <MapPin size={20} className="text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-extrabold text-base text-black break-words">
                    {result.origin} → {result.destination}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 font-semibold">
                    🛣️ <strong>{result.distanceKm} km</strong> · ⏱️ ~{formatDuration(result.baseMinutes)} normal driving baseline · 📅 {result.date}
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive Blue Route Map */}
            <TravelRouteMap
              geometry={result.routeGeometry}
              origin={result.originCoordinates}
              destination={result.destinationCoordinates}
              originName={result.origin}
              destinationName={result.destination}
            />

            {/* Departure Comparison */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
              <h4 className="font-bold text-sm text-black flex items-center gap-2 mb-2">
                <Clock size={16} className="text-purple-600" /> Peak Hour Departure Comparison
              </h4>
              <p className="text-[11px] text-zinc-400 mb-3">
                Compares historical congestion windows across morning, afternoon, and evening rush hours.
              </p>

              <div className="divide-y divide-zinc-100">
                {result.departures.map((slot) => (
                  <div key={slot.time} className="py-2.5 flex justify-between gap-3 items-center">
                    <div>
                      <p className="font-bold text-xs text-black">
                        {slot.label} · <span className="font-mono text-zinc-500">{slot.time} IST</span>
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{slot.traffic}</p>
                    </div>
                    <p className="font-black text-sm text-zinc-900 whitespace-nowrap">{formatDuration(slot.minutes)}</p>
                  </div>
                ))}
              </div>

              {best && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 mt-3 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>
                    Fastest estimated departure: <strong>{best.label} ({best.time} IST)</strong> saves up to{' '}
                    {((result.departures.find((s) => s.time === '18:00')?.minutes ?? best.minutes) - best.minutes)}{' '}
                    minutes vs evening rush hour.
                  </span>
                </div>
              )}
            </div>

            {/* Weather Along Route */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
              <h4 className="font-bold text-sm text-black flex items-center gap-2 mb-3">
                <CloudSun size={16} className="text-orange-500" /> 7-Day Open-Meteo Weather Along Route
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {result.weather.map((w, i) => (
                  <div key={i} className="bg-zinc-50 border border-zinc-200/70 rounded-xl p-3">
                    <p className="font-extrabold text-xs text-black truncate">{w.name.split(',')[0]}</p>
                    <p className="text-xs text-zinc-600 mt-1 font-medium">{w.condition}</p>
                    {w.available && (
                      <p className="text-[11px] text-zinc-400 mt-1">
                        🌡️ {w.low}–{w.high}°C · 🌧️ {w.rain ?? 0}%
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Active Road Hazards & Closures along Route */}
            {result.reports.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <h4 className="font-bold text-xs text-amber-900 flex items-center gap-1.5 uppercase tracking-wider mb-2">
                  <AlertTriangle size={15} className="text-amber-600" /> {result.reports.length} Road Hazard(s) Alerted on this Route
                </h4>
                <div className="space-y-2">
                  {result.reports.map((r, i) => (
                    <div key={r.id || i} className="bg-white/80 p-2.5 rounded-xl border border-amber-200 text-xs flex items-center justify-between">
                      <span className="font-bold text-amber-950">{r.title}</span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                        {r.closure ? '🚧 Road Closure' : r.type.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
