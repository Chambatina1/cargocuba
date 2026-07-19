'use client';
// =============================================
// Cliente Socket.IO hacia el tracking-server
// =============================================
// Conexion al mini-servicio tracking-server. La URL base se resuelve:
//   - TRACKING_URL (env) si esta configurado
//   - misma origin + puerto 3011 con query XTransformPort (Caddy)
//   - fallback localhost:3011 en dev
//
// Expone un singleton: getTrackingSocket() para reusar la misma conexion en
// toda la app, y helpers para enviar eventos como chofer o escuchar como mapa.
// =============================================

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

function resolveTrackingUrl(): string {
  if (process.env.NEXT_PUBLIC_TRACKING_URL) return process.env.NEXT_PUBLIC_TRACKING_URL;
  if (typeof window !== 'undefined') {
    // En dev, el tracking-server corre en localhost:3011
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3011';
    }
    // En produccion detras de Caddy: misma origin con query de puerto
    const port = process.env.NEXT_PUBLIC_TRACKING_PORT || '3011';
    return `${window.location.origin}/?XTransformPort=${port}`;
  }
  return 'http://localhost:3011';
}

export function getTrackingSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket) { socket.connect(); return socket; }
  socket = io(resolveTrackingUrl(), {
    path: '/tracking',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
  });
  socket.on('connect', () => console.log('[tracking-socket] conectado', socket?.id));
  socket.on('disconnect', (r) => console.warn('[tracking-socket] desconectado:', r));
  socket.on('connect_error', (e) => console.warn('[tracking-socket] error conexion:', e?.message));
  return socket;
}

// Suscribirse como observador del mapa (recibe driver-moved, route-progress)
export function joinMap(handlers: {
  onSnapshot?: (drivers: any[]) => void;
  onDriverMoved?: (d: any) => void;
  onRouteProgress?: (p: any) => void;
  onDriverOnline?: (d: any) => void;
  onDriverOffline?: (d: any) => void;
}): () => void {
  const s = getTrackingSocket();
  const wrap = (h?: (...a: any[]) => void) => (...a: any[]) => h?.(...a);
  const handlers2 = {
    'drivers-snapshot': (p: any) => handlers.onSnapshot?.(p?.drivers || []),
    'driver-moved': wrap(handlers.onDriverMoved),
    'route-progress': wrap(handlers.onRouteProgress),
    'driver-online': wrap(handlers.onDriverOnline),
    'driver-offline': wrap(handlers.onDriverOffline),
  };
  for (const [ev, fn] of Object.entries(handlers2)) s.on(ev, fn as any);
  s.emit('join-map', {});
  return () => {
    for (const [ev, fn] of Object.entries(handlers2)) s.off(ev, fn as any);
  };
}

// Enviar como chofer
export function emitDriverLocation(data: { phone: string; lat: number; lng: number; heading?: number; speed?: number; nombre?: string }): void {
  getTrackingSocket().emit('driver-location', data);
}
export function emitDriverOnline(phone: string, nombre?: string): void {
  getTrackingSocket().emit('driver-online', { phone, nombre });
}
export function emitDriverOffline(phone: string): void {
  getTrackingSocket().emit('driver-offline', { phone });
}
export function emitRouteProgress(data: { phone: string; eta?: string; progress?: number; currentStopId?: number; routeId?: number }): void {
  getTrackingSocket().emit('route-progress', data);
}
