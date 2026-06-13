'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShoppingCart, MapPin, Route, Trash2, Check, X, Phone,
  Truck, Loader2, ChevronRight, Zap, RotateCcw, Users, Shield,
  Navigation, Eye, EyeOff, Crosshair, ArrowLeft
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Pickup {
  id: number; nombre: string; telefono: string | null; direccion: string;
  lat: number; lng: number; notas: string | null; estado: string;
  choferAsignado: string | null; ordenRuta: number | null;
  fechaRecogida: string | null; createdAt: string; updatedAt: string;
}

interface Driver {
  phone: string; nombre: string; lat: number; lng: number; activo: boolean; updatedAt: string;
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

const CHOFERES = [
  'Luis Martinez', 'Carlos Rodriguez', 'Miguel Perez', 'Roberto Garcia',
  'Antonio Fernandez', 'Jose Hernandez',
];

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

// ─── Nearest-Neighbor ───────────────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function optimizeOrder(pickups: Pickup[], startLat = BASE_LAT, startLng = BASE_LNG): Pickup[] {
  if (pickups.length <= 1) return [...pickups];
  const remaining = [...pickups], ordered: Pickup[] = [];
  let cLat = startLat, cLng = startLng;
  while (remaining.length > 0) {
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(cLat, cLng, remaining[i].lat, remaining[i].lng);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    const next = remaining.splice(bestI, 1)[0];
    ordered.push(next); cLat = next.lat; cLng = next.lng;
  }
  return ordered;
}

// ─── Reverse Geocode ───────────────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`);
    const j = await r.json(); return j.display_name || '';
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

// Truck icon SVG for driver marker
function truckSVG() {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48"><circle cx="20" cy="20" r="18" fill="${CHOFER_COLOR}" stroke="#fff" stroke-width="3"/><text x="20" y="26" text-anchor="middle" fill="#fff" font-size="18" font-family="system-ui">🚛</text></svg>`)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function CargoCubaPage() {
  // ─── Overlay panels ───
  const [panel, setPanel] = useState<'none' | 'clientForm' | 'driver' | 'adminLogin' | 'admin'>('none');

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
  const driverMarkerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  // ─── Route ───
  const [optimizedRoute, setOptimizedRoute] = useState<Pickup[]>([]);
  const [routeData, setRouteData] = useState<{ route: [number, number][]; totalDistance: number; totalDuration: number; legs: { duration: number; distance: number }[] } | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  // ─── Client form ───
  const [form, setForm] = useState({ nombre: '', telefono: '', direccion: '', lat: 0, lng: 0, notas: '' });
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Driver mode ───
  const [driverPhone, setDriverPhone] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverActive, setDriverActive] = useState(false);
  const [driverMyLocation, setDriverMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // ─── Admin ───
  const [adminPassword, setAdminPassword] = useState('');
  const [adminChofer, setAdminChofer] = useState('');
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);

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
  // LOAD DATA
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
  useEffect(() => { const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP
  // ═══════════════════════════════════════════════════════════════════════════
  const initMap = useCallback(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    if (!mapInstRef.current) {
      mapInstRef.current = L.map(mapRef.current, { center: [BASE_LAT, BASE_LNG], zoom: 11, zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '', maxZoom: 18 }).addTo(mapInstRef.current);
    }
  }, [mapReady]);

  const renderMarkers = useCallback(() => {
    if (!mapInstRef.current || !LRef.current) return;
    const L = LRef.current;

    // Clear all
    markersRef.current.forEach(m => m.remove()); markersRef.current = [];
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
    if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null; }

    const active = pickups.filter(p => p.estado !== 'cancelado');
    const displayList = optimizedRoute.length > 0 && panel === 'admin' ? optimizedRoute : active;
    const bounds: any[] = [];

    // ─── BASE marker (red) ───
    const baseIcon = L.icon({ iconUrl: pinSVG(BASE_COLOR), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
    const baseM = L.marker([BASE_LAT, BASE_LNG], { icon: baseIcon, zIndexOffset: 2000 }).addTo(mapInstRef.current);
    baseM.bindPopup(`<div style="font-family:system-ui;min-width:160px;"><strong style="font-size:13px;">Base</strong><div style="font-size:11px;color:#666;margin-top:2px;">${BASE_NAME}</div><div style="margin-top:4px;font-size:10px;color:#dc2626;font-weight:600;">Punto de partida</div></div>`);
    bounds.push([BASE_LAT, BASE_LNG]); markersRef.current.push(baseM);

    // ─── Route line ───
    if (routeData && routeData.route.length > 1 && panel === 'admin') {
      routeLineRef.current = L.polyline(routeData.route, { color: RUTA, weight: 4, opacity: 0.8, dashArray: '12, 8', lineCap: 'round' }).addTo(mapInstRef.current);
    }

    // ─── Pickup markers ───
    displayList.forEach((p, idx) => {
      const isVerde = p.estado === 'esperando';
      const color = isVerde ? VERDE : MORADO;
      const showNum = optimizedRoute.length > 0 && panel === 'admin';
      const icon = L.icon({ iconUrl: pinSVG(color, showNum ? idx + 1 : undefined, isVerde), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(mapInstRef.current);
      const estadoLabel = isVerde ? 'En Espera' : 'Recogido';
      const estadoColor = isVerde ? VERDE : MORADO;
      marker.bindPopup(`<div style="font-family:system-ui;min-width:180px;"><strong style="font-size:13px;">${p.nombre}</strong><div style="font-size:11px;color:#666;margin-top:2px;">${p.direccion}</div><div style="margin-top:6px;display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${estadoColor};display:inline-block;"></span><span style="font-size:11px;font-weight:600;color:${estadoColor};">${estadoLabel}</span></div>${p.choferAsignado ? `<div style="font-size:11px;margin-top:4px;color:#555;">Chofer: ${p.choferAsignado}</div>` : ''}${p.telefono ? `<a href="tel:${p.telefono}" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;font-weight:600;">${p.telefono}</a>` : ''}</div>`);
      bounds.push([p.lat, p.lng]); markersRef.current.push(marker);
    });

    // ─── DRIVER markers (blue truck, moving) ───
    drivers.filter(d => d.activo).forEach(d => {
      const truckIcon = L.divIcon({
        html: `<div style="position:relative;"><div style="width:40px;height:40px;background:${CHOFER_COLOR};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(37,99,235,0.5);"><span style="font-size:18px;">🚛</span></div><div style="position:absolute;top:-2px;right:-2px;width:12px;height:12px;background:#22c55e;border:2px solid #fff;border-radius:50%;"></div></div>`,
        className: '', iconSize: [40, 40], iconAnchor: [20, 20],
      });
      const dM = L.marker([d.lat, d.lng], { icon: truckIcon, zIndexOffset: 3000 }).addTo(mapInstRef.current);
      dM.bindPopup(`<div style="font-family:system-ui;min-width:160px;"><strong style="font-size:13px;">${d.nombre}</strong><div style="font-size:11px;color:${CHOFER_COLOR};font-weight:600;margin-top:2px;">Chofer en camino</div><div style="font-size:11px;color:#666;margin-top:2px;">${d.phone}</div></div>`);
      bounds.push([d.lat, d.lng]); markersRef.current.push(dM);
    });

    if (bounds.length > 1) {
      mapInstRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
    } else {
      mapInstRef.current.setView([BASE_LAT, BASE_LNG], 12);
    }
    setTimeout(() => mapInstRef.current?.invalidateSize(), 150);
  }, [pickups, drivers, optimizedRoute, routeData, panel, mapReady]);

  useEffect(() => { setTimeout(() => { initMap(); renderMarkers(); }, 200); }, [initMap, renderMarkers]);
  useEffect(() => { if (mapInstRef.current) renderMarkers(); }, [renderMarkers]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT: GPS + SUBMIT
  // ═══════════════════════════════════════════════════════════════════════════
  const getLocation = useCallback(() => {
    setLocating(true);
    if (!navigator.geolocation) { toast.error('GPS no disponible'); setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setForm(f => ({ ...f, lat, lng })); setLocating(false);
        const dir = await reverseGeocode(lat, lng);
        if (dir) setForm(f => ({ ...f, direccion: dir.split(',').slice(0, 3).join(',') }));
      },
      () => { toast.error('Activa tu ubicacion'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  const handleSubmit = async () => {
    if (!form.nombre.trim()) { toast.error('Pon tu nombre'); return; }
    if (form.lat === 0) { toast.error('Espera GPS'); return; }
    setSubmitting(true);
    try {
      const r = await fetch('/api/pickups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, direccion: form.direccion || `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}` }),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success('Tu punto esta VERDE en el mapa');
        setForm({ nombre: '', telefono: '', direccion: '', lat: 0, lng: 0, notas: '' });
        setPanel('none'); load();
      } else toast.error(j.error || 'Error');
    } catch { toast.error('Error de conexion'); }
    setSubmitting(false);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DRIVER: GPS TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  const startDriverTracking = useCallback(() => {
    if (!driverPhone.trim() || !driverName.trim()) { toast.error('Pon tu telefono y nombre'); return; }
    if (!navigator.geolocation) { toast.error('GPS no disponible'); return; }

    // Initial position
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setDriverMyLocation({ lat, lng });
      setDriverActive(true);
      try {
        await fetch('/api/drivers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: driverPhone.trim(), nombre: driverName.trim(), lat, lng, activo: true }),
        });
        toast.success('Estas EN VIVO en el mapa. Todos te ven.');
        load();
      } catch { toast.error('Error al activar GPS'); }
    }, () => toast.error('No se pudo obtener ubicacion'), { enableHighAccuracy: true, timeout: 10000 });

    // Watch position
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = navigator.geolocation.watchPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setDriverMyLocation({ lat, lng });
      try {
        await fetch('/api/drivers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: driverPhone.trim(), nombre: driverName.trim(), lat, lng, activo: true }),
        });
      } catch {}
    }, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });

    return () => { if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current); };
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
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-key': 'chambatina2024' },
        body: JSON.stringify({ id, ...data }),
      });
      const j = await r.json(); if (j.ok) load(); else toast.error(j.error || 'Error');
    } catch { toast.error('Error'); }
  };

  const deletePickup = async (id: number) => {
    try {
      const r = await fetch(`/api/pickups?id=${id}`, { method: 'DELETE', headers: { 'x-admin-key': 'chambatina2024' } });
      const j = await r.json(); if (j.ok) { toast.success('Eliminada'); load(); }
    } catch {}
  };

  const handleOptimize = async () => {
    const esperando = pickups.filter(p => p.estado === 'esperando');
    if (esperando.length < 1) { toast.error('No hay clientes en verde'); return; }
    setOptimizing(true);
    try {
      const ordered = optimizeOrder(esperando);
      setOptimizedRoute(ordered);
      const allPoints = [{ lat: BASE_LAT, lng: BASE_LNG }, ...ordered.map(p => ({ lat: p.lat, lng: p.lng }))];
      const result = await calcRoute(allPoints);
      setRouteData(result);
      for (let i = 0; i < ordered.length; i++) await updatePickup(ordered[i].id, { ordenRuta: i + 1 });
      const firstMi = result.legs[0] ? (result.legs[0].distance * 0.000621371).toFixed(1) : '0';
      toast.success(`Ruta: Base -> ${ordered.length} paradas, ${fmtDist(result.totalDistance)}, ${fmtTime(result.totalDuration)} (Salida: ${firstMi} mi)`);
    } catch (err: any) { toast.error('Error ruta: ' + (err.message || '')); }
    setOptimizing(false);
  };

  // ─── Stats ───
  const esperandoCount = pickups.filter(p => p.estado === 'esperando').length;
  const recogidosCount = pickups.filter(p => p.estado === 'recogido').length;
  const activeDriversCount = drivers.filter(d => d.activo).length;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="relative w-screen h-screen overflow-hidden">

      {/* ═══════════ FULLSCREEN MAP ═══════════ */}
      <div ref={mapRef} className="absolute inset-0 z-0" />
      {!mapReady && <div className="absolute inset-0 z-[1] bg-zinc-100 flex items-center justify-center"><Loader2 className="h-8 w-8 text-emerald-500 animate-spin" /></div>}

      {/* ═══════════ TOP BAR (over map) ═══════════ */}
      <div className="absolute top-0 left-0 right-0 z-[1000] pointer-events-none">
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md px-4 py-2.5 flex items-center justify-between shadow-lg border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-600 p-1.5 rounded-lg"><Truck className="h-4 w-4 text-white" /></div>
            <div>
              <h1 className="text-sm font-bold text-zinc-900 leading-tight">CargoCuba</h1>
              <p className="text-[10px] text-zinc-500 flex items-center gap-2">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{esperandoCount} verde</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" />{recogidosCount} morado</span>
                {activeDriversCount > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />{activeDriversCount} chofer</span>}
              </p>
            </div>
          </div>

          {/* Distance from base to each pickup */}
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-red-500" />
            <span className="text-[10px] text-zinc-500 hidden sm:inline">Base: {BASE_NAME}</span>
          </div>
        </div>
      </div>

      {/* ═══════════ BOTTOM BUTTONS (over map) ═══════════ */}
      {panel === 'none' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex gap-3">
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setPanel('clientForm'); getLocation(); }}
            className="flex flex-col items-center gap-1.5 bg-white rounded-2xl px-5 py-3.5 shadow-2xl border border-zinc-100 hover:shadow-3xl transition-shadow"
            style={{ touchAction: 'manipulation' }}>
            <div className="w-11 h-11 rounded-full bg-emerald-500 flex items-center justify-center"><ShoppingCart className="h-5 w-5 text-white" /></div>
            <span className="text-[11px] font-bold text-zinc-700">Pedir Recogida</span>
          </motion.button>

          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setPanel('driver')}
            className="flex flex-col items-center gap-1.5 bg-white rounded-2xl px-5 py-3.5 shadow-2xl border border-zinc-100 hover:shadow-3xl transition-shadow relative"
            style={{ touchAction: 'manipulation' }}>
            <div className="w-11 h-11 rounded-full bg-blue-500 flex items-center justify-center"><Truck className="h-5 w-5 text-white" /></div>
            <span className="text-[11px] font-bold text-zinc-700">Soy Chofer</span>
            {driverActive && <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />}
          </motion.button>

          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setPanel('adminLogin')}
            className="flex flex-col items-center gap-1.5 bg-white rounded-2xl px-5 py-3.5 shadow-2xl border border-zinc-100 hover:shadow-3xl transition-shadow"
            style={{ touchAction: 'manipulation' }}>
            <div className="w-11 h-11 rounded-full bg-purple-500 flex items-center justify-center"><Shield className="h-5 w-5 text-white" /></div>
            <span className="text-[11px] font-bold text-zinc-700">Admin</span>
          </motion.button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PANEL: CLIENT FORM
          ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {panel === 'clientForm' && (
          <motion.div initial={{ opacity: 0, y: 300 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[1001] bg-white rounded-t-3xl shadow-2xl border-t border-zinc-200 max-h-[85vh] overflow-y-auto">

            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-5 pt-4 pb-2 border-b border-zinc-100 flex items-center justify-between rounded-t-3xl">
              <div>
                <h3 className="font-bold text-base text-zinc-900">Nueva Recogida</h3>
                <p className="text-[11px] text-zinc-500">Tu punto se encendera VERDE en el mapa</p>
              </div>
              <button onClick={() => setPanel('none')} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="h-4 w-4 text-zinc-500" /></button>
            </div>

            <div className="p-5 space-y-3">
              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold ${form.lat !== 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : form.lat !== 0 ? <Check className="h-5 w-5" /> : <MapPin className="h-4 w-4" />}
                {locating ? 'Obteniendo GPS...' : form.lat !== 0 ? 'Ubicacion detectada' : 'Detectando ubicacion...'}
              </div>

              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Tu nombre *" className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />
              <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="Telefono" className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />
              <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Direccion (se autocompleta con GPS)" className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />
              <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Notas (tamano, horario...)" rows={2} className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50 resize-none" />

              <button onClick={handleSubmit} disabled={submitting || form.lat === 0 || !form.nombre.trim()}
                className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg"
                style={{ touchAction: 'manipulation' }}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {submitting ? 'Enviando...' : 'Encender mi punto en VERDE'}
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
            className="absolute top-0 right-0 bottom-0 z-[1001] w-full max-w-sm bg-white shadow-2xl border-l border-zinc-200 flex flex-col">

            <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-3 bg-zinc-50">
              <button onClick={() => { if (driverActive) stopDriverTracking(); setPanel('none'); }} className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center"><ArrowLeft className="h-4 w-4 text-zinc-600" /></button>
              <h3 className="font-bold text-sm text-zinc-900 flex-1">Panel del Chofer</h3>
              {driverActive && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />EN VIVO</span>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Driver info form */}
              <div className="space-y-2.5">
                <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} placeholder="Tu telefono *" className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-zinc-50" />
                <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Tu nombre *" className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-zinc-50" />

                {!driverActive ? (
                  <button onClick={startDriverTracking} disabled={!driverPhone.trim() || !driverName.trim()}
                    className="w-full h-11 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg"
                    style={{ touchAction: 'manipulation' }}>
                    <Navigation className="h-4 w-4" /> Activar GPS — Aparecer en el Mapa
                  </button>
                ) : (
                  <button onClick={stopDriverTracking}
                    className="w-full h-11 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all flex items-center justify-center gap-2"
                    style={{ touchAction: 'manipulation' }}>
                    <X className="h-4 w-4" /> Desconectar del Mapa
                  </button>
                )}
              </div>

              {driverMyLocation && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                  GPS activo: {driverMyLocation.lat.toFixed(4)}, {driverMyLocation.lng.toFixed(4)}
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
                        return (
                          <div key={p.id} className="rounded-xl border border-zinc-200 p-3 flex items-center gap-3" style={{ borderLeftWidth: 3, borderLeftColor: isEsp ? VERDE : MORADO }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-zinc-800">{p.nombre}</p>
                              <p className="text-[10px] text-zinc-400 truncate">{p.direccion}</p>
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
          PANEL: ADMIN LOGIN
          ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {panel === 'adminLogin' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[1001] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPanel('none')}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl">
              <div className="text-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-3"><Shield className="w-7 h-7 text-purple-600" /></div>
                <h3 className="font-bold text-lg text-zinc-900">Admin</h3>
                <p className="text-xs text-zinc-500">CargoCuba</p>
              </div>
              <input type="password" placeholder="Clave" value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adminPassword === 'chambatina2024' && (() => { setAdminLoggedIn(true); setPanel('admin'); toast.success('Admin activo'); })()}
                className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-zinc-50" />
              <button onClick={() => { if (adminPassword === 'chambatina2024') { setAdminLoggedIn(true); setPanel('admin'); toast.success('Admin activo'); } else toast.error('Clave incorrecta'); }}
                className="w-full h-11 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 shadow-lg" style={{ touchAction: 'manipulation' }}>Entrar</button>
              <button onClick={() => setPanel('none')} className="w-full mt-3 text-center text-xs text-zinc-400">Cancelar</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════
          PANEL: ADMIN
          ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {panel === 'admin' && adminLoggedIn && (
          <motion.div initial={{ x: 300 }} animate={{ x: 0 }} exit={{ x: 300 }}
            className="absolute top-0 right-0 bottom-0 z-[1001] w-full max-w-md bg-white shadow-2xl border-l border-zinc-200 flex flex-col">

            {/* Admin header */}
            <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-3 bg-zinc-50 flex-shrink-0">
              <button onClick={() => { setOptimizedRoute([]); setRouteData(null); setAdminLoggedIn(false); setPanel('none'); }} className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center"><ArrowLeft className="h-4 w-4 text-zinc-600" /></button>
              <h3 className="font-bold text-sm text-zinc-900 flex-1">Administracion</h3>
              <select value={adminChofer} onChange={e => setAdminChofer(e.target.value)} className="h-7 px-2 rounded-lg border border-zinc-200 text-[10px] bg-white">
                <option value="">Todos</option>{CHOFERES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Route optimize bar */}
            <div className="px-4 py-2 border-b border-zinc-100 flex items-center gap-2 bg-white flex-shrink-0">
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />{esperandoCount}</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-purple-700"><span className="w-2 h-2 rounded-full bg-purple-500" />{recogidosCount}</span>
              <div className="flex-1" />
              <button onClick={handleOptimize} disabled={optimizing || esperandoCount < 1}
                className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-40"
                style={{ touchAction: 'manipulation' }}>
                {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}{optimizing ? '...' : 'Optimizar'}
              </button>
              {optimizedRoute.length > 0 && <button onClick={() => { setOptimizedRoute([]); setRouteData(null); }} className="w-7 h-7 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-400"><RotateCcw className="h-3 w-3" /></button>}
            </div>

            {/* Route summary */}
            {routeData && optimizedRoute.length > 0 && (
              <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2 flex-shrink-0">
                <Route className="h-3.5 w-3.5 text-blue-600" />
                <p className="text-[10px] font-bold text-blue-800">{optimizedRoute.length} paradas · {fmtDist(routeData.totalDistance)} · {fmtTime(routeData.totalDuration)}</p>
              </div>
            )}

            {/* Pickup list */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-50">
              {loading ? <div className="flex items-center justify-center h-20"><Loader2 className="h-5 w-5 text-zinc-300 animate-spin" /></div> :
              pickups.length === 0 ? <div className="p-8 text-center"><Users className="h-7 w-7 text-zinc-300 mx-auto mb-2" /><p className="text-xs text-zinc-400">Sin solicitudes</p></div> :
              (optimizedRoute.length > 0 ? optimizedRoute : pickups).map(p => (
                <AdminCard key={p.id} pickup={p} onUpdate={updatePickup} onDelete={deletePickup}
                  routeIdx={optimizedRoute.indexOf(p)} showRouteNum={optimizedRoute.length > 0}
                  leg={routeData?.legs[optimizedRoute.indexOf(p)]} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Route order overlay on map */}
      {optimizedRoute.length > 0 && routeData && (panel === 'admin') && (
        <div className="absolute top-14 right-2 z-[999] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-zinc-200 p-2.5 max-w-[200px] max-h-[45vh] overflow-y-auto">
          <p className="text-[10px] font-bold text-zinc-600 mb-1.5">ORDEN DE RECOGIDA</p>
          <div className="flex items-center gap-1.5 py-0.5 mb-1">
            <div className="w-4 h-4 rounded-full bg-red-500 text-white text-[7px] font-bold flex items-center justify-center">B</div>
            <p className="text-[9px] text-red-600 font-semibold truncate">{BASE_NAME}</p>
          </div>
          {optimizedRoute.map((p, i) => (
            <div key={p.id} className="flex items-start gap-1.5 py-0.5">
              <div className="w-4 h-4 rounded-full bg-blue-600 text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-zinc-800 truncate leading-tight">{p.nombre}</p>
                {routeData.legs[i + 1] && <p className="text-[8px] text-blue-500">{fmtDist(routeData.legs[i + 1].distance)} · {fmtTime(routeData.legs[i + 1].duration)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN CARD
// ═══════════════════════════════════════════════════════════════════════════

function AdminCard({ pickup, onUpdate, onDelete, routeIdx, showRouteNum, leg }: {
  pickup: Pickup; onUpdate: (id: number, data: any) => void; onDelete: (id: number) => void;
  routeIdx: number; showRouteNum: boolean; leg?: { duration: number; distance: number };
}) {
  const isEsp = pickup.estado === 'esperando';
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={isEsp ? { borderLeft: `3px solid ${VERDE}` } : pickup.estado === 'recogido' ? { borderLeft: `3px solid ${MORADO}` } : {}}>
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-zinc-50" style={{ touchAction: 'manipulation' }}>
        {showRouteNum ? <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{routeIdx + 1}</div>
          : <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isEsp ? 'bg-emerald-500' : 'bg-purple-500'}`} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-zinc-800 truncate">{pickup.nombre}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isEsp ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>{isEsp ? 'ESPERA' : 'RECOGIDO'}</span>
          </div>
          <p className="text-[10px] text-zinc-400 truncate">{pickup.direccion}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
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
            <div><span className="text-zinc-400">Creada:</span> <span className="text-zinc-600">{new Date(pickup.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            {pickup.notas && <div className="col-span-2"><span className="text-zinc-400">Notas:</span> <span className="text-zinc-600">{pickup.notas}</span></div>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isEsp ? (
              <button onClick={() => onUpdate(pickup.id, { estado: 'recogido', fechaRecogida: new Date().toISOString() })} className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200" style={{ touchAction: 'manipulation' }}><Check className="h-3 w-3" /> Recogido</button>
            ) : (
              <button onClick={() => onUpdate(pickup.id, { estado: 'esperando', fechaRecogida: null })} className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><RotateCcw className="h-3 w-3" /> Espera</button>
            )}
            <button onClick={() => { if (confirm('Eliminar?')) onDelete(pickup.id); }} className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="h-3 w-3" /> Eliminar</button>
            <div className="flex-1" />
            <select value={pickup.choferAsignado || ''} onChange={e => onUpdate(pickup.id, { choferAsignado: e.target.value || null })} className="h-7 px-2 rounded-lg border border-zinc-200 text-[10px] bg-white max-w-[130px]">
              <option value="">Sin chofer</option>{CHOFERES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}