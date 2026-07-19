'use client';
// =============================================
// RutasTab - panel de optimizacion VRP con OR-Tools
// =============================================
// Pestaña del admin que:
//   1. Lista choferes activos con checkboxes (a optimizar)
//   2. Lista recogidas pendientes (a optimizar)
//   3. Boton "Optimizar con OR-Tools" -> llama /api/routing
//   4. Muestra rutas resultantes con secuencia, distancia, duracion, ETAs
//   5. Muestra rutas ACTIVAS en curso con progreso de mision
//
// Autónomo: usa useState/useEffect (sin react-query) para no requerir provider.
// =============================================

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Zap, Loader2, Route as RouteIcon, CheckCircle2, Clock, MapPin, Truck } from 'lucide-react';
import { fmtDist, fmtTime, getGrupoColor } from '@/lib/routing/geo';

interface Driver { phone: string; nombre: string; activo: boolean; puntoPartidaDir?: string | null; capacidad?: number; }
interface Pickup { id: number; nombre: string; direccion: string; estado: string; area: string | null; paquetes: number; }
interface ActiveRoute {
  id: number; choferPhone: string; estado: string; secuencia: any; polyline: [number, number][] | null;
  distanciaTotal: number; duracionTotal: number; paradasTotal: number; paradasHechas: number;
  solverUsed: string | null; stops: { id: number; pickupId: number; orden: number; estado: string; llegadaEstimada: string | null }[];
}
interface OptimizeResult {
  ok: boolean; routes: { routeId: number; choferPhone: string; vehicleId: string; stops: { id: string; orden: number; arrivalSec: number; distanceMeters: number }[]; totalDistance: number; totalDuration: number; load: number }[];
  unassigned: string[]; solverUsed: string; ms?: number; error?: string;
}

export default function RutasTab() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [activeRoutes, setActiveRoutes] = useState<ActiveRoute[]>([]);
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());
  const [selectedPickups, setSelectedPickups] = useState<Set<number>>(new Set());
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [dr, pk, rt] = await Promise.all([
        fetch('/api/drivers').then(r => r.json()),
        fetch('/api/pickups').then(r => r.json()),
        fetch('/api/routing?estado=activa').then(r => r.json()),
      ]);
      setDrivers(dr.data || []);
      setPickups((pk.data || []).filter((p: Pickup) => p.estado === 'esperando'));
      setActiveRoutes(rt.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 6000);
    return () => clearInterval(i);
  }, [load]);

  const activeDrivers = drivers.filter(d => d.activo);

  const toggleDriver = (phone: string) => {
    setSelectedDrivers(prev => { const s = new Set(prev); if (s.has(phone)) s.delete(phone); else s.add(phone); return s; });
  };
  const togglePickup = (id: number) => {
    setSelectedPickups(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const r = await fetch('/api/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverPhones: selectedDrivers.size > 0 ? Array.from(selectedDrivers) : undefined,
          pickupIds: selectedPickups.size > 0 ? Array.from(selectedPickups) : undefined,
          persist: true,
        }),
      });
      const j: OptimizeResult = await r.json();
      if (!j.ok) throw new Error(j.error);
      setResult(j);
      toast.success(`${j.routes.length} rutas optimizadas con ${j.solverUsed} (${j.ms}ms)`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Error optimizando');
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui', padding: 4, color: '#111' }}>
      {/* ── Accion de optimizacion ── */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Zap size={18} color="#2563eb" />
          <strong style={{ fontSize: 14 }}>Optimizador VRP (OR-Tools)</strong>
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
          Selecciona choferes y recogidas, o deja vacío para optimizar todo automáticamente.
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
            Choferes activos ({activeDrivers.length})
          </div>
          {activeDrivers.length === 0 && <div style={{ fontSize: 11, color: '#9ca3af' }}>No hay choferes activos</div>}
          {activeDrivers.map(d => (
            <label key={d.phone} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedDrivers.has(d.phone)} onChange={() => toggleDriver(d.phone)} />
              <span>🚛 {d.nombre}</span>
              {d.puntoPartidaDir && <span style={{ color: '#9ca3af', fontSize: 10 }}>· 🏠 {d.puntoPartidaDir}</span>}
              <span style={{ color: '#6b7280', fontSize: 10 }}>· cap. {d.capacidad || 20}</span>
            </label>
          ))}
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
            Recogidas pendientes ({pickups.length})
          </div>
          {pickups.length === 0 && <div style={{ fontSize: 11, color: '#9ca3af' }}>No hay recogidas pendientes</div>}
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            {pickups.slice(0, 40).map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedPickups.has(p.id)} onChange={() => togglePickup(p.id)} />
                <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                <span style={{ color: '#9ca3af' }}>· {p.direccion.slice(0, 35)}</span>
                {p.paquetes > 1 && <span style={{ color: '#ea580c', fontSize: 10 }}>· {p.paquetes} bultos</span>}
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleOptimize}
          disabled={optimizing || activeDrivers.length === 0 || pickups.length === 0}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10, border: 'none',
            background: optimizing ? '#93c5fd' : '#2563eb', color: '#fff',
            fontWeight: 700, fontSize: 13, cursor: optimizing ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {optimizing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {optimizing ? 'Optimizando...' : `Optimizar ruta${selectedDrivers.size > 1 || activeDrivers.length > 1 ? 's' : ''}`}
        </button>
      </div>

      {/* ── Rutas activas en curso ── */}
      {activeRoutes.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <RouteIcon size={16} color="#16a34a" />
            <strong style={{ fontSize: 13 }}>Rutas en curso ({activeRoutes.length})</strong>
          </div>
          {activeRoutes.map((route, idx) => {
            const color = getGrupoColor(idx);
            const driver = drivers.find(d => d.phone === route.choferPhone);
            const pct = route.paradasTotal > 0 ? Math.round((route.paradasHechas / route.paradasTotal) * 100) : 0;
            return (
              <motion.div key={route.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                style={{ borderLeft: `3px solid ${color}`, padding: '8px 10px', marginBottom: 8, background: '#f9fafb', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ fontSize: 12 }}>🚛 {driver?.nombre || route.choferPhone}</strong>
                  <span style={{ fontSize: 10, color: '#6b7280' }}>{route.solverUsed}</span>
                </div>
                <div style={{ background: '#e5e7eb', height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ background: color, height: '100%', width: `${pct}%`, transition: 'width 0.5s' }} />
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#6b7280', marginBottom: 6 }}>
                  <span><CheckCircle2 size={10} /> {route.paradasHechas}/{route.paradasTotal}</span>
                  <span><MapPin size={10} /> {fmtDist(route.distanciaTotal)}</span>
                  <span><Clock size={10} /> {fmtTime(route.duracionTotal)}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {[...route.stops].sort((a, b) => a.orden - b.orden).map(stop => {
                    const pickup = pickups.find(p => p.id === stop.pickupId);
                    const done = stop.estado === 'recogido';
                    const isCurrent = stop.estado === 'en_camino';
                    return (
                      <div key={stop.id} style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 6,
                        background: done ? '#dcfce7' : isCurrent ? color : '#f3f4f6',
                        color: done ? '#15803d' : isCurrent ? '#fff' : '#374151',
                        fontWeight: isCurrent ? 700 : 500,
                        textDecoration: done ? 'line-through' : 'none',
                        opacity: done ? 0.6 : 1,
                      }}>
                        {stop.orden + 1}. {pickup?.nombre || `#${stop.pickupId}`}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Resultado de la ultima optimizacion ── */}
      {result && result.routes.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginTop: 14, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Truck size={16} color="#2563eb" />
            <strong style={{ fontSize: 13 }}>Rutas optimizadas</strong>
            <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>{result.solverUsed} · {result.ms}ms</span>
          </div>
          {result.unassigned.length > 0 && (
            <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>
              ⚠ {result.unassigned.length} sin asignar por capacidad
            </div>
          )}
          {result.routes.map((r, idx) => {
            const color = getGrupoColor(idx);
            return (
              <div key={r.routeId} style={{ borderLeft: `3px solid ${color}`, padding: '8px 10px', marginBottom: 6, background: '#f9fafb', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  🚛 {r.choferPhone} · {fmtDist(r.totalDistance)} · {fmtTime(r.totalDuration)} · {r.load} bultos
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>
                  {r.stops.map((s, i) => {
                    const eta = new Date(s.arrivalSec * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    return <span key={i}>{i + 1}. #{s.id} ({eta}){i < r.stops.length - 1 ? ' → ' : ''}</span>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
