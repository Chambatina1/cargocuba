// =============================================
// Utilidades geo compartidas (extraidas del monolito page.tsx)
// =============================================

// Haversine en km
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

export function distMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 0.621371;
}

export function fmtDist(m: number): string {
  const mi = m * 0.000621371;
  return mi < 0.1 ? `${Math.round(m)} m` : `${mi.toFixed(1)} mi`;
}

export function fmtTime(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function absoluteETA(cumSeconds: number): string {
  const d = new Date(Date.now() + cumSeconds * 1000);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Proyecta un punto P sobre el segmento AB; devuelve el punto mas cercano y
// el parametro t en [0,1] (posicion a lo largo del segmento). Usado por la
// interpolacion del tracking para "enganchar" el GPS del chofer a la polyline.
export function projectToSegment(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): { lat: number; lng: number; t: number } {
  const ax = aLng, ay = aLat, bx = bLng, by = bLat, px = pLng, py = pLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { lat: aLat, lng: aLng, t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { lat: ay + t * dy, lng: ax + t * dx, t };
}

// Colores para rutas por chofer (mismo esquema visual que el monolito original)
export const GRUPO_COLORES = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#e11d48'];
export function getGrupoColor(idx: number): string {
  return GRUPO_COLORES[idx % GRUPO_COLORES.length];
}

export const VERDE = '#16a34a';
export const MORADO = '#9333ea';
export const RUTA_AZUL = '#2563eb';
export const ROJO_BASE = '#dc2626';
