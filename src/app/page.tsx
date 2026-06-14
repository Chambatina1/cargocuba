'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShoppingCart, MapPin, Route, Trash2, Check, X, Phone,
  Truck, Loader2, ChevronRight, Zap, RotateCcw, Users, Shield,
  Navigation, Crosshair, ArrowLeft, Radar, Map, Clock, Search
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

// ─── Haversine (returns km) ────────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distMilesFromBase(lat: number, lng: number): number {
  return haversine(BASE_LAT, BASE_LNG, lat, lng) * 0.621371;
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

// ─── Forward Geocode (Nominatim) ────────────────────────────────────────
async function forwardGeocode(query: string): Promise<GeoSuggestion[]> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us&accept-language=es`, {
      headers: { 'User-Agent': 'CargoCuba-App/1.0' }
    });
    const j = await r.json(); return (j || []).slice(0, 5);
  } catch { return []; }
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
  const watchIdRef = useRef<number | null>(null);

  // ─── Follow Driver Mode ───
  const [followingDriver, setFollowingDriver] = useState(false);
  const [followDriverPhone, setFollowDriverPhone] = useState<string | null>(null);

  // ─── Admin (no password — direct access) ───
  const [adminChofer, setAdminChofer] = useState('');
  const [adminTab, setAdminTab] = useState<'lista' | 'distancias' | 'ruta'>('lista');
  const [distMatrix, setDistMatrix] = useState<{ from: string; to: string; distMi: number }[]>([]);
  const [calculatingDist, setCalculatingDist] = useState(false);
  const [scheduledDriver, setScheduledDriver] = useState('');
  const [scheduling, setScheduling] = useState(false);

  // ─── Select Mode (tap markers to measure distances) ───
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectLinesRef = useRef<any[]>([]);
  const [selectRouteData, setSelectRouteData] = useState<{ totalDistance: number; totalDuration: number; legs: { duration: number; distance: number }[] } | null>(null);
  const [calcSelectRoute, setCalcSelectRoute] = useState(false);

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

    // Clear preview marker if exists
    if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; }

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
    baseM.bindPopup(`<div style="font-family:system-ui;min-width:160px;"><strong style="font-size:13px;">Base</strong><div style="font-size:11px;color:#666;margin-top:2px;">${BASE_NAME}</div><div style="margin-top:4px;font-size:10px;color:#dc2626;font-weight:600;">Punto de partida</div></div>`);
    bounds.push([BASE_LAT, BASE_LNG]); markersRef.current.push(baseM);

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
        marker.bindPopup(`<div style="font-family:system-ui;min-width:180px;"><strong style="font-size:13px;">${p.nombre}</strong><div style="font-size:11px;color:#666;margin-top:2px;">${p.direccion}</div><div style="margin-top:4px;font-size:11px;color:#dc2626;font-weight:600;">${distFromBase} mi de la Base</div>${p.horarioReady ? `<div style="margin-top:4px;font-size:11px;color:#2563eb;font-weight:600;">Ready: ${p.horarioReady}</div>` : ''}<div style="margin-top:6px;display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${estadoColor};display:inline-block;"></span><span style="font-size:11px;font-weight:600;color:${estadoColor};">${estadoLabel}</span></div>${p.choferAsignado ? `<div style="font-size:11px;margin-top:4px;color:#555;">Chofer: ${p.choferAsignado}</div>` : ''}${p.telefono ? `<a href="tel:${p.telefono}" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;font-weight:600;">${p.telefono}</a>` : ''}</div>`);
      }
      bounds.push([p.lat, p.lng]); markersRef.current.push(marker);
    });

    // ─── DRIVER markers (blue truck with pulse + accuracy circle) ───
    drivers.filter(d => d.activo).forEach(d => {
      // Accuracy circle around driver
      const accuracyCircle = L.circle([d.lat, d.lng], {
        radius: 30,
        color: CHOFER_COLOR,
        fillColor: CHOFER_COLOR,
        fillOpacity: 0.08,
        weight: 2,
        opacity: 0.3,
      }).addTo(mapInstRef.current);
      markersRef.current.push(accuracyCircle);

      // Pulsing outer ring
      const pulseIcon = L.divIcon({
        html: `<div style="position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:60px;height:60px;border-radius:50%;background:rgba(37,99,235,0.15);animation:driverPulse 2s ease-out infinite;"></div>
          <div style="position:absolute;width:44px;height:44px;border-radius:50%;background:rgba(37,99,235,0.25);animation:driverPulse 2s ease-out infinite 0.5s;"></div>
          <div style="width:36px;height:36px;background:${CHOFER_COLOR};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(37,99,235,0.6);z-index:2;position:relative;">
            <span style="font-size:16px;">🚛</span>
          </div>
          <div style="position:absolute;top:0;right:2px;width:12px;height:12px;background:#22c55e;border:2px solid #fff;border-radius:50%;z-index:3;animation:liveDot 1.5s ease-in-out infinite;"></div>
        </div>
        <style>@keyframes driverPulse{0%{transform:scale(0.5);opacity:1}100%{transform:scale(1.3);opacity:0}}@keyframes liveDot{0%,100%{opacity:1}50%{opacity:0.3}}</style>`,
        className: '', iconSize: [60, 60], iconAnchor: [30, 30],
      });
      const dM = L.marker([d.lat, d.lng], { icon: pulseIcon, zIndexOffset: 3000 }).addTo(mapInstRef.current);
      const distFromBase = distMilesFromBase(d.lat, d.lng).toFixed(1);
      dM.bindPopup(`<div style="font-family:system-ui;min-width:180px;"><strong style="font-size:13px;">${d.nombre}</strong><div style="font-size:11px;color:${CHOFER_COLOR};font-weight:600;margin-top:2px;">Chofer EN VIVO</div><div style="font-size:11px;color:#666;margin-top:2px;">${d.phone}</div><div style="margin-top:4px;font-size:11px;color:#dc2626;font-weight:600;">${distFromBase} mi de la Base</div></div>`);
      bounds.push([d.lat, d.lng]); markersRef.current.push(dM);
    });

    // Only auto-fit if NOT following a driver
    if (!followingDriver) {
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
  const handleSearchAddress = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
    setSearching(true); setShowSuggestions(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await forwardGeocode(q);
      setSuggestions(results); setSearching(false);
    }, 400);
  }, []);

  const selectSuggestion = useCallback((s: GeoSuggestion) => {
    const lat = parseFloat(s.lat), lng = parseFloat(s.lon);
    const shortAddr = s.display_name.split(',').slice(0, 3).join(',');
    setForm(f => ({ ...f, lat, lng, direccion: shortAddr }));
    setSearchQuery(shortAddr); setShowSuggestions(false); setSuggestions([]);
    // Place RED preview pin on map
    if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; }
    if (mapInstRef.current && LRef.current) {
      const L = LRef.current;
      const icon = L.icon({ iconUrl: pinSVG('#dc2626'), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46] });
      previewMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 5000 }).addTo(mapInstRef.current);
      previewMarkerRef.current.bindPopup(`<div style="font-family:system-ui;"><strong style="font-size:12px;">Vista Previa</strong><div style="font-size:10px;color:#dc2626;font-weight:600;">Punto rojo = se hara VERDE al enviar</div></div>`);
      mapInstRef.current.setView([lat, lng], 16, { animate: true });
    }
  }, []);

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

  // ═══════════════════════════════════════════════════════════════════════════
  // DRIVER: GPS TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  const startDriverTracking = useCallback(() => {
    if (!driverPhone.trim() || !driverName.trim()) { toast.error('Pon tu telefono y nombre'); return; }
    if (!navigator.geolocation) { toast.error('GPS no disponible'); return; }

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

  // ─── Compute distance matrix between all pickups + base ───
  const handleCalcDistances = async () => {
    const active = pickups.filter(p => p.estado !== 'cancelado');
    if (active.length < 2) { toast.error('Necesitas al menos 2 clientes'); return; }
    setCalculatingDist(true);
    try {
      // Build pairwise distances using haversine (fast, no API needed)
      const matrix: { from: string; to: string; distMi: number }[] = [];
      const all = [{ name: 'BASE', lat: BASE_LAT, lng: BASE_LNG }, ...active.map(p => ({ name: p.nombre, lat: p.lat, lng: p.lng }))];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const dMi = haversine(all[i].lat, all[i].lng, all[j].lat, all[j].lng) * 0.621371;
          matrix.push({ from: all[i].name, to: all[j].name, distMi: Math.round(dMi * 10) / 10 });
        }
      }
      setDistMatrix(matrix);
      setAdminTab('distancias');
      toast.success(`Matriz de distancias: ${all.length} puntos, ${matrix.length} pares`);
    } catch (err: any) { toast.error('Error: ' + (err.message || '')); }
    setCalculatingDist(false);
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
      toast.success(`Ruta optimizada: ${ordered.length} paradas, ${fmtDist(result.totalDistance)}, ${fmtTime(result.totalDuration)}`);
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
  const routeStops = routeData && optimizedRoute.length > 0
    ? (() => {
        const stops: { name: string; distFromPrev: number; cumDist: number; timeFromPrev: number; cumTime: number; distFromBase: number; ready?: string }[] = [];
        let cumD = 0, cumT = 0;
        // Leg 0 = Base to stop 1
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
            distFromBase: haversine(BASE_LAT, BASE_LNG, p.lat, p.lng) * 0.621371,
            ready: p.horarioReady || undefined,
          });
        }
        return stops;
      })()
    : [];

  // ─── Stats ───
  const esperandoCount = pickups.filter(p => p.estado === 'esperando').length;
  const recogidosCount = pickups.filter(p => p.estado === 'recogido').length;
  const activeDriversCount = drivers.filter(d => d.activo).length;

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
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl shadow-2xl border font-bold text-[11px] transition-all ${
              followingDriver
                ? 'bg-blue-600 text-white border-blue-700 shadow-blue-200'
                : 'bg-white text-zinc-800 border-zinc-200 hover:bg-blue-50 hover:border-blue-300'
            }`}
            style={{ touchAction: 'manipulation' }}>
            {followingDriver ? (
              <>
                <Radar className="h-4 w-4 animate-spin" style={{ animationDuration: '3s' }} />
                <span>Siguiendo{followDriverPhone ? `: ${drivers.find(d => d.phone === followDriverPhone)?.nombre || ''}` : ''}</span>
              </>
            ) : (
              <>
                <Navigation className="h-4 w-4 text-blue-600" />
                <span>Seguir Chofer</span>
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center justify-center">{activeDriversCount}</span>
              </>
            )}
          </motion.button>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/80 backdrop-blur-sm border border-zinc-200 text-[10px] text-zinc-400">
            <Truck className="h-3.5 w-3.5" />
            Sin choferes activos
          </div>
        )}
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
            <Map className="h-4 w-4" />
            Ver Mapa
          </motion.button>
        )}
      </AnimatePresence>

      {/* ═══════════ BOTTOM BUTTONS (over map, only when no panel) ═══════════ */}
      {panel === 'none' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex gap-3">
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setSearchQuery(''); setSuggestions([]); setPanel('clientForm'); }}
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

          <motion.button whileTap={{ scale: 0.95 }} onClick={toggleSelectMode}
            className={`flex flex-col items-center gap-1.5 rounded-2xl px-5 py-3.5 shadow-2xl border relative ${selectMode ? 'bg-amber-500 border-amber-600' : 'bg-white border-zinc-100 hover:shadow-3xl'} transition-all`}
            style={{ touchAction: 'manipulation' }}>
            <div className={`w-11 h-11 rounded-full flex items-center justify-center ${selectMode ? 'bg-white' : 'bg-amber-500'}`}>
              <Route className={`h-5 w-5 ${selectMode ? 'text-amber-500' : 'text-white'}`} />
            </div>
            <span className={`text-[11px] font-bold ${selectMode ? 'text-white' : 'text-zinc-700'}`}>Medir</span>
            {selectMode && selectedIds.length > 0 && (
              <div className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 bg-white text-amber-600 text-[10px] font-bold rounded-full flex items-center justify-center px-1 border-2 border-amber-400">{selectedIds.length}</div>
            )}
          </motion.button>

          <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setAdminTab('lista'); setPanel('admin'); }}
            className="flex flex-col items-center gap-1.5 bg-white rounded-2xl px-5 py-3.5 shadow-2xl border border-zinc-100 hover:shadow-3xl transition-shadow"
            style={{ touchAction: 'manipulation' }}>
            <div className="w-11 h-11 rounded-full bg-purple-500 flex items-center justify-center"><Shield className="h-5 w-5 text-white" /></div>
            <span className="text-[11px] font-bold text-zinc-700">Admin</span>
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
                {locating ? 'Obteniendo GPS...' : form.lat !== 0 ? `Ubicacion lista (${distMilesFromBase(form.lat, form.lng).toFixed(1)} mi de la Base)` : 'Busca tu direccion o usa GPS'}
              </div>

              {/* Address search input with autocomplete */}
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    value={searchQuery}
                    onChange={e => handleSearchAddress(e.target.value)}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                    placeholder="Escribe tu direccion (ej: 123 Main St, Orlando)"
                    className="w-full h-11 pl-10 pr-10 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50"
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 animate-spin" />}
                  {!searching && searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-zinc-400 hover:text-zinc-600" /></button>
                  )}
                </div>
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => selectSuggestion(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 border-b border-zinc-50 last:border-0 flex items-start gap-2" style={{ touchAction: 'manipulation' }}>
                        <MapPin className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-zinc-700 leading-relaxed">{s.display_name.split(',').slice(0, 3).join(',')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* GPS fallback button */}
              <button onClick={getLocation} disabled={locating}
                className="w-full h-10 rounded-xl border border-dashed border-zinc-300 text-xs font-semibold text-zinc-500 hover:bg-zinc-50 hover:border-zinc-400 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                style={{ touchAction: 'manipulation' }}>
                <Crosshair className="h-3.5 w-3.5" />
                {locating ? 'Obteniendo GPS...' : 'O usar mi ubicacion GPS'}
              </button>

              {/* Hidden direccion (auto-filled from search) */}
              <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Direccion (auto o edita manualmente)" className="w-full h-11 px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-zinc-50" />

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
              <button onClick={() => { if (driverActive) stopDriverTracking(); setPanel('none'); }} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><ArrowLeft className="h-4 w-4 text-zinc-600" /></button>
              <h3 className="font-bold text-sm text-zinc-900 flex-1">Panel del Chofer</h3>
              {driverActive && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />EN VIVO</span>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Driver info form */}
              <div className="space-y-2.5">
                <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} placeholder="Tu telefono *" className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />
                <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Tu nombre *" className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />

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
              <button onClick={() => { setOptimizedRoute([]); setRouteData(null); setPanel('none'); }} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><ArrowLeft className="h-4 w-4 text-zinc-600" /></button>
              <h3 className="font-bold text-sm text-zinc-900 flex-1">Administracion</h3>
              <select value={adminChofer} onChange={e => setAdminChofer(e.target.value)} className="h-7 px-2 rounded-lg border border-zinc-200 text-[10px] bg-white">
                <option value="">Todos</option>{CHOFERES.map(c => <option key={c} value={c}>{c}</option>)}
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
              {(['lista', 'distancias', 'ruta'] as const).map(t => (
                <button key={t} onClick={() => setAdminTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${adminTab === t ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200' : 'text-zinc-400 hover:text-zinc-600'}`}
                  style={{ touchAction: 'manipulation' }}>
                  {t === 'lista' ? `Lista (${pickups.length})` : t === 'distancias' ? 'Distancias' : 'Ruta'}
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
                    <option value="">Chofer...</option>{CHOFERES.map(c => <option key={c} value={c}>{c}</option>)}
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
              pickups.length === 0 ? <div className="p-8 text-center"><Users className="h-7 w-7 text-zinc-300 mx-auto mb-2" /><p className="text-xs text-zinc-400">Sin solicitudes</p></div> :
              (optimizedRoute.length > 0 ? optimizedRoute : pickups).map(p => (
                <AdminCard key={p.id} pickup={p} onUpdate={updatePickup} onDelete={deletePickup}
                  routeIdx={optimizedRoute.indexOf(p)} showRouteNum={optimizedRoute.length > 0}
                  leg={routeData?.legs[optimizedRoute.indexOf(p) + 1]} />
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
                    <p className="text-[10px] font-bold text-red-600 mb-2 flex items-center gap-1"><MapPin className="h-3 w-3" />Desde la Base ({BASE_NAME})</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {distMatrix.filter(m => m.from === 'BASE').sort((a, b) => a.distMi - b.distMi).map((m, i) => (
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
                    <div className="w-8 h-8 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">B</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-zinc-800">Base — {BASE_NAME}</p>
                      <p className="text-[9px] text-zinc-500">Punto de partida</p>
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
                            <span className="text-[9px] text-red-500 font-semibold">{stop.distFromBase.toFixed(1)} mi de la Base</span>
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ ROUTE ORDER OVERLAY ON MAP ═══════════ */}
      {optimizedRoute.length > 0 && routeData && panel === 'admin' && adminTab === 'ruta' && (
        <div className="absolute top-14 left-3 z-[999] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-zinc-200 p-2.5 max-w-[220px] max-h-[50vh] overflow-y-auto">
          <p className="text-[10px] font-bold text-zinc-600 mb-1.5 flex items-center gap-1"><Clock className="h-3 w-3 text-blue-500" /> RUTA POR HORARIO READY</p>
          <div className="flex items-center gap-1.5 py-0.5 mb-1">
            <div className="w-4 h-4 rounded-full bg-red-500 text-white text-[7px] font-bold flex items-center justify-center">B</div>
            <p className="text-[9px] text-red-600 font-semibold truncate">{BASE_NAME}</p>
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

function AdminCard({ pickup, onUpdate, onDelete, routeIdx, showRouteNum, leg }: {
  pickup: Pickup; onUpdate: (id: number, data: any) => void; onDelete: (id: number) => void;
  routeIdx: number; showRouteNum: boolean; leg?: { duration: number; distance: number };
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
              <option value="">Sin chofer</option>{CHOFERES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}