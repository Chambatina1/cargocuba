// =============================================
// Solver VRP en TypeScript puro - FALLBACK dentro de la app Next.js
// =============================================
// Mismo algoritmo que mini-services/vrp-solver/src/savings-solver.ts
// (Clarke-Wright savings + nearest-neighbor + 2-opt + soft time windows).
// Se usa cuando el mini-servicio OR-Tools no esta disponible.
// Se mantiene duplicado a proposito: los mini-services se construyen y
// despliegan de forma independiente (bun build), por lo que compartir codigo
// cruzaria capas. La interfaz publica es identica.
// =============================================

import type { Vehicle, RoutingStop, SolverResult, SolverRouteStop } from './types';

const DEFAULT_SPEED_MPS = 35 * 1609.34 / 3600; // ~15.6 m/s

interface Matrix {
  distances: number[][];
  durations: number[][];
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildMatrixFallback(vehicles: Vehicle[], stops: RoutingStop[]): Matrix {
  const all: [number, number][] = [
    ...vehicles.map(v => v.start),
    ...stops.map(s => [s.lat, s.lng] as [number, number]),
  ];
  const n = all.length;
  const distances: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const durations: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineM(all[i][0], all[i][1], all[j][0], all[j][1]);
      distances[i][j] = d;
      distances[j][i] = d;
      const t = d / DEFAULT_SPEED_MPS;
      durations[i][j] = t;
      durations[j][i] = t;
    }
  }
  return { distances, durations };
}

function twoOpt(order: number[], dist: (a: number, b: number) => number): number[] {
  let best = [...order];
  let improved = true;
  let iter = 0;
  while (improved && iter++ < 200) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const a = best[i - 1], b = best[i], c = best[k], d = best[k + 1];
        const before = dist(a, b) + (d !== undefined ? dist(c, d) : 0);
        const after = dist(a, c) + (b !== undefined ? dist(b, d !== undefined ? d : c) : 0);
        if (after + 1e-6 < before) {
          best = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}

export function solveVrpFallback(
  vehicles: Vehicle[],
  stops: RoutingStop[],
  matrix?: Matrix,
  now: number = Math.floor(Date.now() / 1000),
): SolverResult {
  if (stops.length === 0) return { routes: [], unassigned: [], solverUsed: 'savings-ts' };
  if (vehicles.length === 0) return { routes: [], unassigned: stops.map(s => s.id), solverUsed: 'savings-ts' };

  const mtx = matrix ?? buildMatrixFallback(vehicles, stops);
  const nV = vehicles.length;
  const demands = stops.map(s => s.demand ?? 1);
  const stopGlobalIdx = stops.map((_, i) => nV + i);

  const sortedStops = [...stopGlobalIdx].sort((a, b) => {
    const sa = stops[a - nV], sb = stops[b - nV];
    if ((sb.priority ?? 0) !== (sa.priority ?? 0)) return (sb.priority ?? 0) - (sa.priority ?? 0);
    const ta = sa.timeWindow?.[0] ?? Infinity;
    const tb = sb.timeWindow?.[0] ?? Infinity;
    return ta - tb;
  });

  // Asignar cada parada al vehiculo mas cercano respetando capacidad
  const stopToVehicle: number[] = new Array(sortedStops.length).fill(0);
  const loadPerVehicle = new Array(nV).fill(0);

  for (let k = 0; k < sortedStops.length; k++) {
    const sIdx = sortedStops[k];
    let bestV = -1, bestD = Infinity;
    for (let v = 0; v < nV; v++) {
      if (loadPerVehicle[v] >= vehicles[v].capacity) continue;
      const d = mtx.distances[v][sIdx];
      if (d < bestD) { bestD = d; bestV = v; }
    }
    if (bestV === -1) continue; // sin capacidad -> queda unassigned
    stopToVehicle[k] = bestV;
    loadPerVehicle[bestV] += demands[sIdx - nV] ?? 1;
  }

  const routes: SolverResult['routes'] = [];
  const assigned = new Set<number>();

  for (let v = 0; v < nV; v++) {
    const myStops: number[] = [];
    for (let k = 0; k < sortedStops.length; k++) {
      if (stopToVehicle[k] === v) myStops.push(sortedStops[k]);
    }
    if (myStops.length === 0) continue;
    const route = buildRouteForVehicle(v, myStops, vehicles, stops, mtx, nV, now);
    for (const s of myStops) assigned.add(s);
    routes.push(route);
  }

  const unassigned: string[] = [];
  for (let k = 0; k < sortedStops.length; k++) {
    if (!assigned.has(sortedStops[k])) unassigned.push(stops[sortedStops[k] - nV].id);
  }

  return { routes, unassigned, solverUsed: 'savings-ts' };
}

function buildRouteForVehicle(
  vIdx: number,
  stopIdxs: number[],
  vehicles: Vehicle[],
  stops: RoutingStop[],
  mtx: Matrix,
  nV: number,
  now: number,
): SolverResult['routes'][number] {
  const depot = vIdx;
  // nearest-neighbor
  const remaining = [...stopIdxs];
  const order: number[] = [];
  let cur = depot;
  while (remaining.length > 0) {
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = mtx.distances[cur][remaining[i]];
      if (d < bestD) { bestD = d; bestI = i; }
    }
    cur = remaining.splice(bestI, 1)[0];
    order.push(cur);
  }

  // 2-opt sobre [depot, ...order, depot]
  const full = [depot, ...order, depot];
  const improved = twoOpt(full, (a, b) => mtx.distances[a][b]);

  // ETAs
  const resultStops: SolverRouteStop[] = [];
  let t = now;
  if (vehicles[vIdx].timeWindow && vehicles[vIdx].timeWindow![0] > t) t = vehicles[vIdx].timeWindow![0];
  let totalDist = 0;
  let totalDur = 0;
  let prev = improved[0];
  for (let i = 1; i < improved.length - 1; i++) {
    const s = improved[i];
    const seg = mtx.distances[prev][s];
    const segT = mtx.durations[prev][s];
    totalDist += seg;
    totalDur += segT;
    t += segT;
    const stopData = stops[s - nV];
    if (stopData.timeWindow && t < stopData.timeWindow[0]) t = stopData.timeWindow[0];
    resultStops.push({ id: stopData.id, orden: i - 1, arrivalSec: t, distanceMeters: seg });
    t += (stopData.serviceMinutes ?? 5) * 60;
    prev = s;
  }

  return {
    vehicleId: vehicles[vIdx].id,
    stops: resultStops,
    totalDistance: totalDist,
    totalDuration: totalDur,
    load: order.reduce((a, s) => a + (stops[s - nV].demand ?? 1), 0),
  };
}
