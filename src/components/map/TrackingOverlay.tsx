'use client';
// =============================================
// TrackingOverlay - overlay de pantalla completa con mapa dedicado que muestra
// el tracking fluido de los choferes con interpolacion por tramos + rutas OR-Tools.
// =============================================
// Se monta por encima de todo (z-index alto). Tiene su propia instancia Leaflet
// para no acoplarse al mapa del monolito page.tsx. Usa:
//   - useDrivers (REST + Socket.IO en vivo)
//   - useActiveRoutes (rutas optimizadas con polyline)
//   - interpolate (movimiento frame a frame siguiendo la calle)
//
// Activado por el boton "Tracking en vivo" del page.tsx o del admin.
// =============================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Radio, Navigation } from 'lucide-react';
import { useDrivers } from '@/hooks/useDrivers';
import { useActiveRoutes } from '@/hooks/useOptimizedRoutes';
import { getGrupoColor, fmtDist, fmtTime } from '@/lib/routing/geo';
import {
  initTracking, ingestGps, tick, getProgress,
  type TrackingState,
} from '@/lib/driver-tracking/interpolate';

interface Props { onClose: () => void; }

interface DriverEntry {
  phone: string;
  color: string;
  polylineLayer: any;
  marker: any;
  accuracyCircle: any;
  tracking: TrackingState | null;
  routeId: number | null;
}

export default function TrackingOverlay({ onClose }: Props) {
  const { drivers } = useDrivers();
  const { data: routes = [] } = useActiveRoutes();
  const mapRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<any>(null);
  const mapInstRef = useRef<any>(null);
  const entriesRef = useRef<Map<string, DriverEntry>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(performance.now());
  const [ready, setReady] = useState(false);
  const [, force] = useState(0);

  // Init mapa dedicado
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled) return;
      LRef.current = L;
      if (!document.getElementById('leaflet-css-overlay')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css-overlay'; link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      if (mapRef.current && !mapInstRef.current) {
        mapInstRef.current = L.map(mapRef.current, { center: [28.6, -81.3], zoom: 11, zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '', maxZoom: 19 })
          .addTo(mapInstRef.current);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (mapInstRef.current) { mapInstRef.current.remove(); mapInstRef.current = null; }
    };
  }, []);

  // Sincronizar rutas activas -> polylines + estados
  useEffect(() => {
    if (!ready || !LRef.current || !mapInstRef.current) return;
    const L = LRef.current;
    const entries = entriesRef.current;
    const activePhones = new Set<string>();

    for (let idx = 0; idx < routes.length; idx++) {
      const route = routes[idx];
      if (route.estado !== 'activa') continue;
      const phone = route.choferPhone;
      activePhones.add(phone);
      const color = getGrupoColor(idx);
      const polyline = (route.polyline as [number, number][] | null) || [];

      let entry = entries.get(phone);
      if (!entry) {
        const polylineLayer = L.polyline([], {
          color, weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round',
        }).addTo(mapInstRef.current);
        const marker = L.marker([0, 0], {
          icon: L.divIcon({
            html: `<div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
              <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:${color}22;animation:tpulse 1.5s ease-out infinite;"></div>
              <div style="width:32px;height:32px;background:${color};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 14px ${color}cc;"><span style="font-size:18px;">🚛</span></div>
              <div style="position:absolute;top:2px;right:6px;width:13px;height:13px;background:#22c55e;border:2px solid #fff;border-radius:50%;animation:tlive 1s ease-in-out infinite;"></div>
            </div>
            <style>@keyframes tpulse{0%{transform:scale(0.5);opacity:1}100%{transform:scale(1.5);opacity:0}}@keyframes tlive{0%,100%{opacity:1}50%{opacity:0.2}}</style>`,
            className: '', iconSize: [48, 48], iconAnchor: [24, 24],
          }),
          zIndexOffset: 4000,
        }).addTo(mapInstRef.current);
        const accuracyCircle = L.circle([0, 0], {
          radius: 40, color, fillColor: color, fillOpacity: 0.06, weight: 2, opacity: 0.3,
        }).addTo(mapInstRef.current);
        entry = { phone, color, polylineLayer, marker, accuracyCircle, tracking: null, routeId: null };
        entries.set(phone, entry);
      }
      entry.routeId = route.id;
      entry.polylineLayer.setStyle({ color });
      entry.polylineLayer.setLatLngs(polyline);
      if (!entry.tracking && polyline.length > 1) {
        const stops = (route.secuencia || []).map((s: any) => ({
          id: String(s.pickupId), lat: 0, lng: 0, arrivalSec: s.arrivalSec || 0,
        }));
        entry.tracking = initTracking({ polyline, stops });
      }
    }

    // Limpiar choferes fuera
    for (const [phone, entry] of entries) {
      if (!activePhones.has(phone)) {
        try { entry.polylineLayer.remove(); entry.marker.remove(); entry.accuracyCircle.remove(); } catch {}
        entries.delete(phone);
      }
    }
  }, [ready, routes]);

  // Ingest GPS real
  useEffect(() => {
    if (!ready) return;
    const entries = entriesRef.current;
    for (const d of drivers) {
      if (!d.activo) continue;
      const entry = entries.get(d.phone);
      if (!entry || !entry.tracking) continue;
      const route = routes.find(r => r.choferPhone === d.phone);
      const poly = (route?.polyline as [number, number][]) || [];
      if (poly.length === 0) continue;
      ingestGps(entry.tracking, { polyline: poly, stops: [] }, d.lat, d.lng, Date.now());
    }
  }, [drivers, ready, routes]);

  // Loop de animacion
  useEffect(() => {
    if (!ready) return;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;
      for (const [, entry] of entriesRef.current) {
        if (!entry.tracking) continue;
        const route = routes.find(r => r.choferPhone === entry.phone);
        const poly = (route?.polyline as [number, number][]) || [];
        if (poly.length === 0) continue;
        tick(entry.tracking, { polyline: poly, stops: [] }, dt);
        entry.marker.setLatLng([entry.tracking.visualLat, entry.tracking.visualLng]);
        entry.accuracyCircle.setLatLng([entry.tracking.visualLat, entry.tracking.visualLng]);
      }
      force(n => (n + 1) % 1000000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [ready, routes]);

  // Auto-fit a las rutas activas (una vez)
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!ready || fittedRef.current || routes.length === 0) return;
    const all: [number, number][] = [];
    for (const r of routes) {
      const poly = (r.polyline as [number, number][]) || [];
      all.push(...poly);
    }
    if (all.length > 1 && mapInstRef.current) {
      mapInstRef.current.fitBounds(all, { padding: [60, 60], maxZoom: 13 });
      fittedRef.current = true;
    }
  }, [ready, routes]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: '#0f172a',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', background: 'rgba(15,23,42,0.95)', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'system-ui',
      }}>
        <Radio size={18} className="animate-pulse" color="#22c55e" />
        <strong style={{ fontSize: 14 }}>Tracking en vivo · Optimizador VRP</strong>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {drivers.filter(d => d.activo).length} choferes · {routes.filter(r => r.estado === 'activa').length} rutas
        </span>
        <button onClick={onClose} style={{
          marginLeft: 'auto', background: 'rgba(239,68,68,0.15)', border: 'none', color: '#fca5a5',
          padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <X size={14} /> Cerrar
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {/* Mapa */}
        <div ref={mapRef} style={{ flex: 1, minWidth: 0 }} />

        {/* Panel lateral de progreso de mision */}
        <div style={{
          width: 320, maxWidth: '40vw', background: 'rgba(15,23,42,0.92)', color: '#fff',
          overflowY: 'auto', padding: 12, borderLeft: '1px solid rgba(255,255,255,0.1)',
          fontFamily: 'system-ui',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10 }}>
            Misiones en curso
          </div>
          {routes.filter(r => r.estado === 'activa').length === 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 40 }}>
              No hay rutas activas.<br />
              <span style={{ fontSize: 11 }}>Optimiza una ruta desde el Admin → Rutas.</span>
            </div>
          )}
          {routes.filter(r => r.estado === 'activa').map((route, idx) => {
            const driver = drivers.find(d => d.phone === route.choferPhone);
            const entry = entriesRef.current.get(route.choferPhone);
            const progress = entry?.tracking ? getProgress(entry.tracking) : 0;
            const color = getGrupoColor(idx);
            const pct = Math.round(progress * 100);
            return (
              <div key={route.id} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12, marginBottom: 10,
                borderLeft: `4px solid ${color}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: 13 }}>🚛 {driver?.nombre || route.choferPhone}</strong>
                  <span style={{ fontSize: 11, color, fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.1)', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ background: color, height: '100%', width: `${pct}%`, transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>
                  <span>✓ {route.paradasHechas}/{route.paradasTotal}</span>
                  <span><Navigation size={9} /> {fmtDist(route.distanciaTotal)}</span>
                  <span>⏱ {fmtTime(route.duracionTotal)}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {[...route.stops].sort((a, b) => a.orden - b.orden).map(stop => {
                    const done = stop.estado === 'recogido';
                    const isCurrent = stop.estado === 'en_camino';
                    return (
                      <div key={stop.id} style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 5,
                        background: done ? 'rgba(34,197,94,0.25)' : isCurrent ? color : 'rgba(255,255,255,0.08)',
                        color: done ? '#86efac' : isCurrent ? '#fff' : '#cbd5e1',
                        fontWeight: isCurrent ? 700 : 500,
                        textDecoration: done ? 'line-through' : 'none',
                        opacity: done ? 0.6 : 1,
                      }}>
                        {stop.orden + 1}. #{stop.pickupId}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
