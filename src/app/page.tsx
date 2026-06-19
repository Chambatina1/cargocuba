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
  createdAt: string; updatedAt: string;
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
async function forwardGeocode(query: string): Promise<GeoSuggestion[]> {
  try {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    const j = await r.json();
    return (j.results || []).map((s: { display_name: string; lat: string; lon: string }) => ({
      display_name: s.display_name,
      lat: s.lat,
      lon: s.lon
    }));
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
    let m = text.match(/@(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    m = text.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    m = text.match(/\/@(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    m = text.match(/query=(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    m = text.match(/ll=(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    m = text.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (m && parseFloat(m[1]) >= -90 && parseFloat(m[1]) <= 90) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  } catch {}
  return null;
}

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
  const [form, setForm] = useState({ nombre: '', telefono: '', direccion: '', lat: 0, lng: 0, notas: '', horarioReady: '' });
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Address search ───
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewMarkerRef = useRef<any>(null);

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

  // ─── Follow Driver Mode ───
  const [followingDriver, setFollowingDriver] = useState(false);
  const [followDriverPhone, setFollowDriverPhone] = useState<string | null>(null);

  // ─── Admin (no password — direct access) ───
  const [adminChofer, setAdminChofer] = useState('');
  const [adminTab, setAdminTab] = useState<'lista' | 'distancias' | 'ruta' | 'grupos'>('lista');
  const [distMatrix, setDistMatrix] = useState<{ from: string; to: string; distMi: number }[]>([]);
  const [calculatingDist, setCalculatingDist] = useState(false);
  const [scheduledDriver, setScheduledDriver] = useState('');
  const [scheduling, setScheduling] = useState(false);

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
      if (j.ok) setDrivers(j.data || []);
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
  // SELECT MODE: tap markers to pick, measure distances, optimize
  // ═══════════════════════════════════════════════════════════════════════════
  const toggleSelectMode = useCallback(() => {
    const next = !selectMode;
    setSelectMode(next);
    if (!next) { setSelectedIds([]); setSelectRouteData(null); }
    else { setOptimizedRoute([]); setRouteData(null); setFollowingDriver(false); setFollowDriverPhone(null); }
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
      // In select mode, tapping toggles selection instead of opening popup
      if (selectMode) {
        marker.on('click', () => { handleMarkerTap(p.id); });
      } else {
        const estadoLabel = isVerde ? 'En Espera' : 'Recogido';
        const estadoColor = isVerde ? VERDE : MORADO;
        const distFromBase = distMilesFromBase(p.lat, p.lng).toFixed(1);
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
        const wazeUrl = `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
        marker.bindPopup(`<div style="font-family:system-ui;min-width:200px;"><strong style="font-size:13px;">${p.nombre}</strong><div style="font-size:11px;color:#666;margin-top:2px;">${p.direccion}</div><div style="margin-top:4px;font-size:11px;color:#dc2626;font-weight:600;">${distFromBase} mi de la Base</div>${p.horarioReady ? `<div style="margin-top:4px;font-size:11px;color:#2563eb;font-weight:600;">Ready: ${p.horarioReady}</div>` : ''}<div style="margin-top:6px;display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${estadoColor};display:inline-block;"></span><span style="font-size:11px;font-weight:600;color:${estadoColor};">${estadoLabel}</span></div>${p.choferAsignado ? `<div style="font-size:11px;margin-top:4px;color:#555;">Chofer: ${p.choferAsignado}</div>` : ''}<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;"><a href="${gmapsUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#4285f4;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">Google Maps</a><a href="${wazeUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#59c657;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">Waze</a>${p.telefono ? `<a href="tel:${p.telefono}" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#2563eb;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">${p.telefono}</a>` : ''}</div></div>`);
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
      const distFromBase = distMilesFromBase(d.lat, d.lng).toFixed(1);

      let instHtml = '';
      if (hasInst) {
        instHtml = `<div style="margin-top:8px;padding:10px;background:linear-gradient(135deg,#fff7ed,#ffedd5);border-radius:12px;border:1.5px solid #fdba74;">${d.mensaje ? `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;"><span style="font-size:14px;">💬</span><div><div style="font-size:9px;color:#92400e;font-weight:600;text-transform:uppercase;">Mensaje</div><div style="font-size:12px;color:#1c1917;font-weight:700;">${d.mensaje}</div></div></div>` : ''}${d.direccionRecojo ? `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;"><span style="font-size:14px;">📍</span><div><div style="font-size:9px;color:#92400e;font-weight:600;text-transform:uppercase;">Recogo en</div><div style="font-size:12px;color:#1c1917;font-weight:700;">${d.direccionRecojo}</div></div></div>` : ''}${d.precioServicio ? `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;"><span style="font-size:14px;">💰</span><div><div style="font-size:9px;color:#92400e;font-weight:600;text-transform:uppercase;">Cobro por servicio</div><div style="font-size:14px;color:#ea580c;font-weight:800;">$${d.precioServicio}</div></div></div>` : ''}${d.comunidad ? `<div style="display:flex;align-items:flex-start;gap:6px;"><span style="font-size:14px;">🏘️</span><div><div style="font-size:9px;color:#92400e;font-weight:600;text-transform:uppercase;">Comunidad</div><div style="font-size:12px;color:#1c1917;font-weight:700;">${d.comunidad}</div></div></div>` : ''}</div>`;
      }

      dM.bindPopup(`<div style="font-family:system-ui;min-width:240px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><div style="width:36px;height:36px;background:${mc};border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:18px;">🚛</span></div><div><strong style="font-size:14px;color:#111;">${d.nombre}</strong><div style="font-size:10px;color:${mc};font-weight:700;display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;"></span>EN VIVO${hasInst ? ' · MODO COMUNITARIO' : ''}</div></div></div><div style="font-size:11px;color:#666;">${d.phone} · ${distFromBase} mi de la Base</div>${instHtml}<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;"><a href="https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:#4285f4;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">Google Maps</a><a href="tel:${d.phone}" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:${mc};color:#fff;font-size:11px;font-weight:600;text-decoration:none;">Llamar</a></div></div>`);
      bounds.push([d.lat, d.lng]); markersRef.current.push(dM);
    });

    // Only auto-fit if NOT following a driver AND user hasn't placed a preview pin
    // (don't steal the map from the user who is selecting an address)
    const hasPreview = previewMarkerRef.current !== null || ppPreviewRef.current !== null;
    if (!followingDriver && !hasPreview) {
      if (bounds.length > 1) {
        mapInstRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
      } else {
        mapInstRef.current.setView([BASE_LAT, BASE_LNG], 12);
      }
    }
    setTimeout(() => mapInstRef.current?.invalidateSize(), 150);
  }, [pickups, drivers, optimizedRoute, routeData, panel, mapReady, followingDriver, selectMode, selectedIds, selectRouteData, handleMarkerTap]);

  useEffect(() => { setTimeout(() => { initMap(); renderMarkers(); }, 200); }, [initMap, renderMarkers]);
  useEffect(() => { if (mapInstRef.current) renderMarkers(); }, [renderMarkers]);

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
        body: JSON.stringify({ ...form, direccion: form.direccion || `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}`, horarioReady: form.horarioReady || null }),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success('Tu punto esta VERDE en el mapa' + (form.horarioReady ? ` (Ready: ${form.horarioReady})` : ''));
        setForm({ nombre: '', telefono: '', direccion: '', lat: 0, lng: 0, notas: '', horarioReady: '' });
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
      if (results.length === 0) toast.info('Sin resultados. Intenta: nombre de calle + ciudad, o usa el boton GPS.');
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

  // ─── Compute distance matrix between all pickups + origin point ───
  const handleCalcDistances = async () => {
    const active = pickups.filter(p => p.estado !== 'cancelado');
    if (active.length < 2) { toast.error('Necesitas al menos 2 clientes'); return; }
    setCalculatingDist(true);
    try {
      const matrix: { from: string; to: string; distMi: number }[] = [];
      // Use selected driver's punto de partida if available, otherwise BASE
      const selDriver = drivers.find(d => d.nombre === adminChofer);
      const originLat = selDriver?.puntoPartidaLat ?? BASE_LAT;
      const originLng = selDriver?.puntoPartidaLng ?? BASE_LNG;
      const originName = selDriver?.puntoPartidaDir || 'BASE';
      const all = [{ name: originName, lat: originLat, lng: originLng }, ...active.map(p => ({ name: p.nombre, lat: p.lat, lng: p.lng }))];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const dMi = haversine(all[i].lat, all[i].lng, all[j].lat, all[j].lng) * 0.621371;
          matrix.push({ from: all[i].name, to: all[j].name, distMi: Math.round(dMi * 10) / 10 });
        }
      }
      setDistMatrix(matrix);
      setAdminTab('distancias');
      toast.success(`Matriz: ${all.length} puntos, ${matrix.length} pares` + (adminChofer ? ` desde ${selDriver?.nombre}` : ''));
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
      const allPoints = [{ lat: startLat, lng: startLng }, ...ordered.map(p => ({ lat: p.lat, lng: p.lng }))];
      const result = await calcRoute(allPoints);
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

  // ─── Cumulative route info for scheduling ───
  const getRouteOrigin = () => {
    if (adminChofer) {
      const selDriver = drivers.find(d => d.nombre === adminChofer);
      if (selDriver?.puntoPartidaLat && selDriver?.puntoPartidaLng) {
        return { lat: selDriver.puntoPartidaLat, lng: selDriver.puntoPartidaLng, name: selDriver.puntoPartidaDir || selDriver.nombre };
      }
    }
    return { lat: BASE_LAT, lng: BASE_LNG, name: BASE_NAME };
  };

  const routeOrigin = getRouteOrigin();

  const routeStops = routeData && optimizedRoute.length > 0
    ? (() => {
        const stops: { name: string; distFromPrev: number; cumDist: number; timeFromPrev: number; cumTime: number; distFromOrigin: number; ready?: string }[] = [];
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
            name: p.nombre,
            distFromPrev: i === 0 ? (routeData.legs[0]?.distance || 0) : leg.distance,
            cumDist: cumD,
            timeFromPrev: i === 0 ? (routeData.legs[0]?.duration || 0) : leg.duration,
            cumTime: cumT,
            distFromOrigin: distMiles(p.lat, p.lng, routeOrigin.lat, routeOrigin.lng),
            ready: p.horarioReady || undefined,
          });
        }
        return stops;
      })()
    : [];

  // ─── Chofer options from DB (all unique driver names + any assigned names) ───
  const choferOptions = [...new Set([
    ...drivers.map(d => d.nombre),
    ...pickups.map(p => p.choferAsignado).filter(Boolean) as string[],
  ])];

  // ─── Stats ───
  const esperandoCount = pickups.filter(p => p.estado === 'esperando').length;
  const recogidosCount = pickups.filter(p => p.estado === 'recogido').length;
  const activeDriversCount = drivers.filter(d => d.activo).length;

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
                      placeholder="Ej: 8310 Lost Lake Dr, Orlando FL..."
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

                  {/* 1. DIRECCION / GOOGLE MAPS LINK (campo principal) */}
                  <div>
                    <p className="text-[10px] text-blue-500 font-semibold mb-1">Escribe la direccion o pega enlace de Google Maps:</p>
                    <div className="flex gap-1.5">
                      <input
                        value={ppSearchQuery}
                        onChange={e => {
                          setPpSearchQuery(e.target.value);
                          const v = e.target.value;
                          const coords = extractGoogleMapsCoords(v);
                          if (coords) {
                            setDriverPPLat(coords.lat); setDriverPPLng(coords.lng);
                            toast.success('Coordenadas extraidas del enlace');
                          }
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('pp-search-btn')?.click(); } }}
                        placeholder="456 Pine St, Orlando  o  https://maps.google.com/..."
                        className="flex-1 h-11 px-3 rounded-lg border-2 border-blue-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white font-medium"
                      />
                      <button id="pp-search-btn" onClick={async () => {
                        const v = ppSearchQuery.trim();
                        if (!v) return;
                        setPpSearching(true);
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
                    <p className="text-[9px] text-blue-400 mt-1">Escribe y pulsa BUSCAR, o pega un enlace de Google Maps</p>
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
                        const distMi = distMilesFromBase(p.lat, p.lng).toFixed(1);
                        return (
                          <div key={p.id} className="rounded-xl border border-zinc-200 p-3 flex items-center gap-3 bg-white/80" style={{ borderLeftWidth: 3, borderLeftColor: isEsp ? VERDE : MORADO }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-zinc-800">{p.nombre}</p>
                              <p className="text-[10px] text-zinc-400 truncate">{p.direccion}</p>
                              <p className="text-[9px] text-red-500 font-semibold mt-0.5">{distMi} mi de la Base</p>
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
            <div className="px-4 py-1.5 border-b border-zinc-100 flex items-center gap-1 bg-zinc-50/80 flex-shrink-0">
              {(['lista', 'distancias', 'ruta', 'grupos'] as const).map(t => (
                <button key={t} onClick={() => setAdminTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${adminTab === t ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200' : 'text-zinc-400 hover:text-zinc-600'}`}
                  style={{ touchAction: 'manipulation' }}>
                  {t === 'lista' ? `Lista (${adminChofer ? pickups.filter(p => p.choferAsignado === adminChofer).length : pickups.length})` : t === 'distancias' ? 'Distancias' : t === 'ruta' ? 'Ruta' : `Grupos (${choferesConAsignados.length})`}
                </button>
              ))}
              <div className="flex-1" />
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />{esperandoCount}</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-purple-700"><span className="w-2 h-2 rounded-full bg-purple-500" />{recogidosCount}</span>
            </div>

            {/* Action bar for lista tab */}
            {adminTab === 'lista' && (
              <div className="px-4 py-2 border-b border-zinc-100 flex items-center gap-2 bg-white/80 flex-shrink-0">
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

            {/* Tab: PICKUP LIST */}
            {adminTab === 'lista' && (
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-50">
              {loading ? <div className="flex items-center justify-center h-20"><Loader2 className="h-5 w-5 text-zinc-300 animate-spin" /></div> :
              (adminChofer ? pickups.filter(p => p.choferAsignado === adminChofer) : pickups).length === 0 ? <div className="p-8 text-center"><Users className="h-7 w-7 text-zinc-300 mx-auto mb-2" /><p className="text-xs text-zinc-400">Sin solicitudes</p></div> :
              (optimizedRoute.length > 0 ? optimizedRoute : (adminChofer ? pickups.filter(p => p.choferAsignado === adminChofer) : pickups)).map(p => (
                <AdminCard key={p.id} pickup={p} onUpdate={updatePickup} onDelete={deletePickup}
                  routeIdx={optimizedRoute.indexOf(p)} showRouteNum={optimizedRoute.length > 0}
                  leg={routeData?.legs[optimizedRoute.indexOf(p) + 1]} choferOptions={choferOptions} />
              ))}
            </div>
            )}

            {/* Tab: DISTANCE MATRIX */}
            {adminTab === 'distancias' && (
            <div className="flex-1 overflow-y-auto p-4">
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
                  <p className="text-[10px] font-bold text-zinc-500 mb-2">DISTANCIAS ENTRE PUNTOS (millas)</p>
                  {/* From Base section */}
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3">
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
                  {distMatrix.filter(m => m.from !== 'BASE').map((m, i) => (
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
                      <div className="ml-4 pl-4 border-l-2 border-blue-300 py-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-blue-600 font-bold">Tramo {i + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-zinc-500">Directa: {(stop.distFromPrev * 0.000621371).toFixed(1)} mi</span>
                            {routeData.legs[i + 1] && <span className="text-[9px] text-blue-600 font-semibold">Ruta: {fmtDist(routeData.legs[i + 1].distance)} · {fmtTime(routeData.legs[i + 1].duration)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-zinc-800">{stop.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-red-500 font-semibold">{stop.distFromOrigin.toFixed(1)} mi del origen</span>
                            {stop.ready && <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{stop.ready}</span>}
                          </div>
                          <p className="text-[9px] text-zinc-400 mt-0.5">Acumulado: {fmtDist(stop.cumDist)} · {fmtTime(stop.cumTime)} desde la Base</p>
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
                  const distMi = distMilesFromBase(p.lat, p.lng).toFixed(1);
                  return (
                    <div key={p.id} className="flex items-start gap-1.5 py-0.5">
                      <div className="w-4 h-4 rounded-full bg-blue-600 text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-800 truncate leading-tight">{p.nombre}</p>
                        <p className="text-[8px] text-red-500">{distMi} mi de la Base</p>
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

function AdminCard({ pickup, onUpdate, onDelete, routeIdx, showRouteNum, leg, choferOptions }: {
  pickup: Pickup; onUpdate: (id: number, data: any) => void; onDelete: (id: number) => void;
  routeIdx: number; showRouteNum: boolean; leg?: { duration: number; distance: number };
  choferOptions: string[];
}) {
  const isEsp = pickup.estado === 'esperando';
  const [expanded, setExpanded] = useState(false);
  const distMi = distMilesFromBase(pickup.lat, pickup.lng).toFixed(1);
  return (
    <div style={isEsp ? { borderLeft: `3px solid ${VERDE}` } : pickup.estado === 'recogido' ? { borderLeft: `3px solid ${MORADO}` } : {}}>
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-zinc-50" style={{ touchAction: 'manipulation' }}>
        {showRouteNum ? <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{routeIdx + 1}</div>
          : <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isEsp ? 'bg-emerald-500' : 'bg-purple-500'}`} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-zinc-800 truncate">{pickup.nombre}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isEsp ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>{isEsp ? 'ESPERA' : 'RECOGIDO'}</span>
            {pickup.horarioReady && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{pickup.horarioReady}</span>}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-zinc-400 truncate">{pickup.direccion}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[9px] text-red-500 font-semibold">{distMi} mi</span>
          {leg && leg.distance > 0 && <span className="text-[9px] text-blue-500 font-medium">{fmtDist(leg.distance)}</span>}
          {pickup.telefono && <a href={`tel:${pickup.telefono}`} onClick={e => e.stopPropagation()} className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Phone className="h-3 w-3" /></a>}
          <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            {pickup.telefono && <div><span className="text-zinc-400">Telefono:</span> <a href={`tel:${pickup.telefono}`} className="text-blue-600 font-medium">{pickup.telefono}</a></div>}
            {pickup.choferAsignado && <div><span className="text-zinc-400">Chofer:</span> <span className="text-zinc-700 font-medium">{pickup.choferAsignado}</span></div>}
            <div><span className="text-zinc-400">Distancia:</span> <span className="text-red-500 font-semibold">{distMi} mi de la Base</span></div>
            <div><span className="text-zinc-400">Creada:</span> <span className="text-zinc-600">{new Date(pickup.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            {pickup.horarioReady && <div><span className="text-zinc-400">Horario Ready:</span> <span className="text-blue-600 font-bold">{pickup.horarioReady}</span></div>}
            {pickup.notas && <div className="col-span-2"><span className="text-zinc-400">Notas:</span> <span className="text-zinc-600">{pickup.notas}</span></div>}
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