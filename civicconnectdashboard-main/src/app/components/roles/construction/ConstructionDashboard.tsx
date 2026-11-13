import { useState, useEffect, useRef } from 'react';
import {
  Construction, Bell, User, MapPin, Users, Calendar, Home, Map,
  AlertTriangle, Navigation, X, CheckCircle, Plus, LogOut, Shield,
  RefreshCw, ClipboardList, Filter, Search, CheckCircle2, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { io as socketIO } from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, SOCKET_URL, API_BASE } from '../../../../api';
import { ProfilePage } from './ProfilePage';
import { IncidentPopup } from './IncidentPopup';

function playAlert() {
  try {
    const c = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = (f: number, s: number, d: number) => {
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.value = f;
      o.type = 'triangle';
      g.gain.setValueAtTime(0.25, c.currentTime + s);
      g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + s + d);
      o.start(c.currentTime + s);
      o.stop(c.currentTime + s + d);
    };
    t(600, 0, 0.2);
    t(800, 0.2, 0.2);
    t(600, 0.4, 0.2);
    t(800, 0.6, 0.3);
  } catch {}
}

function ZoneMap({ incidents, zones, onSelect }: { incidents: any[]; zones: any[]; onSelect: (i: any) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const m = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (m.current) {
      m.current.remove();
      m.current = null;
    }
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView([15.85, 74.50], 13);
    m.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    const pc: Record<string, string> = { high: '#EF4444', medium: '#F97316', low: '#22C55E' };
    const pts: [number, number][] = [];

    // Construction zones
    zones.forEach(z => {
      if (!z.lat || !z.lng) return;
      const ic = L.divIcon({
        className: '',
        html: '<div style="width:30px;height:30px;border-radius:50%;background:#F97316;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:14px">🚧</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      L.marker([z.lat, z.lng], { icon: ic }).addTo(map).bindPopup(`<b>🚧 ${z.name}</b><br/><small>${z.location || ''}</small>`);
      L.circle([z.lat, z.lng], { radius: 200, color: '#F97316', fillColor: '#F97316', fillOpacity: 0.1, weight: 2 }).addTo(map);
      pts.push([z.lat, z.lng]);
    });

    // Incidents
    incidents.forEach(inc => {
      if (!inc.location?.lat) return;
      const s = inc.status === 'resolved' || inc.status === 'closed';
      const c = s ? '#6B7280' : (pc[inc.priority] || '#F97316');
      const isBlock = inc.type === 'construction' || inc.tags?.includes('road_block') || inc.title?.includes('[ROAD BLOCK]');
      const e = s ? '✅' : isBlock ? '🚧' : inc.type === 'pothole' ? '🕳️' : inc.type === 'road_damage' ? '🛣️' : '📋';
      const ic = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${c};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer">${e}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker([inc.location.lat, inc.location.lng], { icon: ic }).addTo(map).on('click', () => onSelect(inc)).bindPopup(`<b>${inc.title || inc.type}</b><br/><small>${inc.location.address || ''}</small>`);
      pts.push([inc.location.lat, inc.location.lng]);
    });

    if (pts.length > 0) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      m.current?.remove();
      m.current = null;
    };
  }, [incidents, zones]);

  return <div ref={ref} className="relative isolate z-0 w-full rounded-2xl overflow-hidden border border-gray-200 shadow-xs" style={{ height: 260 }} />;
}

interface ConstructionDashboardProps {
  onLogout?: () => void;
}

export function ConstructionDashboard({ onLogout }: ConstructionDashboardProps) {
  const [page, setPage] = useState('dashboard');
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [alertData, setAlertData] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [reportFilter, setReportFilter] = useState<'all' | 'pothole' | 'road_damage' | 'waterlogging' | 'resolved'>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [zones, setZones] = useState<any[]>([
    { id: 1, name: 'Angol Road Repair', location: 'Angol Main Road, Belagavi', lat: 15.8380, lng: 74.4950, status: 'active', workers: 12, progress: 45, endDate: '2026-06-15' },
    { id: 2, name: 'KLE Circle Widening', location: 'College Road, KLE', lat: 15.8440, lng: 74.5040, status: 'active', workers: 20, progress: 70, endDate: '2026-05-30' },
  ]);
  const [newZone, setNewZone] = useState({ name: '', location: '' });

  const detectGps = () => {
    setGpsLoading(true);
    if (!navigator.geolocation) {
      const fallback = { lat: 15.8497, lng: 74.4977, address: 'Belagavi City Center' };
      setGpsLocation(fallback);
      setNewZone(prev => ({ ...prev, location: prev.location || fallback.address }));
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let address = `Belagavi (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const data = await res.json();
          if (data && data.display_name) {
            address = data.display_name.split(',').slice(0, 3).join(', ');
          }
        } catch {}
        setGpsLocation({ lat, lng, address });
        setNewZone(prev => ({ ...prev, location: prev.location || address }));
        setGpsLoading(false);
      },
      () => {
        const fallback = { lat: 15.8497, lng: 74.4977, address: 'Belagavi City Center (GPS Locked)' };
        setGpsLocation(fallback);
        setNewZone(prev => ({ ...prev, location: prev.location || fallback.address }));
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  useEffect(() => {
    if (showAddZone) {
      detectGps();
    }
  }, [showAddZone]);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const d = await api.getIncidents();
      const l = Array.isArray(d) ? d : d.incidents || d.data || [];
      setIncidents(l.filter((i: any) =>
        ['pothole', 'road_damage', 'waterlogging', 'flood', 'construction'].includes(i.type) ||
        i.title?.toLowerCase().includes('road') ||
        i.title?.toLowerCase().includes('pothole')
      ));
    } catch {
      setIncidents([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetch_();
  }, []);

  useEffect(() => {
    const s = socketIO(SOCKET_URL);
    s.on('connect', () => s.emit('join-role', 'construction'));

    s.on('incident-update', (d: any) => {
      if (d?.type === 'new' && d?.incident) {
        const t = d.incident.type;
        const isRoadBlock = t === 'construction' || d.incident.tags?.includes('road_block') || d.incident.title?.includes('[ROAD BLOCK]');

        // Construction Authority should NOT be alerted for road blocks (which construction created)
        // Construction only receives alarm & banner notifications when citizens report road damage or potholes
        if (!isRoadBlock && (['pothole', 'road_damage', 'waterlogging'].includes(t) || d.incident.title?.toLowerCase().includes('pothole'))) {
          playAlert();
          setAlertData(d.incident);
          setShowBanner(true);
          fetch_();
          toast.error(`⚠️ NEW CITIZEN REPORT: ${d.incident.title || t}\n📍 ${d.incident.location?.address || 'Belagavi'}`, { duration: 8000 });
          setTimeout(() => setShowBanner(false), 20000);
        } else {
          // Road block or background update: silently refresh incident lists without playing sirens
          fetch_();
        }
      }
    });

    s.on('new-alert', (alert: any) => {
      // Do NOT alert Construction Authority for road block alerts (construction created it for the public!)
      const isRoadBlock = alert?.title?.toLowerCase().includes('road block') || alert?.title?.includes('🚧 [ROAD BLOCK]') || alert?.type === 'traffic';
      if (isRoadBlock) {
        fetch_();
        return;
      }

      // Only alert Construction Authority if it is targeted specifically for construction emergency work
      if (alert?.targetRoles?.includes('construction')) {
        playAlert();
        setAlertData({
          title: alert.title,
          type: 'pothole',
          description: alert.message,
          location: alert.location,
        });
        setShowBanner(true);
        fetch_();
        toast.error(`⚠️ NEW CIVIC REPORT: ${alert.title}\n📍 ${alert.location?.address || 'Belagavi'}`, { duration: 8000 });
        setTimeout(() => setShowBanner(false), 20000);
      }
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const resolve = async (id: string, isBlock: boolean = false) => {
    try {
      await fetch(`${API_BASE}/incidents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('cc_token') ? { Authorization: `Bearer ${localStorage.getItem('cc_token')}` } : {})
        },
        body: JSON.stringify({ status: 'resolved' })
      });
      toast.success(isBlock ? '✅ Road Block cleared! Road opened to public traffic.' : '✅ Citizen report resolved & marked repaired!');
      fetch_();
    } catch {
      toast.error('Failed to resolve issue');
    }
  };

  const addZone = async () => {
    if (!newZone.name.trim()) {
      toast.error('Please enter a zone name or road block title');
      return;
    }
    const lat = gpsLocation?.lat || 15.8497;
    const lng = gpsLocation?.lng || 74.4977;
    const loc = newZone.location.trim() || gpsLocation?.address || 'Belagavi Construction Zone';

    try {
      // 1. Create real Incident so it shows on all citizen & authority maps
      await api.createIncident({
        title: `🚧 [ROAD BLOCK] ${newZone.name.trim()}`,
        type: 'construction',
        description: `Construction & Road Blockage active at ${loc}. Diversion routes active.`,
        priority: 'high',
        status: 'in_progress',
        location: { lat, lng, address: loc },
        tags: ['road_block', 'construction', 'detour']
      });

      // 2. Create broadcast Alert specifically targeting citizens & drivers
      await api.createAlert({
        title: `🚧 Road Block Alert: ${newZone.name.trim()}`,
        message: `Road closure / active construction at ${loc}. Please follow diversion routes.`,
        type: 'traffic',
        severity: 'high',
        targetRoles: ['user', 'all'],
        location: { lat, lng, address: loc }
      });

      toast.success('🚧 Road block registered & broadcasted to citizens!');
      setZones(prev => [...prev, {
        id: Date.now(),
        name: newZone.name.trim(),
        location: loc,
        lat,
        lng,
        status: 'active',
        workers: 12,
        progress: 10,
        endDate: 'TBD'
      }]);
      fetch_();
      setNewZone({ name: '', location: '' });
      setShowAddZone(false);
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || 'Error'));
    }
  };

  // ─── Separate Citizen Reports from Registered Road Blocks ─────────────────────
  // Citizen Reports: Potholes, Road Damage, Waterlogging (NOT road blocks created by authority)
  const citizenReports = incidents.filter(i => {
    const isBlock = i.type === 'construction' || i.tags?.includes('road_block') || i.title?.includes('[ROAD BLOCK]');
    if (isBlock) return false;
    return ['pothole', 'road_damage', 'waterlogging', 'flood'].includes(i.type) ||
      i.title?.toLowerCase().includes('pothole') ||
      i.title?.toLowerCase().includes('damage');
  });

  const activeReports = citizenReports.filter(i => i.status !== 'resolved' && i.status !== 'closed');
  const resolvedReports = citizenReports.filter(i => i.status === 'resolved' || i.status === 'closed');

  // Road Blocks: Barricades, Closures & Diverted Corridors
  const roadBlocks = incidents.filter(i =>
    i.type === 'construction' ||
    i.tags?.includes('road_block') ||
    i.title?.toLowerCase().includes('road block') ||
    i.title?.includes('[ROAD BLOCK]')
  );
  const activeRoadBlocks = roadBlocks.filter(i => i.status !== 'resolved' && i.status !== 'closed');

  // Filtered reports for the Reports tab
  const displayedReports = citizenReports.filter(i => {
    const isSolved = i.status === 'resolved' || i.status === 'closed';
    if (reportFilter === 'resolved') {
      if (!isSolved) return false;
    } else {
      if (isSolved) return false;
      if (reportFilter !== 'all' && i.type !== reportFilter) return false;
    }

    if (reportSearch.trim()) {
      const q = reportSearch.toLowerCase();
      const matchTitle = (i.title || '').toLowerCase().includes(q);
      const matchAddr = (i.location?.address || '').toLowerCase().includes(q);
      const matchType = (i.type || '').toLowerCase().includes(q);
      return matchTitle || matchAddr || matchType;
    }
    return true;
  });

  // Navigation tabs: Tab 4 changed from "Road Blocks" to "Reports"
  const tabs = [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'zones', icon: Construction, label: 'Zones' },
    { id: 'map', icon: Map, label: 'Map' },
    { id: 'reports', icon: ClipboardList, label: 'Reports' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  const renderPage = () => {
    if (page === 'profile') return <ProfilePage onLogout={onLogout} />;

    if (page === 'map') {
      return (
        <div className="p-4 pt-14 pb-28">
          <h2 className="text-2xl font-bold text-black mb-1">Infrastructure Map</h2>
          <p className="text-xs text-gray-500 mb-3">Live visualization of construction zones, road blocks, and citizen reports</p>
          <ZoneMap incidents={incidents} zones={zones} onSelect={setSelected} />
          <div className="flex flex-wrap gap-3 mt-3">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-orange-500" /><span className="text-[11px] text-gray-600 font-medium">Zone / Road Block</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-[11px] text-gray-600 font-medium">High Hazard</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-gray-400" /><span className="text-[11px] text-gray-600 font-medium">Solved</span></div>
          </div>
        </div>
      );
    }

    // ─── PAGE: ZONES (Construction Projects & Active Road Blocks) ───────────────
    if (page === 'zones') {
      return (
        <div className="p-4 pt-14 pb-28">
          <div className="flex justify-between items-center mb-1">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 block">Belagavi Municipal PWD</span>
              <h2 className="text-2xl font-black text-black">Construction Zones</h2>
            </div>
            <button
              onClick={() => setShowAddZone(true)}
              className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-orange-500/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Zone / Block
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Active barricades, road closures, and municipal infrastructure projects</p>

          {/* Section 1: Active Road Blocks & Closures */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-bold text-black text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-600" />
                Active Road Blocks ({activeRoadBlocks.length})
              </h3>
              <span className="text-[11px] text-gray-400 font-medium">Live on Citizen Map</span>
            </div>

            <div className="space-y-2.5">
              {activeRoadBlocks.map((inc, i) => (
                <motion.div
                  key={inc._id || i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-orange-50/70 border border-orange-200/90 rounded-2xl p-3.5 shadow-xs"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0 text-sm shadow-xs">
                        🚧
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-black truncate">{inc.title}</h4>
                        <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-orange-600 shrink-0" />
                          {inc.location?.address || 'Belagavi Corridor'}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-200 text-orange-800 tracking-wide uppercase shrink-0">
                      ROAD BLOCKED
                    </span>
                  </div>

                  <p className="text-xs text-orange-800 bg-orange-100/70 p-2 rounded-xl mt-2.5 font-medium leading-relaxed">
                    {inc.description || 'Barricade active. Public navigation map updated with detour advisory.'}
                  </p>

                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => {
                        if (inc.location?.lat) {
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${inc.location.lat},${inc.location.lng}&travelmode=driving`, '_blank');
                        }
                      }}
                      className="flex-1 py-1.5 bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all"
                    >
                      <Navigation className="w-3 h-3" />
                      Navigate
                    </button>
                    <button
                      onClick={() => resolve(inc._id, true)}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition-all"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Clear Road Block
                    </button>
                  </div>
                </motion.div>
              ))}

              {activeRoadBlocks.length === 0 && (
                <div className="bg-gray-50 border border-gray-200/70 rounded-2xl p-4 text-center">
                  <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                  <p className="text-xs font-bold text-black">No Active Road Closures</p>
                  <p className="text-[11px] text-gray-400">All major roads in Belagavi are currently open.</p>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Active Construction Projects */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-bold text-black text-sm flex items-center gap-2">
                <Construction className="w-4 h-4 text-orange-500" />
                Active Construction Projects ({zones.length})
              </h3>
            </div>

            <div className="space-y-3">
              {zones.map(z => (
                <div key={z.id} className="bg-white rounded-2xl p-3.5 border border-gray-200 shadow-xs">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-black text-sm">{z.name}</h4>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-orange-500" />
                        {z.location}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                      {z.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500 font-medium">Progress</span>
                    <span className="text-orange-600 font-bold">{z.progress}%</span>
                  </div>
                  <div className="h-2 bg-orange-100 rounded-full overflow-hidden mb-3">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${z.progress}%` }}
                      className="h-full bg-orange-500 rounded-full"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (z.lat) {
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${z.lat},${z.lng}&travelmode=driving`, '_blank');
                        }
                      }}
                      className="flex-1 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all"
                    >
                      <Navigation className="w-3 h-3" />
                      Direction
                    </button>
                    <button
                      onClick={() => {
                        setZones(zones.map(zz =>
                          zz.id === z.id
                            ? { ...zz, progress: Math.min(zz.progress + 10, 100), status: zz.progress >= 90 ? 'completed' : 'active' }
                            : zz
                        ));
                        toast.success('Project progress updated!');
                      }}
                      className="flex-1 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold transition-all"
                    >
                      Update (+10%)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // ─── PAGE: REPORTS (Citizen Road Reports - Potholes, Damage, Waterlogging) ──
    if (page === 'reports') {
      return (
        <div className="p-4 pt-14 pb-28">
          <div className="flex justify-between items-center mb-1">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-red-600 block">Civic Hazard Desk</span>
              <h2 className="text-2xl font-black text-black">Citizen Reports</h2>
            </div>
            <div className="bg-red-50 text-red-700 px-3 py-1 rounded-xl text-xs font-bold border border-red-200">
              {activeReports.length} Active
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">Potholes, surface damage, and civic road hazards reported by citizens</p>

          {/* Search Bar */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-3">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              value={reportSearch}
              onChange={e => setReportSearch(e.target.value)}
              placeholder="Search reports by street, locality, or issue..."
              className="bg-transparent text-xs text-black placeholder:text-gray-400 outline-none flex-1 font-medium"
            />
            {reportSearch && (
              <button onClick={() => setReportSearch('')} className="text-xs text-gray-400 hover:text-black">
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-3 -mx-1 px-1">
            {[
              { id: 'all', label: `All (${activeReports.length})` },
              { id: 'pothole', label: `🕳️ Potholes (${activeReports.filter(r => r.type === 'pothole').length})` },
              { id: 'road_damage', label: `🛣️ Damage (${activeReports.filter(r => r.type === 'road_damage').length})` },
              { id: 'waterlogging', label: `🌊 Water (${activeReports.filter(r => r.type === 'waterlogging').length})` },
              { id: 'resolved', label: `✅ Solved (${resolvedReports.length})` },
            ].map(f => {
              const active = reportFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setReportFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Reports List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayedReports.length > 0 ? (
            <div className="space-y-3">
              {displayedReports.map((inc, i) => {
                const isSolved = inc.status === 'resolved' || inc.status === 'closed';
                return (
                  <motion.div
                    key={inc._id || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => setSelected(inc)}
                    className={`rounded-2xl border p-3.5 transition-all cursor-pointer ${
                      isSolved
                        ? 'bg-gray-50/70 border-gray-200 opacity-80'
                        : 'bg-white border-gray-200 hover:shadow-md hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                        isSolved
                          ? 'bg-gray-200 text-gray-600'
                          : inc.type === 'pothole'
                          ? 'bg-amber-100'
                          : inc.type === 'road_damage'
                          ? 'bg-orange-100'
                          : 'bg-blue-100'
                      }`}>
                        {isSolved ? '✅' : inc.type === 'pothole' ? '🕳️' : inc.type === 'road_damage' ? '🛣️' : '🌊'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-black text-sm truncate">{inc.title || inc.type}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                            isSolved
                              ? 'bg-gray-200 text-gray-700'
                              : inc.priority === 'critical' || inc.priority === 'high'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {isSolved ? 'SOLVED' : (inc.priority || 'HIGH').toUpperCase()}
                          </span>
                        </div>

                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-1 truncate">
                          <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                          {inc.location?.address || 'Belagavi'}
                        </p>

                        {inc.description && (
                          <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded-xl mt-2 line-clamp-2">
                            {inc.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {!isSolved && (
                      <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setSelected(inc)}
                          className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-all"
                        >
                          Details & Direction
                        </button>
                        <button
                          onClick={() => resolve(inc._id, false)}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
                        >
                          ✅ Solved
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-14 bg-gray-50 rounded-2xl border border-gray-100 p-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="font-bold text-sm text-black">No Pending Reports</p>
              <p className="text-xs text-gray-400 mt-1">
                {reportFilter === 'resolved'
                  ? 'No resolved reports in record yet.'
                  : 'All citizen road complaints in this category are resolved!'}
              </p>
            </div>
          )}
        </div>
      );
    }

    // ─── PAGE: HOME (Dashboard) ────────────────────────────────────────────────
    return (
      <>
        {/* Compact Sticky Top Bar */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-black">Construction Control</h1>
              <p className="text-[11px] text-gray-400 font-medium">Belagavi Roads & Infrastructure Authority</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage('reports')} className="relative p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors" title="Reports">
                <Bell className="w-5 h-5 text-black" />
                {activeReports.length > 0 && (
                  <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {activeReports.length}
                  </span>
                )}
              </button>
              <button onClick={() => setPage('profile')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                <User className="w-5 h-5 text-gray-700" />
              </button>
              <button onClick={() => onLogout?.()} className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 flex items-center gap-1 text-xs font-bold transition-colors" title="Logout">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div className="p-4 space-y-4 pb-28">
          {/* 4 Metrics Cards */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { l: 'Reports', v: activeReports.length, c: 'bg-red-50 text-red-600', action: () => setPage('reports') },
              { l: 'Zones', v: zones.length, c: 'bg-orange-50 text-orange-600', action: () => setPage('zones') },
              { l: 'Road Blocks', v: activeRoadBlocks.length, c: 'bg-amber-50 text-amber-700', action: () => setPage('zones') },
              { l: 'Solved', v: resolvedReports.length, c: 'bg-emerald-50 text-emerald-600', action: () => setPage('reports') }
            ].map(s => (
              <div
                key={s.l}
                onClick={s.action}
                className={`${s.c} rounded-2xl p-2.5 text-center cursor-pointer hover:opacity-90 active:scale-95 transition-all shadow-xs`}
              >
                <div className="text-xl font-black">{s.v}</div>
                <div className="text-[10px] font-bold opacity-80 truncate">{s.l}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowAddZone(true)}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 active:scale-[0.99] text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 transition-all text-sm"
          >
            <Plus className="w-5 h-5" />
            Add Construction Zone / Road Block
          </button>

          {/* Map Preview */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-black flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-500" />
                Belagavi Grid Map
              </h3>
              <button onClick={() => setPage('map')} className="text-xs font-bold text-black flex items-center gap-1">
                Full Map <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <ZoneMap incidents={incidents} zones={zones} onSelect={setSelected} />
          </div>

          {/* Active Road Blocks Preview */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-black flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-600" />
                Active Road Blocks ({activeRoadBlocks.length})
              </h3>
              <button onClick={() => setPage('zones')} className="text-xs font-bold text-orange-600">
                View all →
              </button>
            </div>
            {activeRoadBlocks.slice(0, 2).map((inc, i) => (
              <div key={inc._id || i} className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-2 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span>🚧</span>
                    <h4 className="font-bold text-xs text-black truncate">{inc.title}</h4>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">{inc.location?.address || 'Belagavi'}</p>
                </div>
                <button
                  onClick={() => resolve(inc._id, true)}
                  className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-bold ml-2 shrink-0"
                >
                  Clear
                </button>
              </div>
            ))}
            {activeRoadBlocks.length === 0 && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center text-xs text-gray-400">
                No active road blocks. All routes clear.
              </div>
            )}
          </div>

          {/* Citizen Road Reports Preview */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-black flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Citizen Road Reports
              </h3>
              <button onClick={() => setPage('reports')} className="text-xs font-bold text-red-500">
                {activeReports.length} reports →
              </button>
            </div>
            {loading && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {activeReports.slice(0, 3).map((inc, i) => (
              <motion.div
                key={inc._id || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelected(inc)}
                className="bg-white rounded-xl border border-gray-200 p-3 mb-2 cursor-pointer hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-sm font-bold shrink-0">
                    {inc.type === 'pothole' ? '🕳️' : '🛣️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-black text-xs truncate">{inc.title || inc.type}</h4>
                    <p className="text-[11px] text-gray-500 truncate">{inc.location?.address?.split(',')[0] || 'Belagavi'}</p>
                  </div>
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                    {inc.priority || 'HIGH'}
                  </span>
                </div>
              </motion.div>
            ))}
            {activeReports.length === 0 && !loading && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center text-xs text-gray-400">
                No pending citizen road reports.
              </div>
            )}
          </div>

          {/* Active Projects */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-black flex items-center gap-2">
                <Construction className="w-4 h-4 text-orange-500" />
                Construction Projects
              </h3>
              <button onClick={() => setPage('zones')} className="text-xs font-bold text-black">
                Manage →
              </button>
            </div>
            {zones.map(z => (
              <div key={z.id} className="bg-orange-50/70 rounded-xl p-3 border border-orange-100 mb-2 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-black">{z.name}</div>
                  <div className="text-[11px] text-gray-500">{z.location} • {z.progress}%</div>
                </div>
                <button
                  onClick={() => setPage('zones')}
                  className="px-3 py-1 bg-orange-500 text-white rounded-lg text-xs font-bold"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="relative h-full overflow-hidden bg-white">
      <div className="relative z-10 h-full overflow-y-auto pb-24">{renderPage()}</div>

      {/* Bottom Navigation: Tab 4 is now 'Reports' */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-lg">
        <div className="grid grid-cols-5 max-w-md mx-auto">
          {tabs.map(t => {
            const a = page === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setPage(t.id)}
                className="relative p-3.5 flex flex-col items-center gap-1 transition-all"
              >
                <t.icon
                  className={`w-5 h-5 ${a ? 'text-black' : 'text-gray-400'}`}
                  fill={a ? 'black' : 'none'}
                />
                <span className={`text-[11px] ${a ? 'text-black font-bold' : 'text-gray-400 font-medium'}`}>
                  {t.label}
                </span>
                {a && (
                  <motion.div
                    layoutId="con-nav"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-black rounded-full"
                    transition={{ type: 'spring', duration: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Citizen Report Urgent Banner (ONLY for citizen reports, NOT for road blocks) */}
      <AnimatePresence>
        {showBanner && alertData && (
          <motion.div
            initial={{ y: -120 }}
            animate={{ y: 0 }}
            exit={{ y: -120 }}
            className="fixed top-0 left-0 right-0 z-[60] p-3 pt-12"
          >
            <div className="bg-white rounded-2xl border-2 border-red-500 p-4 shadow-2xl mx-2">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0 font-bold text-lg">
                  🕳️
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-wider">⚠️ New Citizen Hazard Report</p>
                  <p className="text-sm font-bold text-black truncate">{alertData.title || alertData.type}</p>
                  <p className="text-xs text-gray-500 truncate">{alertData.location?.address || 'Belagavi'}</p>
                </div>
                <button onClick={() => setShowBanner(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    setSelected(alertData);
                    setShowBanner(false);
                    setPage('reports');
                  }}
                  className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold"
                >
                  View in Reports
                </button>
                <button
                  onClick={() => setShowBanner(false)}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Zone / Road Block Modal */}
      <AnimatePresence>
        {showAddZone && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end justify-center p-4">
            <motion.div
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 block">Civic Grid Control</span>
                  <h2 className="text-lg font-black text-black">Add Road Block / Hazard Zone</h2>
                </div>
                <button
                  onClick={() => setShowAddZone(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              <div className="space-y-3.5">
                {/* Zone / Reason Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Road Block / Zone Title *
                  </label>
                  <input
                    value={newZone.name}
                    onChange={e => setNewZone({ ...newZone, name: e.target.value })}
                    placeholder="e.g. NH-4 Flyover Maintenance / Angol Road Closure"
                    className="w-full bg-gray-50 border border-gray-200 focus:border-orange-500 focus:bg-white rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all"
                    autoFocus
                  />
                </div>

                {/* Location Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Location / Landmark
                  </label>
                  <input
                    value={newZone.location}
                    onChange={e => setNewZone({ ...newZone, location: e.target.value })}
                    placeholder="Street name or landmark"
                    className="w-full bg-gray-50 border border-gray-200 focus:border-orange-500 focus:bg-white rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all"
                  />
                </div>

                {/* AUTOMATIC LIVE GPS DISPLAY */}
                <div className="bg-orange-50/70 border border-orange-200/90 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-orange-950">
                        Live GPS Position (Automatic)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={detectGps}
                      disabled={gpsLoading}
                      className="text-[11px] font-bold text-orange-600 hover:text-orange-700 bg-white border border-orange-200 rounded-lg px-2.5 py-1 flex items-center gap-1 shadow-xs transition-all active:scale-95"
                    >
                      <RefreshCw className={`w-3 h-3 ${gpsLoading ? 'animate-spin' : ''}`} />
                      {gpsLoading ? 'Locking...' : 'Relock GPS'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono bg-white/90 border border-orange-200/60 rounded-xl px-3 py-2.5 text-gray-800">
                    <span className="flex items-center gap-1 font-semibold">
                      <MapPin className="w-3.5 h-3.5 text-orange-600" />
                      {gpsLoading ? (
                        <span className="text-gray-400 animate-pulse font-sans">Acquiring high-accuracy satellite signal...</span>
                      ) : (
                        <span>{gpsLocation?.lat ? `${gpsLocation.lat.toFixed(5)}° N, ${gpsLocation.lng.toFixed(5)}° E` : '15.84970° N, 74.49770° E'}</span>
                      )}
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded font-sans">
                      🛰️ Auto-Locked
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Live coordinates are plotted in real-time on citizen navigation maps and smart detour routers.
                  </p>
                </div>

                {/* Submit Button */}
                <button
                  onClick={addZone}
                  disabled={gpsLoading}
                  className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 active:scale-[0.99] text-white rounded-xl font-bold shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <span>🚧</span>
                  <span>Add & Broadcast to Citizens</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <IncidentPopup
            incident={selected}
            onClose={() => setSelected(null)}
            onResolve={(id) => {
              const isBlock = selected.type === 'construction' || selected.tags?.includes('road_block') || selected.title?.includes('[ROAD BLOCK]');
              resolve(id, isBlock);
              setSelected(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
export default ConstructionDashboard;
