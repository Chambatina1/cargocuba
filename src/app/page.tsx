'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShoppingCart, MapPin, Navigation, Route, Trash2, Check, X, Phone,
  Truck, Crosshair, Loader2, ChevronRight, Zap, RotateCcw, Users, Clock,
  ArrowLeft, Eye, EyeOff, Shield, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Dynamic Map (no SSR) ─────────────────────────────────────────────────
const PickupMapView = dynamic(() => import('@/components/MapView'), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────────────
interface Pickup {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string;
  lat: number;
  lng: number;
  notas: string | null;
  estado: string;
  choferAsignado: string | null;
  ordenRuta: number | null;
  fechaRecogida: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Colors ────────────────────────────────────────────────────────────────
const VERDE = '#16a34a';
const MORADO = '#9333ea';
const RUTA = '#2563eb';

const CHOFERES = [
  'Luis Martinez', 'Carlos Rodriguez', 'Miguel Perez', 'Roberto Garcia',
  'Antonio Fernandez', 'Jose Hernandez',
];

// ─── OSRM Route Calc ───────────────────────────────────────────────────────
async function calcRoute(points: { lat: number; lng: number }[]) {
  if (points.length < 2) return { route: [] as [number, number][], totalDistance: 0, totalDuration: 0, legs: [] as { duration: number; distance: number }[] };
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('Ruta no encontrada');
  const r = json.routes[0];
  return {
    route: r.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]),
    totalDistance: r.distance || 0,
    totalDuration: r.duration || 0,
    legs: (r.legs || []).map((l: any) => ({ duration: l.duration || 0, distance: l.distance || 0 })),
  };
}

function fmtDist(m: number) { return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`; }
function fmtTime(s: number) { if (s < 60) return `${Math.round(s)}s`; const m = Math.floor(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; }

// ─── Nearest-Neighbor Optimization ─────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function optimizeOrder(pickups: Pickup[], startLat = 25.8, startLng = -80.3): Pickup[] {
  if (pickups.length <= 1) return [...pickups];
  const remaining = [...pickups];
  const ordered: Pickup[] = [];
  let cLat = startLat, cLng = startLng;
  while (remaining.length > 0) {
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(cLat, cLng, remaining[i].lat, remaining[i].lng);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    const next = remaining.splice(bestI, 1)[0];
    ordered.push(next);
    cLat = next.lat; cLng = next.lng;
  }
  return ordered;
}

// ─── Reverse Geocode ───────────────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`);
    const j = await r.json();
    return j.display_name || '';
  } catch { return ''; }
}

// ─── SVG Marker ────────────────────────────────────────────────────────────
function pinSVG(color: string, num?: number, pulse?: boolean) {
  const numHtml = num !== undefined
    ? `<circle cx="18" cy="16" r="10" fill="#fff" opacity="0.95"/><text x="18" y="20.5" text-anchor="middle" font-size="12" font-weight="bold" fill="${color}" font-family="system-ui">${num}</text>`
    : `<circle cx="18" cy="16" r="5" fill="#fff" opacity="0.9"/>`;
  const pulseHtml = pulse ? `<circle cx="18" cy="16" r="14" fill="none" stroke="${color}" stroke-width="2" opacity="0.4"><animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite"/></circle>` : '';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46"><path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z" fill="${color}" stroke="#fff" stroke-width="2"/>${pulseHtml}${numHtml}</svg>`)}`;
}

// ─── Animation ─────────────────────────────────────────────────────────────
const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 } };

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function CargoCubaPage() {
  // Two main views
  const [view, setView] = useState<'cliente' | 'admin'>('cliente');

  // ─── Data ───
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Map ───
  const [mapReady, setMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeLineRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  // ─── Route optimization ───
  const [optimizedRoute, setOptimizedRoute] = useState<Pickup[]>([]);
  const [routeData, setRouteData] = useState<{ route: [number, number][]; totalDistance: number; totalDuration: number; legs: { duration: number; distance: number }[] } | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  // ─── Client form ───
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: '', telefono: '', direccion: '', lat: 0, lng: 0, notas: '' });
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Admin ───
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminChofer, setAdminChofer] = useState('');

  // ─── Load Leaflet ───
  useEffect(() => {
    (async () => {
      try {
        const L = (await import('leaflet')).default;
        LRef.current = L;
        setMapReady(true);
      } catch { toast.error('No se pudo cargar el mapa'); }
    })();
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    return () => { if (mapInstRef.current) { mapInstRef.current.remove(); mapInstRef.current = null; } };
  }, []);

  // ─── Load pickups ───
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (adminChofer) params.set('chofer', adminChofer);
      const r = await fetch(`/api/pickups?${params}`);
      const j = await r.json();
      if (j.ok) setPickups(j.data || []);
    } catch {}
    setLoading(false);
  }, [adminChofer]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { const iv = setInterval(load, 25000); return () => clearInterval(iv); }, [load]);

  // ─── Init map ───
  const initMap = useCallback((lat = 25.8, lng = -80.3, zoom = 10) => {
    if (!mapReady || !mapContainerRef.current || !LRef.current) return;
    const L = LRef.current;
    if (!mapInstRef.current) {
      mapInstRef.current = L.map(mapContainerRef.current, { center: [lat, lng], zoom, zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '', maxZoom: 18 }).addTo(mapInstRef.current);
    }
  }, [mapReady]);

  // ─── Render markers ───
  const renderMarkers = useCallback(() => {
    if (!mapInstRef.current || !LRef.current) return;
    const L = LRef.current;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }

    const active = pickups.filter(p => p.estado !== 'cancelado');
    if (active.length === 0) return;

    const displayList = optimizedRoute.length > 0 && view === 'admin' ? optimizedRoute : active;
    const bounds: any[] = [];

    // Route line (admin optimized)
    if (routeData && routeData.route.length > 1 && view === 'admin') {
      routeLineRef.current = L.polyline(routeData.route, {
        color: RUTA, weight: 4, opacity: 0.8, dashArray: '12, 8', lineCap: 'round',
      }).addTo(mapInstRef.current);
    }

    displayList.forEach((p, idx) => {
      const isVerde = p.estado === 'esperando';
      const color = isVerde ? VERDE : MORADO;
      const showNum = optimizedRoute.length > 0 && view === 'admin';
      const icon = L.icon({
        iconUrl: pinSVG(color, showNum ? idx + 1 : undefined, isVerde),
        iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46],
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(mapInstRef.current);
      const estadoLabel = isVerde ? 'En Espera' : 'Recogido';
      const estadoColor = isVerde ? VERDE : MORADO;
      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:180px;">
          <strong style="font-size:13px;">${p.nombre}</strong>
          <div style="font-size:11px;color:#666;margin-top:2px;">${p.direccion}</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${estadoColor};display:inline-block;"></span>
            <span style="font-size:11px;font-weight:600;color:${estadoColor};">${estadoLabel}</span>
          </div>
          ${p.choferAsignado ? `<div style="font-size:11px;margin-top:4px;color:#555;">Chofer: ${p.choferAsignado}</div>` : ''}
          ${p.telefono ? `<a href="tel:${p.telefono}" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;font-weight:600;">${p.telefono}</a>` : ''}
        </div>
      `);
      bounds.push([p.lat, p.lng]);
      markersRef.current.push(marker);
    });

    if (bounds.length > 0) mapInstRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    setTimeout(() => mapInstRef.current?.invalidateSize(), 100);
  }, [pickups, optimizedRoute, routeData, view, mapReady]);

  // Map init on view change
  useEffect(() => {
    setTimeout(() => { initMap(); renderMarkers(); }, 150);
  }, [view, showForm, initMap, renderMarkers]);
  useEffect(() => { if (mapInstRef.current) renderMarkers(); }, [renderMarkers]);

  // ─── GPS location ───
  const getLocation = useCallback(() => {
    setLocating(true);
    if (!navigator.geolocation) { toast.error('Tu navegador no soporta GPS'); setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setForm(f => ({ ...f, lat, lng }));
        setLocating(false);
        const dir = await reverseGeocode(lat, lng);
        if (dir) setForm(f => ({ ...f, direccion: dir.split(',').slice(0, 3).join(',') }));
      },
      () => { toast.error('Activa tu ubicacion en el telefono'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  // ─── Submit pickup ───
  const handleSubmit = async () => {
    if (!form.nombre.trim()) { toast.error('Pon tu nombre'); return; }
    if (form.lat === 0 && form.lng === 0) { toast.error('Espera a tu ubicacion GPS'); return; }
    setSubmitting(true);
    try {
      const r = await fetch('/api/pickups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, direccion: form.direccion || `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}` }),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success('Tu punto esta VERDE en el mapa. Un chofer te recogera pronto.');
        setForm({ nombre: '', telefono: '', direccion: '', lat: 0, lng: 0, notas: '' });
        setShowForm(false);
        load();
      } else toast.error(j.error || 'Error');
    } catch { toast.error('Error de conexion'); }
    setSubmitting(false);
  };

  // ─── Admin: update pickup ───
  const updatePickup = async (id: number, data: any) => {
    try {
      const r = await fetch('/api/pickups', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-key': 'chambatina2024' },
        body: JSON.stringify({ id, ...data }),
      });
      const j = await r.json();
      if (j.ok) load(); else toast.error(j.error || 'Error');
    } catch { toast.error('Error de conexion'); }
  };

  const deletePickup = async (id: number) => {
    try {
      const r = await fetch(`/api/pickups?id=${id}`, { method: 'DELETE', headers: { 'x-admin-key': 'chambatina2024' } });
      const j = await r.json();
      if (j.ok) { toast.success('Eliminada'); load(); }
    } catch {}
  };

  // ─── Admin: optimize route ───
  const handleOptimize = async () => {
    const esperando = pickups.filter(p => p.estado === 'esperando');
    if (esperando.length < 2) { toast.error('Se necesitan al menos 2 clientes en verde'); return; }
    setOptimizing(true);
    try {
      const ordered = optimizeOrder(esperando);
      setOptimizedRoute(ordered);
      const result = await calcRoute(ordered.map(p => ({ lat: p.lat, lng: p.lng })));
      setRouteData(result);
      for (let i = 0; i < ordered.length; i++) await updatePickup(ordered[i].id, { ordenRuta: i + 1 });
      toast.success(`Ruta optimizada: ${ordered.length} paradas, ${fmtDist(result.totalDistance)}, ${fmtTime(result.totalDuration)}`);
    } catch (err: any) {
      toast.error('Error al calcular ruta: ' + (err.message || ''));
    }
    setOptimizing(false);
  };

  // ─── Stats ───
  const esperandoCount = pickups.filter(p => p.estado === 'esperando').length;
  const recogidosCount = pickups.filter(p => p.estado === 'recogido').length;

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN LOGIN
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'admin' && !adminLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <motion.div {...fadeUp} className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-8 h-8 text-purple-600" />
            </div>
            <h1 className="text-xl font-bold text-zinc-900">Administracion</h1>
            <p className="text-sm text-zinc-500 mt-1">CargoCuba Recogidas</p>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <input
                type={adminPassword ? 'password' : 'text'}
                placeholder="Clave de administrador"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adminPassword === 'chambatina2024' && (() => { setAdminLoggedIn(true); toast.success('Bienvenido admin'); })()}
                className="w-full h-12 px-4 pr-10 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-zinc-50"
              />
              <button onClick={() => { /* toggle visibility */ }} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                {adminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={() => { if (adminPassword === 'chambatina2024') { setAdminLoggedIn(true); toast.success('Bienvenido admin'); } else toast.error('Clave incorrecta'); }}
              className="w-full h-12 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 transition-all shadow-lg"
              style={{ touchAction: 'manipulation' }}
            >
              Entrar
            </button>
          </div>
          <button onClick={() => setView('cliente')} className="w-full mt-4 text-center text-sm text-zinc-400 hover:text-zinc-600 flex items-center justify-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Volver al mapa
          </button>
        </motion.div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-screen">

      {/* ═══ HEADER ═══ */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-bold text-base">CargoCuba</h2>
            <p className="text-emerald-100 text-[11px] flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-200 inline-block" /> {esperandoCount} en espera</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-300 inline-block" /> {recogidosCount} recogidos</span>
            </p>
          </div>
        </div>
        <div className="flex bg-white/20 rounded-xl p-0.5">
          {(['cliente', 'admin'] as const).map(v => (
            <button key={v} onClick={() => { setView(v); setOptimizedRoute([]); setRouteData(null); }}
              className={`text-xs font-medium px-4 py-1.5 rounded-lg transition-all ${
                view === v ? 'bg-white text-emerald-700 shadow-sm' : 'text-white/80 hover:text-white'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              {v === 'cliente' ? 'Pedir Recogida' : 'Admin'}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CLIENTE VIEW — Toca el carrito, nombre, direccion, se enciende VERDE
          ═══════════════════════════════════════════════════════════════════ */}
      {view === 'cliente' && (
        <div className="flex-1 overflow-y-auto bg-zinc-50">
          <div className="max-w-lg mx-auto p-4 space-y-4">

            {/* Hero */}
            <motion.div {...fadeUp} className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-500 rounded-2xl p-5 text-white">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-10 translate-x-10" />
              <div className="relative">
                <ShoppingCart className="h-8 w-8 mb-3 opacity-90" />
                <h3 className="text-lg font-bold">Solicita tu recogida</h3>
                <p className="text-emerald-100 text-xs mt-1.5 leading-relaxed">
                  Toca el carrito, pon tu nombre y direccion. Tu punto se encendera en <b className="text-emerald-200">VERDE</b> en el mapa.
                  Cuando el chofer recoja tu paquete, cambiara a <b className="text-purple-200">MORADO</b>.
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-300" /><span className="text-[11px]">Esperando</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-400" /><span className="text-[11px]">Recogido</span></div>
                </div>
              </div>
            </motion.div>

            {/* CARRITO BUTTON */}
            {!showForm && (
              <motion.button
                {...fadeUp}
                onClick={() => { setShowForm(true); getLocation(); }}
                className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-bold text-base flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 active:scale-[0.98]"
                style={{ touchAction: 'manipulation' }}
              >
                <ShoppingCart className="h-7 w-7" />
                Pedir Recogida
              </motion.button>
            )}

            {/* FORM */}
            {showForm && (
              <motion.div {...fadeUp} className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-zinc-800">Nueva Recogida</h4>
                  <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center">
                    <X className="h-4 w-4 text-zinc-500" />
                  </button>
                </div>

                {/* GPS status */}
                <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold ${
                  form.lat !== 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : form.lat !== 0 ? <Check className="h-5 w-5" /> : <MapPin className="h-4 w-4" />}
                  {locating ? 'Obteniendo ubicacion GPS...' : form.lat !== 0 ? 'Ubicacion detectada correctamente' : 'Detectando ubicacion...'}
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">Tu nombre *</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: Maria Garcia"
                    className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">Telefono</label>
                  <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="+1 786 xxx xxxx"
                    className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">Direccion (se autocompleta con GPS)</label>
                  <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                    placeholder="Tu direccion se llena con el GPS..."
                    className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">Notas (tamano, horario...)</label>
                  <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                    placeholder="Ej: Caja mediana, estoy hasta las 5pm"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50 resize-none" />
                </div>

                <button onClick={handleSubmit}
                  disabled={submitting || form.lat === 0 || !form.nombre.trim()}
                  className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                  style={{ touchAction: 'manipulation' }}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {submitting ? 'Enviando...' : 'Confirmar — Encender mi punto en VERDE'}
                </button>
              </motion.div>
            )}

            {/* MAP */}
            <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-zinc-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-600">Mapa de Recogidas</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500" /> En espera</span>
                  <span className="flex items-center gap-1 text-[10px] text-purple-600"><span className="w-2 h-2 rounded-full bg-purple-500" /> Recogido</span>
                </div>
              </div>
              <div ref={mapContainerRef} className="w-full" style={{ height: showForm ? '250px' : '300px' }} />
            </div>

            {/* Status list */}
            {pickups.filter(p => p.estado !== 'cancelado').length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">Estado de Recogidas</p>
                {pickups.filter(p => p.estado !== 'cancelado').slice(-5).reverse().map(p => {
                  const isEsp = p.estado === 'esperando';
                  return (
                    <div key={p.id} className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full flex-shrink-0 ${isEsp ? 'bg-emerald-500' : 'bg-purple-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-zinc-800">{p.nombre}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{p.direccion}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isEsp ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                        {isEsp ? 'Espera' : 'Recogido'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ADMIN VIEW — Ve clientes, asigna chofer, optimiza ruta
          ═══════════════════════════════════════════════════════════════════ */}
      {view === 'admin' && adminLoggedIn && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Admin toolbar */}
          <div className="bg-white border-b border-zinc-200 px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
            <select value={adminChofer} onChange={e => setAdminChofer(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-zinc-200 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
              <option value="">Todos los chofers</option>
              {CHOFERES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex-1" />
            <div className="flex items-center gap-3 mr-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {esperandoCount}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-purple-700">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> {recogidosCount}
              </span>
            </div>
            <button onClick={handleOptimize} disabled={optimizing || esperandoCount < 2}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 hover:bg-emerald-700 disabled:opacity-40 transition-all shadow-sm"
              style={{ touchAction: 'manipulation' }}>
              {optimizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {optimizing ? 'Calculando...' : 'Optimizar Ruta'}
            </button>
            {optimizedRoute.length > 0 && (
              <button onClick={() => { setOptimizedRoute([]); setRouteData(null); }}
                className="w-8 h-8 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-400 hover:bg-zinc-50">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Route summary */}
          {routeData && optimizedRoute.length > 0 && (
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
              <Route className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-blue-800">Ruta optimizada: {optimizedRoute.length} paradas</p>
                <p className="text-[10px] text-blue-600">{fmtDist(routeData.totalDistance)} total · {fmtTime(routeData.totalDuration)} estimado</p>
              </div>
            </div>
          )}

          {/* Map + List */}
          <div className="flex-1 flex overflow-hidden">
            {/* Map */}
            <div className="flex-1 relative min-h-[300px]">
              {!mapReady && (
                <div className="absolute inset-0 z-10 bg-zinc-100 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" />
                </div>
              )}
              <div ref={mapContainerRef} className="w-full h-full" />

              {/* Route order overlay */}
              {optimizedRoute.length > 0 && routeData && (
                <div className="absolute top-2 right-2 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-zinc-200 p-2.5 max-w-[200px] max-h-[50vh] overflow-y-auto">
                  <p className="text-[10px] font-bold text-zinc-600 mb-1.5 px-0.5">ORDEN DE RECOGIDA</p>
                  {optimizedRoute.map((p, i) => (
                    <div key={p.id} className="flex items-start gap-1.5 py-0.5">
                      <div className="w-4 h-4 rounded-full bg-blue-600 text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-800 truncate leading-tight">{p.nombre}</p>
                        {routeData.legs[i] && <p className="text-[8px] text-blue-500">{fmtDist(routeData.legs[i].distance)} · {fmtTime(routeData.legs[i].duration)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar (desktop) */}
            <div className="hidden lg:flex flex-col w-96 border-l border-zinc-200 bg-white overflow-hidden flex-shrink-0">
              <div className="px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/50">
                <p className="text-xs font-bold text-zinc-700">Clientes ({pickups.filter(p => p.estado !== 'cancelado').length})</p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-50">
                {loading ? (
                  <div className="flex items-center justify-center h-24"><Loader2 className="h-5 w-5 text-zinc-300 animate-spin" /></div>
                ) : pickups.length === 0 ? (
                  <div className="p-8 text-center">
                    <Users className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                    <p className="text-xs text-zinc-400">Sin solicitudes aun</p>
                  </div>
                ) : (
                  (optimizedRoute.length > 0 ? optimizedRoute : pickups).map(p => (
                    <AdminCard key={p.id} pickup={p}
                      onUpdate={updatePickup} onDelete={deletePickup}
                      routeIdx={optimizedRoute.indexOf(p)}
                      showRouteNum={optimizedRoute.length > 0}
                      leg={routeData?.legs[optimizedRoute.indexOf(p)]} />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Mobile list */}
          <div className="lg:hidden border-t border-zinc-200 bg-white max-h-[40vh] overflow-y-auto">
            {pickups.length === 0 ? (
              <div className="p-6 text-center"><p className="text-xs text-zinc-400">Sin solicitudes</p></div>
            ) : (
              (optimizedRoute.length > 0 ? optimizedRoute : pickups).map(p => (
                <AdminCard key={p.id} pickup={p}
                  onUpdate={updatePickup} onDelete={deletePickup}
                  routeIdx={optimizedRoute.indexOf(p)}
                  showRouteNum={optimizedRoute.length > 0}
                  leg={routeData?.legs[optimizedRoute.indexOf(p)]} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN CARD
// ═══════════════════════════════════════════════════════════════════════════

function AdminCard({ pickup, onUpdate, onDelete, routeIdx, showRouteNum, leg }: {
  pickup: Pickup;
  onUpdate: (id: number, data: any) => void;
  onDelete: (id: number) => void;
  routeIdx: number;
  showRouteNum: boolean;
  leg?: { duration: number; distance: number };
}) {
  const isEsp = pickup.estado === 'esperando';
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={isEsp ? { borderLeft: `3px solid ${VERDE}` } : pickup.estado === 'recogido' ? { borderLeft: `3px solid ${MORADO}` } : {}}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-zinc-50 transition-colors"
        style={{ touchAction: 'manipulation' }}>

        {showRouteNum ? (
          <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {routeIdx + 1}
          </div>
        ) : (
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isEsp ? 'bg-emerald-500' : 'bg-purple-500'}`} />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-zinc-800 truncate">{pickup.nombre}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isEsp ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
              {isEsp ? 'ESPERA' : 'RECOGIDO'}
            </span>
          </div>
          <p className="text-[10px] text-zinc-400 truncate">{pickup.direccion}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {leg && leg.distance > 0 && <span className="text-[9px] text-blue-500 font-medium">{fmtDist(leg.distance)}</span>}
          {pickup.telefono && (
            <a href={`tel:${pickup.telefono}`} onClick={e => e.stopPropagation()}
              className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Phone className="h-3 w-3" />
            </a>
          )}
          <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            {pickup.telefono && <div><span className="text-zinc-400">Telefono:</span> <a href={`tel:${pickup.telefono}`} className="text-blue-600 font-medium">{pickup.telefono}</a></div>}
            <div><span className="text-zinc-400">Coords:</span> <span className="text-zinc-600">{pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)}</span></div>
            {pickup.choferAsignado && <div><span className="text-zinc-400">Chofer:</span> <span className="text-zinc-700 font-medium">{pickup.choferAsignado}</span></div>}
            <div><span className="text-zinc-400">Creada:</span> <span className="text-zinc-600">{new Date(pickup.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            {pickup.notas && <div className="col-span-2"><span className="text-zinc-400">Notas:</span> <span className="text-zinc-600">{pickup.notas}</span></div>}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {isEsp ? (
              <button onClick={() => onUpdate(pickup.id, { estado: 'recogido', fechaRecogida: new Date().toISOString() })}
                className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-all"
                style={{ touchAction: 'manipulation' }}>
                <Check className="h-3 w-3" /> Marcar Recogido
              </button>
            ) : pickup.estado === 'recogido' ? (
              <button onClick={() => onUpdate(pickup.id, { estado: 'esperando', fechaRecogida: null })}
                className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all">
                <RotateCcw className="h-3 w-3" /> Volver a Espera
              </button>
            ) : null}

            <button onClick={() => { if (confirm('Eliminar?')) onDelete(pickup.id); }}
              className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-all">
              <Trash2 className="h-3 w-3" /> Eliminar
            </button>

            <div className="flex-1" />

            <select value={pickup.choferAsignado || ''} onChange={e => onUpdate(pickup.id, { choferAsignado: e.target.value || null })}
              className="h-7 px-2 rounded-lg border border-zinc-200 text-[10px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 max-w-[130px]">
              <option value="">Sin chofer</option>
              {CHOFERES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}