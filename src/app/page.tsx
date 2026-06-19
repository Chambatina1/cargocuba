'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShoppingCart, MapPin, Route, Trash2, Check, X, Phone,
  Truck, Loader2, ChevronRight, Zap, RotateCcw, Users, Shield,
  Navigation, Crosshair, ArrowLeft, Radar, MapIcon, Clock, Search
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Pickup {
  id: number; nombre: string; telefono: string | null; direccion: string;
  lat: number; lng: number; notas: string | null; estado: string;
  choferAsignado: string | null; ordenRuta: number | null;
  fechaRecogida: string | null; horarioReady: string | null;
  area: string | null; createdAt: string; updatedAt: string;
}

interface GeoSuggestion {
  display_name: string; lat: string; lon: string;
}

interface Driver {
  phone: string; nombre: string; lat: number; lng: number; activo: boolean; updatedAt: string;
  mensaje?: string | null; precioServicio?: string | null; direccionRecojo?: string | null; comunidad?: string | null;
  puntoPartidaLat?: number | null; puntoPartidaLng?: number | null; puntoPartidaDir?: string | null;
}

// ─── Base / Depot ──────────────────────────────────────────────────────────
const BASE_LAT = 28.6184;
const BASE_LNG = -81.3153;
const BASE_NAME = '2234 Winter Woods Blvd';

// ─── Colors ────────────────────────────────────────────────────────────────
const VERDE = '#16a34a';
const MORADO = '#9333ea';
const RUTA = '#2563eb';
const BASE_COLOR = '#dc2626';
const CHOFER_COLOR = '#2563eb';

// Colores para cada grupo de chofer
const GRUPO_COLORES = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#e11d48'];

function getGrupoColor(idx: number) { return GRUPO_COLORES[idx % GRUPO_COLORES.length]; }

// ─── OSRM ───────────────────────────────────────────────────────────────────
async function calcRoute(points: { lat: number; lng: number }[]) {
  if (points.length < 2) return { route: [] as [number, number][], totalDistance: 0, totalDuration: 0, legs: [] as { duration: number; distance: number }[] };
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('Ruta no encontrada');
  const r = json.routes[0];
  return {
    route: r.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]),
    totalDistance: r.distance || 0, totalDuration: r.duration || 0,
    legs: (r.legs || []).map((l: any) => ({ duration: l.duration || 0, distance: l.distance || 0 })),
  };
}

function fmtDist(m: number) {
  const mi = m * 0.000621371;
  return mi < 0.1 ? `${Math.round(m)} m` : `${mi.toFixed(1)} mi`;
}
function fmtTime(s: number) { if (s < 60) return `${Math.round(s)}s`; const m = Math.floor(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; }
function absoluteETA(cumSeconds: number): string {
  const d = new Date(Date.now() + cumSeconds * 1000);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ─── Haversine (returns km) ────────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distMiles(lat: number, lng: number, fromLat = BASE_LAT, fromLng = BASE_LNG): number {
  return haversine(fromLat, fromLng, lat, lng) * 0.621371;
}

function distMilesFromBase(lat: number, lng: number): number {
  return distMiles(lat, lng);
}

function optimizeOrder(pickups: Pickup[], startLat = BASE_LAT, startLng = BASE_LNG): Pickup[] {
  if (pickups.length <= 1) return [...pickups];
  // Sort by horarioReady first (nulls last = treat as '99:99'), then nearest-neighbor within time groups
  const sorted = [...pickups].sort((a, b) => {
    const tA = a.horarioReady || '99:99';
    const tB = b.horarioReady || '99:99';
    return tA.localeCompare(tB);
  });
  // Group by horarioReady
  const groups: Map<string, Pickup[]> = new Map();
  for (const p of sorted) {
    const key = p.horarioReady || '__sin_horario__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  // Nearest-neighbor within each group, chaining groups in time order
  const ordered: Pickup[] = [];
  let cLat = startLat, cLng = startLng;
  for (const [, group] of groups) {
    const remaining = [...group];
    while (remaining.length > 0) {
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversine(cLat, cLng, remaining[i].lat, remaining[i].lng);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      const next = remaining.splice(bestI, 1)[0];
      ordered.push(next); cLat = next.lat; cLng = next.lng;
    }
  }
  return ordered;
}

// ─── Server-side geocoding via /api/geocode (Census + Nominatim + Photon) ─
// All geocoding goes through our API route to avoid CORS and maximize coverage.
// The server queries US Census (best US addresses), Photon (Komoot), and
// Nominatim (OSM) in parallel — like having Google Maps quality.
const geocodeCache = new Map<string, { results: GeoSuggestion[]; ts: number }>();
const GEOCODE_TTL = 30 * 60 * 1000; // 30 min

async function forwardGeocode(query: string): Promise<GeoSuggestion[]> {
  const key = query.toLowerCase().trim();
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.ts < GEOCODE_TTL) return cached.results;
  try {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    const j = await r.json();
    const results: GeoSuggestion[] = (j.results || []).map((s: { display_name: string; lat: string; lon: string }) => ({
      display_name: s.display_name,
      lat: s.lat,
      lon: s.lon
    }));
    if (results.length > 0) geocodeCache.set(key, { results, ts: Date.now() });
    return results;
  } catch { return []; }
}

// ─── Reverse Geocode (server-side to avoid CORS) ─────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lng}`);
    const j = await r.json();
    return j.display_name || '';
  } catch { return ''; }
}

// ─── SVG Markers ────────────────────────────────────────────────────────────
function pinSVG(color: string, num?: number, pulse?: boolean) {
  const numHtml = num !== undefined
    ? `<circle cx="18" cy="16" r="10" fill="#fff" opacity="0.95"/><text x="18" y="20.5" text-anchor="middle" font-size="12" font-weight="bold" fill="${color}" font-family="system-ui">${num}</text>`
    : `<circle cx="18" cy="16" r="5" fill="#fff" opacity="0.9"/>`;
  const pulseHtml = pulse ? `<circle cx="18" cy="16" r="14" fill="none" stroke="${color}" stroke-width="2" opacity="0.4"><animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite"/></circle>` : '';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46"><path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z" fill="${color}" stroke="#fff" stroke-width="2"/>${pulseHtml}${numHtml}</svg>`)}`;
}

// ─── Extract coords from Google Maps link ────────────────────────────────
function extractGoogleMapsCoords(text: string): { lat: number; lng: number } | null {
  try {
    // Apple Maps: maps.apple.com/?ll=28.6,-81.3 or ?daddr=28.6,-81.3
    let m = text.match(/maps\.apple\.com\/.*[?&]ll=(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    // Waze: waze.com/ul?ll=28.6,-81.3
    m = text.match(/waze\.com\/ul\?.*ll=(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    // Google Maps: @28.6,-81.3
    m = text.match(/@(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    // Google Maps: !3d28.6!4d-81.3
    m = text.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    // Google Maps: /@28.6,-81.3
    m = text.match(/\/@(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    // Google Maps: query=28.6,-81.3
    m = text.match(/query=(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    // Generic: ll=28.6,-81.3
    m = text.match(/ll=(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    // Plain coords: 28.6,-81.3
    m = text.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (m && parseFloat(m[1]) >= -90 && parseFloat(m[1]) <= 90) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  } catch {}
  return null;
}

// ─── Navigation URLs ───────────────────────────────────────────────────────
function navGoogleMaps(lat: number, lng: number) { return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`; }
function navWaze(lat: number, lng: number) { return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`; }
function navAppleMaps(lat: number, lng: number) { return `https://maps.apple.com/?daddr=${lat},${lng}`; }

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function CargoCubaPage() {
  // ─── Overlay panels ───
  const [panel, setPanel] = useState<'none' | 'clientForm' | 'driver' | 'admin'>('none');

  // ─── Data ───
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Map refs ───
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeLineRef = useRef<any>(null);
  const driverAccuracyRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  // ─── Route ───
  const [optimizedRoute, setOptimizedRoute] = useState<Pickup[]>([]);
  const [routeData, setRouteData] = useState<{ route: [number, number][]; totalDistance: number; totalDuration: number; legs: { duration: number; distance: number }[] } | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  // ─── Client form ───
  const [form, setForm] = useState({ nombre: '', telefono: '', direccion: '', lat: 0, lng: 0, notas: '', horarioReady: '', area: '' });
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Address search ───
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewMarkerRef = useRef<any>(null);
  const mapViewInitialized = useRef(false); // only auto-fit map on FIRST render

  // ─── Driver mode ───
  const [driverPhone, setDriverPhone] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverActive, setDriverActive] = useState(false);
  const [driverMyLocation, setDriverMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverMensaje, setDriverMensaje] = useState('Voy a salir para Chambatina');
  const [driverPrecio, setDriverPrecio] = useState('');
  const [driverDirRecojo, setDriverDirRecojo] = useState('');
  const [driverComunidad, setDriverComunidad] = useState('');
  // ─── Punto de Partida del Chofer ───
  const [driverPPLat, setDriverPPLat] = useState<number | null>(null);
  const [driverPPLng, setDriverPPLng] = useState<number | null>(null);
  const [driverPPDir, setDriverPPDir] = useState('');
  const [ppSearchQuery, setPpSearchQuery] = useState('');
  const [ppSuggestions, setPpSuggestions] = useState<GeoSuggestion[]>([]);
  const [ppSearching, setPpSearching] = useState(false);
  const [ppShowSugg, setPpShowSugg] = useState(false);
  const [ppTapMode, setPpTapMode] = useState(false);
  const [ppSaving, setPpSaving] = useState(false);
  const ppTapModeRef = useRef(false);
  const ppTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ppPreviewRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const prevDriversRef = useRef<Map<string, { lat: number; lng: number; time: number }>>(new Map());
  const driverSpeedsRef = useRef<Map<string, number>>(new Map()); // mph

  // ─── Almacén de Destino ───
  const [warehouse, setWarehouse] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [whSearchQuery, setWhSearchQuery] = useState('');
  const [whSuggestions, setWhSuggestions] = useState<GeoSuggestion[]>([]);
  const [whSearching, setWhSearching] = useState(false);
  const [whShowSugg, setWhShowSugg] = useState(false);

  // ─── Follow Driver Mode ───
  const [followingDriver, setFollowingDriver] = useState(false);
  const [followDriverPhone, setFollowDriverPhone] = useState<string | null>(null);

  // ─── Admin (no password — direct access) ───
  const [adminChofer, setAdminChofer] = useState('');
  const [adminTab, setAdminTab] = useState<'lista' | 'distancias' | 'ruta' | 'grupos' | 'areas'>('lista');
  const [adminAreaFilter, setAdminAreaFilter] = useState('');
  const [distMatrix, setDistMatrix] = useState<{ from: string; to: string; distMi: number }[]>([]);
  const [calculatingDist, setCalculatingDist] = useState(false);
  const [scheduledDriver, setScheduledDriver] = useState('');
  const [scheduling, setScheduling] = useState(false);
  // Admin search & filter
  const [adminSearch, setAdminSearch] = useState('');
  const [adminEstadoFilter, setAdminEstadoFilter] = useState<'' | 'esperando' | 'recogido'>('');
  // Admin batch selection
  const [adminSelectedIds, setAdminSelectedIds] = useState<Set<number>>(new Set());
  const [adminBatchChofer, setAdminBatchChofer] = useState('');

  // ─── Grupos por Chofer (puntos de partida) ───
  const [driverRoutes, setDriverRoutes] = useState<Map<string, { route: Pickup[]; data: { route: [number, number][]; totalDistance: number; totalDuration: number; legs: { duration: number; distance: number }[] } | null }>>(new Map());
  const [optimizingAll, setOptimizingAll] = useState(false);
  const [selectedGrupoChofer, setSelectedGrupoChofer] = useState<string | null>(null);

  // ─── Select Mode (tap markers to measure distances) ───
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectLinesRef = useRef<any[]>([]);
  const [selectRouteData, setSelectRouteData] = useState<{ totalDistance: number; totalDuration: number; legs: { duration: number; distance: number }[] } | null>(null);
  const [calcSelectRoute, setCalcSelectRoute] = useState(false);

  // ─── Distance Reference Point (tap to set origin for distance calculations) ───
  const [distRefMode, setDistRefMode] = useState(false);
  const [distRefPoint, setDistRefPoint] = useState<{ lat: number; lng: number; name: string; pickupId?: number } | null>(null);
  const distRefMarkerRef = useRef<any>(null);

  // Helper: get the effective reference for distances (refPoint > driverPP > BASE)
  const getEffectiveRef = useCallback(() => {
    if (distRefPoint) return { lat: distRefPoint.lat, lng: distRefPoint.lng, name: distRefPoint.name };
    const selDriver = drivers.find(d => d.nombre === adminChofer);
    if (selDriver?.puntoPartidaLat && selDriver?.puntoPartidaLng) {
      return { lat: selDriver.puntoPartidaLat, lng: selDriver.puntoPartidaLng, name: selDriver.puntoPartidaDir || selDriver.nombre };
    }
    return { lat: BASE_LAT, lng: BASE_LNG, name: BASE_NAME };
  }, [distRefPoint, drivers, adminChofer]);
  const effectiveRef = getEffectiveRef();

  // ─── Client Tap Mode (tap map to place pickup) ───
  const [clientTapMode, setClientTapMode] = useState(false);
  const clientTapModeRef = useRef(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD LEAFLET
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    (async () => {
      try { const L = (await import('leaflet')).default; LRef.current = L; setMapReady(true); }
      catch { toast.error('No se pudo cargar el mapa'); }
    })();
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    return () => { if (mapInstRef.current) { mapInstRef.current.remove(); mapInstRef.current = null; } };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD DATA (faster refresh for driver tracking)
  // ═══════════════════════════════════════════════════════════════════════════
  const load = useCallback(async () => {
    try {
      const p = await fetch('/api/pickups');
      const j = await p.json();
      if (j.ok) setPickups(j.data || []);
    } catch {}
    try {
      const d = await fetch('/api/drivers');
      const j = await d.json();
      const drvList = j.data || [];
      if (j.ok) setDrivers(drvList);
      // Calculate speed for each driver (mph)
      const now = Date.now();
      for (const drv of drvList) {
        if (!drv.activo) continue;
        const prev = prevDriversRef.current.get(drv.phone);
        if (prev) {
          const dtSec = (now - prev.time) / 1000;
          if (dtSec > 2 && dtSec < 30) { // ignore stale or too-fast updates
            const dKm = haversine(prev.lat, prev.lng, drv.lat, drv.lng);
            const dMi = dKm * 0.621371;
            const mph = (dMi / dtSec) * 3600;
            // Smooth: average with previous speed, ignore unrealistic (>100mph)
            const prevSpd = driverSpeedsRef.current.get(drv.phone) || 0;
            driverSpeedsRef.current.set(drv.phone, mph > 0 && mph < 100 ? Math.round(prevSpd * 0.4 + mph * 0.6) : 0);
          }
        }
        prevDriversRef.current.set(drv.phone, { lat: drv.lat, lng: drv.lng, time: now });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { setLoading(true); load(); }, [load]);
  // Refresh every 4 seconds for real-time driver movement
  useEffect(() => { const iv = setInterval(load, 4000); return () => clearInterval(iv); }, [load]);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-FOLLOW DRIVER: keep map centered on followed driver
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!followingDriver || !followDriverPhone || !mapInstRef.current) return;
    const target = drivers.find(d => d.phone === followDriverPhone && d.activo);
    if (target) {
      mapInstRef.current.setView([target.lat, target.lng], 16, { animate: true, duration: 1.5 });
    }
  }, [drivers, followingDriver, followDriverPhone]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTANCE REFERENCE MODE: tap a marker to set as reference for distances
  // ═══════════════════════════════════════════════════════════════════════════
  const toggleDistRefMode = useCallback(() => {
    const next = !distRefMode;
    setDistRefMode(next);
    if (!next) { setDistRefPoint(null); if (distRefMarkerRef.current) { distRefMarkerRef.current.remove(); distRefMarkerRef.current = null; } }
    else { setSelectMode(false); setSelectedIds([]); setSelectRouteData(null); setPanel('none'); }
  }, [distRefMode]);

  const handleDistRefTap = useCallback((pickup: { id: number; nombre: string; lat: number; lng: number }) => {
    if (!distRefMode) return;
    setDistRefPoint({ lat: pickup.lat, lng: pickup.lng, name: pickup.nombre, pickupId: pickup.id });
    setDistRefMode(false);
    // Add marker
    if (distRefMarkerRef.current) { distRefMarkerRef.current.remove(); distRefMarkerRef.current = null; }
    if (mapInstRef.current && LRef.current) {
      const L = LRef.current;
      const icon = L.divIcon({
        html: `<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;"><div style="width:28px;height:28px;background:#dc2626;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(220,38,38,0.5);z-index:2;"><span style="font-size:14px;">📍</span></div><div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#dc2626;color:#fff;padding:1px 8px;border-radius:6px;font-size:8px;font-weight:800;font-family:system-ui;box-shadow:0 1px 4px rgba(0,0,0,0.2);">REFERENCIA</div></div>`,
        className: '', iconSize: [40, 58], iconAnchor: [20, 20],
      });
      distRefMarkerRef.current = L.marker([pickup.lat, pickup.lng], { icon, zIndexOffset: 4000 }).addTo(mapInstRef.current);
      distRefMarkerRef.current.bindPopup(`<div style="font-family:system-ui;"><strong style="font-size:13px;">${pickup.nombre}</strong><div style="font-size:11px;color:#dc2626;font-weight:600;margin-top:2px;">Punto de referencia para distancias</div><div style="font-size:10px;color:#666;margin-top:2px;">${pickup.direccion || ''}</div></div>`);
    }
    toast.success(`Referencia: ${pickup.nombre} — todas las distancias se miden desde aqui`);
    // Auto-calculate distances from new reference point (via useEffect on effectiveRef)
  }, [distRefMode]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SELECT MODE: tap markers to pick, measure distances, optimize
  // ═══════════════════════════════════════════════════════════════════════════
  const toggleSelectMode = useCallback(() => {
    const next = !selectMode;
    setSelectMode(next);
    if (!next) { setSelectedIds([]); setSelectRouteData(null); }
    else { setOptimizedRoute([]); setRouteData(null); setFollowingDriver(false); setFollowDriverPhone(null); setDistRefMode(false); }
  }, [selectMode]);

  const handleMarkerTap = useCallback((pickupId: number) => {
    if (!selectMode) return;
    setSelectedIds(prev => {
      const idx = prev.indexOf(pickupId);
      if (idx >= 0) {
        const next = [...prev];
        next.splice(idx, 1);
        if (next.length === 0) setSelectRouteData(null);
        return next;
      } else {
        return [...prev, pickupId];
      }
    });
    setSelectRouteData(null);
  }, [selectMode]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP
  // ═══════════════════════════════════════════════════════════════════════════
  const initMap = useCallback(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    if (!mapInstRef.current) {
      mapInstRef.current = L.map(mapRef.current, { center: [BASE_LAT, BASE_LNG], zoom: 11, zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '', maxZoom: 19 }).addTo(mapInstRef.current);
    }
  }, [mapReady]);

  const renderMarkers = useCallback(() => {
    if (!mapInstRef.current || !LRef.current) return;
    const L = LRef.current;

    // Clear all markers
    markersRef.current.forEach(m => m.remove()); markersRef.current = [];
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
    if (driverAccuracyRef.current) { driverAccuracyRef.current.remove(); driverAccuracyRef.current = null; }
    selectLinesRef.current.forEach(l => l.remove()); selectLinesRef.current = [];

    // Do NOT clear preview markers here — they belong to the user and should
    // survive data refreshes (every 4s). Only the user should remove them.
    // previewMarkerRef = client address pin, ppPreviewRef = driver PP pin

    const active = pickups.filter(p => p.estado !== 'cancelado');
    const displayList = optimizedRoute.length > 0 && panel === 'admin' ? optimizedRoute : active;

    // If following a driver, don't auto-fit bounds
    if (followingDriver) {
      // Only render markers, don't change view
    }

    const bounds: any[] = [];

    // ─── BASE marker (red) ───
    const baseIcon = L.icon({ iconUrl: pinSVG(BASE_COLOR), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
    const baseM = L.marker([BASE_LAT, BASE_LNG], { icon: baseIcon, zIndexOffset: 2000 }).addTo(mapInstRef.current);
    baseM.bindPopup(`<div style="font-family:system-ui;min-width:160px;"><strong style="font-size:13px;">Base</strong><div style="font-size:11px;color:#666;margin-top:2px;">${BASE_NAME}</div><div style="margin-top:4px;font-size:10px;color:#dc2626;font-weight:600;">Punto de partida principal</div></div>`);
    bounds.push([BASE_LAT, BASE_LNG]); markersRef.current.push(baseM);

    // ─── WAREHOUSE / ALMACÉN marker (dark red flag) ───
    if (warehouse) {
      const whIcon = L.divIcon({
        html: `<div style="position:relative;"><div style="width:36px;height:36px;background:#7f1d1d;border:3px solid #fff;border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.4);"><span style="font-size:18px;">🏭</span></div><div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#7f1d1d;color:#fff;padding:1px 6px;border-radius:6px;font-size:8px;font-weight:800;font-family:system-ui;box-shadow:0 1px 4px rgba(0,0,0,0.2);">ALMACÉN</div></div>`,
        className: '', iconSize: [36, 54], iconAnchor: [18, 36],
      });
      const whM = L.marker([warehouse.lat, warehouse.lng], { icon: whIcon, zIndexOffset: 2500 }).addTo(mapInstRef.current);
      whM.bindPopup(`<div style="font-family:system-ui;min-width:180px;"><strong style="font-size:13px;">Almacén de Destino</strong><div style="font-size:11px;color:#666;margin-top:2px;">${warehouse.name}</div><div style="margin-top:4px;font-size:10px;color:#7f1d1d;font-weight:600;">Destino final de la ruta</div></div>`);
      bounds.push([warehouse.lat, warehouse.lng]); markersRef.current.push(whM);
    }

    // ─── PUNTOS DE PARTIDA de cada chofer (estrellas naranja) ───
    drivers.filter(d => d.puntoPartidaLat && d.puntoPartidaLng).forEach((d, idx) => {
      const color = getGrupoColor(idx);
      const ppIcon = L.divIcon({
        html: `<div style="position:relative;"><div style="width:32px;height:32px;background:${color};border:3px solid #fff;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.3);"><span style="transform:rotate(45deg);font-size:14px;">🏠</span></div><div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;background:${color};color:#fff;padding:1px 6px;border-radius:6px;font-size:8px;font-weight:800;font-family:system-ui;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${d.nombre.split(' ')[0]}</div></div>`,
        className: '', iconSize: [32, 50], iconAnchor: [16, 32],
      });
      const ppM = L.marker([d.puntoPartidaLat!, d.puntoPartidaLng!], { icon: ppIcon, zIndexOffset: 2500 }).addTo(mapInstRef.current);
      const ppDist = distMiles(d.puntoPartidaLat!, d.puntoPartidaLng!).toFixed(1);
      ppM.bindPopup(`<div style="font-family:system-ui;min-width:180px;"><strong style="font-size:13px;">Sede: ${d.nombre}</strong><div style="font-size:11px;color:#666;margin-top:2px;">${d.puntoPartidaDir || 'Sin direccion'}</div><div style="margin-top:4px;font-size:10px;color:${color};font-weight:600;">Punto de partida de este chofer</div><div style="font-size:10px;color:#dc2626;">${ppDist} mi de la Base</div></div>`);
      bounds.push([d.puntoPartidaLat!, d.puntoPartidaLng!]); markersRef.current.push(ppM);
    });

    // ─── Route lines per driver group (Grupos tab) ───
    if (adminTab === 'grupos' && driverRoutes.size > 0) {
      let grupoIdx = 0;
      for (const [nombre, routeInfo] of driverRoutes) {
        if (routeInfo.data && routeInfo.data.route.length > 1) {
          const color = getGrupoColor(grupoIdx);
          const line = L.polyline(routeInfo.data.route, { color, weight: 4, opacity: 0.8, dashArray: '12, 8', lineCap: 'round' }).addTo(mapInstRef.current);
          markersRef.current.push(line);
        }
        grupoIdx++;
      }
    }

    // ─── Route line (admin optimize) ───
    if (routeData && routeData.route.length > 1 && panel === 'admin') {
      routeLineRef.current = L.polyline(routeData.route, { color: RUTA, weight: 4, opacity: 0.8, dashArray: '12, 8', lineCap: 'round' }).addTo(mapInstRef.current);
    }

    // ─── SELECT MODE: lines between selected points ───
    if (selectMode && selectedIds.length > 0) {
      const selPts = selectedIds.map(id => pickups.find(p => p.id === id)).filter(Boolean) as Pickup[];
      const allPts: [number, number][] = [[BASE_LAT, BASE_LNG], ...selPts.map(p => [p.lat, p.lng] as [number, number])];
      // Draw lines
      if (allPts.length >= 2) {
        // OSRM route line if available
        if (selectRouteData) {
          const osrmPts = selectedIds.map(id => pickups.find(p => p.id === id)).filter(Boolean) as Pickup[];
          const coords: [number, number][] = [[BASE_LAT, BASE_LNG], ...osrmPts.map(p => [p.lat, p.lng])];
          const line = L.polyline(coords, { color: '#f59e0b', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(mapInstRef.current);
          selectLinesRef.current.push(line);
        } else {
          const line = L.polyline(allPts, { color: '#f59e0b', weight: 4, opacity: 0.7, dashArray: '10, 6', lineCap: 'round' }).addTo(mapInstRef.current);
          selectLinesRef.current.push(line);
        }
      }
      // Distance labels at midpoints
      for (let i = 0; i < allPts.length - 1; i++) {
        const midLat = (allPts[i][0] + allPts[i + 1][0]) / 2;
        const midLng = (allPts[i][1] + allPts[i + 1][1]) / 2;
        const dMi = haversine(allPts[i][0], allPts[i][1], allPts[i + 1][0], allPts[i + 1][1]) * 0.621371;
        const legDist = selectRouteData?.legs[i] ? fmtDist(selectRouteData.legs[i].distance) : `${dMi.toFixed(1)} mi`;
        const legTime = selectRouteData?.legs[i] ? ` · ${fmtTime(selectRouteData.legs[i].duration)}` : '';
        const label = L.divIcon({
          html: `<div style="background:#fff;padding:2px 7px;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,0.2);border:1.5px solid #f59e0b;white-space:nowrap;font-family:system-ui;font-size:10px;font-weight:700;color:#92400e;">${legDist}${legTime}</div>`,
          className: '', iconAnchor: [40, 12],
        });
        const labelM = L.marker([midLat, midLng], { icon: label, interactive: false, zIndexOffset: 2500 }).addTo(mapInstRef.current);
        selectLinesRef.current.push(labelM);
      }
    }

    // ─── Pickup markers ───
    displayList.forEach((p, idx) => {
      const isVerde = p.estado === 'esperando';
      const color = isVerde ? VERDE : MORADO;
      const showNum = optimizedRoute.length > 0 && panel === 'admin';
      const selIdx = selectMode ? selectedIds.indexOf(p.id) : -1;
      const isSelected = selIdx >= 0;
      // In select mode, selected pins turn orange with selection number
      const finalColor = isSelected ? '#f59e0b' : color;
      const finalNum = isSelected ? selIdx + 1 : (showNum ? idx + 1 : undefined);
      const icon = L.icon({ iconUrl: pinSVG(finalColor, finalNum, isVerde && !isSelected), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(mapInstRef.current);
      // In select mode, tapping toggles selection; in dist ref mode, tap sets reference
      if (selectMode) {
        marker.on('click', () => { handleMarkerTap(p.id); });
      } else if (distRefMode) {
        marker.on('click', () => { handleDistRefTap(p); });
      } else {
        const estadoLabel = isVerde ? 'En Espera' : 'Recogido';
        const estadoColor = isVerde ? VERDE : MORADO;
        const distFromRef = haversine(effectiveRef.lat, effectiveRef.lng, p.lat, p.lng) * 0.621371;
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
        const wazeUrl = `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
        marker.bindPopup(`<div style="font-family:system-ui;min-width:200px;"><strong style="font-size:13px;">${p.nombre}</strong><div style="font-size:11px;color:#666;margin-top:2px;">${p.direccion}</div><div style="margin-top:4px;font-size:11px;color:#dc2626;font-weight:600;">${distFromRef.toFixed(1)} mi de ${effectiveRef.name}</div>${p.horarioReady ? `<div style="margin-top:4px;font-size:11px;color:#2563eb;font-weight:600;">Ready: ${p.horarioReady}</div>` : ''}<div style="margin-top:6px;display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${estadoColor};display:inline-block;"></span><span style="font-size:11px;font-weight:600;color:${estadoColor};">${estadoLabel}</span></div>${p.choferAsignado ? `<div style="font-size:11px;margin-top:4px;color:#555;">Chofer: ${p.choferAsignado}</div>` : ''}<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;"><a href="${gmapsUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#4285f4;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">Google Maps</a><a href="${wazeUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#59c657;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">Waze</a>${p.telefono ? `<a href="tel:${p.telefono}" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#2563eb;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">${p.telefono}</a>` : ''}</div></div>`);
      }
      bounds.push([p.lat, p.lng]); markersRef.current.push(marker);
    });

    // ─── DRIVER markers (community driver with blinking instructions) ───
    drivers.filter(d => d.activo).forEach(d => {
      const hasInst = d.mensaje || d.direccionRecojo || d.precioServicio;
      const mc = hasInst ? '#f97316' : CHOFER_COLOR;
      const mcr = hasInst ? '249,115,22' : '37,99,235';
      const isz = hasInst ? 90 : 60;
      const csz = hasInst ? 50 : 36;
      const esz = hasInst ? '22px' : '16px';

      const accuracyCircle = L.circle([d.lat, d.lng], {
        radius: hasInst ? 50 : 30, color: mc, fillColor: mc, fillOpacity: 0.06, weight: 2, opacity: 0.3,
      }).addTo(mapInstRef.current);
      markersRef.current.push(accuracyCircle);

      let msgBubble = '';
      if (hasInst) {
        const bt = (d.mensaje || '') + (d.precioServicio ? ` | $${d.precioServicio}` : '');
        msgBubble = `<div style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:8px;white-space:nowrap;z-index:10;"><div style="background:rgba(${mcr},0.95);color:#fff;padding:4px 12px;border-radius:10px;font-size:11px;font-weight:800;box-shadow:0 3px 12px rgba(0,0,0,0.25);letter-spacing:0.3px;animation:msgBlink 2s ease-in-out infinite;font-family:system-ui;">${bt}</div><div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid rgba(${mcr},0.95);margin:0 auto;"></div></div>`;
      }

      const pulseIcon = L.divIcon({
        html: `<div style="position:relative;width:${isz}px;height:${isz}px;display:flex;align-items:center;justify-content:center;"><div style="position:absolute;width:${isz}px;height:${isz}px;border-radius:50%;background:rgba(${mcr},0.12);animation:driverPulse 1.5s ease-out infinite;"></div><div style="position:absolute;width:${Math.round(isz*0.78)}px;height:${Math.round(isz*0.78)}px;border-radius:50%;background:rgba(${mcr},0.22);animation:driverPulse 1.5s ease-out infinite 0.4s;"></div><div style="width:${csz}px;height:${csz}px;background:${mc};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 16px rgba(${mcr},0.7);z-index:2;position:relative;"><span style="font-size:${esz};">🚛</span></div><div style="position:absolute;top:2px;right:4px;width:14px;height:14px;background:#22c55e;border:2px solid #fff;border-radius:50%;z-index:3;animation:liveDot 1s ease-in-out infinite;"></div>${msgBubble}</div><style>@keyframes driverPulse{0%{transform:scale(0.5);opacity:1}100%{transform:scale(1.4);opacity:0}}@keyframes liveDot{0%,100%{opacity:1}50%{opacity:0.2}}@keyframes msgBlink{0%,100%{opacity:1;transform:translateX(-50%) scale(1)}50%{opacity:0.85;transform:translateX(-50%) scale(1.03)}}</style>`,
        className: '', iconSize: [isz, isz + (hasInst ? 50 : 0)], iconAnchor: [isz / 2, isz / 2],
      });
      const dM = L.marker([d.lat, d.lng], { icon: pulseIcon, zIndexOffset: 3000 }).addTo(mapInstRef.current);
      const distFromRef = haversine(effectiveRef.lat, effectiveRef.lng, d.lat, d.lng) * 0.621371;
      const speed = driverSpeedsRef.current.get(d.phone) || 0;
      const speedHtml = speed > 0 ? `<div style="font-size:11px;color:#16a34a;font-weight:700;margin-top:2px;">${speed} mph</div>` : '';

      let instHtml = '';
      if (hasInst) {
        instHtml = `<div style="margin-top:8px;padding:10px;background:linear-gradient(135deg,#fff7ed,#ffedd5);border-radius:12px;border:1.5px solid #fdba74;">${d.mensaje ? `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;"><span style="font-size:14px;">💬</span><div><div style="font-size:9px;color:#92400e;font-weight:600;text-transform:uppercase;">Mensaje</div><div style="font-size:12px;color:#1c1917;font-weight:700;">${d.mensaje}</div></div></div>` : ''}${d.direccionRecojo ? `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;"><span style="font-size:14px;">📍</span><div><div style="font-size:9px;color:#92400e;font-weight:600;text-transform:uppercase;">Recogo en</div><div style="font-size:12px;color:#1c1917;font-weight:700;">${d.direccionRecojo}</div></div></div>` : ''}${d.precioServicio ? `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;"><span style="font-size:14px;">💰</span><div><div style="font-size:9px;color:#92400e;font-weight:600;text-transform:uppercase;">Cobro por servicio</div><div style="font-size:14px;color:#ea580c;font-weight:800;">$${d.precioServicio}</div></div></div>` : ''}${d.comunidad ? `<div style="display:flex;align-items:flex-start;gap:6px;"><span style="font-size:14px;">🏘️</span><div><div style="font-size:9px;color:#92400e;font-weight:600;text-transform:uppercase;">Comunidad</div><div style="font-size:12px;color:#1c1917;font-weight:700;">${d.comunidad}</div></div></div>` : ''}</div>`;
      }

      dM.bindPopup(`<div style="font-family:system-ui;min-width:240px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><div style="width:36px;height:36px;background:${mc};border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:18px;">🚛</span></div><div><strong style="font-size:14px;color:#111;">${d.nombre}</strong><div style="font-size:10px;color:${mc};font-weight:700;display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;"></span>EN VIVO${hasInst ? ' · MODO COMUNITARIO' : ''}</div></div></div><div style="font-size:11px;color:#666;">${d.phone} · ${distFromRef.toFixed(1)} mi de ${effectiveRef.name}</div>${speedHtml}${instHtml}<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;"><a href="https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:#4285f4;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">Google Maps</a><a href="tel:${d.phone}" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:${mc};color:#fff;font-size:11px;font-weight:600;text-decoration:none;">Llamar</a></div></div>`);
      bounds.push([d.lat, d.lng]); markersRef.current.push(dM);
    });

    // Only auto-fit on FIRST render — never steal the map from the user after that
    // (data refreshes every 4s, but the user's zoom/pan must be respected)
    if (!followingDriver && !mapViewInitialized.current) {
      mapViewInitialized.current = true;
      if (bounds.length > 1) {
        mapInstRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
      } else {
        mapInstRef.current.setView([BASE_LAT, BASE_LNG], 12);
      }
    }
    setTimeout(() => mapInstRef.current?.invalidateSize(), 150);
  }, [pickups, drivers, optimizedRoute, routeData, panel, mapReady, followingDriver, selectMode, selectedIds, selectRouteData, handleMarkerTap, distRefMode, handleDistRefTap, effectiveRef]);

  useEffect(() => { setTimeout(() => { initMap(); renderMarkers(); }, 200); }, [initMap, renderMarkers]);
  useEffect(() => { if (mapInstRef.current) renderMarkers(); }, [renderMarkers]);

  // When closing a panel, allow map to re-fit once (so user sees all markers)
  useEffect(() => { if (panel === 'none') mapViewInitialized.current = false; }, [panel]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLLOW DRIVER BUTTON HANDLER
  // ═══════════════════════════════════════════════════════════════════════════
  const handleFollowDriver = useCallback((phone?: string) => {
    if (!mapInstRef.current || !LRef.current) return;

    const activeDrivers = drivers.filter(d => d.activo);
    if (activeDrivers.length === 0) {
      toast.error('No hay choferes activos. El chofer debe ir a "Soy Chofer" y activar GPS primero.');
      return;
    }

    // Close any open panel to show the map
    setPanel('none');

    if (followingDriver && followDriverPhone === phone) {
      // Unfollow
      setFollowingDriver(false);
      setFollowDriverPhone(null);
      toast.success('Dejaste de seguir al chofer');
      renderMarkers();
      return;
    }

    const target = phone ? activeDrivers.find(d => d.phone === phone) : activeDrivers[0];
    if (!target) return;

    setFollowingDriver(true);
    setFollowDriverPhone(target.phone);
    mapInstRef.current.setView([target.lat, target.lng], 16, { animate: true });
    toast.success(`Siguiendo a ${target.nombre} en tiempo real`);
  }, [drivers, followingDriver, followDriverPhone, renderMarkers]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT: ADDRESS SEARCH + GPS + SUBMIT
  // ═══════════════════════════════════════════════════════════════════════════
  const selectSuggestion = useCallback((s: GeoSuggestion, overrideAddr?: string) => {
    const lat = parseFloat(s.lat), lng = parseFloat(s.lon);
    // Keep the user's original typed address, NOT the geocoder's display_name.
    // The geocoder might return a slightly different number (e.g. user typed 8310, Census returns 8498).
    // We take the COORDINATES from the geocoder but preserve the user's text.
    const userAddr = (overrideAddr || searchQuery).trim();
    const geoAddr = s.display_name.split(',').slice(0, 3).join(',').trim();
    // Use user's text as primary, geocoder's as reference in the confirmed field
    setForm(f => ({ ...f, lat, lng, direccion: userAddr }));
    setSearchQuery(userAddr); setShowSuggestions(false); setSuggestions([]);
    // Place RED preview pin on map (user stays in form, no panel close)
    if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; }
    if (mapInstRef.current && LRef.current) {
      const L = LRef.current;
      const icon = L.icon({ iconUrl: pinSVG('#dc2626'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
      previewMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
      previewMarkerRef.current.bindPopup(`<div style="font-family:system-ui;"><strong style="font-size:12px;">${userAddr}</strong>${geoAddr !== userAddr ? `<div style="font-size:9px;color:#888;margin-top:2px;">Referencia: ${geoAddr}</div>` : ''}<div style="font-size:10px;color:#dc2626;font-weight:600;margin-top:4px;">Punto rojo = se hara VERDE al enviar</div></div>`).openPopup();
      mapInstRef.current.setView([lat, lng], 16, { animate: true });
    }
  }, [searchQuery]);

  // Auto-search as user types (shows suggestions, NO auto-select, NO panel close)
  const handleSearchAddress = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
    setSearching(true); setShowSuggestions(true);
    searchTimerRef.current = setTimeout(async () => {
      // If it looks like a Google Maps link, just mark it directly
      const coords = extractGoogleMapsCoords(q);
      if (coords) {
        const dir = await reverseGeocode(coords.lat, coords.lng);
        const short = dir ? dir.split(',').slice(0, 3).join(',') : `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
        setForm(f => ({ ...f, lat: coords.lat, lng: coords.lng, direccion: short }));
        setSearchQuery(short);
        if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; }
        if (mapInstRef.current && LRef.current) {
          const L = LRef.current;
          const icon = L.icon({ iconUrl: pinSVG('#dc2626'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
          previewMarkerRef.current = L.marker([coords.lat, coords.lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
          previewMarkerRef.current.bindPopup(`<div style="font-family:system-ui;"><strong style="font-size:12px;">Tu direccion</strong><div style="font-size:10px;color:#dc2626;font-weight:600;">Punto rojo = se hara VERDE al enviar</div></div>`).openPopup();
          mapInstRef.current.setView([coords.lat, coords.lng], 16, { animate: true });
        }
        setSuggestions([]); setSearching(false); setShowSuggestions(false);
        return;
      }
      // Regular address: show suggestions only, let user pick
      const results = await forwardGeocode(q);
      setSuggestions(results); setSearching(false);
      // No toast on auto-search - just show suggestions or empty
    }, 300);
  }, []);

  // Explicit search on button press / Enter key
  const handleClientSearchNow = useCallback(async () => {
    const input = document.getElementById('client-addr-input') as HTMLInputElement;
    const q = (input?.value || searchQuery).trim();
    if (!q) { toast.error('Escribe una direccion primero'); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearching(true); setShowSuggestions(false); setSuggestions([]);
    // Check Google Maps link
    const coords = extractGoogleMapsCoords(q);
    if (coords) {
      const dir = await reverseGeocode(coords.lat, coords.lng);
      const short = dir ? dir.split(',').slice(0, 3).join(',') : `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
      setForm(f => ({ ...f, lat: coords.lat, lng: coords.lng, direccion: short }));
      setSearchQuery(short);
      if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; }
      if (mapInstRef.current && LRef.current) {
        const L = LRef.current;
        const icon = L.icon({ iconUrl: pinSVG('#dc2626'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
        previewMarkerRef.current = L.marker([coords.lat, coords.lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
        previewMarkerRef.current.bindPopup(`<div style="font-family:system-ui;"><strong style="font-size:12px;">Tu direccion</strong><div style="font-size:10px;color:#dc2626;font-weight:600;">Punto rojo = se hara VERDE al enviar</div></div>`).openPopup();
        mapInstRef.current.setView([coords.lat, coords.lng], 16, { animate: true });
      }
      setSearching(false);
      return;
    }
    // Search via Nominatim
    const results = await forwardGeocode(q);
    setSearching(false);
    if (results.length > 0) {
      selectSuggestion(results[0], q);
      toast.success('Direccion encontrada');
    } else {
      toast.error('No encontrada. Escribe: calle + ciudad');
    }
  }, [searchQuery, selectSuggestion]);

  const getLocation = useCallback(() => {
    setLocating(true);
    if (!navigator.geolocation) { toast.error('GPS no disponible'); setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setForm(f => ({ ...f, lat, lng })); setLocating(false);
        const dir = await reverseGeocode(lat, lng);
        if (dir) {
          const short = dir.split(',').slice(0, 3).join(',');
          setForm(f => ({ ...f, direccion: short }));
          setSearchQuery(short);
        }
        // Place RED preview pin
        if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; }
        if (mapInstRef.current && LRef.current) {
          const L = LRef.current;
          const icon = L.icon({ iconUrl: pinSVG('#dc2626'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
          previewMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
          mapInstRef.current.setView([lat, lng], 16, { animate: true });
        }
      },
      () => { toast.error('Activa tu ubicacion'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  const handleSubmit = async () => {
    if (!form.nombre.trim()) { toast.error('Pon tu nombre'); return; }
    if (form.lat === 0) { toast.error('Selecciona una direccion en el mapa'); return; }
    setSubmitting(true);
    try {
      const r = await fetch('/api/pickups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, direccion: form.direccion || `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}`, horarioReady: form.horarioReady || null, area: form.area || null }),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success('Tu punto esta VERDE en el mapa' + (form.horarioReady ? ` (Ready: ${form.horarioReady})` : ''));
        setForm({ nombre: '', telefono: '', direccion: '', lat: 0, lng: 0, notas: '', horarioReady: '', area: '' });
        setSearchQuery(''); setSuggestions([]); setShowSuggestions(false);
        setPanel('none'); load();
      } else toast.error(j.error || 'Error');
    } catch { toast.error('Error de conexion'); }
    setSubmitting(false);
  };

  // ─── Punto de Partida: Address Search ───
  const handlePPSearch = useCallback((q: string) => {
    setPpSearchQuery(q);
    if (ppTimerRef.current) clearTimeout(ppTimerRef.current);
    if (q.length < 2) { setPpSuggestions([]); setPpShowSugg(false); return; }
    setPpSearching(true); setPpShowSugg(true);
    ppTimerRef.current = setTimeout(async () => {
      const results = await forwardGeocode(q);
      setPpSuggestions(results); setPpSearching(false);
    }, 300);
  }, []);

  const selectPPSuggestion = useCallback((s: GeoSuggestion, overrideAddr?: string) => {
    const lat = parseFloat(s.lat), lng = parseFloat(s.lon);
    // Keep user's typed address like we do for client form
    const userAddr = (overrideAddr || ppSearchQuery).trim();
    const geoAddr = s.display_name.split(',').slice(0, 3).join(',').trim();
    setDriverPPLat(lat); setDriverPPLng(lng); setDriverPPDir(userAddr);
    setPpSearchQuery(userAddr); setPpShowSugg(false); setPpSuggestions([]);
    // Show preview on map
    if (ppPreviewRef.current) { ppPreviewRef.current.remove(); ppPreviewRef.current = null; }
    if (mapInstRef.current && LRef.current) {
      const L = LRef.current;
      const icon = L.icon({ iconUrl: pinSVG('#ea580c'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
      ppPreviewRef.current = L.marker([lat, lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
      ppPreviewRef.current.bindPopup(`<div style="font-family:system-ui;"><strong style="font-size:12px;">${userAddr}</strong>${geoAddr !== userAddr ? `<div style="font-size:9px;color:#888;margin-top:2px;">Referencia: ${geoAddr}</div>` : ''}<div style="font-size:10px;color:#ea580c;font-weight:600;">Sede de este chofer</div></div>`).openPopup();
      mapInstRef.current.setView([lat, lng], 15, { animate: true });
    }
  }, [ppSearchQuery]);

  const setPPFromGPS = useCallback(() => {
    if (!navigator.geolocation) { toast.error('GPS no disponible'); return; }
    toast.info('Obteniendo ubicacion para punto de partida...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setDriverPPLat(lat); setDriverPPLng(lng);
        const dir = await reverseGeocode(lat, lng);
        if (dir) { const short = dir.split(',').slice(0, 3).join(','); setDriverPPDir(short); setPpSearchQuery(short); }
        toast.success('Punto de partida definido por GPS');
      },
      () => toast.error('No se pudo obtener ubicacion'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  // ─── Punto de Partida: Tap on Map ───
  const startPpTapMode = useCallback(() => {
    if (!mapInstRef.current) { toast.error('El mapa no esta listo'); return; }
    ppTapModeRef.current = true;
    setPpTapMode(true);
    // Cerrar panel para que el mapa quede visible
    setPanel('none');
    toast.info('Toca un punto en el mapa para poner tu sede');
  }, []);

  const handleMapClickPP = useCallback(async (lat: number, lng: number) => {
    if (!ppTapModeRef.current) return;
    ppTapModeRef.current = false; setPpTapMode(false);
    setDriverPPLat(lat); setDriverPPLng(lng);
    // Mostrar preview
    if (ppPreviewRef.current) { ppPreviewRef.current.remove(); ppPreviewRef.current = null; }
    if (mapInstRef.current && LRef.current) {
      const L = LRef.current;
      const icon = L.icon({ iconUrl: pinSVG('#ea580c'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
      ppPreviewRef.current = L.marker([lat, lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
      ppPreviewRef.current.bindPopup('<div style="font-family:system-ui;"><strong style="font-size:12px;">Punto de Partida</strong><div style="font-size:10px;color:#ea580c;font-weight:600;">Sede de este chofer</div></div>').openPopup();
    }
    // Reverse geocode
    toast.info('Obteniendo direccion...');
    const dir = await reverseGeocode(lat, lng);
    const short = dir ? dir.split(',').slice(0, 3).join(',') : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setDriverPPDir(short); setPpSearchQuery(short);
    toast.success('Punto de partida puesto en el mapa');
  }, [ppTapModeRef]);

  // ─── Client Tap: handle map click for pickup location ───
  const handleMapClickClient = useCallback(async (lat: number, lng: number) => {
    if (!clientTapModeRef.current) return;
    clientTapModeRef.current = false; setClientTapMode(false);
    setForm(f => ({ ...f, lat, lng }));
    // Mostrar preview rojo
    if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; }
    if (mapInstRef.current && LRef.current) {
      const L = LRef.current;
      const icon = L.icon({ iconUrl: pinSVG('#dc2626'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
      previewMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
      previewMarkerRef.current.bindPopup('<div style="font-family:system-ui;"><strong style="font-size:12px;">Tu recogida</strong><div style="font-size:10px;color:#dc2626;font-weight:600;">Punto rojo = se hara VERDE al enviar</div></div>').openPopup();
    }
    // Reverse geocode
    toast.info('Obteniendo direccion...');
    const dir = await reverseGeocode(lat, lng);
    const short = dir ? dir.split(',').slice(0, 3).join(',') : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setForm(f => ({ ...f, direccion: short }));
    setSearchQuery(short);
    toast.success('Direccion marcada. Ahora llena nombre y envia.');
    // Reabrir panel de pedidos
    setTimeout(() => setPanel('clientForm'), 300);
  }, []);

  // ─── Connect map click handlers (PP + Client) ───
  useEffect(() => {
    ppTapModeRef.current = ppTapMode;
  }, [ppTapMode]);

  useEffect(() => {
    clientTapModeRef.current = clientTapMode;
  }, [clientTapMode]);

  useEffect(() => {
    if (!mapInstRef.current) return;
    const handler = (e: any) => {
      handleMapClickPP(e.latlng.lat, e.latlng.lng);
      handleMapClickClient(e.latlng.lat, e.latlng.lng);
    };
    mapInstRef.current.on('click', handler);
    return () => { mapInstRef.current?.off('click', handler); };
  }, [mapInstRef.current, handleMapClickPP, handleMapClickClient]);

  // ─── Guardar Punto de Partida independientemente ───
  const savePuntoPartida = useCallback(async () => {
    if (!driverPhone.trim()) { toast.error('Pon tu telefono primero'); return; }
    if (!driverPPLat || !driverPPLng) { toast.error('Selecciona un punto de partida primero (busca, GPS o toca el mapa)'); return; }
    setPpSaving(true);
    try {
      const res = await fetch('/api/drivers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: driverPhone.trim(),
          nombre: driverName.trim() || 'Chofer',
          puntoPartidaLat: driverPPLat,
          puntoPartidaLng: driverPPLng,
          puntoPartidaDir: driverPPDir.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('Punto de partida guardado correctamente');
        load();
      } else {
        toast.error(data.error || 'Error al guardar');
      }
    } catch { toast.error('Error de conexion'); }
    setPpSaving(false);
  }, [driverPhone, driverPPLat, driverPPLng, driverPPDir]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DRIVER: GPS TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  const startDriverTracking = useCallback(() => {
    if (!driverPhone.trim() || !driverName.trim()) { toast.error('Pon tu telefono y nombre'); return; }
    if (!navigator.geolocation) { toast.error('GPS no disponible'); return; }

    const driverPayload = {
      phone: driverPhone.trim(), nombre: driverName.trim(), lat: 0, lng: 0, activo: true,
      mensaje: driverMensaje.trim() || 'Voy a salir para Chambatina',
      precioServicio: driverPrecio.trim() || null,
      direccionRecojo: driverDirRecojo.trim() || null,
      comunidad: driverComunidad.trim() || null,
      puntoPartidaLat: driverPPLat,
      puntoPartidaLng: driverPPLng,
      puntoPartidaDir: driverPPDir.trim() || null,
    };
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setDriverMyLocation({ lat, lng });
      setDriverActive(true);
      try {
        await fetch('/api/drivers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...driverPayload, lat, lng }),
        });
        toast.success('Estas EN VIVO. Todos ven tus instrucciones en el mapa.');
        load();
      } catch { toast.error('Error al activar GPS'); }
    }, () => toast.error('No se pudo obtener ubicacion'), { enableHighAccuracy: true, timeout: 10000 });

    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = navigator.geolocation.watchPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setDriverMyLocation({ lat, lng });
      try {
        await fetch('/api/drivers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...driverPayload, lat, lng }),
        });
      } catch {}
    }, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 });
  }, [driverPhone, driverName, load]);

  const stopDriverTracking = async () => {
    if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setDriverActive(false);
    try {
      await fetch('/api/drivers', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: driverPhone.trim(), activo: false }),
      });
      toast.success('Te has desconectado del mapa');
      load();
    } catch {}
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN: ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const updatePickup = async (id: number, data: any) => {
    try {
      const r = await fetch('/api/pickups', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      });
      const j = await r.json(); if (j.ok) load(); else toast.error(j.error || 'Error');
    } catch { toast.error('Error'); }
  };

  const deletePickup = async (id: number) => {
    try {
      const r = await fetch(`/api/pickups?id=${id}`, { method: 'DELETE' });
      const j = await r.json(); if (j.ok) { toast.success('Eliminada'); load(); }
    } catch {}
  };

  // ─── Distance matrix computation ───
  const computeDistMatrix = useCallback((originLat: number, originLng: number, originName: string) => {
    const active = pickups.filter(p => p.estado !== 'cancelado');
    if (active.length < 1) return [];
    const matrix: { from: string; to: string; distMi: number }[] = [];
    const all = [{ name: originName, lat: originLat, lng: originLng }, ...active.map(p => ({ name: p.nombre, lat: p.lat, lng: p.lng }))];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const dMi = haversine(all[i].lat, all[i].lng, all[j].lat, all[j].lng) * 0.621371;
        matrix.push({ from: all[i].name, to: all[j].name, distMi: Math.round(dMi * 10) / 10 });
      }
    }
    return matrix;
  }, [pickups]);

  // Ref to always have latest computeDistMatrix accessible from any callback
  const computeDistRef = useRef(computeDistMatrix);
  computeDistRef.current = computeDistMatrix;

  // Auto-compute distances when reference point changes
  useEffect(() => {
    if (distRefPoint) {
      const active = pickups.filter(p => p.estado !== 'cancelado');
      if (active.length >= 1) {
        const matrix = computeDistRef.current(effectiveRef.lat, effectiveRef.lng, effectiveRef.name);
        setDistMatrix(matrix);
        setAdminTab('distancias');
        setPanel('admin'); // Open admin panel to show distances
      }
    } else if (distMatrix.length > 0) {
      const matrix = computeDistRef.current(effectiveRef.lat, effectiveRef.lng, effectiveRef.name);
      setDistMatrix(matrix);
    }
  }, [effectiveRef.lat, effectiveRef.lng, effectiveRef.name]);

  const handleCalcDistances = async () => {
    const active = pickups.filter(p => p.estado !== 'cancelado');
    if (active.length < 2) { toast.error('Necesitas al menos 2 clientes'); return; }
    setCalculatingDist(true);
    try {
      const matrix = computeDistMatrix(effectiveRef.lat, effectiveRef.lng, effectiveRef.name);
      setDistMatrix(matrix);
      setAdminTab('distancias');
      toast.success(`Matriz: ${active.length + 1} puntos, ${matrix.length} pares desde ${effectiveRef.name}`);
    } catch (err: any) { toast.error('Error: ' + (err.message || '')); }
    setCalculatingDist(false);
  };

  const handleOptimize = async () => {
    let esperando = pickups.filter(p => p.estado === 'esperando');
    if (adminChofer) esperando = esperando.filter(p => p.choferAsignado === adminChofer);
    if (esperando.length < 1) { toast.error(adminChofer ? 'No hay clientes asignados a este chofer' : 'No hay clientes en verde'); return; }
    setOptimizing(true);
    try {
      // Use driver's punto de partida as start, fallback to BASE
      const selDriver = drivers.find(d => d.nombre === adminChofer);
      const startLat = selDriver?.puntoPartidaLat ?? BASE_LAT;
      const startLng = selDriver?.puntoPartidaLng ?? BASE_LNG;
      const ordered = optimizeOrder(esperando, startLat, startLng);
      setOptimizedRoute(ordered);
      // Build route: origin → pickups → warehouse (if set) → back to origin
      const routePoints = [{ lat: startLat, lng: startLng }, ...ordered.map(p => ({ lat: p.lat, lng: p.lng }))];
      if (warehouse) routePoints.push({ lat: warehouse.lat, lng: warehouse.lng });
      // Optionally add return to origin
      if (warehouse) routePoints.push({ lat: startLat, lng: startLng });
      const result = await calcRoute(routePoints);
      setRouteData(result);
      for (let i = 0; i < ordered.length; i++) await updatePickup(ordered[i].id, { ordenRuta: i + 1 });
      const desde = selDriver ? `desde ${selDriver.nombre}` : 'desde la Base';
      toast.success(`Ruta optimizada ${desde}: ${ordered.length} paradas, ${fmtDist(result.totalDistance)}, ${fmtTime(result.totalDuration)}`);
      setAdminTab('ruta');
    } catch (err: any) { toast.error('Error ruta: ' + (err.message || '')); }
    setOptimizing(false);
  };

  // ─── Schedule route to driver (assign chofer to all stops) ───
  const handleScheduleRoute = async () => {
    if (optimizedRoute.length === 0) { toast.error('Optimiza la ruta primero'); return; }
    if (!scheduledDriver) { toast.error('Selecciona un chofer'); return; }
    setScheduling(true);
    try {
      for (const p of optimizedRoute) {
        await updatePickup(p.id, { choferAsignado: scheduledDriver });
      }
      toast.success(`Ruta programada para ${scheduledDriver}: ${optimizedRoute.length} paradas`);
    } catch { toast.error('Error al programar'); }
    setScheduling(false);
  };

  // ─── Cumulative route info for scheduling (uses effectiveRef) ───
  const getRouteOrigin = () => effectiveRef;

  const routeOrigin = getRouteOrigin();

  const routeStops = routeData && optimizedRoute.length > 0
    ? (() => {
        const stops: { name: string; type: 'pickup' | 'warehouse' | 'return'; distFromPrev: number; cumDist: number; timeFromPrev: number; cumTime: number; distFromOrigin: number; ready?: string }[] = [];
        let cumD = 0, cumT = 0;
        for (let i = 0; i < optimizedRoute.length; i++) {
          const leg = routeData.legs[i + 1] || { distance: 0, duration: 0 };
          const p = optimizedRoute[i];
          if (i === 0 && routeData.legs[0]) {
            cumD = routeData.legs[0].distance;
            cumT = routeData.legs[0].duration;
          } else {
            cumD += leg.distance;
            cumT += leg.duration;
          }
          stops.push({
            name: p.nombre, type: 'pickup',
            distFromPrev: i === 0 ? (routeData.legs[0]?.distance || 0) : leg.distance,
            cumDist: cumD, timeFromPrev: i === 0 ? (routeData.legs[0]?.duration || 0) : leg.duration,
            cumTime: cumT, distFromOrigin: distMiles(p.lat, p.lng, routeOrigin.lat, routeOrigin.lng),
            ready: p.horarioReady || undefined,
          });
        }
        // Add warehouse stop if set
        if (warehouse && routeData.legs[optimizedRoute.length + 1]) {
          const wLeg = routeData.legs[optimizedRoute.length + 1];
          cumD += wLeg.distance; cumT += wLeg.duration;
          stops.push({ name: warehouse.name, type: 'warehouse', distFromPrev: wLeg.distance, cumDist: cumD, timeFromPrev: wLeg.duration, cumTime: cumT, distFromOrigin: distMiles(warehouse.lat, warehouse.lng, routeOrigin.lat, routeOrigin.lng) });
        }
        // Add return to origin if warehouse was set
        if (warehouse && routeData.legs[optimizedRoute.length + 2]) {
          const rLeg = routeData.legs[optimizedRoute.length + 2];
          cumD += rLeg.distance; cumT += rLeg.duration;
          stops.push({ name: 'Regreso a Base', type: 'return', distFromPrev: rLeg.distance, cumDist: cumD, timeFromPrev: rLeg.duration, cumTime: cumT, distFromOrigin: 0 });
        }
        return stops;
      })()
    : [];

  // ─── Admin filtered pickups (search + estado filter) ───
  const adminFilteredPickups = (() => {
    let list = adminChofer ? pickups.filter(p => p.choferAsignado === adminChofer) : pickups;
    if (adminEstadoFilter) list = list.filter(p => p.estado === adminEstadoFilter);
    if (adminSearch.trim()) {
      const q = adminSearch.toLowerCase().trim();
      list = list.filter(p =>
        p.nombre.toLowerCase().includes(q) ||
        p.direccion.toLowerCase().includes(q) ||
        (p.telefono && p.telefono.includes(q))
      );
    }
    return list;
  })();

  // ─── Chofer options from DB (all unique driver names + any assigned names) ───
  const choferOptions = [...new Set([
    ...drivers.map(d => d.nombre),
    ...pickups.map(p => p.choferAsignado).filter(Boolean) as string[],
  ])];

  // ─── Stats ───
  const esperandoCount = pickups.filter(p => p.estado === 'esperando').length;
  const recogidosCount = pickups.filter(p => p.estado === 'recogido').length;
  const activeDriversCount = drivers.filter(d => d.activo).length;

  // ─── Admin batch actions ───
  const toggleAdminSelect = useCallback((id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAdminSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const adminSelectAll = useCallback(() => {
    const all = adminFilteredPickups.map(p => p.id);
    if (adminSelectedIds.size === all.length && all.length > 0) setAdminSelectedIds(new Set());
    else setAdminSelectedIds(new Set(all));
  }, [adminFilteredPickups, adminSelectedIds]);
  const handleBatchUpdate = useCallback(async (data: any) => {
    if (adminSelectedIds.size === 0) { toast.error('Selecciona al menos uno'); return; }
    let ok = 0;
    for (const id of adminSelectedIds) {
      try { const r = await fetch('/api/pickups', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...data }) }); const j = await r.json(); if (j.ok) ok++; } catch {}
    }
    toast.success(`${ok} actualizado${ok !== 1 ? 's' : ''}`);
    setAdminSelectedIds(new Set()); load();
  }, [adminSelectedIds, load]);
  const handleBatchDelete = useCallback(async () => {
    if (adminSelectedIds.size === 0) return;
    if (!confirm(`Eliminar ${adminSelectedIds.size} recogida${adminSelectedIds.size > 1 ? 's' : ''}?`)) return;
    let ok = 0;
    for (const id of adminSelectedIds) {
      try { const r = await fetch(`/api/pickups?id=${id}`, { method: 'DELETE' }); const j = await r.json(); if (j.ok) ok++; } catch {}
    }
    toast.success(`${ok} eliminada${ok !== 1 ? 's' : ''}`);
    setAdminSelectedIds(new Set()); load();
  }, [adminSelectedIds, load]);

  // ─── Grupos por chofer (computado) ───
  const choferesConAsignados = (() => {
    const assigned = pickups.filter(p => p.choferAsignado && p.estado !== 'cancelado');
    const groups: { nombre: string; driver: Driver | undefined; pickups: Pickup[] }[] = [];
    const map = new Map<string, Pickup[]>();
    for (const p of assigned) {
      if (!map.has(p.choferAsignado!)) map.set(p.choferAsignado!, []);
      map.get(p.choferAsignado!)!.push(p);
    }
    for (const [nombre, ps] of map) {
      groups.push({ nombre, driver: drivers.find(d => d.nombre === nombre), pickups: ps });
    }
    return groups;
  })();

  const unassigned = pickups.filter(p => !p.choferAsignado && p.estado !== 'cancelado');

  // ─── Optimizar TODOS los grupos ───
  const handleOptimizeAll = async () => {
    if (choferesConAsignados.length === 0) { toast.error('No hay choferes con clientes asignados'); return; }
    setOptimizingAll(true);
    const newRoutes = new Map<string, { route: Pickup[]; data: any }>();
    try {
      for (const grupo of choferesConAsignados) {
        const esperando = grupo.pickups.filter(p => p.estado === 'esperando');
        if (esperando.length < 1) continue;
        const startLat = grupo.driver?.puntoPartidaLat ?? BASE_LAT;
        const startLng = grupo.driver?.puntoPartidaLng ?? BASE_LNG;
        const ordered = optimizeOrder(esperando, startLat, startLng);
        const allPoints = [{ lat: startLat, lng: startLng }, ...ordered.map(p => ({ lat: p.lat, lng: p.lng }))];
        let result = null;
        try { result = await calcRoute(allPoints); } catch {}
        newRoutes.set(grupo.nombre, { route: ordered, data: result });
      }
      setDriverRoutes(newRoutes);
      toast.success(`Optimizadas ${newRoutes.size} rutas (una por chofer)`);
      setAdminTab('grupos');
    } catch (err: any) { toast.error('Error: ' + (err.message || '')); }
    setOptimizingAll(false);
  };

  // ─── Select mode computed values ───
  const selectedPickups = selectedIds.map(id => pickups.find(p => p.id === id)).filter(Boolean) as Pickup[];
  const selectLegs = (() => {
    if (selectedPickups.length === 0) return [];
    const legs: { from: string; to: string; distMi: number }[] = [];
    const allPts = [{ name: 'Base', lat: BASE_LAT, lng: BASE_LNG }, ...selectedPickups.map(p => ({ name: p.nombre, lat: p.lat, lng: p.lng }))];
    for (let i = 0; i < allPts.length - 1; i++) {
      const dMi = haversine(allPts[i].lat, allPts[i].lng, allPts[i + 1].lat, allPts[i + 1].lng) * 0.621371;
      legs.push({ from: allPts[i].name, to: allPts[i + 1].name, distMi: Math.round(dMi * 10) / 10 });
    }
    return legs;
  })();
  const selectTotalDirectMi = selectLegs.reduce((s, l) => s + l.distMi, 0);

  const handleCalcSelectRoute = async () => {
    if (selectedPickups.length < 1) return;
    setCalcSelectRoute(true);
    try {
      const pts = [{ lat: BASE_LAT, lng: BASE_LNG }, ...selectedPickups.map(p => ({ lat: p.lat, lng: p.lng }))];
      const result = await calcRoute(pts);
      setSelectRouteData({ totalDistance: result.totalDistance, totalDuration: result.totalDuration, legs: result.legs });
    } catch (err: any) { toast.error('Error: ' + (err.message || '')); }
    setCalcSelectRoute(false);
  };

  const handleOptimizeSelected = async () => {
    if (selectedPickups.length < 2) { toast.error('Selecciona al menos 2 puntos'); return; }
    const ordered = optimizeOrder(selectedPickups);
    setSelectedIds(ordered.map(p => p.id));
    setSelectRouteData(null);
    try {
      const pts = [{ lat: BASE_LAT, lng: BASE_LNG }, ...ordered.map(p => ({ lat: p.lat, lng: p.lng }))];
      const result = await calcRoute(pts);
      setSelectRouteData({ totalDistance: result.totalDistance, totalDuration: result.totalDuration, legs: result.legs });
      toast.success(`Orden optimizado: ${fmtDist(result.totalDistance)}, ${fmtTime(result.totalDuration)}`);
    } catch (err: any) { toast.error('Error ruta: ' + (err.message || '')); }
  };



  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="relative w-screen h-screen overflow-hidden">

      {/* ═══════════ FULLSCREEN MAP (ALWAYS VISIBLE) ═══════════ */}
      <div ref={mapRef} className="absolute inset-0 z-0" />
      {!mapReady && <div className="absolute inset-0 z-[1] bg-zinc-100 flex items-center justify-center"><Loader2 className="h-8 w-8 text-emerald-500 animate-spin" /></div>}

      {/* ═══ BANNER: Toca el mapa para punto de partida ═══ */}
      <AnimatePresence>
        {ppTapMode && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="absolute top-14 left-2 right-2 z-[1005] bg-orange-500 text-white px-4 py-3 rounded-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 animate-bounce" />
                <span className="font-bold text-sm">Toca el mapa donde esta tu sede</span>
              </div>
              <button onClick={() => { ppTapModeRef.current = false; setPpTapMode(false); }} className="bg-white/20 rounded-full p-1.5"><X className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ BANNER: Toca el mapa para recogida (cliente) ═══ */}
      <AnimatePresence>
        {clientTapMode && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="absolute top-14 left-2 right-2 z-[1005] bg-emerald-500 text-white px-4 py-3 rounded-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 animate-bounce" />
                <span className="font-bold text-sm">Toca el mapa donde quieres la recogida</span>
              </div>
              <button onClick={() => { clientTapModeRef.current = false; setClientTapMode(false); }} className="bg-white/20 rounded-full p-1.5"><X className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ FLOTANTE: Punto seleccionado - Guardar sin abrir panel ═══ */}
      <AnimatePresence>
        {driverPPLat && driverPPLng && !ppTapMode && panel === 'none' && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="absolute bottom-20 left-2 right-2 z-[1005] bg-white rounded-2xl shadow-2xl border border-blue-200 p-3 space-y-2"
          >
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-zinc-800">Punto de partida listo</p>
                <p className="text-[11px] text-zinc-500 truncate">{driverPPDir || `${driverPPLat.toFixed(4)}, ${driverPPLng.toFixed(4)}`}</p>
              </div>
              <button onClick={() => { setDriverPPLat(null); setDriverPPLng(null); setDriverPPDir(''); setPpSearchQuery(''); if (ppPreviewRef.current) { ppPreviewRef.current.remove(); ppPreviewRef.current = null; } }} className="text-zinc-400 hover:text-red-500 flex-shrink-0"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-2">
              <button onClick={savePuntoPartida} disabled={ppSaving || !driverPhone.trim()}
                className="flex-1 h-11 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold text-sm hover:from-blue-600 hover:to-indigo-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg"
                style={{ touchAction: 'manipulation' }}>
                {ppSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Guardar</>}
              </button>
              <button onClick={() => { ppTapModeRef.current = true; setPpTapMode(true); }}
                className="h-11 px-4 rounded-xl border-2 border-orange-300 text-orange-600 font-bold text-xs hover:bg-orange-50 transition-all flex items-center justify-center gap-1.5"
                style={{ touchAction: 'manipulation' }}>
                <MapPin className="h-4 w-4" /> Cambiar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ TOP BAR (over map, always visible) ═══════════ */}
      <div className="absolute top-0 left-0 right-0 z-[1000] pointer-events-none">
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md px-4 py-2.5 flex items-center justify-between shadow-lg border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-600 p-1.5 rounded-lg"><Truck className="h-4 w-4 text-white" /></div>
            <div>
              <h1 className="text-sm font-bold text-zinc-900 leading-tight">CargoCuba</h1>
              <p className="text-[10px] text-zinc-500 flex items-center gap-2">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{esperandoCount} verde</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" />{recogidosCount} morado</span>
                {activeDriversCount > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />{activeDriversCount} en vivo</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-red-500" />
            <span className="text-[10px] text-zinc-500 hidden sm:inline">Base: {BASE_NAME}</span>
          </div>
        </div>
      </div>

      {/* ═══════════ FOLLOW DRIVER BUTTON (ALWAYS visible, top-right) ═══════════ */}
      <div className="absolute top-14 right-3 z-[1002]">
        {activeDriversCount > 0 ? (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => handleFollowDriver()}
            className={`flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border font-bold text-xs transition-all ${
              followingDriver
                ? 'bg-blue-600 text-white border-blue-700 shadow-blue-200 shadow-lg'
                : 'bg-white text-zinc-800 border-blue-300 hover:bg-blue-50 shadow-blue-100 shadow-lg'
            }`}
            style={{ touchAction: 'manipulation' }}>
            {followingDriver ? (
              <>
                <Radar className="h-5 w-5 animate-spin" style={{ animationDuration: '3s' }} />
                <span>Siguiendo{followDriverPhone ? `: ${drivers.find(d => d.phone === followDriverPhone)?.nombre || ''}` : ''}</span>
              </>
            ) : (
              <>
                <Navigation className="h-5 w-5 text-blue-600" />
                <span>Seguir Chofer EN VIVO</span>
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">{activeDriversCount}</span>
              </>
            )}
          </motion.button>
        ) : null}
      </div>

      {/* ═══════════ FOLLOWING DRIVER INFO BAR ═══════════ */}
      <AnimatePresence>
        {followingDriver && followDriverPhone && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-[104px] right-3 z-[1002] bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-blue-200 p-3 min-w-[200px]"
          >
            {(() => {
              const d = drivers.find(dr => dr.phone === followDriverPhone);
              if (!d) return null;
              const dist = distMilesFromBase(d.lat, d.lng).toFixed(1);
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-sm">🚛</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-900 truncate">{d.nombre}</p>
                      <p className="text-[9px] text-blue-600 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        EN VIVO
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500">{dist} mi de la Base</span>
                    <span className="text-zinc-400">{d.lat.toFixed(4)}, {d.lng.toFixed(4)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    {d.phone && <span className="text-zinc-400">{d.phone}</span>}
                    <span className="text-zinc-400">Actualizado: {new Date(d.updatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ BACK TO MAP BUTTON (visible when any panel is open) ═══════════ */}
      <AnimatePresence>
        {panel !== 'none' && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => { setPanel('none'); setOptimizedRoute([]); setRouteData(null); setFollowingDriver(false); setFollowDriverPhone(null); }}
            className="absolute bottom-4 left-4 z-[1003] flex items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-2xl shadow-2xl font-bold text-xs"
            style={{ touchAction: 'manipulation' }}>
            <MapIcon className="h-4 w-4" />
            Ver Mapa
          </motion.button>
        )}
      </AnimatePresence>

      {/* ═══════════ BOTTOM BUTTONS (over map, only when no panel) ═══════════ */}
      {panel === 'none' && (
        <div className="absolute bottom-4 left-2 right-2 z-[1000] flex justify-around">
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => { setSearchQuery(''); setSuggestions([]); setPanel('clientForm'); }}
            className="flex flex-col items-center gap-1 bg-white rounded-2xl px-3 py-2.5 shadow-2xl border border-zinc-100"
            style={{ touchAction: 'manipulation' }}>
            <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center"><ShoppingCart className="h-4 w-4 text-white" /></div>
            <span className="text-[9px] font-bold text-zinc-700 leading-tight">Pedir</span>
          </motion.button>

          <motion.button whileTap={{ scale: 0.92 }} onClick={() => setPanel('driver')}
            className="flex flex-col items-center gap-1 bg-white rounded-2xl px-3 py-2.5 shadow-2xl border border-orange-200 relative"
            style={{ touchAction: 'manipulation' }}>
            <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-200"><Truck className="h-4 w-4 text-white" /></div>
            <span className="text-[9px] font-bold text-orange-700 leading-tight">Chofer</span>
            {driverActive && <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white animate-pulse" />}
          </motion.button>

          <motion.button whileTap={{ scale: 0.92 }} onClick={toggleSelectMode}
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2.5 shadow-2xl border relative ${selectMode ? 'bg-amber-500 border-amber-600' : 'bg-white border-zinc-100'} transition-all`}
            style={{ touchAction: 'manipulation' }}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${selectMode ? 'bg-white' : 'bg-amber-500'}`}>
              <Route className={`h-4 w-4 ${selectMode ? 'text-amber-500' : 'text-white'}`} />
            </div>
            <span className={`text-[9px] font-bold leading-tight ${selectMode ? 'text-white' : 'text-zinc-700'}`}>Medir</span>
            {selectMode && selectedIds.length > 0 && (
              <div className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-white text-amber-600 text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-amber-400">{selectedIds.length}</div>
            )}
          </motion.button>

          <motion.button whileTap={{ scale: 0.92 }} onClick={toggleDistRefMode}
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2.5 shadow-2xl border relative ${distRefMode ? 'bg-red-500 border-red-600' : distRefPoint ? 'bg-red-50 border-red-300' : 'bg-white border-zinc-100'} transition-all`}
            style={{ touchAction: 'manipulation' }}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${distRefMode ? 'bg-white' : distRefPoint ? 'bg-red-500' : 'bg-red-500'}`}>
              <MapPin className={`h-4 w-4 ${distRefMode ? 'text-red-500' : 'text-white'}`} />
            </div>
            <span className={`text-[9px] font-bold leading-tight ${distRefMode ? 'text-white' : distRefPoint ? 'text-red-700' : 'text-zinc-700'}`}>{distRefPoint ? 'Ref' : 'Ref'}</span>
            {distRefPoint && !distRefMode && (
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white" />
            )}
          </motion.button>

          <motion.button whileTap={{ scale: 0.92 }} onClick={() => { setAdminTab('lista'); setPanel('admin'); }}
            className="flex flex-col items-center gap-1 bg-white rounded-2xl px-3 py-2.5 shadow-2xl border border-zinc-100"
            style={{ touchAction: 'manipulation' }}>
            <div className="w-9 h-9 rounded-full bg-purple-500 flex items-center justify-center"><Shield className="h-4 w-4 text-white" /></div>
            <span className="text-[9px] font-bold text-zinc-700 leading-tight">Admin</span>
          </motion.button>
        </div>
      )}

      {/* ═══════════ SELECT MODE BANNER ═══════════ */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-24 left-3 right-3 z-[1002] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-amber-200 overflow-hidden"
          >
            {/* Header */}
            <div className="px-3.5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                  <Route className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-xs font-bold text-amber-800">
                  {selectedIds.length === 0 ? 'Toca los marcadores para seleccionarlos' : `${selectedIds.length} punto${selectedIds.length > 1 ? 's' : ''} seleccionado${selectedIds.length > 1 ? 's' : ''} · Directa: ${selectTotalDirectMi.toFixed(1)} mi`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedIds.length >= 2 && (
                  <>
                    <button onClick={handleOptimizeSelected} disabled={calcSelectRoute}
                      className="text-[9px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1"
                      style={{ touchAction: 'manipulation' }}>
                      {calcSelectRoute ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}Optimizar
                    </button>
                    <button onClick={handleCalcSelectRoute} disabled={calcSelectRoute}
                      className="text-[9px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1"
                      style={{ touchAction: 'manipulation' }}>
                      {calcSelectRoute ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3" />}Ruta Real
                    </button>
                  </>
                )}
                {selectedIds.length > 0 && (
                  <button onClick={() => { setSelectedIds([]); setSelectRouteData(null); }}
                    className="text-[9px] font-bold px-2 py-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 flex items-center gap-1"
                    style={{ touchAction: 'manipulation' }}>
                    <RotateCcw className="h-3 w-3" />Limpiar
                  </button>
                )}
                <button onClick={toggleSelectMode}
                  className="text-[9px] font-bold px-2 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
                  style={{ touchAction: 'manipulation' }}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            {/* Legs list */}
            {selectLegs.length > 0 && (
              <div className="max-h-[30vh] overflow-y-auto">
                {selectLegs.map((leg, i) => (
                  <div key={i} className="px-3.5 py-2 flex items-center gap-2.5 border-b border-zinc-50 last:border-0">
                    <div className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center flex-shrink-0 ${i === 0 ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                      {i === 0 ? 'B' : i}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-zinc-800 truncate">{leg.from}</span>
                        <ChevronRight className="h-3 w-3 text-zinc-300 flex-shrink-0" />
                        <span className="text-[11px] font-semibold text-zinc-800 truncate">{leg.to}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] font-bold text-amber-700">{leg.distMi} mi</span>
                      {selectRouteData?.legs[i] && (
                        <span className="text-[9px] text-zinc-400">Ruta: {fmtDist(selectRouteData.legs[i].distance)} · {fmtTime(selectRouteData.legs[i].duration)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {/* Total */}
                <div className="px-3.5 py-2 bg-amber-50/50 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-500">TOTAL</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-amber-700">{selectTotalDirectMi.toFixed(1)} mi directa</span>
                    {selectRouteData && (
                      <span className="text-[10px] font-bold text-emerald-600">Ruta: {fmtDist(selectRouteData.totalDistance)} · {fmtTime(selectRouteData.totalDuration)}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ DIST REF MODE BANNER ═══════════ */}
      <AnimatePresence>
        {distRefMode && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-24 left-3 right-3 z-[1002] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-red-300 overflow-hidden"
          >
            <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-white animate-bounce" />
                </div>
                <div>
                  <span className="text-xs font-bold text-red-800 block">Toca un marcador para poner referencia</span>
                  <span className="text-[9px] text-red-500">Ese punto sera el origen para calcular todas las distancias</span>
                </div>
              </div>
              <button onClick={toggleDistRefMode}
                className="text-[9px] font-bold px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
                style={{ touchAction: 'manipulation' }}>
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ DIST REF POINT INFO BAR ═══════════ */}
      <AnimatePresence>
        {distRefPoint && !distRefMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-3 right-3 z-[1002] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-red-200 overflow-hidden"
          >
            <div className="px-4 py-2.5 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-red-700">Referencia: {distRefPoint.name}</p>
                <p className="text-[9px] text-zinc-500">Todas las distancias se miden desde aqui</p>
              </div>
              <button onClick={toggleDistRefMode}
                className="text-[9px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1 flex-shrink-0"
                style={{ touchAction: 'manipulation' }}>
                <RotateCcw className="h-3 w-3" />Cambiar
              </button>
              <button onClick={() => { setDistRefPoint(null); if (distRefMarkerRef.current) { distRefMarkerRef.current.remove(); distRefMarkerRef.current = null; } }}
                className="text-[9px] font-bold px-2 py-1.5 rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 flex-shrink-0"
                style={{ touchAction: 'manipulation' }}>
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════
          PANEL: CLIENT FORM
          ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {panel === 'clientForm' && (
          <motion.div initial={{ opacity: 0, y: 300 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[1001] bg-white rounded-t-3xl shadow-2xl border-t border-zinc-200 max-h-[85vh] overflow-y-auto">

            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-5 pt-4 pb-2 border-b border-zinc-100 flex items-center justify-between rounded-t-3xl z-10">
              <div>
                <h3 className="font-bold text-base text-zinc-900">Nueva Recogida</h3>
                <p className="text-[11px] text-zinc-500">Tu punto se encendera VERDE en el mapa</p>
              </div>
              <button onClick={() => { setPanel('none'); if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; } setSearchQuery(''); setSuggestions([]); }} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="h-4 w-4 text-zinc-500" /></button>
            </div>

            <div className="p-5 space-y-3">
              {/* Location status bar */}
              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold ${form.lat !== 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : form.lat !== 0 ? <Check className="h-5 h-5" /> : <MapPin className="h-4 w-4" />}
                {locating ? 'Obteniendo GPS...' : form.lat !== 0 ? `Ubicacion lista (${distMilesFromBase(form.lat, form.lng).toFixed(1)} mi de la Base)` : 'Pon tu direccion abajo'}
              </div>

              {/* ── 1. DIRECCION (estilo Uber) ── */}
              <div>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      id="client-addr-input"
                      value={searchQuery}
                      onChange={e => handleSearchAddress(e.target.value)}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleClientSearchNow(); } }}
                      placeholder="Direccion o pega enlace de Google Maps, Waze, Safari..."
                      className="w-full h-12 pl-10 pr-10 rounded-xl border-2 border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-zinc-50 font-medium"
                      autoComplete="off"
                    />
                    {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />}
                    {!searching && searchQuery && (
                      <button onClick={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); setForm(f => ({ ...f, lat: 0, lng: 0 })); if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; } }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-zinc-400 hover:text-red-500" /></button>
                    )}
                  </div>
                  <button onClick={handleClientSearchNow} disabled={searching || !searchQuery.trim()}
                    className="h-12 px-4 rounded-xl bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-40 flex-shrink-0 flex items-center justify-center gap-1.5 shadow-md" style={{ touchAction: 'manipulation' }}>
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Buscar
                  </button>
                </div>
                {/* Sugerencias DENTRO del flujo (no absolute) */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => selectSuggestion(s)}
                        className="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-zinc-50 last:border-0 flex items-start gap-2.5" style={{ touchAction: 'manipulation' }}>
                        <MapPin className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-[13px] text-zinc-700 leading-snug">{s.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showSuggestions && !searching && suggestions.length === 0 && searchQuery.length >= 3 && (
                  <div className="mt-1.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                    Sin resultados. Prueba con: calle, numero, ciudad y estado
                  </div>
                )}
              </div>

              {/* Direccion guardada (se llena auto, editable) */}
              <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Direccion confirmada (se llena sola o edita)" className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />

              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Tu nombre *" className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />
              <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="Telefono" className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />

              {/* Horario Ready - time picker */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                  <input type="time" value={form.horarioReady} onChange={e => setForm(f => ({ ...f, horarioReady: e.target.value }))}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-blue-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-blue-50/50" />
                </div>
                <div className="text-[10px] text-zinc-500 leading-tight px-1">Hora<br/>Ready</div>
              </div>

              {/* Area / Localidad */}
              <select value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                className="w-full h-11 px-4 rounded-xl border border-emerald-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-emerald-50/50 font-medium">
                <option value="">Area / Localidad (opcional)</option>
                <option value="Miami">Miami</option>
                <option value="West">West (Hialeah/Doral)</option>
                <option value="Pan">Pan (Pembroke Pines)</option>
                <option value="Beach">Beach (Miami Beach)</option>
                <option value="North">North (Broward)</option>
                <option value="Kendall">Kendall</option>
              </select>

              <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Notas (tamano, instrucciones...)" rows={2} className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50 resize-none" />

              {/* Opciones alternativas */}
              <div className="flex gap-2">
                <button onClick={getLocation} disabled={locating}
                  className="flex-1 h-9 rounded-lg border border-dashed border-zinc-300 text-[10px] font-semibold text-zinc-500 hover:bg-zinc-50 flex items-center justify-center gap-1 disabled:opacity-50"
                  style={{ touchAction: 'manipulation' }}>
                  <Crosshair className="h-3 w-3" /> {locating ? 'GPS...' : 'Mi GPS'}
                </button>
                <button onClick={() => { clientTapModeRef.current = true; setClientTapMode(true); setPanel('none'); toast.info('Toca el mapa donde quieres la recogida'); }}
                  className="flex-1 h-9 rounded-lg border border-dashed border-zinc-300 text-[10px] font-semibold text-zinc-500 hover:bg-zinc-50 flex items-center justify-center gap-1"
                  style={{ touchAction: 'manipulation' }}>
                  <MapPin className="h-3 w-3" /> Tocar Mapa
                </button>
              </div>

              <button onClick={handleSubmit} disabled={submitting || form.lat === 0 || !form.nombre.trim()}
                className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg"
                style={{ touchAction: 'manipulation' }}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {submitting ? 'Enviando...' : `Encender mi punto en VERDE${form.horarioReady ? ` (Ready ${form.horarioReady})` : ''}`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════
          PANEL: DRIVER
          ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {panel === 'driver' && (
          <motion.div initial={{ opacity: 0, x: 300 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 300 }}
            className="absolute top-0 right-0 bottom-0 z-[1001] w-full max-w-sm bg-white/95 backdrop-blur-sm shadow-2xl border-l border-zinc-200 flex flex-col">

            <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-3 bg-white">
              <button onClick={() => { if (driverActive) stopDriverTracking(); setPanel('none'); if (ppPreviewRef.current) { ppPreviewRef.current.remove(); ppPreviewRef.current = null; } }} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><ArrowLeft className="h-4 w-4 text-zinc-600" /></button>
              <h3 className="font-bold text-sm text-zinc-900 flex-1">Panel del Chofer</h3>
              {driverActive && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />EN VIVO</span>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Driver info form */}
              <div className="space-y-2.5">
                <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} placeholder="Tu telefono *" className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Tu nombre *" className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />

                {/* ─── INSTRUCCIONES PARA EL MAPA ─── */}
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-3 space-y-2.5">
                  <p className="text-[11px] font-bold text-orange-800 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] flex items-center justify-center font-bold">i</span>
                    Instrucciones que veran todos en el mapa
                  </p>
                  <input value={driverMensaje} onChange={e => setDriverMensaje(e.target.value)} placeholder="Ej: Voy a salir para Chambatina" className="w-full h-10 px-3 rounded-lg border border-orange-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white font-semibold" />
                  <input value={driverDirRecojo} onChange={e => setDriverDirRecojo(e.target.value)} placeholder="Direccion donde recoges (ej: 1234 Palm St)" className="w-full h-10 px-3 rounded-lg border border-orange-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-orange-500">$</span>
                      <input value={driverPrecio} onChange={e => setDriverPrecio(e.target.value)} placeholder="5" className="w-full h-10 pl-7 pr-3 rounded-lg border border-orange-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white font-bold" />
                    </div>
                    <span className="text-[10px] text-zinc-500 leading-tight flex items-center px-1">Precio<br/>servicio</span>
                  </div>
                  <input value={driverComunidad} onChange={e => setDriverComunidad(e.target.value)} placeholder="Tu comunidad (ej: Pinar del Rio, Hialeah)" className="w-full h-10 px-3 rounded-lg border border-orange-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                </div>

                {/* ─── PUNTO DE PARTIDA (SEDE) ─── */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 space-y-2.5">
                  <p className="text-[11px] font-bold text-blue-800 flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    Tu Punto de Partida (Sede)
                  </p>

                  {/* 1. DIRECCION / GOOGLE MAPS LINK (campo principal - estilo Uber) */}
                  <div>
                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400" />
                        <input
                          value={ppSearchQuery}
                          onChange={e => {
                            const v = e.target.value;
                            const coords = extractGoogleMapsCoords(v);
                            if (coords) {
                              setPpSearchQuery(v);
                              setDriverPPLat(coords.lat); setDriverPPLng(coords.lng);
                              setPpSuggestions([]); setPpShowSugg(false);
                              if (ppPreviewRef.current) { ppPreviewRef.current.remove(); ppPreviewRef.current = null; }
                              if (mapInstRef.current && LRef.current) {
                                const L = LRef.current;
                                const icon = L.icon({ iconUrl: pinSVG('#ea580c'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
                                ppPreviewRef.current = L.marker([coords.lat, coords.lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
                                ppPreviewRef.current.bindPopup(`<div style="font-family:system-ui;"><strong style="font-size:12px;">Punto de Google Maps</strong><div style="font-size:10px;color:#ea580c;font-weight:600;">Sede de este chofer</div></div>`).openPopup();
                                mapInstRef.current.setView([coords.lat, coords.lng], 15, { animate: true });
                              }
                              reverseGeocode(coords.lat, coords.lng).then(dir => {
                                const short = dir ? dir.split(',').slice(0, 3).join(',') : 'Punto de Google Maps';
                                setDriverPPDir(short); setPpSearchQuery(short);
                              });
                              toast.success('Coordenadas extraidas del enlace');
                            } else {
                              handlePPSearch(v);
                            }
                          }}
                          onFocus={() => { if (ppSuggestions.length > 0) setPpShowSugg(true); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('pp-search-btn')?.click(); } }}
                          placeholder="Ej: 456 Pine St, Orlando FL..."
                          className="w-full h-11 pl-10 pr-10 rounded-lg border-2 border-blue-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white font-medium"
                          autoComplete="off"
                        />
                        {ppSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" />}
                        {!ppSearching && ppSearchQuery && (
                          <button onClick={() => { setPpSearchQuery(''); setPpSuggestions([]); setPpShowSugg(false); setDriverPPLat(null); setDriverPPLng(null); setDriverPPDir(''); if (ppPreviewRef.current) { ppPreviewRef.current.remove(); ppPreviewRef.current = null; } }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-zinc-400 hover:text-red-500" /></button>
                        )}
                      </div>
                      <button id="pp-search-btn" onClick={async () => {
                        const v = ppSearchQuery.trim();
                        if (!v) return;
                        if (ppTimerRef.current) clearTimeout(ppTimerRef.current);
                        setPpSearching(true); setPpShowSugg(false); setPpSuggestions([]);
                        const coords = extractGoogleMapsCoords(v);
                        if (coords) {
                          setDriverPPLat(coords.lat); setDriverPPLng(coords.lng);
                          if (mapInstRef.current && LRef.current) {
                            if (ppPreviewRef.current) { ppPreviewRef.current.remove(); ppPreviewRef.current = null; }
                            const L = LRef.current;
                            const icon = L.icon({ iconUrl: pinSVG('#ea580c'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
                            ppPreviewRef.current = L.marker([coords.lat, coords.lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
                            ppPreviewRef.current.bindPopup('<div style="font-family:system-ui;"><strong style="font-size:12px;">Punto de Partida</strong><div style="font-size:10px;color:#ea580c;font-weight:600;">Sede de este chofer</div></div>').openPopup();
                            mapInstRef.current.setView([coords.lat, coords.lng], 15, { animate: true });
                          }
                          const dir = await reverseGeocode(coords.lat, coords.lng);
                          const short = dir ? dir.split(',').slice(0, 3).join(',') : 'Punto de Google Maps';
                          setDriverPPDir(short); setPpSearchQuery(short);
                          setPpSearching(false);
                          toast.success('Punto de partida ubicado en el mapa');
                        } else {
                          const results = await forwardGeocode(v);
                          setPpSearching(false);
                          if (results.length > 0) { selectPPSuggestion(results[0], v); toast.success('Punto de partida ubicado en el mapa'); }
                          else { toast.error('No encontrada. Escribe: calle + ciudad, o pega enlace de Google Maps.'); }
                        }
                      }}
                      className="h-11 px-4 rounded-lg bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 disabled:opacity-40 flex-shrink-0 flex items-center justify-center gap-1.5" style={{ touchAction: 'manipulation' }}>
                        {ppSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Buscar
                      </button>
                    </div>
                    {/* Sugerencias automaticas (igual que formulario cliente) */}
                    {ppShowSugg && ppSuggestions.length > 0 && (
                      <div className="mt-1.5 bg-white border border-blue-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                        {ppSuggestions.map((s, i) => (
                          <button key={i} onClick={() => selectPPSuggestion(s)}
                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-zinc-50 last:border-0 flex items-start gap-2.5" style={{ touchAction: 'manipulation' }}>
                            <MapPin className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                            <span className="text-[13px] text-zinc-700 leading-snug">{s.display_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {ppShowSugg && !ppSearching && ppSuggestions.length === 0 && ppSearchQuery.length >= 3 && (
                      <div className="mt-1.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                        Sin resultados. Prueba con: calle, numero, ciudad y estado
                      </div>
                    )}
                  </div>

                  {/* 2. OPCIONES PEQUEÑAS: GPS + Tocar Mapa */}
                  <div className="flex gap-2">
                    <button onClick={setPPFromGPS} className="flex-1 h-9 rounded-lg border border-dashed border-blue-300 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-1.5">
                      <Crosshair className="h-3.5 w-3.5" /> Mi GPS
                    </button>
                    <button onClick={startPpTapMode} className="flex-1 h-9 rounded-lg border border-dashed border-blue-300 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> Tocar Mapa
                    </button>
                  </div>

                  {/* Punto seleccionado + Guardar */}
                  {driverPPLat && driverPPLng && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-100">
                        <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-green-700">Punto seleccionado</p>
                          <p className="text-[9px] text-zinc-500 truncate">{driverPPDir || `${driverPPLat.toFixed(4)}, ${driverPPLng.toFixed(4)}`}</p>
                        </div>
                        <button onClick={() => { setDriverPPLat(null); setDriverPPLng(null); setDriverPPDir(''); setPpSearchQuery(''); if (ppPreviewRef.current) { ppPreviewRef.current.remove(); ppPreviewRef.current = null; } }} className="text-zinc-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                      </div>
                      <button onClick={savePuntoPartida} disabled={ppSaving || !driverPhone.trim()}
                        className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold text-sm hover:from-blue-600 hover:to-indigo-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                        style={{ touchAction: 'manipulation' }}>
                        {ppSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {ppSaving ? 'Guardando...' : 'Guardar Punto de Partida'}
                      </button>
                    </div>
                  )}
                </div>

                {!driverActive ? (
                  <button onClick={startDriverTracking} disabled={!driverPhone.trim() || !driverName.trim()}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm hover:from-orange-600 hover:to-amber-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-200"
                    style={{ touchAction: 'manipulation' }}>
                    <Navigation className="h-5 w-5" /> Activar GPS — Aparecer en el Mapa
                  </button>
                ) : (
                  <button onClick={stopDriverTracking}
                    className="w-full h-12 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-200"
                    style={{ touchAction: 'manipulation' }}>
                    <X className="h-5 w-5" /> Desconectar del Mapa
                  </button>
                )}
              </div>

              {/* Active driver instructions summary */}
              {driverActive && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-1.5">
                  <p className="text-[11px] font-bold text-orange-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Tu info visible en el mapa ahora:
                  </p>
                  {driverMensaje && <p className="text-xs text-zinc-700"><span className="font-bold text-orange-600">Mensaje:</span> {driverMensaje}</p>}
                  {driverDirRecojo && <p className="text-xs text-zinc-700"><span className="font-bold text-orange-600">Recogo en:</span> {driverDirRecojo}</p>}
                  {driverPrecio && <p className="text-xs text-zinc-700"><span className="font-bold text-orange-600">Cobro:</span> ${driverPrecio}</p>}
                  {driverComunidad && <p className="text-xs text-zinc-700"><span className="font-bold text-orange-600">Comunidad:</span> {driverComunidad}</p>}
                </div>
              )}

              {driverMyLocation && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                  <div className="flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> GPS Activo</div>
                  <div className="font-mono">{driverMyLocation.lat.toFixed(6)}, {driverMyLocation.lng.toFixed(6)}</div>
                  <div className="mt-1 font-semibold">{distMilesFromBase(driverMyLocation.lat, driverMyLocation.lng).toFixed(1)} mi de la Base</div>
                </div>
              )}

              {/* Driver's assigned pickups */}
              {driverPhone.trim() && (
                <div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Mis Recogidas Asignadas</p>
                  {pickups.filter(p => p.choferAsignado === driverPhone.trim() && p.estado !== 'cancelado').length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-4">Aun no tienes recogidas asignadas. El admin te asignara clientes.</p>
                  ) : (
                    <div className="space-y-2">
                      {pickups.filter(p => p.choferAsignado === driverPhone.trim() && p.estado !== 'cancelado').map(p => {
                        const isEsp = p.estado === 'esperando';
                        const distMi = haversine(effectiveRef.lat, effectiveRef.lng, p.lat, p.lng).toFixed(1);
                        return (
                          <div key={p.id} className="rounded-xl border border-zinc-200 p-3 flex items-center gap-3 bg-white/80" style={{ borderLeftWidth: 3, borderLeftColor: isEsp ? VERDE : MORADO }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-zinc-800">{p.nombre}</p>
                              <p className="text-[10px] text-zinc-400 truncate">{p.direccion}</p>
                              <p className="text-[9px] text-red-500 font-semibold mt-0.5">{distMi} mi de {effectiveRef.name}</p>
                              {p.telefono && <a href={`tel:${p.telefono}`} className="text-[10px] text-blue-600 font-semibold">{p.telefono}</a>}
                            </div>
                            {isEsp && (
                              <button onClick={() => updatePickup(p.id, { estado: 'recogido', fechaRecogida: new Date().toISOString() })}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200"
                                style={{ touchAction: 'manipulation' }}>
                                <Check className="h-3 w-3 inline mr-0.5" />Recogido
                              </button>
                            )}
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isEsp ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                              {p.ordenRuta ? `#${p.ordenRuta}` : isEsp ? 'ESPERA' : 'LISTO'}
                            </span>
                            {p.horarioReady && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{p.horarioReady}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ═══════════════════════════════════════════════════════════════════
          PANEL: ADMIN
          ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {panel === 'admin' && (
          <motion.div initial={{ x: 300 }} animate={{ x: 0 }} exit={{ x: 300 }}
            className="absolute top-0 right-0 bottom-0 z-[1001] w-full max-w-md bg-white/95 backdrop-blur-sm shadow-2xl border-l border-zinc-200 flex flex-col">

            {/* Admin header */}
            <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-3 bg-white flex-shrink-0">
              <button onClick={() => { setOptimizedRoute([]); setRouteData(null); setDriverRoutes(new Map()); setPanel('none'); }} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><ArrowLeft className="h-4 w-4 text-zinc-600" /></button>
              <h3 className="font-bold text-sm text-zinc-900 flex-1">Administracion</h3>
              <select value={adminChofer} onChange={e => { setAdminChofer(e.target.value); setOptimizedRoute([]); setRouteData(null); setDistMatrix([]); }} className="h-7 px-2 rounded-lg border border-zinc-200 text-[10px] bg-white">
                <option value="">Todos</option>
                {[...new Set(pickups.map(p => p.choferAsignado).filter(Boolean))].map(c => <option key={c!} value={c!}>{c}</option>)}
              </select>
            </div>

            {/* Active drivers bar */}
            {activeDriversCount > 0 && (
              <div className="px-4 py-2 border-b border-zinc-100 flex items-center gap-2 bg-blue-50/80 flex-shrink-0">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[10px] font-bold text-blue-700">{activeDriversCount} chofer{activeDriversCount > 1 ? 'es' : ''} en vivo</span>
                <div className="flex-1" />
                <button onClick={() => handleFollowDriver()} className="text-[9px] font-bold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center gap-1">
                  <Navigation className="h-3 w-3" /> Seguir en mapa
                </button>
              </div>
            )}

            {/* Admin tabs */}
            <div className="px-4 py-1.5 border-b border-zinc-100 flex items-center gap-1 bg-zinc-50/80 flex-shrink-0 overflow-x-auto">
              {(['lista', 'areas', 'distancias', 'ruta', 'grupos'] as const).map(t => (
                <button key={t} onClick={() => setAdminTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex-shrink-0 ${adminTab === t ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200' : 'text-zinc-400 hover:text-zinc-600'}`}
                  style={{ touchAction: 'manipulation' }}>
                  {t === 'lista' ? `Lista (${adminChofer ? pickups.filter(p => p.choferAsignado === adminChofer).length : pickups.length})` : t === 'areas' ? 'Areas' : t === 'distancias' ? 'Distancias' : t === 'ruta' ? 'Ruta' : `Grupos (${choferesConAsignados.length})`}
                </button>
              ))}
              <div className="flex-1" />
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />{esperandoCount}</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-purple-700"><span className="w-2 h-2 rounded-full bg-purple-500" />{recogidosCount}</span>
            </div>

            {/* Reference point bar — always visible in admin */}
            <div className="px-4 py-1.5 border-b border-zinc-100 flex items-center gap-2 bg-red-50/80 flex-shrink-0">
              <MapPin className="h-3 w-3 text-red-500 flex-shrink-0" />
              <span className="text-[9px] font-bold text-red-700 flex-shrink-0">Ref:</span>
              <select
                value={distRefPoint ? `pickup-${distRefPoint.pickupId}` : adminChofer && drivers.find(d => d.nombre === adminChofer)?.puntoPartidaLat ? `driver-${adminChofer}` : 'base'}
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'base') {
                    setDistRefPoint(null);
                    if (distRefMarkerRef.current) { distRefMarkerRef.current.remove(); distRefMarkerRef.current = null; }
                  } else if (v.startsWith('pickup-')) {
                    const pid = parseInt(v.split('-')[1]);
                    const p = pickups.find(pp => pp.id === pid);
                    if (p) {
                      setDistRefPoint({ lat: p.lat, lng: p.lng, name: p.nombre, pickupId: p.id });
                      // Add ref marker on map
                      if (distRefMarkerRef.current) { distRefMarkerRef.current.remove(); distRefMarkerRef.current = null; }
                      if (mapInstRef.current && LRef.current) {
                        const L = LRef.current;
                        const icon = L.divIcon({ html: `<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;"><div style="width:28px;height:28px;background:#dc2626;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(220,38,38,0.5);z-index:2;"><span style="font-size:14px;">📍</span></div><div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#dc2626;color:#fff;padding:1px 8px;border-radius:6px;font-size:8px;font-weight:800;font-family:system-ui;">REFERENCIA</div></div>`, className: '', iconSize: [40, 58], iconAnchor: [20, 20] });
                        distRefMarkerRef.current = L.marker([p.lat, p.lng], { icon, zIndexOffset: 4000 }).addTo(mapInstRef.current);
                      }
                      toast.success(`Referencia: ${p.nombre}`);
                    }
                  } else if (v.startsWith('driver-')) {
                    setDistRefPoint(null);
                    if (distRefMarkerRef.current) { distRefMarkerRef.current.remove(); distRefMarkerRef.current = null; }
                  }
                }}
                className="flex-1 h-7 px-2 rounded-lg border border-red-200 text-[10px] font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-red-300"
              >
                <option value="base">Base ({BASE_NAME})</option>
                {drivers.filter(d => d.puntoPartidaLat && d.puntoPartidaLng).map(d => (
                  <option key={`driver-${d.nombre}`} value={`driver-${d.nombre}`}>Chofer: {d.nombre} ({d.puntoPartidaDir || 'GPS'})</option>
                ))}
                {pickups.filter(p => p.estado !== 'cancelado').sort((a, b) => a.nombre.localeCompare(b.nombre)).map(p => (
                  <option key={`pickup-${p.id}`} value={`pickup-${p.id}`}>{p.nombre} ({p.direccion?.substring(0, 25)})</option>
                ))}
              </select>
              {distRefPoint && (
                <button onClick={() => { setDistRefPoint(null); if (distRefMarkerRef.current) { distRefMarkerRef.current.remove(); distRefMarkerRef.current = null; } }}
                  className="text-[8px] font-bold px-1.5 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 flex-shrink-0"
                  style={{ touchAction: 'manipulation' }}>
                  <X className="h-2.5 w-2.5 inline" /> Quitar
                </button>
              )}
              <button onClick={toggleDistRefMode}
                className="text-[8px] font-bold px-1.5 py-1 rounded bg-red-500 text-white hover:bg-red-600 flex items-center gap-1 flex-shrink-0"
                style={{ touchAction: 'manipulation' }}>
                <Crosshair className="h-2.5 w-2.5" />Mapa
              </button>
            </div>

            {/* Action bar for lista tab */}
            {adminTab === 'lista' && (
              <div className="px-4 py-2 border-b border-zinc-100 flex-shrink-0 space-y-2">
                {/* Search + filter row */}
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                    <input value={adminSearch} onChange={e => { setAdminSearch(e.target.value); setAdminSelectedIds(new Set()); }}
                      placeholder="Buscar nombre, direccion, telefono..."
                      className="w-full h-7 pl-7 pr-7 rounded-lg border border-zinc-200 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white" />
                    {adminSearch && <button onClick={() => setAdminSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-zinc-400" /></button>}
                  </div>
                  <select value={adminEstadoFilter} onChange={e => { setAdminEstadoFilter(e.target.value as '' | 'esperando' | 'recogido'); setAdminSelectedIds(new Set()); }}
                    className="h-7 px-2 rounded-lg border border-zinc-200 text-[10px] bg-white">
                    <option value="">Todos</option>
                    <option value="esperando">Esperando</option>
                    <option value="recogido">Recogidos</option>
                  </select>
                </div>
                {/* Batch actions bar */}
                {adminSelectedIds.size > 0 && (
                  <div className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-[10px] font-bold text-blue-700">{adminSelectedIds.size} seleccionado{adminSelectedIds.size > 1 ? 's' : ''}</span>
                    <div className="flex-1" />
                    <button onClick={adminSelectAll} className="text-[9px] font-bold px-2 py-1 rounded bg-zinc-200 text-zinc-600 hover:bg-zinc-300">Todos</button>
                    <select value={adminBatchChofer} onChange={e => setAdminBatchChofer(e.target.value)} className="h-6 px-1.5 rounded border border-zinc-300 text-[9px] bg-white max-w-[80px]">
                      <option value="">Chofer...</option>{choferOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {adminBatchChofer && <button onClick={() => { handleBatchUpdate({ choferAsignado: adminBatchChofer }); setAdminBatchChofer(''); }} className="text-[9px] font-bold px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600">Asignar</button>}
                    <button onClick={() => handleBatchUpdate({ estado: 'recogido', fechaRecogida: new Date().toISOString() })} className="text-[9px] font-bold px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200">Recogido</button>
                    <button onClick={handleBatchDelete} className="text-[9px] font-bold px-2 py-1 rounded bg-red-100 text-red-500 hover:bg-red-200">Eliminar</button>
                    <button onClick={() => setAdminSelectedIds(new Set())} className="text-[9px] font-bold px-1.5 py-1 rounded bg-zinc-200 text-zinc-500">X</button>
                  </div>
                )}
                {/* Action buttons */}
                <div className="flex items-center gap-1.5">
                  <button onClick={adminSelectAll}
                    className="text-[9px] font-bold px-2 py-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 flex items-center gap-1">
                    {adminSelectedIds.size === adminFilteredPickups.length && adminFilteredPickups.length > 0 ? <Check className="h-3 w-3" /> : null} Seleccionar
                  </button>
                  <button onClick={handleOptimize} disabled={optimizing || esperandoCount < 1}
                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-40"
                    style={{ touchAction: 'manipulation' }}>
                    {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}{optimizing ? '...' : 'Optimizar'}
                  </button>
                  <button onClick={handleCalcDistances} disabled={calculatingDist || pickups.filter(p => p.estado !== 'cancelado').length < 2}
                    className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 hover:bg-orange-600 disabled:opacity-40"
                    style={{ touchAction: 'manipulation' }}>
                    {calculating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Route className="h-3 w-3" />}{calculating ? '...' : 'Distancias'}
                  </button>
                  {optimizedRoute.length > 0 && <button onClick={() => { setOptimizedRoute([]); setRouteData(null); }} className="w-7 h-7 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-400"><RotateCcw className="h-3 w-3" /></button>}
                  <div className="flex-1" />
                  <span className="text-[9px] text-zinc-400">{adminFilteredPickups.length} de {pickups.length}</span>
                </div>
              </div>
            )}

            {/* Route summary (when optimized) */}
            {routeData && optimizedRoute.length > 0 && adminTab === 'ruta' && (
              <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <Route className="h-3.5 w-3.5 text-blue-600" />
                  <p className="text-[10px] font-bold text-blue-800">{optimizedRoute.length} paradas · {fmtDist(routeData.totalDistance)} total · {fmtTime(routeData.totalDuration)}</p>
                </div>
                {/* Schedule driver */}
                <div className="flex items-center gap-2">
                  <select value={scheduledDriver} onChange={e => setScheduledDriver(e.target.value)} className="h-7 px-2 rounded-lg border border-blue-200 text-[10px] bg-white flex-1">
                    <option value="">Chofer...</option>{choferOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={handleScheduleRoute} disabled={scheduling || !scheduledDriver}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 hover:bg-blue-700 disabled:opacity-40"
                    style={{ touchAction: 'manipulation' }}>
                    {scheduling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}{scheduling ? '...' : 'Programar Chofer'}
                  </button>
                </div>
              </div>
            )}

            {/* Tab: ÁREAS / LOCALIDADES */}
            {adminTab === 'areas' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Area filter bar */}
              <div className="flex items-center gap-1.5">
                <select value={adminAreaFilter} onChange={e => setAdminAreaFilter(e.target.value)}
                  className="flex-1 h-8 px-3 rounded-lg border border-emerald-200 text-[11px] font-semibold bg-emerald-50/50 focus:outline-none focus:ring-1 focus:ring-emerald-300">
                  <option value="">Todas las areas</option>
                  {[...new Set(pickups.filter(p => p.area).map(p => p.area!))].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <span className="text-[9px] font-bold text-zinc-400">{pickups.filter(p => p.area && p.estado !== 'cancelado').length} con area</span>
              </div>
              {(() => {
                const active = pickups.filter(p => p.estado !== 'cancelado');
                // Group by area
                const areaMap = new Map<string, typeof active>();
                const noArea: typeof active = [];
                for (const p of active) {
                  if (!p.area) { noArea.push(p); continue; }
                  if (adminAreaFilter && p.area !== adminAreaFilter) continue;
                  if (!areaMap.has(p.area)) areaMap.set(p.area, []);
                  areaMap.get(p.area)!.push(p);
                }
                const areas = [...areaMap.entries()].sort((a, b) => b[1].length - a[1].length);
                if (areas.length === 0 && noArea.length === 0) return (
                  <div className="p-8 text-center">
                    <MapIcon className="h-7 w-7 text-zinc-300 mx-auto mb-2" />
                    <p className="text-xs text-zinc-400">Sin clientes con area asignada</p>
                    <p className="text-[10px] text-zinc-300 mt-1">Asigna un area a cada cliente al crearlo o desde la Lista</p>
                  </div>
                );
                return (
                  <>
                    {areas.map(([areaName, areaPickups]) => {
                      const areaColor = ['bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500'][areas.findIndex(a => a[0] === areaName) % 6];
                      const areaBg = ['bg-blue-50', 'bg-emerald-50', 'bg-orange-50', 'bg-purple-50', 'bg-pink-50', 'bg-cyan-50'][areas.findIndex(a => a[0] === areaName) % 6];
                      const areaBorder = ['border-blue-200', 'border-emerald-200', 'border-orange-200', 'border-purple-200', 'border-pink-200', 'border-cyan-200'][areas.findIndex(a => a[0] === areaName) % 6];
                      // Calculate distances from ref point (or BASE) to this area (avg)
                      const refLat = distRefPoint?.lat ?? BASE_LAT;
                      const refLng = distRefPoint?.lng ?? BASE_LNG;
                      const refName = distRefPoint?.name ?? BASE_NAME;
                      const avgDist = (areaPickups.reduce((s, p) => s + haversine(refLat, refLng, p.lat, p.lng) * 0.621371, 0) / areaPickups.length).toFixed(1);
                      return (
                        <div key={areaName} className={`border ${areaBorder} rounded-xl overflow-hidden`}>
                          {/* Area header */}
                          <div className={`${areaBg} px-3 py-2.5 flex items-center gap-2.5`}>
                            <div className={`w-7 h-7 rounded-full ${areaColor} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>{areaName.charAt(0)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-zinc-800">{areaName}</p>
                              <p className="text-[9px] text-zinc-500">{areaPickups.length} cliente{areaPickups.length !== 1 ? 's' : ''} · {avgDist} mi promedio de {refName}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">{areaPickups.filter(p => p.estado === 'esperando').length} espera</span>
                              <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full">{areaPickups.filter(p => p.estado === 'recogido').length} recog</span>
                            </div>
                          </div>
                          {/* Client list with distances between them */}
                          <div className="divide-y divide-zinc-50">
                            {areaPickups.sort((a, b) => a.nombre.localeCompare(b.nombre)).map((pickup, pIdx) => {
                              // Distances from this pickup to all others in the same area
                              const distsInArea = areaPickups.filter(pp => pp.id !== pickup.id).map(pp => ({
                                ...pp, dMi: haversine(pickup.lat, pickup.lng, pp.lat, pp.lng) * 0.621371
                              })).sort((a, b) => a.dMi - b.dMi);
                              const distBase = (haversine(refLat, refLng, pickup.lat, pickup.lng) * 0.621371).toFixed(1);
                              const [showDists, setShowDists] = React.useState(false);
                              return (
                                <div key={pickup.id} className="px-3 py-2 hover:bg-zinc-50/50">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${pickup.estado === 'esperando' ? 'bg-emerald-500' : 'bg-purple-500'}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-semibold text-zinc-800 truncate">{pickup.nombre}</p>
                                      <p className="text-[9px] text-zinc-400 truncate">{pickup.direccion}</p>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <span className="text-[9px] text-red-500 font-semibold">{distBase} mi</span>
                                      {pickup.choferAsignado && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full font-bold">{pickup.choferAsignado.split(' ')[0]}</span>}
                                    </div>
                                    {/* Nav links */}
                                    <a href={navGoogleMaps(pickup.lat, pickup.lng)} target="_blank" rel="noopener" className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[7px] font-black flex-shrink-0">G</a>
                                    <a href={navWaze(pickup.lat, pickup.lng)} target="_blank" rel="noopener" className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[7px] font-black flex-shrink-0">W</a>
                                    <a href={navAppleMaps(pickup.lat, pickup.lng)} target="_blank" rel="noopener" className="w-5 h-5 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[7px] font-black flex-shrink-0">A</a>
                                  </div>
                                  {/* Distances to other clients in area */}
                                  <div className="ml-4 mt-1">
                                    <button onClick={() => setShowDists(!showDists)} className="text-[9px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1" style={{ touchAction: 'manipulation' }}>
                                      <Route className="h-2.5 w-2.5" />{showDists ? 'Ocultar' : 'Ver'} distancias a {distsInArea.length} cliente{distsInArea.length !== 1 ? 's' : ''} en {areaName}
                                    </button>
                                    {showDists && (
                                      <div className="mt-1 bg-amber-50/80 border border-amber-200 rounded-lg max-h-36 overflow-y-auto">
                                        {distsInArea.map(pp => (
                                          <div key={pp.id} className="flex items-center justify-between px-2.5 py-1 border-b border-amber-100 last:border-0">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pp.estado === 'esperando' ? 'bg-emerald-500' : 'bg-purple-500'}`} />
                                              <span className="text-[9px] text-zinc-700 truncate">{pp.nombre}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                              <span className={`text-[9px] font-bold ${pp.dMi < 2 ? 'text-emerald-600' : pp.dMi < 5 ? 'text-orange-600' : 'text-red-600'}`}>{pp.dMi.toFixed(1)} mi</span>
                                              <a href={`https://www.google.com/maps/dir/?api=1&origin=${pickup.lat},${pickup.lng}&destination=${pp.lat},${pp.lng}`} target="_blank" rel="noopener" className="text-[7px] text-blue-500 font-bold px-1 py-0.5 rounded bg-blue-50">G</a>
                                              <a href={navWaze(pp.lat, pp.lng)} target="_blank" rel="noopener" className="text-[7px] text-emerald-600 font-bold px-1 py-0.5 rounded bg-emerald-50">W</a>
                                              <a href={navAppleMaps(pp.lat, pp.lng)} target="_blank" rel="noopener" className="text-[7px] text-zinc-600 font-bold px-1 py-0.5 rounded bg-zinc-100">A</a>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {/* Clients without area */}
                    {!adminAreaFilter && noArea.length > 0 && (
                      <div className="border border-zinc-200 rounded-xl overflow-hidden">
                        <div className="bg-zinc-50 px-3 py-2 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-zinc-400 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">?</div>
                          <div>
                            <p className="text-[11px] font-bold text-zinc-600">Sin area asignada ({noArea.length})</p>
                          </div>
                        </div>
                        {noArea.map(p => (
                          <div key={p.id} className="px-3 py-2 border-b border-zinc-50 last:border-0 flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.estado === 'esperando' ? 'bg-emerald-500' : 'bg-purple-500'}`} />
                            <span className="text-[11px] text-zinc-700 truncate flex-1">{p.nombre}</span>
                            <span className="text-[9px] text-red-500 font-semibold">{(haversine(distRefPoint?.lat ?? BASE_LAT, distRefPoint?.lng ?? BASE_LNG, p.lat, p.lng) * 0.621371).toFixed(1)} mi</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            )}

            {/* Tab: PICKUP LIST */}
            {adminTab === 'lista' && (
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-50">
              {loading ? <div className="flex items-center justify-center h-20"><Loader2 className="h-5 w-5 text-zinc-300 animate-spin" /></div> :
              adminFilteredPickups.length === 0 ? <div className="p-8 text-center"><Users className="h-7 w-7 text-zinc-300 mx-auto mb-2" /><p className="text-xs text-zinc-400">{adminSearch || adminEstadoFilter ? 'Sin resultados para este filtro' : 'Sin solicitudes'}</p></div> :
              (optimizedRoute.length > 0 ? optimizedRoute : adminFilteredPickups).map(p => (
                <AdminCard key={p.id} pickup={p} allPickups={pickups.filter(pp => pp.estado !== 'cancelado' && pp.id !== p.id)} onUpdate={updatePickup} onDelete={deletePickup}
                  routeIdx={optimizedRoute.indexOf(p)} showRouteNum={optimizedRoute.length > 0}
                  leg={routeData?.legs[optimizedRoute.indexOf(p) + 1]} choferOptions={choferOptions}
                  isSelected={adminSelectedIds.has(p.id)} onToggleSelect={(e) => toggleAdminSelect(p.id, e)}
                  effectiveRef={effectiveRef} />
              ))}
            </div>
            )}

            {/* Tab: DISTANCE MATRIX */}
            {adminTab === 'distancias' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-2.5 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0">R</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-zinc-800 truncate">Distancias desde: {routeOrigin.name}</p>
                  <p className="text-[8px] text-zinc-500">Cambia la referencia arriba con el dropdown "Ref"</p>
                </div>
              </div>
              {distMatrix.length === 0 ? (
                <div className="p-8 text-center">
                  <Route className="h-7 w-7 text-zinc-300 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400 mb-3">Calcula las distancias entre todos los clientes</p>
                  <button onClick={handleCalcDistances} disabled={calculatingDist || pickups.filter(p => p.estado !== 'cancelado').length < 2}
                    className="bg-orange-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 mx-auto hover:bg-orange-600 disabled:opacity-40"
                    style={{ touchAction: 'manipulation' }}>
                    {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}{calculating ? 'Calculando...' : 'Calcular Distancias'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-500 mb-2">DISTANCIAS DESDE {routeOrigin.name.toUpperCase()} (millas)</p>
                  {/* From Reference section */}
                  <div className={`border rounded-xl p-3 ${distRefPoint ? 'bg-red-50 border-red-200' : 'bg-red-50 border-red-100'}`}>
                    <p className="text-[10px] font-bold text-red-600 mb-2 flex items-center gap-1"><MapPin className="h-3 w-3" />Desde {routeOrigin.name}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {distMatrix.filter(m => m.from === routeOrigin.name).sort((a, b) => a.distMi - b.distMi).map((m, i) => (
                        <div key={i} className="bg-white rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-zinc-700 truncate max-w-[100px]">{m.to}</span>
                          <span className="text-[10px] font-bold text-red-600">{m.distMi} mi</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Between clients */}
                  <p className="text-[10px] font-bold text-zinc-500 mt-3 mb-1">ENTRE CLIENTES</p>
                  {distMatrix.filter(m => m.from !== 'BASE' && m.from !== routeOrigin.name).map((m, i) => (
                    <div key={i} className="bg-white border border-zinc-100 rounded-lg px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-semibold text-zinc-700 truncate">{m.from}</span>
                        <ArrowLeft className="h-3 w-3 text-zinc-300 rotate-180 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-zinc-700 truncate">{m.to}</span>
                      </div>
                      <span className={`text-[10px] font-bold ml-2 flex-shrink-0 ${m.distMi < 2 ? 'text-emerald-600' : m.distMi < 5 ? 'text-orange-600' : 'text-red-600'}`}>{m.distMi} mi</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Tab: ROUTE / SCHEDULE */}
            {adminTab === 'ruta' && (
            <div className="flex-1 overflow-y-auto">
              {optimizedRoute.length === 0 || !routeData ? (
                <div className="p-8 text-center">
                  <Zap className="h-7 w-7 text-zinc-300 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400 mb-3">Optimiza la ruta primero para ver el itinerario completo</p>
                  <button onClick={handleOptimize} disabled={optimizing || esperandoCount < 1}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 mx-auto hover:bg-emerald-700 disabled:opacity-40"
                    style={{ touchAction: 'manipulation' }}>
                    {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{optimizing ? '...' : 'Optimizar Ruta'}
                  </button>
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-bold text-zinc-500 mb-1">ITINERARIO COMPLETO CON DISTANCIAS</p>
                  {/* Base start */}
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{adminChofer ? 'S' : 'B'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-zinc-800">{routeOrigin.name}</p>
                      <p className="text-[9px] text-zinc-500">{adminChofer ? 'Punto de partida del chofer' : 'Punto de partida principal'}</p>
                    </div>
                  </div>
                  {/* Stops with leg distances */}
                  {routeStops.map((stop, i) => (
                    <div key={i}>
                      {/* Leg connector */}
                      <div className={`ml-4 pl-4 border-l-2 py-1 ${stop.type === 'warehouse' ? 'border-red-400' : stop.type === 'return' ? 'border-zinc-400' : 'border-blue-300'}`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] font-bold ${stop.type === 'warehouse' ? 'text-red-600' : stop.type === 'return' ? 'text-zinc-500' : 'text-blue-600'}`}>
                            {stop.type === 'warehouse' ? 'Almacén' : stop.type === 'return' ? 'Regreso' : `Tramo ${i + 1}`}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-zinc-500">Directa: {(stop.distFromPrev * 0.000621371).toFixed(1)} mi</span>
                            {routeData.legs[i + 1] && <span className="text-[9px] text-blue-600 font-semibold">Ruta: {fmtDist(routeData.legs[i + 1].distance)} · {fmtTime(routeData.legs[i + 1].duration)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className={`border rounded-xl p-3 flex items-center gap-3 ${stop.type === 'warehouse' ? 'bg-red-50 border-red-200' : stop.type === 'return' ? 'bg-zinc-50 border-zinc-200' : 'bg-white border-zinc-200'}`}>
                        <div className={`w-8 h-8 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${stop.type === 'warehouse' ? 'bg-red-700' : stop.type === 'return' ? 'bg-zinc-500' : 'bg-blue-600'}`}>
                          {stop.type === 'warehouse' ? '🏭' : stop.type === 'return' ? '🏠' : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] font-bold ${stop.type === 'warehouse' ? 'text-red-800' : stop.type === 'return' ? 'text-zinc-600' : 'text-zinc-800'}`}>{stop.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-red-500 font-semibold">{stop.distFromOrigin.toFixed(1)} mi del origen</span>
                            {stop.ready && <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{stop.ready}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[9px] text-zinc-400">Acumulado: {fmtDist(stop.cumDist)} · {fmtTime(stop.cumTime)}</p>
                            <span className="text-[9px] text-emerald-600 font-bold">Llegada: {absoluteETA(stop.cumTime)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Total summary */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Route className="h-4 w-4 text-emerald-600" />
                      <span className="text-[11px] font-bold text-emerald-800">Resumen del Viaje</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-lg font-bold text-zinc-900">{optimizedRoute.length}</p>
                        <p className="text-[9px] text-zinc-500">Paradas</p>
                      </div>
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-lg font-bold text-zinc-900">{fmtDist(routeData.totalDistance)}</p>
                        <p className="text-[9px] text-zinc-500">Distancia</p>
                      </div>
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-lg font-bold text-zinc-900">{fmtTime(routeData.totalDuration)}</p>
                        <p className="text-[9px] text-zinc-500">Tiempo</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* ALMACÉN DE DESTINO */}
            <div className="border-t border-zinc-100 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-red-700 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> ALMACÉN DE DESTINO</p>
                {warehouse && <button onClick={() => setWarehouse(null)} className="text-[9px] text-red-400 hover:text-red-600 font-semibold">Quitar</button>}
              </div>
              {warehouse ? (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <div className="w-7 h-7 rounded bg-red-700 text-white text-sm flex items-center justify-center flex-shrink-0">🏭</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-red-800 truncate">{warehouse.name}</p>
                    <p className="text-[9px] text-zinc-500">Se agrega como destino final en la ruta optimizada</p>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-red-400" />
                      <input
                        value={whSearchQuery}
                        onChange={e => {
                          const v = e.target.value;
                          setWhSearchQuery(v);
                          if (v.length < 3) { setWhSuggestions([]); setWhShowSugg(false); return; }
                          setWhSearching(true); setWhShowSugg(true);
                          setTimeout(async () => {
                            const r = await forwardGeocode(v);
                            setWhSuggestions(r); setWhSearching(false);
                          }, 300);
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const first = whSuggestions[0]; if (first) { setWarehouse({ lat: parseFloat(first.lat), lng: parseFloat(first.lon), name: first.display_name.split(',').slice(0, 3).join(',') }); setWhShowSugg(false); setWhSuggestions([]); setWhSearchQuery(''); toast.success('Almacén configurado'); } } }}
                        placeholder="Busca el almacén de destino..."
                        className="w-full h-9 pl-8 pr-8 rounded-lg border border-red-200 text-[11px] focus:outline-none focus:ring-1 focus:ring-red-300 bg-white"
                        autoComplete="off"
                      />
                      {whSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-red-500 animate-spin" />}
                      {!whSearching && whSearchQuery && <button onClick={() => { setWhSearchQuery(''); setWhSuggestions([]); setWhShowSugg(false); }} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-zinc-400 hover:text-red-500" /></button>}
                    </div>
                  </div>
                  {whShowSugg && whSuggestions.length > 0 && (
                    <div className="mt-1 bg-white border border-red-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                      {whSuggestions.map((s, i) => (
                        <button key={i} onClick={() => { setWarehouse({ lat: parseFloat(s.lat), lng: parseFloat(s.lon), name: s.display_name.split(',').slice(0, 3).join(',') }); setWhShowSugg(false); setWhSuggestions([]); setWhSearchQuery(''); toast.success('Almacén configurado'); }}
                          className="w-full text-left px-3 py-2 hover:bg-red-50 border-b border-zinc-50 last:border-0 flex items-center gap-2 text-[11px] text-zinc-700">
                          <MapPin className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />{s.display_name.split(',').slice(0, 3).join(',')}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[9px] text-zinc-400 mt-1">Opcional — se agrega al final de la ruta optimizada</p>
                </div>
              )}
            </div>

            {/* Tab: GRUPOS (rutas por chofer desde su punto de partida) */}
            {adminTab === 'grupos' && (
            <div className="flex-1 overflow-y-auto">
              {choferesConAsignados.length === 0 ? (
                <div className="p-8 text-center">
                  <Users className="h-7 w-7 text-zinc-300 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400 mb-1">Sin choferes con clientes asignados</p>
                  <p className="text-[10px] text-zinc-300">Asigna un chofer a cada cliente desde la Lista</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-zinc-500">GRUPOS POR CHOFER</p>
                    <button onClick={handleOptimizeAll} disabled={optimizingAll}
                      className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-40"
                      style={{ touchAction: 'manipulation' }}>
                      {optimizingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}{optimizingAll ? '...' : 'Optimizar Todos'}
                    </button>
                  </div>
                  {unassigned.length > 0 && (
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-5 h-5 rounded-full bg-zinc-400 text-white text-[8px] font-bold flex items-center justify-center">?</div>
                        <p className="text-[10px] font-bold text-zinc-600">Sin asignar ({unassigned.length})</p>
                      </div>
                      {unassigned.map(p => (
                        <div key={p.id} className="ml-7 text-[9px] text-zinc-400 py-0.5">{p.nombre} — {p.estado === 'esperando' ? 'Espera' : 'Recogido'}</div>
                      ))}
                    </div>
                  )}
                  {choferesConAsignados.map((grupo, gIdx) => {
                    const color = getGrupoColor(gIdx);
                    const rInfo = driverRoutes.get(grupo.nombre);
                    const hasPP = grupo.driver?.puntoPartidaLat && grupo.driver?.puntoPartidaLng;
                    return (
                      <div key={grupo.nombre} className={`border rounded-xl overflow-hidden ${selectedGrupoChofer === grupo.nombre ? 'border-blue-300 shadow-md' : 'border-zinc-200'}`}>
                        <button onClick={() => setSelectedGrupoChofer(selectedGrupoChofer === grupo.nombre ? null : grupo.nombre)}
                          className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-zinc-50" style={{ touchAction: 'manipulation' }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: color }}>
                            <span className="text-white text-[10px] font-bold">{gIdx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-[11px] font-bold text-zinc-800">{grupo.nombre}</p>
                            <p className="text-[9px] text-zinc-400">
                              {grupo.pickups.length} cliente{grupo.pickups.length !== 1 ? 's' : ''}
                              {hasPP ? ` · Sede: ${grupo.driver!.puntoPartidaDir || 'GPS'}` : ' · Sin punto de partida'}
                            </p>
                          </div>
                          {rInfo && (
                            <div className="text-right flex-shrink-0">
                              <p className="text-[9px] font-bold" style={{ color }}>{fmtDist(rInfo.data?.totalDistance || 0)}</p>
                              <p className="text-[8px] text-zinc-400">{fmtTime(rInfo.data?.totalDuration || 0)}</p>
                            </div>
                          )}
                          <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${selectedGrupoChofer === grupo.nombre ? 'rotate-90' : ''}`} />
                        </button>
                        {selectedGrupoChofer === grupo.nombre && (
                          <div className="border-t border-zinc-100 bg-zinc-50/50">
                            <div className="px-3 py-2 flex items-center gap-2 border-b border-zinc-100">
                              <div className="w-5 h-5 rounded text-[7px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: color, color: '#fff' }}>S</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[9px] font-bold text-zinc-700">{hasPP ? (grupo.driver!.puntoPartidaDir || 'Punto de partida') : 'Base (' + BASE_NAME + ')'}</p>
                              </div>
                            </div>
                            {(rInfo?.route || grupo.pickups).map((p: Pickup, i: number) => {
                              const leg = rInfo?.data?.legs[i + 1];
                              return (
                                <div key={p.id} className="px-3 py-2 flex items-center gap-2 border-b border-zinc-50 last:border-0">
                                  <div className="w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: color, color: '#fff' }}>{i + 1}</div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-semibold text-zinc-800 truncate">{p.nombre}</p>
                                    {leg && <p className="text-[8px] text-zinc-400">{fmtDist(leg.distance)} · {fmtTime(leg.duration)}</p>}
                                  </div>
                                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${p.estado === 'esperando' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                                    {p.estado === 'esperando' ? 'ESPERA' : 'RECOGIDO'}
                                  </span>
                                </div>
                              );
                            })}
                            {rInfo?.data && (
                              <div className="px-3 py-2 flex items-center justify-between" style={{ background: `${color}11` }}>
                                <span className="text-[9px] font-bold text-zinc-500">Total</span>
                                <span className="text-[10px] font-bold" style={{ color }}>{fmtDist(rInfo.data.totalDistance)} · {fmtTime(rInfo.data.totalDuration)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ ROUTE ORDER OVERLAY ON MAP ═══════════ */}
      {optimizedRoute.length > 0 && routeData && panel === 'admin' && adminTab === 'ruta' && (
        <div className="absolute top-14 left-3 z-[999] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-zinc-200 p-2.5 max-w-[220px] max-h-[50vh] overflow-y-auto">
          <p className="text-[10px] font-bold text-zinc-600 mb-1.5 flex items-center gap-1"><Clock className="h-3 w-3 text-blue-500" /> RUTA POR HORARIO READY</p>
          <div className="flex items-center gap-1.5 py-0.5 mb-1">
            <div className="w-4 h-4 rounded-full bg-red-500 text-white text-[7px] font-bold flex items-center justify-center">{adminChofer ? 'S' : 'B'}</div>
            <p className="text-[9px] text-red-600 font-semibold truncate">{routeOrigin.name}</p>
          </div>
          {(() => {
            // Group by horarioReady for display
            const groups: { time: string; items: { p: Pickup; idx: number }[] }[] = [];
            let currentGroup: string | null = null;
            optimizedRoute.forEach((p, i) => {
              const t = p.horarioReady || 'Sin horario';
              if (t !== currentGroup) {
                currentGroup = t;
                groups.push({ time: t, items: [] });
              }
              groups[groups.length - 1].items.push({ p, idx: i });
            });
            return groups.map(g => (
              <div key={g.time}>
                <div className="text-[9px] font-bold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 mt-1 mb-0.5 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />{g.time}
                </div>
                {g.items.map(({ p, idx }) => {
                  const distMi = haversine(effectiveRef.lat, effectiveRef.lng, p.lat, p.lng).toFixed(1);
                  return (
                    <div key={p.id} className="flex items-start gap-1.5 py-0.5">
                      <div className="w-4 h-4 rounded-full bg-blue-600 text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-800 truncate leading-tight">{p.nombre}</p>
                        <p className="text-[8px] text-red-500">{distMi} mi de {effectiveRef.name}</p>
                        {routeData.legs[idx + 1] && <p className="text-[8px] text-blue-500">{fmtDist(routeData.legs[idx + 1].distance)} · {fmtTime(routeData.legs[idx + 1].duration)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN CARD
// ═══════════════════════════════════════════════════════════════════════════

function AdminCard({ pickup, allPickups, onUpdate, onDelete, routeIdx, showRouteNum, leg, choferOptions, isSelected, onToggleSelect, effectiveRef }: {
  pickup: Pickup; allPickups: Pickup[]; onUpdate: (id: number, data: any) => void; onDelete: (id: number) => void;
  routeIdx: number; showRouteNum: boolean; leg?: { duration: number; distance: number };
  choferOptions: string[]; isSelected?: boolean; onToggleSelect?: (e?: React.MouseEvent) => void;
  effectiveRef?: { lat: number; lng: number; name: string };
}) {
  const isEsp = pickup.estado === 'esperando';
  const [expanded, setExpanded] = useState(false);
  const [showDistances, setShowDistances] = useState(false);
  const ref = effectiveRef || { lat: BASE_LAT, lng: BASE_LNG, name: BASE_NAME };
  const distMi = haversine(ref.lat, ref.lng, pickup.lat, pickup.lng).toFixed(1);
  // Distances from this pickup to all others, sorted nearest first
  const distsToOthers = allPickups
    .map(p => ({ ...p, dMi: haversine(pickup.lat, pickup.lng, p.lat, p.lng) * 0.621371 }))
    .sort((a, b) => a.dMi - b.dMi);
  return (
    <div style={isEsp ? { borderLeft: `3px solid ${VERDE}` } : pickup.estado === 'recogido' ? { borderLeft: `3px solid ${MORADO}` } : {}} className={isSelected ? 'bg-blue-50/60' : ''}>
      <div className="flex items-center">
        {/* Batch select checkbox */}
        {onToggleSelect && (
          <button onClick={onToggleSelect} className="ml-2 flex-shrink-0" style={{ touchAction: 'manipulation' }}>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-zinc-300 bg-white'}`}>
              {isSelected && <Check className="h-3 w-3 text-white" />}
            </div>
          </button>
        )}
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-zinc-50" style={{ touchAction: 'manipulation' }}>
          {showRouteNum ? <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{routeIdx + 1}</div>
            : <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isEsp ? 'bg-emerald-500' : 'bg-purple-500'}`} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-semibold text-zinc-800 truncate">{pickup.nombre}</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isEsp ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>{isEsp ? 'ESPERA' : 'RECOGIDO'}</span>
              {pickup.horarioReady && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{pickup.horarioReady}</span>}
              {pickup.area && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{pickup.area}</span>}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-zinc-400 truncate">{pickup.direccion}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[9px] text-red-500 font-semibold">{distMi} mi</span>
            {leg && leg.distance > 0 && <span className="text-[9px] text-blue-500 font-medium">{fmtDist(leg.distance)}</span>}
          </div>
          {/* Nav buttons (always visible) */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <a href={navGoogleMaps(pickup.lat, pickup.lng)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
              className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-[8px] font-black" title="Google Maps">G</a>
            <a href={navWaze(pickup.lat, pickup.lng)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
              className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[8px] font-black" title="Waze">W</a>
            <a href={navAppleMaps(pickup.lat, pickup.lng)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
              className="w-6 h-6 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[8px] font-black" title="Apple Maps/Safari">A</a>
            {pickup.telefono && <a href={`tel:${pickup.telefono}`} onClick={e => e.stopPropagation()} className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Phone className="h-3 w-3" /></a>}
          </div>
          <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2.5">
          {/* Navigation buttons (large) */}
          <div className="flex gap-1.5">
            <a href={navGoogleMaps(pickup.lat, pickup.lng)} target="_blank" rel="noopener"
              className="flex-1 h-9 rounded-lg bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center gap-1.5 hover:bg-blue-600">
              <span className="text-xs">G</span> Google Maps
            </a>
            <a href={navWaze(pickup.lat, pickup.lng)} target="_blank" rel="noopener"
              className="flex-1 h-9 rounded-lg bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-600">
              <span className="text-xs">W</span> Waze
            </a>
            <a href={navAppleMaps(pickup.lat, pickup.lng)} target="_blank" rel="noopener"
              className="flex-1 h-9 rounded-lg bg-zinc-800 text-white text-[10px] font-bold flex items-center justify-center gap-1.5 hover:bg-zinc-900">
              <span className="text-xs">A</span> Safari
            </a>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            {pickup.telefono && <div><span className="text-zinc-400">Telefono:</span> <a href={`tel:${pickup.telefono}`} className="text-blue-600 font-medium">{pickup.telefono}</a></div>}
            {pickup.choferAsignado && <div><span className="text-zinc-400">Chofer:</span> <span className="text-zinc-700 font-medium">{pickup.choferAsignado}</span></div>}
            <div><span className="text-zinc-400">Distancia:</span> <span className="text-red-500 font-semibold">{distMi} mi de {ref.name}</span></div>
            <div><span className="text-zinc-400">Creada:</span> <span className="text-zinc-600">{new Date(pickup.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            {pickup.horarioReady && <div><span className="text-zinc-400">Horario Ready:</span> <span className="text-blue-600 font-bold">{pickup.horarioReady}</span></div>}
            <div><span className="text-zinc-400">Area:</span> <select value={pickup.area || ''} onChange={e => onUpdate(pickup.id, { area: e.target.value || null })} className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 focus:outline-none">
              <option value="">Sin area</option>
              <option value="Miami">Miami</option>
              <option value="West">West (Hialeah/Doral)</option>
              <option value="Pan">Pan (Pembroke Pines)</option>
              <option value="Beach">Beach (Miami Beach)</option>
              <option value="North">North (Broward)</option>
              <option value="Kendall">Kendall</option>
            </select></div>
            {pickup.notas && <div className="col-span-2"><span className="text-zinc-400">Notas:</span> <span className="text-zinc-600">{pickup.notas}</span></div>}
          </div>
          {/* ─── DISTANCIAS A TODOS LOS DEMÁS CLIENTES ─── */}
          <div>
            <button onClick={() => setShowDistances(!showDistances)} className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 hover:text-amber-800" style={{ touchAction: 'manipulation' }}>
              <Route className="h-3 w-3" /> {showDistances ? 'Ocultar' : 'Ver'} distancias a {distsToOthers.length} clientes
            </button>
            {showDistances && (
              <div className="mt-1.5 bg-amber-50/80 border border-amber-200 rounded-xl max-h-40 overflow-y-auto">
                {distsToOthers.length === 0 ? (
                  <p className="text-[10px] text-zinc-400 text-center py-2">No hay otros clientes</p>
                ) : distsToOthers.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-1.5 border-b border-amber-100 last:border-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.estado === 'esperando' ? 'bg-emerald-500' : 'bg-purple-500'}`} />
                      <span className="text-[10px] text-zinc-700 truncate">{p.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-bold ${p.dMi < 2 ? 'text-emerald-600' : p.dMi < 5 ? 'text-orange-600' : 'text-red-600'}`}>{p.dMi.toFixed(1)} mi</span>
                      <a href={navGoogleMaps(pickup.lat, pickup.lng).replace(`destination=${pickup.lat},${pickup.lng}`, `origin=${pickup.lat},${pickup.lng}&destination=${p.lat},${p.lng}`)} target="_blank" rel="noopener" className="text-[8px] text-blue-500 font-bold px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100">G</a>
                      <a href={navWaze(p.lat, p.lng)} target="_blank" rel="noopener" className="text-[8px] text-emerald-600 font-bold px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100">W</a>
                      <a href={navAppleMaps(p.lat, p.lng)} target="_blank" rel="noopener" className="text-[8px] text-zinc-600 font-bold px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200">A</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isEsp ? (
              <button onClick={() => onUpdate(pickup.id, { estado: 'recogido', fechaRecogida: new Date().toISOString() })} className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200" style={{ touchAction: 'manipulation' }}><Check className="h-3 w-3" /> Recogido</button>
            ) : (
              <button onClick={() => onUpdate(pickup.id, { estado: 'esperando', fechaRecogida: null })} className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><RotateCcw className="h-3 w-3" /> Espera</button>
            )}
            <button onClick={() => { if (confirm('Eliminar?')) onDelete(pickup.id); }} className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="h-3 w-3" /> Eliminar</button>
            <input type="time" value={pickup.horarioReady || ''} onChange={e => onUpdate(pickup.id, { horarioReady: e.target.value || null })}
              className="h-7 px-2 rounded-lg border border-blue-200 text-[10px] bg-blue-50/50 max-w-[100px]" title="Horario Ready" />
            <div className="flex-1" />
            <select value={pickup.choferAsignado || ''} onChange={e => onUpdate(pickup.id, { choferAsignado: e.target.value || null })} className="h-7 px-2 rounded-lg border border-zinc-200 text-[10px] bg-white max-w-[130px]">
              <option value="">Sin chofer</option>{choferOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}