// =============================================
// OSRM client - ruteo por calle real con fallback
// =============================================
// - calcRoute(points): polyline + distancia + duracion + legs
// - table(origins, destinations): matriz de duraciones (para el solver)
//
// Endpoints publicos de OSRM (sin clave). Si el principal cae, intenta el
// secundario. Si ambos fallan, retorna null y el caller usa haversine.
// =============================================

const OSRM_ENDPOINTS = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de',
];

export interface RouteResult {
  route: [number, number][];
  totalDistance: number;
  totalDuration: number;
  legs: { duration: number; distance: number }[];
}

export async function calcRoute(points: { lat: number; lng: number }[]): Promise<RouteResult | null> {
  if (points.length < 2) return { route: [], totalDistance: 0, totalDuration: 0, legs: [] };
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  for (const base of OSRM_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
        { signal: controller.signal },
      );
      clearTimeout(to);
      if (!res.ok) continue;
      const json = await res.json();
      if (json.code !== 'Ok' || !json.routes?.length) continue;
      const r = json.routes[0];
      return {
        route: r.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]),
        totalDistance: r.distance || 0,
        totalDuration: r.duration || 0,
        legs: (r.legs || []).map((l: any) => ({ duration: l.duration || 0, distance: l.distance || 0 })),
      };
    } catch {
      continue;
    }
  }
  return null;
}

// OSRM Table API: matriz de duraciones/distancias entre puntos.
// Devuelve [N][N] en metros y segundos. null si todos los endpoints fallan.
export async function table(points: { lat: number; lng: number }[]): Promise<{
  distances: number[][];
  durations: number[][];
} | null> {
  if (points.length < 2) return null;
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  for (const base of OSRM_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(
        `${base}/table/v1/driving/${coords}?annotations=duration,distance`,
        { signal: controller.signal },
      );
      clearTimeout(to);
      if (!res.ok) continue;
      const json = await res.json();
      if (json.code !== 'Ok' || !json.distances || !json.durations) continue;
      return {
        distances: json.distances as number[][],
        durations: json.durations as number[][],
      };
    } catch {
      continue;
    }
  }
  return null;
}
