import { useState, useEffect, useRef } from 'react';
import { Bell, User, Search, Scan, AlertTriangle, MapPin, Clock, Navigation, CheckCircle, Phone, X, LogOut, Filter, CheckCircle2, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { api, SOCKET_URL, API_BASE } from '../../../../api';
import { io as socketIO } from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BottomNav } from './BottomNav';
import { AIInsights } from './AIInsights';
import { MapPage } from './MapPage';
import { AlertsPage } from './AlertsPage';
import { ProfilePage } from './ProfilePage';

// ─── Incident Detail Modal ────────────────────────────────────────────────────
function IncidentDetailModal({ incident, onClose, onResolve }: { incident: any; onClose: () => void; onResolve: (id: string) => void }) {
  const isSolved = incident.status === 'resolved' || incident.status === 'closed';

  const openDirection = () => {
    const lat = incident.location?.lat;
    const lng = incident.location?.lng;
    if (lat && lng) {
      navigator.geolocation?.getCurrentPosition(
        (pos) => { window.open(`https://www.google.com/maps/dir/?api=1&origin=${pos.coords.latitude},${pos.coords.longitude}&destination=${lat},${lng}&travelmode=driving`, '_blank'); },
        () => { window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank'); }
      );
    } else {
      toast.error('No GPS coordinates available');
    }
  };

  const priorityConfig: Record<string, {bg:string, text:string, label:string}> = {
    high:   { bg: '#FFE5E5', text: '#FF4444', label: '🔴 HIGH PRIORITY' },
    medium: { bg: '#FFF5E5', text: '#FFA500', label: '🟡 MEDIUM' },
    low:    { bg: '#E5F5E5', text: '#22C55E', label: '🟢 LOW' },
  };
  const pConfig = priorityConfig[incident.priority] || priorityConfig.medium;
  const typeIcon: Record<string,string> = { accident: '🚗', traffic_jam: '🚦', pothole: '🕳️', road_damage: '🛣️', waterlogging: '🌊', illegal_parking: '🅿️' };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold text-black">Incident Details</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-5 h-5 text-black" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Photo Evidence */}
          {incident.images?.[0] && (
            <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
              <img src={incident.images[0]} alt="Evidence" className="w-full h-56 object-cover" />
            </div>
          )}

          {/* Status Banner */}
          {isSolved ? (
            <div className="rounded-2xl p-4 bg-green-50 border border-green-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-green-700 font-bold text-sm">✅ CASE SOLVED</p>
                <p className="text-green-600 text-xs">Resolved {incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleString() : 'recently'}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-3 flex items-center justify-between" style={{ backgroundColor: pConfig.bg }}>
              <span className="text-sm font-bold" style={{ color: pConfig.text }}>{pConfig.label}</span>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-white/60" style={{ color: pConfig.text }}>
                {(incident.status || 'open').toUpperCase()}
              </span>
            </div>
          )}

          {/* Info */}
          <div className="bg-gray-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{typeIcon[incident.type] || '📋'}</span>
              <h3 className="font-bold text-black text-lg">{incident.title || incident.type?.replace(/_/g, ' ')}</h3>
            </div>
            {incident.description && <p className="text-sm text-gray-600 mb-3">{incident.description}</p>}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin className="w-4 h-4 text-red-500" />
                <span className="font-medium">{incident.location?.address || incident.location?.area || 'Unknown'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{incident.createdAt ? new Date(incident.createdAt).toLocaleString() : 'Recently'}</span>
              </div>
              {incident.location?.lat && (
                <div className="flex items-center gap-2 text-gray-400">
                  <Navigation className="w-4 h-4" />
                  <span className="text-xs">{incident.location.lat.toFixed(4)}, {incident.location.lng.toFixed(4)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Direction */}
          {incident.location?.lat && (
            <button onClick={openDirection}
              className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md">
              <Navigation className="w-5 h-5" /> 🚗 Get Direction to Spot
            </button>
          )}

          {/* Actions */}
          {!isSolved && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { onResolve(incident._id); onClose(); }}
                className="flex items-center justify-center gap-2 py-3 bg-emerald-50 rounded-xl text-emerald-600 font-medium text-sm">
                <CheckCircle className="w-4 h-4" /> Mark Solved
              </button>
              <button onClick={() => toast.info('Calling dispatch...')}
                className="flex items-center justify-center gap-2 py-3 bg-blue-50 rounded-xl text-blue-600 font-medium text-sm">
                <Phone className="w-4 h-4" /> Call Dispatch
              </button>
            </div>
          )}

          <button onClick={onClose} className="w-full py-3 bg-gray-100 text-black rounded-xl font-medium">Close</button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Leaflet Incident Map ─────────────────────────────────────────────────────
function IncidentMap({ incidents, onSelectIncident }: { incidents: any[]; onSelectIncident: (inc: any) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false });
    mapInstance.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    // Belagavi traffic hotspots
    const trafficZones = [
      { lat: 15.8497, lng: 74.4977, label: 'RPD Cross — High Traffic', color: '#EF4444' },
      { lat: 15.8440, lng: 74.5040, label: 'College Road — Congestion', color: '#F97316' },
      { lat: 15.8525, lng: 74.5085, label: 'Bogarves Circle — Moderate', color: '#FBBF24' },
      { lat: 15.8520, lng: 74.5020, label: 'Rani Channamma Circle — High', color: '#EF4444' },
      { lat: 15.8560, lng: 74.5000, label: 'Kirloskar Road — Moderate', color: '#FBBF24' },
      { lat: 15.8380, lng: 74.4950, label: 'Angol Main Road — Low', color: '#22C55E' },
      { lat: 15.8600, lng: 74.4900, label: 'Khanapur Road — Low', color: '#22C55E' },
    ];

    // Add traffic zones as circles
    trafficZones.forEach(z => {
      L.circle([z.lat, z.lng], { radius: 200, color: z.color, fillColor: z.color, fillOpacity: 0.15, weight: 2 }).addTo(map)
        .bindPopup(`<b>🚦 ${z.label}</b>`);
    });

    // Add incident markers
    const withCoords = incidents.filter(i => i.location?.lat && i.location?.lng);
    const typeIcon: Record<string,string> = { accident: '🚗', traffic_jam: '🚦', pothole: '🕳️', road_damage: '🛣️', waterlogging: '🌊', illegal_parking: '🅿️' };
    const priorityColor: Record<string,string> = { high: '#EF4444', medium: '#F97316', low: '#22C55E' };

    withCoords.forEach(inc => {
      const isSolved = inc.status === 'resolved' || inc.status === 'closed';
      const color = isSolved ? '#6B7280' : (priorityColor[inc.priority] || '#F97316');
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer">${isSolved ? '✅' : (typeIcon[inc.type] || '📋')}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      });
      const marker = L.marker([inc.location.lat, inc.location.lng], { icon }).addTo(map);
      marker.bindPopup(`<b>${inc.title || inc.type}</b><br/>${inc.location.address || ''}<br/><small>${isSolved ? '✅ Case Solved' : (inc.priority?.toUpperCase() || '')}</small>`);
      marker.on('click', () => onSelectIncident(inc));
    });

    // Fit bounds
    const allPoints = [...trafficZones.map(z => [z.lat, z.lng] as [number, number]), ...withCoords.map(i => [i.location.lat, i.location.lng] as [number, number])];
    if (allPoints.length > 0) {
      map.fitBounds(allPoints as L.LatLngBoundsExpression, { padding: [30, 30] });
    } else {
      map.setView([15.8500, 74.5000], 14); // Belagavi center
    }

    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [incidents]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-black flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-500" /> Incident Map
        </h3>
        <div className="flex items-center gap-1.5">
          <motion.div className="w-1.5 h-1.5 bg-green-500 rounded-full" animate={{ opacity: [1,0.3,1] }} transition={{ duration: 1.5, repeat: Infinity }} />
          <span className="text-xs font-medium text-green-600">LIVE</span>
        </div>
      </div>
      <div ref={mapRef} className="w-full rounded-2xl overflow-hidden border border-gray-200" style={{ height: 280 }} />
      <div className="flex items-center gap-4 mt-2 px-1">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow" /><span className="text-[10px] text-gray-500">High</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-orange-500 border-2 border-white shadow" /><span className="text-[10px] text-gray-500">Medium</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow" /><span className="text-[10px] text-gray-500">Low</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-gray-400 border-2 border-white shadow" /><span className="text-[10px] text-gray-500">Solved</span></div>
      </div>
    </div>
  );
}

// ─── Police Dashboard ─────────────────────────────────────────────────────────
interface PoliceDashboardProps {
  onLogout?: () => void;
}

export function PoliceDashboard({ onLogout }: PoliceDashboardProps) {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [caseFilter, setCaseFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [stats, setStats] = useState({ active: 0, assigned: 0, resolved: 0, total: 0 });
  const user = api.getUser();

  const fetchIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const data = await api.getIncidents();
      const list = Array.isArray(data) ? data : data.incidents || data.data || [];
      setIncidents(list);
      setStats({
        active: list.filter((i: any) => i.status === 'open' || i.status === 'active').length,
        assigned: list.filter((i: any) => i.status === 'in_progress' || i.status === 'assigned').length,
        resolved: list.filter((i: any) => i.status === 'resolved' || i.status === 'closed').length,
        total: list.length,
      });
    } catch { setIncidents([]); }
    setLoadingIncidents(false);
  };

  const [newAlertData, setNewAlertData] = useState<any>(null);
  const [showAlertBanner, setShowAlertBanner] = useState(false);

  // Alert sound using Web Audio API
  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Siren-like alert: two alternating tones
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      // 3 alternating high-low tones
      playTone(880, 0, 0.2); playTone(660, 0.2, 0.2);
      playTone(880, 0.4, 0.2); playTone(660, 0.6, 0.2);
      playTone(880, 0.8, 0.2); playTone(660, 1.0, 0.2);
      // Final attention tone
      playTone(1100, 1.2, 0.4);
    } catch {}
  };

  useEffect(() => { fetchIncidents(); }, []);

  // Socket.IO: real-time alerts
  useEffect(() => {
    const socket = socketIO(SOCKET_URL);
    socket.on('connect', () => {
      socket.emit('join-role', 'police');
    });

    socket.on('incident-update', (data: any) => {
      if (data?.type === 'new' && data?.incident) {
        playAlertSound();
        setNewAlertData(data.incident);
        setShowAlertBanner(true);
        fetchIncidents(); // refresh list

        toast.error(
          `🚨 NEW INCIDENT: ${data.incident.title || data.incident.type}\n📍 ${data.incident.location?.address || 'Unknown location'}`,
          { duration: 8000 }
        );

        // Auto-hide banner after 15 seconds
        setTimeout(() => setShowAlertBanner(false), 15000);
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  const handleResolve = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/incidents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('cc_token') ? { Authorization: `Bearer ${localStorage.getItem('cc_token')}` } : {}),
        },
        body: JSON.stringify({ status: 'resolved' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      toast.success('✅ Case Solved! Incident resolved.');
      fetchIncidents();
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || 'Unknown error'));
    }
  };

  const getPriorityColor = (p: string) => {
    if (p === 'high') return { bg: '#FFE5E5', text: '#FF4444' };
    if (p === 'medium') return { bg: '#FFF5E5', text: '#FFA500' };
    return { bg: '#E5F5E5', text: '#22C55E' };
  };
  const typeIcon: Record<string,string> = { accident: '🚗', traffic_jam: '🚦', pothole: '🕳️', road_damage: '🛣️', waterlogging: '🌊', illegal_parking: '🅿️' };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const renderCasesPage = () => {
    const filteredCases = incidents.filter(inc => {
      if (caseFilter === 'open') return inc.status === 'open' || inc.status === 'active';
      if (caseFilter === 'in_progress') return inc.status === 'in_progress' || inc.status === 'assigned';
      if (caseFilter === 'resolved') return inc.status === 'resolved' || inc.status === 'closed';
      return true;
    }).filter(inc => {
      if (!searchQuery) return true;
      return inc.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.location?.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.type?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
      <div className="p-4 pt-12 pb-28">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">Investigative Records</span>
            <h2 className="text-2xl font-black text-black">Traffic & Crime Cases</h2>
          </div>
          <button
            onClick={fetchIncidents}
            className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-black"
          >
            Refresh
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Official case logs reported by citizens and field units</p>

        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {[
            { id: 'all', label: `All (${incidents.length})` },
            { id: 'open', label: `Active (${stats.active})` },
            { id: 'in_progress', label: `Assigned (${stats.assigned})` },
            { id: 'resolved', label: `Solved (${stats.resolved})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setCaseFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                caseFilter === f.id ? 'bg-black text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Cases List */}
        {loadingIncidents ? (
          <div className="text-center py-12 text-sm text-gray-400">Loading cases...</div>
        ) : filteredCases.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100 p-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-sm text-black">No cases found</p>
            <p className="text-xs text-gray-400 mt-1">All incidents in this category have been addressed.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCases.map(inc => {
              const isSolved = inc.status === 'resolved' || inc.status === 'closed';
              return (
                <div
                  key={inc._id}
                  onClick={() => setSelectedIncident(inc)}
                  className="bg-white border border-gray-200 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    {inc.images?.[0] ? (
                      <img src={inc.images[0]} alt="Evidence" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-gray-100" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-2xl">
                        {typeIcon[inc.type] || '📋'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="font-bold text-sm text-black truncate">{inc.title || inc.type}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSolved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {(inc.status || 'open').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 flex items-center gap-1 truncate mb-2">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        {inc.location?.address || 'Belagavi Grid'}
                      </p>
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedIncident(inc)}
                          className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold"
                        >
                          View Details
                        </button>
                        {!isSolved && (
                          <button
                            onClick={() => handleResolve(inc._id)}
                            className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Solve Case
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'map': return <MapPage />;
      case 'alerts': return <AlertsPage />;
      case 'cases': return renderCasesPage();
      case 'profile': return <ProfilePage onLogout={onLogout} />;
      default:
        return (
          <>
            {/* Professional Header (No 9:41 fake phone bar) */}
            <div className="sticky top-0 z-20 bg-white border-b border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚔</span>
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 block">Belagavi Traffic Police</span>
                    <span className="text-[10px] text-gray-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Command & Dispatch
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage('alerts')}
                    className="relative p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                    title="Alerts"
                  >
                    <Bell className="w-5 h-5 text-black" />
                    {stats.active > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => setCurrentPage('profile')}
                    className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    title="Profile & Settings"
                  >
                    <User className="w-5 h-5 text-gray-700" />
                  </button>
                  <button
                    onClick={() => onLogout?.()}
                    className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors flex items-center gap-1 text-xs font-bold"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5 uppercase tracking-wide">{greeting}</div>
                <h1 className="text-2xl font-bold text-black mb-3">{user?.name || 'Officer'}</h1>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search incidents, road hazards..."
                    className="w-full bg-gray-50 border-0 rounded-2xl pl-11 pr-11 py-3 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 bg-black rounded-lg flex items-center justify-center">
                    <Scan className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total', value: stats.total, color: 'bg-gray-50 text-black' },
                  { label: 'Active', value: stats.active, color: 'bg-red-50 text-red-600' },
                  { label: 'Assigned', value: stats.assigned, color: 'bg-blue-50 text-blue-600' },
                  { label: 'Solved', value: stats.resolved, color: 'bg-green-50 text-green-600' },
                ].map(s => (
                  <div key={s.label} className={`${s.color} rounded-2xl p-3 text-center`}>
                    <div className="text-xl font-bold">{s.value}</div>
                    <div className="text-[10px] font-medium opacity-70">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Incident Map */}
              <IncidentMap incidents={incidents} onSelectIncident={setSelectedIncident} />

              {/* AI Insights */}
              <AIInsights />

              {/* Live Incidents */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-black flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" /> Live Incidents
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <motion.div className="w-1.5 h-1.5 bg-red-500 rounded-full" animate={{ opacity: [1,0.3,1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                    <span className="text-xs font-medium text-red-500">{stats.active} active</span>
                  </div>
                </div>

                {loadingIncidents && (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                <div className="space-y-3">
                  {incidents.slice(0, 10).map((inc, i) => {
                    const isSolved = inc.status === 'resolved' || inc.status === 'closed';
                    const colors = isSolved ? { bg: '#E5F5E5', text: '#22C55E' } : getPriorityColor(inc.priority || 'low');
                    return (
                      <motion.div key={inc._id || i}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        onClick={() => setSelectedIncident(inc)}
                        className="bg-white rounded-2xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]">
                        <div className="h-1" style={{ backgroundColor: colors.text }} />
                        <div className="p-4">
                          <div className="flex items-start gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-lg shrink-0">
                              {isSolved ? '✅' : (typeIcon[inc.type] || '📋')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h4 className={`font-semibold text-sm truncate ${isSolved ? 'text-gray-400 line-through' : 'text-black'}`}>
                                  {inc.title || inc.type?.replace(/_/g, ' ')}
                                </h4>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                                  style={{ backgroundColor: colors.bg, color: colors.text }}>
                                  {isSolved ? '✅ SOLVED' : (inc.priority || 'low').toUpperCase()}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{inc.location?.address?.split(',')[0] || 'Unknown'}</span>
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{inc.createdAt ? new Date(inc.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '?'}</span>
                              </div>
                            </div>
                          </div>
                          {!isSolved && (
                            <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                              <button onClick={() => setSelectedIncident(inc)}
                                className="flex-1 py-2 bg-blue-50 rounded-lg text-blue-600 text-xs font-medium text-center">
                                View Details
                              </button>
                              <button onClick={() => handleResolve(inc._id)}
                                className="flex-1 py-2 bg-green-50 rounded-lg text-green-600 text-xs font-medium text-center flex items-center justify-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Solve Case
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="relative h-full overflow-hidden bg-white">
      <div className="relative z-10 h-full overflow-y-auto pb-24">{renderPage()}</div>
      <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} />

      {/* Real-time Alert Banner */}
      <AnimatePresence>
        {showAlertBanner && newAlertData && (
          <motion.div
            initial={{ y: -120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -120, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed top-0 left-0 right-0 z-[60] p-3 pt-12"
          >
            <div
              className="bg-white rounded-2xl border-2 border-red-400 p-4 shadow-2xl mx-2"
              style={{ animation: 'alertPulse 1s ease-in-out infinite' }}
            >
              <style>{`@keyframes alertPulse { 0%,100% { border-color: #f87171; box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { border-color: #ef4444; box-shadow: 0 0 20px 4px rgba(239,68,68,0.3); } }`}</style>
              <div className="flex items-start gap-3">
                <motion.div
                  className="w-12 h-12 rounded-xl bg-red-500 flex items-center justify-center shrink-0"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <AlertTriangle className="w-6 h-6 text-white" />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-red-500 uppercase tracking-wide mb-0.5">🚨 New Incident Reported</p>
                  <p className="text-sm font-bold text-black truncate">{newAlertData.title || newAlertData.type}</p>
                  <p className="text-xs text-gray-500 truncate">{newAlertData.location?.address || 'Unknown'}</p>
                  <p className="text-[10px] text-gray-400 mt-1">Priority: {(newAlertData.priority || 'medium').toUpperCase()}</p>
                </div>
                <button onClick={() => setShowAlertBanner(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setSelectedIncident(newAlertData); setShowAlertBanner(false); }}
                  className="flex-1 py-2 bg-red-500 text-white rounded-xl text-xs font-bold">
                  View Details
                </button>
                <button onClick={() => setShowAlertBanner(false)}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium">
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedIncident && (
          <IncidentDetailModal incident={selectedIncident} onClose={() => setSelectedIncident(null)} onResolve={handleResolve} />
        )}
      </AnimatePresence>
    </div>
  );
}
