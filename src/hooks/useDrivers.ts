'use client';
// =============================================
// Hook useDrivers - estado de choferes: REST + Socket.IO para tracking en vivo
// =============================================

import { useEffect, useState, useRef, useCallback } from 'react';
import { joinMap, emitDriverLocation, emitDriverOnline, emitDriverOffline } from '@/lib/driver-tracking/socket';

export interface Driver {
  phone: string;
  nombre: string;
  lat: number;
  lng: number;
  activo: boolean;
  updatedAt: string;
  mensaje?: string | null;
  precioServicio?: string | null;
  direccionRecojo?: string | null;
  comunidad?: string | null;
  puntoPartidaLat?: number | null;
  puntoPartidaLng?: number | null;
  puntoPartidaDir?: string | null;
  capacidad?: number;
  rutaActiva?: any;
  etaActual?: string | null;
  progreso?: number | null;
  velocidad?: number | null;
  heading?: number | null;
  currentStopId?: number | null;
}

async function fetchDrivers(): Promise<Driver[]> {
  const r = await fetch('/api/drivers');
  const j = await r.json();
  return j.data || [];
}

export function useDrivers() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [connected, setConnected] = useState(false);
  const initialized = useRef(false);

  // Carga inicial y refresco periodico via REST (fallback al socket)
  const refresh = useCallback(async () => {
    try { setDrivers(await fetchDrivers()); } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);

    // Socket.IO para updates en vivo (movimiento del chofer)
    const unsubscribe = joinMap({
      onSnapshot: (list) => {
        setConnected(true);
        // mergear posiciones en vivo sobre el estado REST
        setDrivers(prev => {
          const map = new Map(prev.map(d => [d.phone, d]));
          for (const live of list) {
            const existing = map.get(live.phone);
            map.set(live.phone, { ...(existing || {}), ...live } as Driver);
          }
          return Array.from(map.values());
        });
      },
      onDriverMoved: (live) => {
        setDrivers(prev => prev.map(d => d.phone === live.phone ? { ...d, ...live } : d));
      },
      onRouteProgress: (p) => {
        setDrivers(prev => prev.map(d => d.phone === p.phone ? {
          ...d, etaActual: p.eta ?? d.etaActual, progreso: p.progress ?? d.progreso,
          currentStopId: p.currentStopId ?? d.currentStopId,
        } : d));
      },
      onDriverOnline: (d) => {
        setDrivers(prev => prev.some(x => x.phone === d.phone)
          ? prev.map(x => x.phone === d.phone ? { ...x, activo: true } : x)
          : [...prev, { phone: d.phone, nombre: d.nombre || 'Chofer', lat: 0, lng: 0, activo: true, updatedAt: new Date().toISOString() }]);
      },
      onDriverOffline: (d) => {
        setDrivers(prev => prev.map(x => x.phone === d.phone ? { ...x, activo: false } : x));
      },
    });

    return () => { unsubscribe(); clearInterval(interval); };
  }, [refresh]);

  return { drivers, connected, refresh };
}

// Hook para que el chofer emita su GPS
export function useDriverEmitter() {
  return {
    sendLocation: emitDriverLocation,
    goOnline: emitDriverOnline,
    goOffline: emitDriverOffline,
  };
}
