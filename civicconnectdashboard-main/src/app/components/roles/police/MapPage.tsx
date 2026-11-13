import { useState, useEffect, useRef } from 'react';
import {
  Navigation, MapPin, Search, Shield, AlertTriangle, CheckCircle,
  Radio, Compass, RefreshCw, ChevronRight, Car, AlertCircle, Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, SOCKET_URL, API_BASE } from '../../../../api';
import { io as socketIO } from 'socket.io-client';

const BELAGAVI_POLICE_STATIONS = [
  { name: 'Belagavi Traffic Police HQ', location: 'Rani Chennamma Circle, Belagavi', lat: 15.8497, lng: 74.4977, type: 'hq' },
  { name: 'Khade Bazar Police Station', location: 'Khade Bazar, Belagavi', lat: 15.8560, lng: 74.5080, type: 'station' },
  { name: 'Tilakwadi Police Station', location: 'Congress Road, Tilakwadi', lat: 15.8340, lng: 74.5020, type: 'station' },
  { name: 'Camp Police Station', location: 'Camp Area, Belagavi', lat: 15.8620, lng: 74.5120, type: 'station' },
  { name: 'APMC Police Station', location: 'APMC Market Yard, Belagavi', lat: 15.8750, lng: 74.5200, type: 'station' },
  { name: 'Udyambag Police Station', location: 'Udyambag Industrial Area', lat: 15.8200, lng: 74.4850, type: 'station' },
];

const TRAFFIC_HOTSPOTS = [
  { lat: 15.8497, lng: 74.4977, label: 'RPD Cross — Heavy Traffic', color: '#EF4444' },
  { lat: 15.8440, lng: 74.5040, label: 'College Road — Congestion', color: '#F97316' },
  { lat: 15.8525, lng: 74.5085, label: 'Bogarves Circle — Moderate Flow', color: '#FBBF24' },
  { lat: 15.8520, lng: 74.5020, label: 'Rani Chennamma Circle — High Traffic', color: '#EF4444' },
  { lat: 15.8380, lng: 74.4950, label: 'Angol Main Road — Normal Flow', color: '#22C55E' },
];

interface MapPageProps {
  incidents?: any[];
  onSelectIncident?: (incident: any) => void;
  onResolve?: (id: string) => void;
}

export function MapPage({ incidents: propIncidents, onSelectIncident, onResolve }: MapPageProps) {
  const [incidents, setIncidents] = useState<any[]>(propIncidents || []);
  const [loading, setLoading] = useState(!propIncidents || propIncidents.length === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'accident' | 'traffic' | 'road_block' | 'critical' | 'resolved'>('all');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Fetch real incidents if not passed as props
  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const data = await api.getIncidents({ limit: '50' } as any);
      const list = Array.isArray(data) ? data : data.incidents || data.data || [];
      setIncidents(list);
    } catch {
      // Keep existing incidents
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!propIncidents || propIncidents.length === 0) {
      fetchIncidents();
    } else {
      setIncidents(propIncidents);
      setLoading(false);
    }
  }, [propIncidents]);

  // Real-time Socket.IO listener for live police incident updates
  useEffect(() => {
    const s = socketIO(SOCKET_URL);
    s.on('connect', () => {
      s.emit('join-role', 'police');
      s.emit('join-role', 'all');
    });

    s.on('incident-update', (d: any) => {
      if (d?.type === 'new' && d?.incident) {
        setIncidents(prev => [d.incident, ...prev.filter(i => i._id !== d.incident._id)]);
      } else if (d?.incident) {
        setIncidents(prev => prev.map(i => i._id === d.incident._id ? d.incident : i));
      }
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([15.8497, 74.4977], 13);

    mapInstance.current = map;

    // Real OpenStreetMap Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Layer group for dynamic markers
    const markerGroup = L.layerGroup().addTo(map);
    markersRef.current = markerGroup;

    // Plot static Belagavi Police Stations
    BELAGAVI_POLICE_STATIONS.forEach(st => {
      const stationIcon = L.divIcon({
        className: '',
        html: `
          <div style="width:34px;height:34px;border-radius:12px;background:#1E3A8A;border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;">
            👮
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      L.marker([st.lat, st.lng], { icon: stationIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:'DM Sans',sans-serif;padding:3px;min-width:180px;">
            <div style="font-weight:800;font-size:13px;color:#1E3A8A;">🚔 ${st.name}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:2px;">${st.location}</div>
            <div style="font-size:10px;font-weight:700;color:#2563EB;margin-top:4px;background:#EFF6FF;padding:2px 6px;border-radius:6px;display:inline-block;">ACTIVE PATROL SECTOR</div>
          </div>
        `);
    });

    // Plot Congestion Circles
    TRAFFIC_HOTSPOTS.forEach(z => {
      L.circle([z.lat, z.lng], {
        radius: 220,
        color: z.color,
        fillColor: z.color,
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map).bindPopup(`<b>🚦 ${z.label}</b><br/><small>Belagavi Traffic Corridor</small>`);
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Update incident markers when incidents or activeFilter changes
  useEffect(() => {
    if (!mapInstance.current || !markersRef.current) return;
    markersRef.current.clearLayers();

    const priorityColor: Record<string, string> = {
      critical: '#EF4444',
      high: '#EF4444',
      medium: '#F97316',
      low: '#22C55E',
    };

    const typeIcons: Record<string, string> = {
      accident: '🚗💥',
      traffic: '🚦',
      traffic_jam: '🚦',
      road_damage: '🛣️',
      pothole: '🕳️',
      waterlogging: '🌊',
      illegal_parking: '🅿️',
      crime: '🚨',
      construction: '🚧',
    };

    const filtered = incidents.filter(i => {
      const isSolved = i.status === 'resolved' || i.status === 'closed';
      const isBlock = i.type === 'construction' || i.tags?.includes('road_block') || i.title?.toLowerCase().includes('road block');

      if (activeFilter === 'resolved') return isSolved;
      if (isSolved && activeFilter !== 'all') return false;

      if (activeFilter === 'accident') return i.type === 'accident';
      if (activeFilter === 'traffic') return i.type === 'traffic' || i.type === 'traffic_jam';
      if (activeFilter === 'road_block') return isBlock;
      if (activeFilter === 'critical') return i.priority === 'critical' || i.priority === 'high';

      return true;
    });

    const boundsPoints: [number, number][] = [];

    filtered.forEach(inc => {
      if (!inc.location?.lat || !inc.location?.lng) return;
      const lat = Number(inc.location.lat);
      const lng = Number(inc.location.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      boundsPoints.push([lat, lng]);

      const isSolved = inc.status === 'resolved' || inc.status === 'closed';
      const isBlock = inc.type === 'construction' || inc.tags?.includes('road_block') || inc.title?.toLowerCase().includes('road block');
      const color = isSolved ? '#6B7280' : isBlock ? '#EA580C' : (priorityColor[inc.priority] || '#F97316');
      const emoji = isSolved ? '✅' : isBlock ? '🚧' : (typeIcons[inc.type] || '⚠️');

      // Draw Detour circle for road blocks
      if (isBlock && !isSolved) {
        L.circle([lat, lng], {
          radius: 200,
          color: '#EA580C',
          fillColor: '#EA580C',
          fillOpacity: 0.15,
          weight: 2,
        }).addTo(markersRef.current).bindPopup(`<b>🚧 Construction Road Block</b><br/>${inc.title || ''}<br/><small>Diversion in effect</small>`);
      }

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: ${color};
            border: 3px solid #ffffff;
            box-shadow: 0 3px 10px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
            cursor: pointer;
            transition: transform 0.2s;
          " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">
            ${emoji}
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([lat, lng], { icon }).addTo(markersRef.current);

      marker.bindPopup(`
        <div style="font-family:'DM Sans',sans-serif;padding:2px;min-width:200px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
            <span style="font-size:11px;font-weight:800;color:${color};text-transform:uppercase;">${(inc.type || 'REPORT').replace('_', ' ')}</span>
            <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${isSolved ? '#E5E7EB' : '#FEE2E2'};color:${isSolved ? '#374151' : '#DC2626'};">
              ${isSolved ? 'RESOLVED' : (inc.priority || 'HIGH').toUpperCase()}
            </span>
          </div>
          <div style="font-weight:700;font-size:13px;color:#111827;line-height:1.3;">${inc.title || inc.type}</div>
          <div style="font-size:11px;color:#4B5563;margin-top:4px;">📍 ${inc.location?.address || 'Belagavi'}</div>
          ${inc.description ? `<div style="font-size:11px;color:#6B7280;margin-top:4px;background:#F9FAFB;padding:4px 6px;border-radius:6px;">${inc.description}</div>` : ''}
          <div style="margin-top:8px;display:flex;gap:4px;">
            <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving','_blank')" style="flex:1;background:#2563EB;color:#fff;border:none;border-radius:6px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;">
              🚗 GPS Navigate
            </button>
          </div>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectIncident) {
          onSelectIncident(inc);
        }
      });
    });

    // If we have points and not zoomed in, fit bounds nicely
    if (boundsPoints.length > 0 && mapInstance.current) {
      mapInstance.current.fitBounds(boundsPoints, { padding: [40, 40], maxZoom: 15 });
    }
  }, [incidents, activeFilter, onSelectIncident]);

  // GPS Locate Current Officer
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setGpsLoading(true);
    toast.info('Acquiring high-accuracy police patrol GPS position...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLocation({ lat, lng });

        if (mapInstance.current) {
          mapInstance.current.flyTo([lat, lng], 16, { duration: 1.2 });

          // Add or move officer position marker
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([lat, lng]);
          } else {
            const officerIcon = L.divIcon({
              className: '',
              html: `
                <div style="position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center;">
                  <div style="position:absolute;width:100%;height:100%;border-radius:50%;background:#3B82F6;opacity:0.4;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
                  <div style="width:18px;height:18px;border-radius:50%;background:#1D4ED8;border:3px solid #fff;box-shadow:0 0 10px rgba(29,78,216,0.6);"></div>
                </div>
              `,
              iconSize: [30, 30],
              iconAnchor: [15, 15],
            });
            userMarkerRef.current = L.marker([lat, lng], { icon: officerIcon })
              .addTo(mapInstance.current)
              .bindPopup('<b>👮 Your Patrol Location</b><br/>Belagavi Traffic Police');
          }
        }
        setGpsLoading(false);
        toast.success(`📍 GPS Locked: ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`);
      },
      () => {
        setGpsLoading(false);
        // Fallback to Belagavi Center
        if (mapInstance.current) {
          mapInstance.current.flyTo([15.8497, 74.4977], 14);
        }
        toast.warning('Using Belagavi Traffic Police HQ location');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleZoomIn = () => {
    mapInstance.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstance.current?.zoomOut();
  };

  const handleResetCenter = () => {
    mapInstance.current?.flyTo([15.8497, 74.4977], 13);
  };

  const flyToIncident = (inc: any) => {
    if (!inc.location?.lat || !inc.location?.lng) {
      toast.error('No coordinates for this incident');
      return;
    }
    const lat = Number(inc.location.lat);
    const lng = Number(inc.location.lng);
    mapInstance.current?.flyTo([lat, lng], 16, { duration: 1 });
  };

  const openNavigation = (inc: any) => {
    if (inc.location?.lat && inc.location?.lng) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${inc.location.lat},${inc.location.lng}&travelmode=driving`,
        '_blank'
      );
    } else {
      toast.error('Location coordinates not available');
    }
  };

  const handleResolveInternal = async (id: string) => {
    if (onResolve) {
      onResolve(id);
      return;
    }
    try {
      await fetch(`${API_BASE}/incidents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('cc_token') ? { Authorization: `Bearer ${localStorage.getItem('cc_token')}` } : {})
        },
        body: JSON.stringify({ status: 'resolved' })
      });
      toast.success('✅ Incident resolved!');
      fetchIncidents();
    } catch {
      toast.error('Failed to resolve');
    }
  };

  // Filtered incidents for the list below map
  const displayedIncidents = incidents.filter(i => {
    const isSolved = i.status === 'resolved' || i.status === 'closed';
    const isBlock = i.type === 'construction' || i.tags?.includes('road_block') || i.title?.toLowerCase().includes('road block');

    if (activeFilter === 'resolved') {
      if (!isSolved) return false;
    } else {
      if (isSolved) return false;
      if (activeFilter === 'accident' && i.type !== 'accident') return false;
      if (activeFilter === 'traffic' && i.type !== 'traffic' && i.type !== 'traffic_jam') return false;
      if (activeFilter === 'road_block' && !isBlock) return false;
      if (activeFilter === 'critical' && (i.priority !== 'critical' && i.priority !== 'high')) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (i.title || '').toLowerCase().includes(q);
      const matchAddr = (i.location?.address || '').toLowerCase().includes(q);
      const matchType = (i.type || '').toLowerCase().includes(q);
      return matchTitle || matchAddr || matchType;
    }
    return true;
  });

  const activeCount = incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed').length;

  return (
    <div className="h-full bg-white flex flex-col overflow-y-auto no-scrollbar pb-28">
      {/* Real Leaflet Map Container */}
      <div className="relative isolate z-0 w-full h-[54vh] min-h-[320px] bg-gray-100 border-b border-gray-200">
        <div ref={mapRef} className="w-full h-full" style={{ zIndex: 1 }} />

        {/* Floating Search Bar */}
        <div className="absolute top-4 left-4 right-16 z-10">
          <div className="relative shadow-lg rounded-2xl overflow-hidden bg-white/95 backdrop-blur-md border border-gray-200/80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Belagavi roads, incidents, landmarks..."
              className="w-full bg-transparent pl-10 pr-4 py-3 text-xs text-black placeholder-gray-400 focus:outline-none font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Floating Map Controls */}
        <div className="absolute top-4 right-3 z-10 flex flex-col gap-2">
          {/* GPS Locate Me */}
          <button
            onClick={handleLocateMe}
            disabled={gpsLoading}
            className="w-10 h-10 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200/80 flex items-center justify-center text-blue-600 hover:bg-blue-50 active:scale-95 transition-all"
            title="Locate Patrol GPS"
          >
            <Navigation className={`w-4 h-4 ${gpsLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            className="w-10 h-10 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200/80 flex items-center justify-center text-black font-bold text-base hover:bg-gray-50 active:scale-95 transition-all"
            title="Zoom In"
          >
            +
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            className="w-10 h-10 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200/80 flex items-center justify-center text-black font-bold text-base hover:bg-gray-50 active:scale-95 transition-all"
            title="Zoom Out"
          >
            −
          </button>

          {/* Center Belagavi */}
          <button
            onClick={handleResetCenter}
            className="w-10 h-10 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200/80 flex items-center justify-center text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
            title="Center Belagavi City"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>

        {/* Floating Live Grid Status Pill */}
        <div className="absolute bottom-3 left-4 z-10 bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl px-2.5 py-1 flex items-center gap-2 shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-black text-gray-800 uppercase tracking-wider">
            Belagavi Traffic Grid Live
          </span>
        </div>
      </div>

      {/* Filter Tabs Bar */}
      <div className="p-3 bg-white border-b border-gray-100">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'all', label: `All (${activeCount})` },
            { id: 'accident', label: `🚗 Accidents (${incidents.filter(i => i.type === 'accident' && i.status !== 'resolved').length})` },
            { id: 'traffic', label: `🚦 Traffic (${incidents.filter(i => (i.type === 'traffic' || i.type === 'traffic_jam') && i.status !== 'resolved').length})` },
            { id: 'road_block', label: `🚧 Blocks (${incidents.filter(i => (i.type === 'construction' || i.tags?.includes('road_block') || i.title?.toLowerCase().includes('road block')) && i.status !== 'resolved').length})` },
            { id: 'critical', label: `🚨 Critical (${incidents.filter(i => (i.priority === 'critical' || i.priority === 'high') && i.status !== 'resolved').length})` },
            { id: 'resolved', label: `✅ Solved (${incidents.filter(i => i.status === 'resolved' || i.status === 'closed').length})` },
          ].map(f => {
            const active = activeFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Real Nearby Incidents List */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-black text-sm flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-blue-600" />
              Live Incidents on Grid ({displayedIncidents.length})
            </h3>
            <p className="text-[11px] text-gray-400">Click any card to focus on map or navigate with GPS</p>
          </div>
          <button
            onClick={fetchIncidents}
            className="text-xs text-blue-600 font-bold bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayedIncidents.length > 0 ? (
          displayedIncidents.map((incident, i) => {
            const isSolved = incident.status === 'resolved' || incident.status === 'closed';
            const isHigh = incident.priority === 'critical' || incident.priority === 'high';
            const isRoadBlock = incident.type === 'construction' || incident.tags?.includes('road_block') || incident.title?.toLowerCase().includes('road block');

            return (
              <motion.div
                key={incident._id || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => flyToIncident(incident)}
                className={`rounded-2xl p-4 border transition-all cursor-pointer ${
                  isSolved
                    ? 'bg-gray-50/70 border-gray-200 opacity-80'
                    : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                      isSolved
                        ? 'bg-gray-100'
                        : isRoadBlock
                        ? 'bg-orange-100'
                        : incident.type === 'accident'
                        ? 'bg-red-100'
                        : incident.type === 'traffic' || incident.type === 'traffic_jam'
                        ? 'bg-amber-100'
                        : 'bg-blue-100'
                    }`}>
                      {isSolved ? '✅' : isRoadBlock ? '🚧' : incident.type === 'accident' ? '🚗💥' : incident.type === 'traffic' || incident.type === 'traffic_jam' ? '🚦' : '📋'}
                    </div>

                    <div className="min-w-0">
                      <h4 className="font-bold text-black text-sm truncate">{incident.title || incident.type}</h4>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-1 truncate">
                        <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                        <span>{incident.location?.address || 'Belagavi Road'}</span>
                      </p>
                      {incident.description && (
                        <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded-xl mt-2 line-clamp-2">
                          {incident.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0 tracking-wide uppercase ${
                    isSolved
                      ? 'bg-gray-200 text-gray-700'
                      : isHigh
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {isSolved ? 'SOLVED' : (incident.priority || 'HIGH').toUpperCase()}
                  </span>
                </div>

                {/* Card Action Buttons */}
                <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => openNavigation(incident)}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Navigate
                  </button>

                  {onSelectIncident && (
                    <button
                      onClick={() => onSelectIncident(incident)}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-800 rounded-xl text-xs font-bold transition-all"
                    >
                      Case Details
                    </button>
                  )}

                  {!isSolved && (
                    <button
                      onClick={() => handleResolveInternal(incident._id)}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all"
                      title="Mark Solved"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100 p-6">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-sm text-black">No Incidents in this View</p>
            <p className="text-xs text-gray-400 mt-1">
              {activeFilter === 'resolved'
                ? 'No resolved cases recorded yet.'
                : 'All traffic corridors in this category are currently clear!'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
export default MapPage;
