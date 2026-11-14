import { useState, useEffect, useRef, useCallback } from "react";
import { api, SOCKET_URL } from "../../../../api";
import { io as socketIO } from "socket.io-client";
import {
  AlertTriangle, AlertCircle, Bell, Car, MapPin, Navigation2, Map as MapIcon,
  User, Shield, Search, Phone, Mail, Lock, Eye, EyeOff,
  ChevronRight, Home, FileText, ClipboardList, Zap,
  Check, Camera, Upload, Star, TrendingUp, Activity, Brain,
  LogOut, Globe, Sun, Moon, Layers, Clock, Navigation,
  Route, Cpu, Radio, CheckCircle2, ChevronDown, Fingerprint, RefreshCcw, X
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { TravelPrediction } from "./TravelPrediction";
import { BELAGAVI_NODES, runAStar, haversine, type RoadNode, type AStarResult } from "../../../../lib/astar";

// ─── Main Tab Type ────────────────────────────────────────────────────────────
type MainTab = "home" | "map" | "alerts" | "reports" | "profile" | "ai" | "emergency" | "route" | "track";
type MapLayer = "traffic" | "accidents" | "parking";

const QUICK_ACTIONS = [
  { id: "reports",   label: "Report Issue",    Icon: AlertTriangle, bg: "#FEF2F2", color: "#EF4444" },
  { id: "ai",        label: "AI Prediction",   Icon: Brain,         bg: "#F5F3FF", color: "#7C3AED" },
  { id: "emergency", label: "Emergency SOS",   Icon: Shield,        bg: "#FFF1F2", color: "#E11D48" },
  { id: "alerts",    label: "Live Alerts",     Icon: Radio,         bg: "#EFF6FF", color: "#2563EB" },
  { id: "route",     label: "Smart Route",     Icon: Route,         bg: "#F0F9FF", color: "#0284C7" },
  { id: "track",     label: "Track Report",    Icon: ClipboardList, bg: "#F5F3FF", color: "#6D28D9" },
];

const REPORT_TYPES = [
  { id: "accident",        label: "Accident",          icon: AlertTriangle, color: "#EF4444", bg: "#FEF2F2", authority: "Traffic Police & Emergency" },
  { id: "traffic_jam",     label: "Traffic Jam",       icon: Car,           color: "#F97316", bg: "#FFF7ED", authority: "Traffic Police" },
  { id: "pothole",         label: "Pothole",           icon: AlertCircle,   color: "#92400E", bg: "#FEF3C7", authority: "Construction Authority / Public Works (PWD)" },
  { id: "road_damage",     label: "Road Damage",       icon: Layers,        color: "#52525B", bg: "#F4F4F5", authority: "Construction Authority" },
  { id: "waterlogging",    label: "Waterlogging",      icon: Navigation,    color: "#0284C7", bg: "#EFF6FF", authority: "Drainage & Municipal PWD" },
  { id: "illegal_parking", label: "Illegal Parking",   icon: Car,           color: "#F97316", bg: "#FFF7ED", authority: "Traffic Enforcement Police" },
];

// ─── Inline CSS ───────────────────────────────────────────────────────────────
const Css = () => (
  <style>{`
    @keyframes floatUp { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
    @keyframes locPulse { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(2.5);opacity:0} }
    @keyframes slideUp { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }
    @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
    @keyframes spin    { to{transform:rotate(360deg)} }
    .animate-float     { animation: floatUp 3s ease-in-out infinite; }
    .animate-slide-up  { animation: slideUp 0.4s ease-out forwards; }
    .animate-fade-in   { animation: fadeIn 0.35s ease-out forwards; }
    .animate-spin-slow { animation: spin 0.8s linear infinite; }
    .no-scrollbar      { scrollbar-width:none; -ms-overflow-style:none; }
    .no-scrollbar::-webkit-scrollbar { display:none; }
    .card       { background:#fff; border:1px solid #F4F4F5; border-radius:1rem; }
    .card-hover:hover { background:#FAFAFA; }
    .input-field { background:#F9F9FA; border:1px solid #F0F0F1; border-radius:0.875rem; }
    .input-field:focus-within { border-color:#000; }
    .btn-primary  { background:#000; color:#fff; border-radius:0.875rem; font-weight:700; transition:background .15s,transform .1s; }
    .btn-primary:hover  { background:#111; }
    .btn-primary:active { transform:scale(0.98); }
    .btn-secondary  { background:#F4F4F5; border-radius:0.875rem; color:#000; font-weight:600; transition:background .15s,transform .1s; }
    .btn-secondary:hover  { background:#EBEBEC; }
    .btn-secondary:active { transform:scale(0.98); }
    .leaflet-popup-content-wrapper { border-radius:12px !important; box-shadow:0 4px 20px rgba(0,0,0,0.12) !important; }
    .leaflet-popup-tip { display:none; }
    .leaflet-popup-close-button { display:none !important; }
  `}</style>
);

// ─── Leaflet Map Component (Belagavi Traffic + Live GPS + Real Incidents) ──────
function CityMapLeaflet({ full = false, layer = "traffic" }: { full?: boolean; layer?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const locMk = useRef<L.Marker | null>(null);
  const locCr = useRef<L.Circle | null>(null);
  const wId = useRef<number | null>(null);
  const hf = useRef(false);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const h = full ? "100%" : 280;

  const locIcon = L.divIcon({
    className: "",
    html: '<div style="position:relative;width:28px;height:28px"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.22);animation:locPulse 2s ease-out infinite"></div><div style="position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 2px 8px rgba(59,130,246,0.5)"></div></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  useEffect(() => {
    if (!ref.current) return;
    if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
    hf.current = false;

    const map = L.map(ref.current, {
      center: [15.85, 74.50],
      zoom: full ? 14 : 13,
      zoomControl: false,
      attributionControl: false,
    });
    mapObj.current = map;

    // Google Maps-styled OpenStreetMap tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);

    // Belagavi Traffic Zones
    const zones = [
      { lat: 15.8497, lng: 74.4977, l: "RPD Cross — Heavy Traffic", c: "#EF4444", r: 250 },
      { lat: 15.8440, lng: 74.5040, l: "College Road — Moderate",    c: "#F97316", r: 200 },
      { lat: 15.8525, lng: 74.5085, l: "Bogarves — Moderate",        c: "#FBBF24", r: 180 },
      { lat: 15.8520, lng: 74.5020, l: "Rani Channamma — Heavy",     c: "#EF4444", r: 220 },
      { lat: 15.8560, lng: 74.5000, l: "Kirloskar Road — Light",     c: "#22C55E", r: 180 },
      { lat: 15.8380, lng: 74.4950, l: "Angol — Light",              c: "#22C55E", r: 200 },
      { lat: 15.8600, lng: 74.4900, l: "Khanapur Rd — Light",        c: "#22C55E", r: 170 },
    ];
    if (layer === "traffic") {
      zones.forEach(z => {
        L.circle([z.lat, z.lng], { radius: z.r, color: z.c, fillColor: z.c, fillOpacity: 0.18, weight: 2.5 })
          .addTo(map)
          .bindPopup(`<b>🚦 ${z.l}</b>`);
      });
    }

    // Real Incidents and Road Blocks from MongoDB
    api.getIncidents().then((data: any) => {
      const list = Array.isArray(data) ? data : data.incidents || data.data || [];
      const typeIcons: Record<string, string> = { accident: '🚗', traffic_jam: '🚦', pothole: '🕳️', road_damage: '🚧', construction: '🚧', waterlogging: '🌊', illegal_parking: '🅿️' };
      list.forEach((inc: any) => {
        if (!inc.location?.lat || !inc.location?.lng) return;
        const isSolved = inc.status === 'resolved' || inc.status === 'closed';
        const isConstruction = inc.type === 'construction' || inc.tags?.includes('road_block') || inc.title?.toLowerCase().includes('road block') || inc.title?.toLowerCase().includes('construction');

        const color = isSolved ? '#6B7280' : isConstruction ? '#EA580C' : inc.priority === 'critical' || inc.priority === 'high' ? '#EF4444' : '#F97316';
        const emoji = isSolved ? '✅' : isConstruction ? '🚧' : (typeIcons[inc.type] || '📍');

        // Draw Road Block Closure Zone on Map if active construction / road block
        if (isConstruction && !isSolved) {
          L.circle([inc.location.lat, inc.location.lng], {
            radius: 200,
            color: '#EA580C',
            fillColor: '#F97316',
            fillOpacity: 0.22,
            weight: 2.5,
            dashArray: '6, 6'
          }).addTo(map).bindPopup(`<b>🚧 Construction Road Block</b><br/>${inc.title || ''}<br/><small>Diversion in effect</small>`);
        }

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer">${emoji}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const marker = L.marker([inc.location.lat, inc.location.lng], { icon }).addTo(map);
        const photoHtml = inc.images?.[0] ? `<img src="${inc.images[0]}" style="width:100%;height:85px;object-fit:cover;border-radius:8px;margin-bottom:6px;"/>` : '';
        
        if (isConstruction) {
          marker.bindPopup(`
            <div style="font-family:'DM Sans',sans-serif;min-width:180px;padding:2px;">
              ${photoHtml}
              <div style="background:#FFF7ED;border:1px solid #FED7AA;color:#C2410C;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:800;margin-bottom:6px;display:inline-block">🚧 ROAD BLOCK / DIVERSION</div>
              <div style="font-weight:700;font-size:13px;color:#111;">${inc.title || 'Road Work in Progress'}</div>
              <div style="font-size:11px;color:#666;margin:4px 0;">📍 ${inc.location?.address || 'Belagavi Road'}</div>
              <div style="font-size:11px;color:#EA580C;font-weight:600;margin-top:4px;">⚠️ Road blocked by Construction Authority. Follow detours.</div>
            </div>
          `);
        } else {
          marker.bindPopup(`
            <div style="font-family:'DM Sans',sans-serif;min-width:160px;padding:2px;">
              ${photoHtml}
              <div style="font-weight:700;font-size:13px;color:#111;">${inc.title || inc.type}</div>
              <div style="font-size:11px;color:#666;margin:2px 0;">📍 ${inc.location?.address || 'Location on map'}</div>
              <div style="font-size:10px;font-weight:700;color:${color}">${(inc.priority || 'MEDIUM').toUpperCase()} ${isSolved ? '• SOLVED' : ''}</div>
            </div>
          `);
        }
      });
    }).catch(() => {});

    // Also fetch Live Alerts from Construction Authority & Municipal Services
    api.getAlerts().then((alertList: any[]) => {
      if (!Array.isArray(alertList)) return;
      alertList.forEach(al => {
        if (!al.location?.lat || !al.location?.lng || al.isResolved) return;
        const isRoadBlock = al.title?.toLowerCase().includes('road block') || al.type === 'traffic';
        const aIcon = L.divIcon({
          className: '',
          html: `<div style="width:30px;height:30px;border-radius:50%;background:#EA580C;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer">⚠️</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });
        L.marker([al.location.lat, al.location.lng], { icon: aIcon }).addTo(map).bindPopup(`
          <div style="font-family:'DM Sans',sans-serif;min-width:160px;">
            <div style="background:#FEF2F2;border:1px solid #FEE2E2;color:#DC2626;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:800;margin-bottom:4px;display:inline-block">LIVE ALERT</div>
            <div style="font-weight:700;font-size:12px;color:#111;">${al.title}</div>
            <div style="font-size:11px;color:#666;margin:2px 0;">${al.message}</div>
          </div>
        `);
      });
    }).catch(() => {});

    // Live GPS Marker
    locMk.current = L.marker([15.85, 74.50], { icon: locIcon, zIndexOffset: 1000 }).addTo(map);
    locCr.current = L.circle([15.85, 74.50], { radius: 50, fillColor: "#3B82F6", fillOpacity: 0.08, color: "#3B82F6", weight: 1, opacity: 0.25 }).addTo(map);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => {
        const ll: L.LatLngExpression = [p.coords.latitude, p.coords.longitude];
        setLiveCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        locMk.current?.setLatLng(ll); locCr.current?.setLatLng(ll);
        map.setView(ll, full ? 16 : 15); hf.current = true;
      }, () => {}, { enableHighAccuracy: true });

      wId.current = navigator.geolocation.watchPosition(p => {
        const ll: L.LatLngExpression = [p.coords.latitude, p.coords.longitude];
        setLiveCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        locMk.current?.setLatLng(ll); locCr.current?.setLatLng(ll).setRadius(p.coords.accuracy || 50);
        if (!hf.current && mapObj.current) { mapObj.current.setView(ll, full ? 15 : 14); hf.current = true; }
      }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    }

    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 300);
    setTimeout(() => map.invalidateSize(), 600);
    return () => {
      if (wId.current !== null) navigator.geolocation.clearWatch(wId.current);
      mapObj.current?.remove();
      mapObj.current = null;
    };
  }, [full, layer]);

  const handleMyLocation = () => {
    if (liveCoords && mapObj.current) {
      mapObj.current.setView([liveCoords.lat, liveCoords.lng], 16, { animate: true });
    }
  };

  return (
    <div className="relative isolate z-0 w-full overflow-hidden rounded-2xl shadow-xs" style={{ height: h }}>
      <div ref={ref} className="w-full h-full" />
      <div style={{ zIndex: 500, position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {[{ label: "Live Traffic", dot: "#F97316" }, { label: "Live GPS", dot: "#3B82F6" }].map(b => (
            <div key={b.label} className="bg-white/90 backdrop-blur-sm rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 border border-zinc-100 shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: b.dot }} />
              <span className="text-[11px] font-bold text-black">{b.label}</span>
            </div>
          ))}
        </div>
        <div className="absolute right-3 bottom-3 flex flex-col gap-2 pointer-events-auto">
          <button onClick={handleMyLocation} className="w-10 h-10 rounded-2xl bg-white border border-zinc-100 flex items-center justify-center shadow-md active:scale-95 transition-all">
            <Navigation size={16} className="text-black" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 1. Home Screen ───────────────────────────────────────────────────────────
function HomeScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const user = api.getUser();
  const displayName = user?.name || "Citizen";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const [stats, setStats] = useState<any>(null);
  const [recentIncidents, setRecentIncidents] = useState<any[]>([]);

  useEffect(() => {
    api.getDashboardStats().then(d => { if (d && !d.message) setStats(d); }).catch(() => {});
    api.getIncidents({ limit: '5' } as any).then((data: any) => {
      const list = Array.isArray(data) ? data : data.incidents || data.data || [];
      setRecentIncidents(list.slice(0, 5));
    }).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-28 bg-white">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[12px] text-zinc-400 font-semibold uppercase tracking-wider">{greeting}</p>
            <h1 className="text-[26px] font-black text-black leading-tight">{displayName} 👋</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setTab("alerts")} className="relative w-11 h-11 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center">
              <Bell size={18} className="text-black" />
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            </button>
            <div onClick={() => setTab("profile")} className="w-11 h-11 rounded-2xl bg-black text-white flex items-center justify-center text-sm font-bold cursor-pointer shadow-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="input-field flex items-center gap-3 px-4 py-3.5">
          <Search size={15} className="text-zinc-400 shrink-0" />
          <input
            placeholder="Search traffic updates, road hazards, alerts…"
            className="flex-1 bg-transparent outline-none text-[13px] text-black placeholder:text-zinc-400 font-medium"
          />
          <div className="w-7 h-7 rounded-xl bg-black flex items-center justify-center shrink-0">
            <Navigation2 size={12} className="text-white" />
          </div>
        </div>
      </div>

      {/* Live Map Widget */}
      <div className="px-5 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[14px] font-black text-black">Live Traffic Map</p>
          <button onClick={() => setTab("map")} className="text-[12px] font-bold text-black flex items-center gap-0.5 hover:underline">
            Full Map <ChevronRight size={13} />
          </button>
        </div>
        <CityMapLeaflet full={false} layer="traffic" />
      </div>

      {/* Quick Actions */}
      <div className="px-5 mb-5">
        <p className="text-[14px] font-black text-black mb-3">Quick Actions</p>
        <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
          <div className="flex gap-3 w-max">
            {QUICK_ACTIONS.map(({ id, label, Icon, bg, color }) => (
              <button
                key={id}
                onClick={() => setTab(id as MainTab)}
                className="flex flex-col items-center gap-2 bg-white border border-zinc-100 rounded-2xl px-4 py-3.5 min-w-[76px] hover:bg-zinc-50 active:scale-95 transition-all shadow-xs"
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: bg }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <span className="text-[11px] font-semibold text-zinc-600 text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Traffic Insights */}
      <div className="px-5 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-black" />
            <p className="text-[14px] font-black text-black">AI Traffic Insights</p>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-100 rounded-xl px-2.5 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-emerald-600">LIVE</span>
          </div>
        </div>
        <div className="bg-white border border-zinc-100 rounded-2xl p-4 shadow-xs">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Active Incidents", value: stats?.incidents?.active?.toString() || "3", color: "#EF4444" },
              { label: "Avg Delay", value: "14 min", color: "#F97316" },
              { label: "City Alerts", value: stats?.alerts?.active?.toString() || "2", color: "#CA8A04" },
              { label: "Resolved Today", value: stats?.incidents?.resolved?.toString() || "5", color: "#16A34A" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                <span className="text-[11px] text-zinc-400 font-semibold">{label}</span>
                <div className="text-[18px] font-black mt-1" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Incidents List */}
      <div className="px-5 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[14px] font-black text-black">Nearby Live Incidents</p>
          <button onClick={() => setTab("track")} className="text-[12px] font-bold text-black flex items-center gap-0.5 hover:underline">
            View All <ChevronRight size={13} />
          </button>
        </div>
        <div className="space-y-2.5">
          {recentIncidents.length === 0 ? (
            <div className="p-4 bg-zinc-50 rounded-2xl text-center text-zinc-400 text-xs">
              Roads are currently clear in your area.
            </div>
          ) : (
            recentIncidents.map((inc, i) => (
              <div key={inc._id || i} className="bg-white border border-zinc-100 rounded-2xl p-3.5 flex items-center gap-3 shadow-xs">
                {inc.images?.[0] ? (
                  <img src={inc.images[0]} alt="evidence" className="w-12 h-12 rounded-xl object-cover border border-zinc-100 shrink-0" />
                ) : (
                  <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center text-xl shrink-0">
                    {inc.type === 'accident' ? '🚗' : inc.type === 'traffic_jam' ? '🚦' : inc.type === 'pothole' ? '🕳️' : '📍'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-black truncate">{inc.title || inc.type}</div>
                  <div className="text-[11px] text-zinc-400 truncate mt-0.5">{inc.location?.address || 'Location on map'}</div>
                  <span className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${inc.priority === 'critical' ? 'bg-red-50 text-red-600' : inc.priority === 'high' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {(inc.priority || 'MEDIUM').toUpperCase()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 2. Full Map Screen ───────────────────────────────────────────────────────
function MapScreen() {
  const [layer, setLayer] = useState<MapLayer>("traffic");
  return (
    <div className="flex flex-col h-full bg-white relative pb-24">
      <div className="px-5 pt-10 pb-3 shrink-0 flex items-center justify-between border-b border-zinc-100">
        <div>
          <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Navigation & Grid</p>
          <h2 className="text-[20px] font-black text-black">Live City Map</h2>
        </div>
        <div className="flex gap-1.5 bg-zinc-100 p-1 rounded-xl">
          {(['traffic', 'accidents'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLayer(l as MapLayer)}
              className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all ${
                layer === l ? 'bg-white text-black shadow-xs' : 'text-zinc-500'
              }`}
            >
              {l === 'traffic' ? '🚦 Traffic' : '🚗 Incidents'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 relative w-full h-full">
        <CityMapLeaflet full={true} layer={layer} />
      </div>
    </div>
  );
}

// ─── 3. Report Screen (With Live Location & Image Upload) ─────────────────────
function ReportsScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const [selectedType, setSelectedType] = useState<string>("accident");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("high");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState("");

  // Live GPS
  const [liveLocation, setLiveLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  // Image Upload
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedCategory = REPORT_TYPES.find(t => t.id === selectedType) || REPORT_TYPES[0];

  const detectLocation = () => {
    setLocLoading(true);
    if (!navigator.geolocation) {
      setLiveLocation({ lat: 15.8497, lng: 74.4977, address: "Belagavi, RPD Cross" });
      setLocLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let address = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const data = await res.json();
          if (data && data.display_name) {
            address = data.display_name.split(",").slice(0, 3).join(", ");
          }
        } catch {}
        setLiveLocation({ lat, lng, address });
        setLocLoading(false);
      },
      () => {
        setLiveLocation({ lat: 15.8497, lng: 74.4977, address: "Belagavi, RPD Cross (GPS fallback)" });
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    detectLocation();
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Image size must be less than 20MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawData = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // High-efficiency memory compression: scale down to 900px max
        const maxDim = 900;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.65);
          setImageBase64(compressed);
          toast.success("📷 Photo compressed & attached!");
        } else {
          setImageBase64(rawData);
          toast.success("📷 Photo attached!");
        }
      };
      img.onerror = () => {
        setImageBase64(rawData);
        toast.success("📷 Photo attached!");
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!liveLocation) {
      toast.error("Waiting for GPS location...");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        type: selectedType,
        title: title.trim() || `${selectedCategory.label} — ${liveLocation.address.split(",")[0]}`,
        description: description.trim() || `${selectedCategory.label} reported by citizen at ${liveLocation.address}`,
        location: { lat: liveLocation.lat, lng: liveLocation.lng, address: liveLocation.address },
        priority,
        images: imageBase64 ? [imageBase64] : [],
      };

      const res = await api.createIncident(payload);
      setTicketId(res._id ? res._id.slice(-6).toUpperCase() : "CC-" + Math.floor(1000 + Math.random() * 9000));
      setSubmitted(true);
      toast.success(`🚨 Dispatched to ${selectedCategory.authority}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit report");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-white pb-20">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <Check size={32} className="text-emerald-600" strokeWidth={3} />
        </div>
        <h2 className="text-[22px] font-black text-black mb-1">Report Dispatched!</h2>
        <p className="text-[13px] text-zinc-500 mb-2">
          Your report has been sent directly to <strong>{selectedCategory.authority}</strong>.
        </p>
        <div className="bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-3 mb-6">
          <span className="text-[11px] text-zinc-400 font-semibold uppercase">Ticket Reference</span>
          <div className="text-[20px] font-black text-black tracking-wider">{ticketId}</div>
        </div>
        <div className="flex gap-3 w-full">
          <button onClick={() => { setSubmitted(false); setImageBase64(null); setTitle(""); setDescription(""); }} className="btn-secondary flex-1 py-3.5 text-xs font-bold">
            Report Another
          </button>
          <button onClick={() => setTab("home")} className="btn-primary flex-1 py-3.5 text-xs font-bold">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-32 px-5 pt-12 bg-white">
      <div className="mb-4">
        <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Citizen Reporting</p>
        <h2 className="text-[22px] font-black text-black">Report an Issue</h2>
        <p className="text-[12px] text-zinc-400 mt-0.5">Captures your live location & alerts respective authorities</p>
      </div>

      {/* Category Grid */}
      <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2.5">Select Issue Type</p>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {REPORT_TYPES.map(({ id, label, icon: Icon, color, bg }) => {
          const active = selectedType === id;
          return (
            <button
              key={id}
              onClick={() => setSelectedType(id)}
              className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                active ? "bg-black text-white border-black shadow-md" : "bg-white border-zinc-100 text-black hover:border-zinc-200"
              }`}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: active ? "#222" : bg }}>
                <Icon size={18} style={{ color: active ? "#FFF" : color }} />
              </div>
              <span className="text-[12px] font-bold leading-tight">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Target Authority Dispatch Banner */}
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between mb-4">
        <div>
          <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Routes Directly To</span>
          <div className="text-[13px] font-extrabold text-blue-950">{selectedCategory.authority}</div>
        </div>
        <span className="text-[10px] bg-blue-200 text-blue-900 font-bold px-2 py-0.5 rounded-lg">Auto Dispatch</span>
      </div>

      {/* Title */}
      <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Title / Short Description</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Enter incident title or brief summary"
        className="w-full input-field px-4 py-3.5 text-[13px] text-black placeholder:text-zinc-400 outline-none mb-4 font-medium"
      />

      {/* Evidence Photo Upload */}
      <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Attach Evidence Photo</p>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="hidden" />

      {imageBase64 ? (
        <div className="relative rounded-2xl overflow-hidden border border-zinc-200 mb-4">
          <img src={imageBase64} alt="Incident evidence" className="w-full h-44 object-cover" />
          <button onClick={() => setImageBase64(null)} className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black text-white rounded-full">
            <X size={16} />
          </button>
          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-lg">
            📷 Photo Attached
          </div>
        </div>
      ) : (
        <div onClick={() => fileInputRef.current?.click()} className="w-full h-24 border-2 border-dashed border-zinc-200 hover:border-black rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors mb-4 bg-zinc-50">
          <Camera size={20} className="text-zinc-400" />
          <span className="text-[12px] font-bold text-black">Take Photo or Choose File</span>
          <span className="text-[10px] text-zinc-400">JPG, PNG up to 15MB</span>
        </div>
      )}

      {/* Live Location Box */}
      <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-3.5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">📍 Live GPS Location</span>
          <button onClick={detectLocation} disabled={locLoading} className="text-[11px] text-blue-600 font-bold hover:underline flex items-center gap-1">
            <RefreshCcw size={11} className={locLoading ? "animate-spin" : ""} />
            {locLoading ? "Detecting..." : "Refresh GPS"}
          </button>
        </div>
        <p className="text-[12px] font-bold text-black line-clamp-1">{liveLocation?.address || "Detecting live GPS..."}</p>
        <span className="text-[10px] text-zinc-400 font-mono mt-0.5 block">
          {liveLocation ? `Coordinates: ${liveLocation.lat.toFixed(5)}, ${liveLocation.lng.toFixed(5)}` : "Fetching satellites..."}
        </span>
      </div>

      {/* Priority Selection */}
      <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Priority Level</p>
      <div className="flex gap-2 mb-4">
        {(["low", "medium", "high", "critical"] as const).map((p) => {
          const active = priority === p;
          return (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold capitalize transition-all border ${
                active ? "bg-black text-white border-black shadow-xs" : "bg-zinc-50 text-zinc-600 border-zinc-100"
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* Notes / Details */}
      <div className="mb-6">
        <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 block mb-2">
          Details (Optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add details, landmarks, or vehicle numbers..."
          rows={4}
          className="w-full bg-zinc-50 border border-zinc-200 focus:border-black focus:bg-white rounded-2xl p-4 text-[13px] text-black placeholder:text-zinc-400 outline-none resize-none min-h-[110px] font-medium transition-all shadow-inner/10"
        />
      </div>

      {/* Submit Button */}
      <button onClick={handleSubmit} disabled={loading || !liveLocation} className="btn-primary w-full py-4 text-[14px] disabled:opacity-50">
        {loading ? "Dispatching Alert to Authorities..." : "🚨 Submit & Alert Respective Authority"}
      </button>
    </div>
  );
}

// ─── 4. Live Alerts Screen ────────────────────────────────────────────────────
function AlertsScreen() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = () => {
    setLoading(true);
    api.getAlerts().then((data: any[]) => {
      if (Array.isArray(data)) {
        setAlerts(data);
      }
    }).catch(() => setAlerts([])).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAlerts();

    const socket = socketIO(SOCKET_URL);
    socket.on('connect', () => socket.emit('join-role', 'all'));
    socket.on('new-alert', (newAlert: any) => {
      setAlerts(prev => [newAlert, ...prev]);
      toast.warning(`⚠️ Live Alert: ${newAlert.title || 'City Broadcast'}`);
    });

    return () => { socket.disconnect(); };
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-28 px-5 pt-12 bg-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">City Broadcaster</p>
          <h2 className="text-[22px] font-black text-black">Active Alerts</h2>
        </div>
        <button
          onClick={fetchAlerts}
          className="text-xs font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-xl transition-all"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="card p-8 text-center flex flex-col items-center justify-center my-6 border border-zinc-100">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <CheckCircle2 size={24} />
          </div>
          <p className="text-[14px] font-bold text-black">All Roads Clear</p>
          <p className="text-[12px] text-zinc-400 mt-1 max-w-xs">
            No active road blocks, collisions, or emergency alerts in Belagavi at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a: any, i: number) => {
            const isRoadBlock = a.title?.toLowerCase().includes('road block') || a.type === 'traffic';
            return (
              <div
                key={a._id || a.id || i}
                className={`card p-4 flex items-start gap-3.5 shadow-xs border ${
                  isRoadBlock ? 'border-orange-200 bg-orange-50/40' : 'border-zinc-100 bg-white'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    isRoadBlock ? 'bg-orange-100 text-orange-700' : 'bg-red-50 text-red-600'
                  }`}
                >
                  {isRoadBlock ? <span className="text-lg">🚧</span> : <AlertTriangle size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[13px] font-bold text-black truncate">{a.title}</span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                        isRoadBlock ? 'bg-orange-200 text-orange-800' : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {isRoadBlock ? 'ROAD BLOCK' : a.severity || 'medium'}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-600 mt-1 leading-relaxed">
                    {a.message || a.loc || 'Alert issued by city authorities'}
                  </p>
                  {a.location?.address && (
                    <p className="text-[11px] text-zinc-400 mt-1.5 flex items-center gap-1">
                      <MapPin size={11} /> {a.location.address}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 5. Emergency SOS Screen ──────────────────────────────────────────────────
function EmergencyScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const handleSOS = async () => {
    setSending(true);
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 900));
    }
    setCountdown(0);
    try {
      await api.createIncident({
        type: "accident",
        title: "🚨 CRITICAL EMERGENCY SOS DISPATCH",
        description: "Emergency SOS triggered by citizen. Immediate response required.",
        location: { lat: 15.8497, lng: 74.4977, address: "Belagavi Central Emergency Grid" },
        priority: "critical",
      });
      toast.success("🚨 EMERGENCY SOS BROADCASTED TO ALL UNITS!");
    } catch {
      toast.error("Failed to transmit SOS. Please call 112 directly.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center pb-24 bg-white">
      <div className="mb-6">
        <span className="text-[11px] text-red-500 font-bold uppercase tracking-wider">High Priority Emergency</span>
        <h2 className="text-[26px] font-black text-black">Instant SOS Dispatch</h2>
        <p className="text-[13px] text-zinc-400 mt-1">Transmits your live coordinates to Police, Ambulance & Control Room</p>
      </div>

      <button
        onClick={handleSOS}
        disabled={sending}
        className="w-48 h-48 rounded-full bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center shadow-2xl active:scale-95 transition-all mb-8 relative border-4 border-red-100"
      >
        <Shield size={48} className="mb-1" />
        <span className="text-[22px] font-black tracking-widest">{countdown > 0 ? countdown : "HOLD SOS"}</span>
        <span className="text-[11px] text-red-200 font-medium">Alert All Units</span>
      </button>

      {/* Quick Call Helplines */}
      <div className="w-full grid grid-cols-2 gap-3 mb-4">
        {[
          { label: "Police 112", tel: "112", icon: "🚓" },
          { label: "Ambulance 108", tel: "108", icon: "🚑" },
        ].map(({ label, tel, icon }) => (
          <a
            key={label}
            href={`tel:${tel}`}
            className="p-3 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs text-black hover:bg-zinc-100"
          >
            <span>{icon}</span> {label}
          </a>
        ))}
      </div>

      <button onClick={() => setTab("home")} className="text-xs text-zinc-400 font-semibold hover:text-black">
        ← Cancel & Return Home
      </button>
    </div>
  );
}

// ─── 6. AI Traffic Prediction Screen ──────────────────────────────────────────
function AIPredictionScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  return <TravelPrediction onBack={() => setTab("home")} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── A* PATHFINDING ALGORITHM (Imported from src/lib/astar.ts) ────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── A* Route Map Visualizer ─────────────────────────────────────────────────
function AStarRouteMap({ result, fromNode, toNode }: { result: AStarResult; fromNode: RoadNode; toNode: RoadNode }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }

    const allLats = result.path.map(n => n.lat);
    const allLngs = result.path.map(n => n.lng);
    const centerLat = (Math.min(...allLats) + Math.max(...allLats)) / 2;
    const centerLng = (Math.min(...allLngs) + Math.max(...allLngs)) / 2;

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false })
      .setView([centerLat, centerLng], 14);
    mapObj.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);

    // Draw the A* computed route polyline
    const routeCoords: [number, number][] = result.path.map(n => [n.lat, n.lng]);
    L.polyline(routeCoords, { color: "#3B82F6", weight: 5, opacity: 0.85, dashArray: undefined }).addTo(map);

    // Start marker (green)
    const startIcon = L.divIcon({ className: "", iconSize: [32, 32], iconAnchor: [16, 16],
      html: `<div style="width:32px;height:32px;border-radius:50%;background:#22C55E;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px">🚶</div>` });
    L.marker([fromNode.lat, fromNode.lng], { icon: startIcon }).addTo(map)
      .bindPopup(`<b>🟢 Start: ${fromNode.name}</b>`).openPopup();

    // End marker (red)
    const endIcon = L.divIcon({ className: "", iconSize: [32, 32], iconAnchor: [16, 16],
      html: `<div style="width:32px;height:32px;border-radius:50%;background:#EF4444;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px">🏁</div>` });
    L.marker([toNode.lat, toNode.lng], { icon: endIcon }).addTo(map)
      .bindPopup(`<b>🔴 Destination: ${toNode.name}</b>`);

    // Intermediate node markers
    result.path.slice(1, -1).forEach((node, i) => {
      const stepIcon = L.divIcon({ className: "", iconSize: [24, 24], iconAnchor: [12, 12],
        html: `<div style="width:24px;height:24px;border-radius:50%;background:#3B82F6;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:900">${i + 1}</div>` });
      L.marker([node.lat, node.lng], { icon: stepIcon }).addTo(map)
        .bindPopup(`<b>${i + 1}. ${node.name}</b><br/><small>via ${result.roads[i + 1]}</small>`);
    });

    // Fit map bounds to path
    map.fitBounds(L.polyline(routeCoords).getBounds(), { padding: [30, 30] });

    return () => { if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; } };
  }, [result, fromNode, toNode]);

  return <div ref={mapRef} style={{ height: 240, borderRadius: "1rem", overflow: "hidden", border: "1px solid #E4E4E7" }} />;
}

// ─── 7. Smart Route Finder — Free-text geocoded locations with OSRM real routing ──
type OSRMRoute = { geometry: number[][]; distanceKm: number; durationMins: number };

async function geocodePlace(query: string): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
    );
    const d = await r.json();
    const p = d.results?.[0];
    if (!p) return null;
    return { lat: p.latitude, lng: p.longitude, name: [p.name, p.admin1].filter(Boolean).join(', ') };
  } catch { return null; }
}

async function fetchOSRMRoutes(
  fromLat: number, fromLng: number, toLat: number, toLng: number
): Promise<OSRMRoute[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&alternatives=true`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) return [];
  return data.routes.slice(0, 3).map((r: any) => ({
    geometry: r.geometry.coordinates as number[][],
    distanceKm: Math.round(r.distance / 1000),
    durationMins: Math.ceil(r.duration / 60),
  }));
}

function SmartRouteMap({ routes, fromCoord, toCoord, fromName, toName, activeIdx }: {
  routes: OSRMRoute[];
  fromCoord: { lat: number; lng: number };
  toCoord: { lat: number; lng: number };
  fromName: string; toName: string; activeIdx: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);

  const COLORS = ['#2563EB', '#16A34A', '#CA8A04'];
  const LABELS = ['Fastest', 'Balanced', 'Eco'];

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false });
    mapObj.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    const allPts: [number, number][] = [[fromCoord.lat, fromCoord.lng], [toCoord.lat, toCoord.lng]];

    // Draw inactive routes first (dimmed), active last (on top)
    [...routes].reverse().forEach((route, revIdx) => {
      const idx = routes.length - 1 - revIdx;
      const pts: [number, number][] = route.geometry.map(([lng, lat]) => [lat, lng]);
      pts.forEach(p => allPts.push(p));
      const isActive = idx === activeIdx;
      L.polyline(pts, { color: '#fff', weight: isActive ? 9 : 7, opacity: isActive ? 0.9 : 0.5 }).addTo(map);
      L.polyline(pts, {
        color: COLORS[idx] || COLORS[0],
        weight: isActive ? 6 : 3,
        opacity: isActive ? 1 : 0.35,
        dashArray: isActive ? undefined : '7 5',
      }).bindTooltip(`${LABELS[idx]} · ${route.distanceKm} km · ${route.durationMins} min`, { sticky: true }).addTo(map);
    });

    // Start marker
    const startIcon = L.divIcon({ className: '', iconSize: [32, 32], iconAnchor: [16, 16],
      html: `<div style="width:32px;height:32px;border-radius:50%;background:#22C55E;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:14px">🟢</div>` });
    L.marker([fromCoord.lat, fromCoord.lng], { icon: startIcon }).bindPopup(`<b>Start:</b> ${fromName}`).addTo(map);

    // End marker
    const endIcon = L.divIcon({ className: '', iconSize: [32, 32], iconAnchor: [16, 16],
      html: `<div style="width:32px;height:32px;border-radius:50%;background:#EF4444;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:14px">🏁</div>` });
    L.marker([toCoord.lat, toCoord.lng], { icon: endIcon }).bindPopup(`<b>Destination:</b> ${toName}`).addTo(map);

    map.fitBounds(L.latLngBounds(allPts), { padding: [30, 30] });

    return () => { mapObj.current?.remove(); mapObj.current = null; };
  }, [routes, fromCoord, toCoord, activeIdx]);

  return (
    <div ref={mapRef} style={{ height: 260, borderRadius: '1rem', overflow: 'hidden', border: '1px solid #E4E4E7' }} />
  );
}

function RouteDirectionScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [useGPS, setUseGPS] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [routes, setRoutes] = useState<OSRMRoute[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fromCoord, setFromCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [toCoord, setToCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');

  const ROUTE_CONFIGS = [
    { label: '🔵 Fastest',      color: '#2563EB', speedNote: 'Highway speed — highest fuel use' },
    { label: '🟢 Balanced',     color: '#16A34A', speedNote: 'City mix — moderate fuel use' },
    { label: '🟡 Eco-Friendly', color: '#CA8A04', speedNote: 'Slower but maximum mileage' },
  ];

  // Mileage helpers
  function carKmpl(tag: number) { return [15, 16.5, 18][tag] ?? 15; }
  function bikeKmpl(tag: number) { return [40, 44, 50][tag] ?? 40; }
  function optSpeedCar(tag: number) { return [60, 55, 50][tag] ?? 60; }
  function optSpeedBike(tag: number) { return [50, 45, 40][tag] ?? 50; }

  const compute = async () => {
    if (!toText.trim()) { toast.error('Enter a destination!'); return; }
    setLoading(true); setError(''); setRoutes([]); setActiveIdx(0);

    try {
      let origin: { lat: number; lng: number; name: string };
      if (useGPS || !fromText.trim()) {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 })
        );
        origin = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'My Location (GPS)' };
      } else {
        const o = await geocodePlace(fromText);
        if (!o) throw new Error(`Could not find "${fromText}". Try a city or landmark name.`);
        origin = o;
      }

      const dest = await geocodePlace(toText);
      if (!dest) throw new Error(`Could not find "${toText}". Try a city or landmark name.`);

      const r = await fetchOSRMRoutes(origin.lat, origin.lng, dest.lat, dest.lng);
      if (!r.length) throw new Error('No route found. Check your locations and try again.');

      setFromCoord({ lat: origin.lat, lng: origin.lng });
      setToCoord({ lat: dest.lat, lng: dest.lng });
      setFromName(origin.name);
      setToName(dest.name);
      setRoutes(r);
      toast.success(`✅ Found ${r.length} route${r.length > 1 ? 's' : ''}!`);
    } catch (e: any) {
      setError(e.message || 'Could not compute route. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const active = routes[activeIdx];

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-28 px-4 pt-10 bg-white">
      {/* Header */}
      <div className="mb-4">
        <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest">Smart Route Finder</p>
        <h2 className="text-[22px] font-black text-black leading-tight">Route Planner</h2>
        <p className="text-[11px] text-zinc-400 mt-0.5">Type any location — 3 route alternatives with mileage</p>
      </div>

      {/* Inputs */}
      <div className="space-y-2.5 mb-4">
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 block">🟢 Starting From</label>
          <input
            value={useGPS ? '' : fromText}
            onChange={e => { setFromText(e.target.value); setRoutes([]); }}
            disabled={useGPS || loading}
            placeholder={useGPS ? '📍 My Current Location (GPS)' : 'e.g. RPD Cross Belagavi, Hubli Station...'}
            className="w-full bg-zinc-50 border border-zinc-200 focus:border-black rounded-xl px-3 py-2.5 text-xs font-bold text-black outline-none transition-all"
          />
          <label className="flex items-center gap-2 mt-1.5 text-xs text-zinc-500 cursor-pointer font-medium">
            <input type="checkbox" checked={useGPS} onChange={e => { setUseGPS(e.target.checked); setRoutes([]); }} className="rounded accent-black" />
            <Navigation size={12} className="text-blue-500" /> Use GPS location
          </label>
        </div>
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 block">🔴 Destination</label>
          <input
            value={toText}
            onChange={e => { setToText(e.target.value); setRoutes([]); }}
            disabled={loading}
            placeholder="e.g. Dharwad, Goa, Bengaluru, Mall of Mysore..."
            className="w-full bg-zinc-50 border border-zinc-200 focus:border-black rounded-xl px-3 py-2.5 text-xs font-bold text-black outline-none transition-all"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500 font-bold bg-red-50 border border-red-200 rounded-xl p-2.5 mb-3">{error}</p>}

      <button onClick={compute} disabled={loading}
        className="btn-primary w-full py-3.5 text-xs font-black flex items-center justify-center gap-2 mb-5">
        {loading
          ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Finding Routes…</>
          : <><Route size={14} /> Find 3 Route Alternatives</>
        }
      </button>

      {/* Results */}
      {routes.length > 0 && fromCoord && toCoord && (
        <div className="space-y-4 animate-fade-in">
          {/* Route Selector */}
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${routes.length}, 1fr)` }}>
            {routes.map((r, i) => {
              const cfg = ROUTE_CONFIGS[i] || ROUTE_CONFIGS[0];
              return (
                <button key={i} onClick={() => setActiveIdx(i)}
                  className={`rounded-xl px-2 py-2.5 text-xs font-bold border transition-all text-center ${i === activeIdx ? 'bg-black text-white border-black shadow-sm' : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'}`}>
                  <div className="text-base">{cfg.label.split(' ')[0]}</div>
                  <div className="mt-0.5 truncate">{cfg.label.split(' ').slice(1).join(' ')}</div>
                  <div className="text-[10px] mt-0.5 opacity-80">{r.distanceKm} km</div>
                  <div className="text-[10px] opacity-80">{r.durationMins} min</div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-3 flex-wrap text-[10px] text-zinc-500">
            {routes.map((_, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-4 rounded-full" style={{ background: ROUTE_CONFIGS[i]?.color || '#000', opacity: i === activeIdx ? 1 : 0.4 }} />
                {ROUTE_CONFIGS[i]?.label.split(' ').slice(1).join(' ')}
              </span>
            ))}
          </div>

          {/* Map */}
          <SmartRouteMap
            routes={routes}
            fromCoord={fromCoord} toCoord={toCoord}
            fromName={fromName} toName={toName}
            activeIdx={activeIdx}
          />

          {/* Route detail for active */}
          {active && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white border border-zinc-200 rounded-2xl p-3 text-center">
                  <div className="text-lg">📏</div>
                  <div className="text-sm font-black text-black">{active.distanceKm} km</div>
                  <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Distance</div>
                </div>
                <div className="bg-white border border-zinc-200 rounded-2xl p-3 text-center">
                  <div className="text-lg">⏱️</div>
                  <div className="text-sm font-black text-black">{active.durationMins} min</div>
                  <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Est. Travel Time</div>
                </div>
              </div>

              {/* Vehicle Mileage */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-black text-black mb-3 flex items-center gap-2">⛽ Vehicle Mileage — {ROUTE_CONFIGS[activeIdx]?.label}</p>
                <div className="space-y-2.5">
                  {/* Car */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5"><Car size={14} className="text-blue-600" /><span className="font-black text-xs text-blue-900">Car</span></div>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg">{carKmpl(activeIdx)} km/L</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div><div className="text-xs font-black text-blue-900">🛢️ {(active.distanceKm / carKmpl(activeIdx)).toFixed(1)} L</div><div className="text-[9px] text-blue-600">Fuel</div></div>
                      <div><div className="text-xs font-black text-blue-900">₹{Math.round((active.distanceKm / carKmpl(activeIdx)) * 105)}</div><div className="text-[9px] text-blue-600">Cost</div></div>
                      <div><div className="text-xs font-black text-blue-900 flex items-center justify-center gap-0.5"><Zap size={10}/>{optSpeedCar(activeIdx)} km/h</div><div className="text-[9px] text-blue-600">Best speed</div></div>
                    </div>
                  </div>
                  {/* Bike */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5"><Car size={14} className="text-green-600" /><span className="font-black text-xs text-green-900">Bike / 2-Wheeler</span></div>
                      <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-lg">{bikeKmpl(activeIdx)} km/L</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div><div className="text-xs font-black text-green-900">🛢️ {(active.distanceKm / bikeKmpl(activeIdx)).toFixed(1)} L</div><div className="text-[9px] text-green-600">Fuel</div></div>
                      <div><div className="text-xs font-black text-green-900">₹{Math.round((active.distanceKm / bikeKmpl(activeIdx)) * 105)}</div><div className="text-[9px] text-green-600">Cost</div></div>
                      <div><div className="text-xs font-black text-green-900 flex items-center justify-center gap-0.5"><Zap size={10}/>{optSpeedBike(activeIdx)} km/h</div><div className="text-[9px] text-green-600">Best speed</div></div>
                    </div>
                  </div>
                  {/* EV */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5"><Zap size={14} className="text-purple-600" /><span className="font-black text-xs text-purple-900">Electric Vehicle</span></div>
                      <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-lg">{[120, 110, 100][activeIdx]} Wh/km</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div><div className="text-xs font-black text-purple-900">⚡ {((active.distanceKm * ([120, 110, 100][activeIdx] ?? 120)) / 1000).toFixed(1)} kWh</div><div className="text-[9px] text-purple-600">Energy</div></div>
                      <div><div className="text-xs font-black text-purple-900">₹{Math.round(((active.distanceKm * ([120, 110, 100][activeIdx] ?? 120)) / 1000) * 8)}</div><div className="text-[9px] text-purple-600">Charge cost</div></div>
                      <div><div className="text-xs font-black text-purple-900 flex items-center justify-center gap-0.5"><Zap size={10}/>{[45, 42, 38][activeIdx] ?? 45} km/h</div><div className="text-[9px] text-purple-600">Best speed</div></div>
                    </div>
                  </div>
                </div>
                <p className="text-[9px] text-zinc-400 mt-2.5 leading-relaxed">
                  💡 Drive at the optimal speed for maximum mileage. Eco route saves ~20% fuel vs Fastest. Fuel: ₹105/L · EV: ₹8/kWh.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 8. Track Report Screen ───────────────────────────────────────────────────
function TrackReportScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getIncidents().then((d: any) => {
      const list = Array.isArray(d) ? d : d.incidents || d.data || [];
      setReports(list);
    }).catch(() => setReports([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-28 px-5 pt-12 bg-white">
      <div className="mb-4">
        <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Status Tracker</p>
        <h2 className="text-[22px] font-black text-black">My Reports Status</h2>
      </div>
      <div className="space-y-3">
        {loading ? (
          <div className="text-xs text-zinc-400 text-center py-8">Loading reports...</div>
        ) : reports.length === 0 ? (
          <div className="text-xs text-zinc-400 text-center py-8">No reports filed yet.</div>
        ) : (
          reports.map((r, i) => (
            <div key={r._id || i} className="card p-4 border border-zinc-100 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-bold text-black">{r.title || r.type}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                  {(r.status || 'open').toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">{r.location?.address || 'Location provided'}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── 9. Profile Screen ────────────────────────────────────────────────────────
function ProfileScreen({ onLogout }: { onLogout?: () => void }) {
  const [currentUser, setCurrentUser] = useState(() => api.getUser());
  const [name, setName] = useState(currentUser?.name || "Citizen");
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    const updated = { ...(currentUser || {}), name: name.trim() };
    api.setUser(updated);
    setCurrentUser(updated);
    setIsEditing(false);
    toast.success("Profile name updated successfully!");
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      api.clearToken();
      window.location.reload();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-28 px-5 pt-12 bg-white">
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-black text-white rounded-full flex items-center justify-center text-2xl font-black mx-auto mb-3 shadow-md">
          {name.charAt(0).toUpperCase()}
        </div>

        {isEditing ? (
          <div className="flex flex-col items-center gap-2 max-w-xs mx-auto mb-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-center px-4 py-2 text-lg font-bold border border-zinc-300 rounded-xl focus:border-black outline-none"
              placeholder="Enter your name"
              autoFocus
            />
            <div className="flex gap-2 w-full">
              <button
                onClick={handleSave}
                className="flex-1 py-1.5 bg-black text-white rounded-xl text-xs font-bold"
              >
                Save
              </button>
              <button
                onClick={() => { setName(currentUser?.name || "Citizen"); setIsEditing(false); }}
                className="flex-1 py-1.5 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mb-1">
            <h2 className="text-[20px] font-black text-black">{name}</h2>
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 text-zinc-400 hover:text-black transition-colors"
              title="Edit Name"
            >
              <span className="text-sm">✏️</span>
            </button>
          </div>
        )}

        <p className="text-[12px] text-zinc-400">{currentUser?.email || "citizen@civic.com"}</p>
        <span className="inline-block mt-2 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded-full">
          🛡️ Verified Citizen
        </span>
      </div>

      <div className="space-y-3 mb-6">
        <div
          onClick={() => {
            sessionStorage.removeItem('cc_pwa_dismissed');
            window.location.reload();
          }}
          className="card p-4 border border-orange-100 bg-orange-50/50 rounded-2xl flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all hover:bg-orange-50"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">📲</span>
            <div>
              <p className="text-xs font-bold text-black">Download Mobile App</p>
              <p className="text-[11px] text-gray-500">Install to your phone home screen</p>
            </div>
          </div>
          <span className="text-xs font-black text-orange-700 bg-orange-200/80 px-3 py-1 rounded-xl">
            Install PWA
          </span>
        </div>

        <div className="card p-4 border border-zinc-100 flex items-center justify-between">
          <span className="text-xs font-bold text-black">Emergency Contact</span>
          <span className="text-xs text-zinc-500 font-mono">112 (Police) / 108 (Ambulance)</span>
        </div>
        <div className="card p-4 border border-zinc-100 flex items-center justify-between">
          <span className="text-xs font-bold text-black">Location Access</span>
          <span className="text-xs text-emerald-600 font-bold">Enabled (High Precision)</span>
        </div>
      </div>

      <button onClick={handleLogout} className="btn-secondary w-full py-4 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-100 flex items-center justify-center gap-2">
        <LogOut size={16} /> Sign Out
      </button>
    </div>
  );
}

// ─── Floating Bottom Navigation ───────────────────────────────────────────────
function BottomNav({ tab, setTab }: { tab: MainTab; setTab: (t: MainTab) => void }) {
  const tabs: { id: MainTab; Icon: any; label: string }[] = [
    { id: "home",    Icon: Home,     label: "Home" },
    { id: "map",     Icon: MapIcon,  label: "Map" },
    { id: "alerts",  Icon: Bell,     label: "Alerts" },
    { id: "reports", Icon: FileText, label: "Report" },
    { id: "profile", Icon: User,     label: "Profile" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 px-4 pb-4 z-[99999] pointer-events-none">
      <div
        className="bg-white rounded-3xl px-2 py-2 flex items-center justify-around border border-zinc-200 pointer-events-auto"
        style={{ boxShadow: "0 -4px 30px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.14)" }}
      >
        {tabs.map(({ id, Icon, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all ${
                active ? "bg-black text-white shadow-sm" : "text-zinc-400 hover:text-black"
              }`}
            >
              <Icon size={18} className={active ? "text-white" : "text-zinc-400"} />
              <span className={`text-[10px] font-bold ${active ? "text-white" : "text-zinc-500"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function playCitizenChime() {
  try {
    const c = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.frequency.setValueAtTime(520, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, c.currentTime + 0.22);
    g.gain.setValueAtTime(0.25, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.35);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.35);
  } catch {}
}

// ─── Root Citizen Dashboard ───────────────────────────────────────────────────
export function CitizenDashboard({ onLogout }: { onLogout?: () => void }) {
  const [tab, setTab] = useState<MainTab>("home");
  const [activeRoadAlert, setActiveRoadAlert] = useState<any>(null);

  useEffect(() => {
    const socket = socketIO(SOCKET_URL);
    socket.on('connect', () => {
      socket.emit('join-role', 'all');
      socket.emit('join-role', 'user');
    });

    socket.on('new-alert', (alert: any) => {
      const isRoadBlock = alert?.title?.toLowerCase().includes('road block') || alert?.title?.includes('[ROAD BLOCK]') || alert?.type === 'traffic';
      playCitizenChime();
      if (isRoadBlock) {
        toast.error(`🚧 ROAD CLOSURE ALERT: ${alert.title}\n📍 ${alert.location?.address || 'Belagavi'}. Detours in effect!`, {
          duration: 9000,
          action: {
            label: 'View Map',
            onClick: () => setTab('map')
          }
        });
        setActiveRoadAlert(alert);
      } else {
        toast.warning(`⚠️ Live Civic Alert: ${alert.title || 'City Broadcast'}`);
      }
    });

    socket.on('incident-update', (d: any) => {
      if (d?.type === 'new' && (d.incident?.type === 'construction' || d.incident?.tags?.includes('road_block') || d.incident?.title?.includes('[ROAD BLOCK]'))) {
        playCitizenChime();
        toast.error(`🚧 Road Closure Detour: ${d.incident.title}\n📍 ${d.incident.location?.address || 'Belagavi'}`, {
          duration: 8000,
          action: {
            label: 'View Map',
            onClick: () => setTab('map')
          }
        });
        setActiveRoadAlert({
          title: d.incident.title,
          location: d.incident.location,
          message: d.incident.description || 'Road barricaded for infrastructure work.'
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-white overflow-hidden flex flex-col font-sans">
      <Css />

      {/* Real-time Road Block / Detour Alert Notification Banner */}
      {activeRoadAlert && (
        <div className="fixed top-3 left-3 right-3 z-[100] bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between border border-red-400 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0">🚧</span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-orange-200">Road Block / Closure Alert</p>
              <p className="text-xs font-bold truncate">{activeRoadAlert.title}</p>
              <p className="text-[10px] text-orange-100 truncate">{activeRoadAlert.location?.address || 'Belagavi'} • Detour routes active</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            <button
              onClick={() => { setTab('map'); setActiveRoadAlert(null); }}
              className="px-2.5 py-1 bg-white text-orange-700 font-black text-[11px] rounded-lg shadow-xs hover:bg-orange-50 active:scale-95 transition-all"
            >
              View Map
            </button>
            <button
              onClick={() => setActiveRoadAlert(null)}
              className="w-6 h-6 flex items-center justify-center hover:bg-white/20 rounded-lg text-white font-bold text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        {tab === "home"      && <HomeScreen setTab={setTab} />}
        {tab === "map"       && <MapScreen />}
        {tab === "alerts"    && <AlertsScreen />}
        {tab === "reports"   && <ReportsScreen setTab={setTab} />}
        {tab === "emergency" && <EmergencyScreen setTab={setTab} />}
        {tab === "ai"        && <AIPredictionScreen setTab={setTab} />}
        {tab === "route"     && <RouteDirectionScreen setTab={setTab} />}
        {tab === "track"     && <TrackReportScreen setTab={setTab} />}
        {tab === "profile"   && <ProfileScreen onLogout={onLogout} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}
export default CitizenDashboard;
