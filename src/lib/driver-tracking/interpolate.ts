'use client';
// =============================================
// Interpolacion por tramos - tracking fluido del chofer
// =============================================
// Problema: el chofer envia GPS cada pocos segundos. Si simplemente movemos el
// marcador a cada update, el efecto es "teleport" (salto). Solucion:
//
//  1. Tenemos la polyline de la ruta asignada (array de [lat,lng] por calle real)
//  2. A cada GPS real, proyectamos el punto sobre la polyline y encontramos el
//     indice de progreso (que segmento y a que distancia).
//  3. Entre GPS reales, avanzamos la posicion visual frame a frame (rAF) a la
//     velocidad estimada, siguiendo la polyline. Esto da movimiento continuo.
//  4. Cuando llega el siguiente GPS, recalibramos (si el chofer se adelanto o
//     atraso respecto a la estimacion, corregimos suavemente).
//
// Salida: posicion visual actual [lat,lng], progreso 0..1, ETA y parada actual.
// =============================================

import { haversineM, projectToSegment } from '@/lib/routing/geo';

export interface RouteSnapshot {
  polyline: [number, number][];     // [[lat,lng], ...]
  stops: { id: string; lat: number; lng: number; arrivalSec: number }[];
}

export interface TrackingState {
  // indice del segmento actual en la polyline
  segIdx: number;
  // distancia acumulada recorrida sobre la polyline (metros)
  distanceTraveled: number;
  // longitud total de la polyline (metros)
  totalDistance: number;
  // longitud acumulada hasta cada nodo (para lookup rapido)
  cum: number[];
  // ultima posicion REAL del GPS (para recalibrar)
  lastReal: { lat: number; lng: number; ts: number } | null;
  // velocidad estimada (m/s) suavizada
  speedMps: number;
  // posicion visual actual
  visualLat: number;
  visualLng: number;
}

// Construye el estado inicial a partir de la ruta
export function initTracking(route: RouteSnapshot): TrackingState {
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < route.polyline.length; i++) {
    total += haversineM(
      route.polyline[i - 1][0], route.polyline[i - 1][1],
      route.polyline[i][0], route.polyline[i][1],
    );
    cum.push(total);
  }
  return {
    segIdx: 0,
    distanceTraveled: 0,
    totalDistance: total,
    cum,
    lastReal: null,
    speedMps: 0,
    visualLat: route.polyline[0]?.[0] ?? 0,
    visualLng: route.polyline[0]?.[1] ?? 0,
  };
}

// Recibe un GPS real y recalibra el estado (proyecta sobre la polyline)
export function ingestGps(state: TrackingState, route: RouteSnapshot, lat: number, lng: number, ts: number): TrackingState {
  // Proyectar el punto sobre cada segmento y quedarse con el mas cercano
  let bestSeg = 0, bestDist = Infinity, bestProjLat = lat, bestProjLng = lng;
  for (let i = 0; i < route.polyline.length - 1; i++) {
    const [aLat, aLng] = route.polyline[i];
    const [bLat, bLng] = route.polyline[i + 1];
    const proj = projectToSegment(lat, lng, aLat, aLng, bLat, bLng);
    const d = haversineM(lat, lng, proj.lat, proj.lng);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i;
      bestProjLat = proj.lat;
      bestProjLng = proj.lng;
      // distancia recorrida hasta este punto = cum[i] + t * long_segmento
      state.distanceTraveled = state.cum[i] + proj.t * (state.cum[i + 1] - state.cum[i]);
      state.segIdx = i;
    }
  }

  // Estimar velocidad con el GPS anterior (suavizado EMA)
  if (state.lastReal) {
    const dt = (ts - state.lastReal.ts) / 1000;
    if (dt > 0.5 && dt < 60) {
      const realDist = haversineM(state.lastReal.lat, state.lastReal.lng, lat, lng);
      const inst = realDist / dt;
      // filtrar outliers
      if (inst < 45) { // < ~100mph
        state.speedMps = state.speedMps > 0 ? state.speedMps * 0.5 + inst * 0.5 : inst;
      }
    }
  }
  state.lastReal = { lat, lng, ts };
  // La posicion visual arranca desde la proyeccion recalibrada (snap suave)
  state.visualLat = bestProjLat;
  state.visualLng = bestProjLng;
  return state;
}

// Avanza la posicion visual en dt segundos a velocidad estimada
// (llamar desde requestAnimationFrame con dt real)
export function tick(state: TrackingState, route: RouteSnapshot, dtSec: number): TrackingState {
  if (state.totalDistance <= 0) return state;
  const advance = state.speedMps * dtSec;
  state.distanceTraveled = Math.min(state.totalDistance, state.distanceTraveled + advance);
  // Encontrar el segmento que contiene distanceTraveled
  let i = state.segIdx;
  while (i < route.polyline.length - 2 && state.cum[i + 1] < state.distanceTraveled) i++;
  state.segIdx = i;
  const segLen = state.cum[i + 1] - state.cum[i];
  const t = segLen > 0 ? (state.distanceTraveled - state.cum[i]) / segLen : 0;
  const [aLat, aLng] = route.polyline[i];
  const [bLat, bLng] = route.polyline[i + 1] || route.polyline[i];
  state.visualLat = aLat + t * (bLat - aLat);
  state.visualLng = aLng + t * (bLng - aLng);
  return state;
}

// Progreso 0..1
export function getProgress(state: TrackingState): number {
  if (state.totalDistance <= 0) return 0;
  return Math.min(1, Math.max(0, state.distanceTraveled / state.totalDistance));
}

// Parada actual: la primera cuyo arrivalSec es futuro mas cercano,
// o basado en el progreso de distancia respecto a las paradas
export function getCurrentStop(state: TrackingState, route: RouteSnapshot): RouteSnapshot['stops'][number] | null {
  if (route.stops.length === 0) return null;
  // Calcular distancia a cada parada proyectando sobre la polyline
  let bestStop = route.stops[0], bestDelta = Infinity;
  for (const s of route.stops) {
    // distancia recorrida hasta la parada
    let stopDist = 0;
    for (let i = 0; i < route.polyline.length - 1; i++) {
      const dToStop = haversineM(route.polyline[i][0], route.polyline[i][1], s.lat, s.lng);
      if (dToStop < 50) { stopDist = state.cum[i]; break; }
    }
    const remaining = stopDist - state.distanceTraveled;
    if (remaining > -20 && remaining < bestDelta) { bestDelta = remaining; bestStop = s; }
  }
  return bestStop;
}

// ETA en segundos desde ahora a la parada indicada (basado en distancia y velocidad)
export function getETA(state: TrackingState, stopLat: number, stopLng: number): number {
  const distToStop = haversineM(state.visualLat, state.visualLng, stopLat, stopLng);
  if (state.speedMps > 1) return distToStop / state.speedMps;
  // velocidad por defecto si no tenemos estimacion
  return distToStop / (15.6); // ~35mph
}
