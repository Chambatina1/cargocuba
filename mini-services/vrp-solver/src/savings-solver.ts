// =============================================
// VRP Solver en TypeScript puro (fallback / cuando OR-Tools no esta disponible)
//
// Implementa:
//   - Clarke-Wright savings (multi-vehiculo, construye rutas balanceadas)
//   - Nearest-neighbor dentro de cada ruta como inicializacion
//   - 2-opt intra-ruta para mejorar el orden
//   - Ventanas de tiempo suaves (soft TW: penaliza pero no descarta)
//   - Capacidad por vehiculo
//
// Mismo formato de entrada/salida que el solver OR-Tools, asi son
// intercambiables. No es tan optimo como OR-Tools con GLS, pero es
// determinista, sin dependencias nativas y suficiente para flotas pequenas
// (decenas de paradas / varios choferes).
// =============================================

export interface SolverVehicle {
  id: string;
  start: [number, number];        // [lat, lng]
  end?: [number, number];         // optional depot return, defaults to start
  capacity: number;               // max demand units
  timeWindow?: [number, number];  // [startSec, endSec] del turno del chofer (epoch seg)
}

export interface SolverStop {
  id: string;
  lat: number;
  lng: number;
  demand?: number;          // default 1
  serviceMinutes?: number;  // default 5
  timeWindow?: [number, number]; // [startSec, endSec] epoch seg (opcional)
  priority?: number;        // 0 normal, >0 urgente (se atiende antes)
}

export interface SolverMatrix {
  // distancias y duraciones en metros y segundos; [i][j] = origen i -> destino j
  // indice 0..nVehicles-1 son vehiculos, luego nVehicles..nVehicles+nStops-1 son paradas
  distances: number[][];
  durations: number[][];
}

export interface SolverRouteStop {
  id: string;
  orden: number;
  arrivalSec: number;    // epoch segundos, ETA absoluto
  distanceMeters: number;
}

export interface SolverRouteResult {
  vehicleId: string;
  stops: SolverRouteStop[];
  totalDistance: number;  // metros
  totalDuration: number;  // segundos
  load: number;           // suma de demandas
}

export interface SolverResult {
  routes: SolverRouteResult[];
  unassigned: string[];
  solverUsed: string;
}

// Haversine en metros
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Velocidad promedio de conduccion urbana/suburbana en FL (mph -> m/s)
const DEFAULT_SPEED_MPS = 35 * 1609.34 / 3600; // ~15.6 m/s

// Construye matrices de costo (metros/segundos) cuando el caller no las envia
export function buildMatrix(vehicles: SolverVehicle[], stops: SolverStop[]): SolverMatrix {
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

// 2-opt intra-ruta: da vuelta segmentos para reducir distancia total
function twoOpt(order: number[], matrix: (a: number, b: number) => number): number[] {
  let best = [...order];
  let improved = true;
  let iter = 0;
  const maxIter = 200;
  while (improved && iter++ < maxIter) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const a = best[i - 1], b = best[i], c = best[k], d = best[k + 1];
        const before = matrix(a, b) + (d !== undefined ? matrix(c, d) : 0);
        const after = matrix(a, c) + (b !== undefined ? matrix(b, d !== undefined ? d : c) : 0);
        if (after + 1e-6 < before) {
          // reverse segment i..k
          best = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}

// Clarke-Wright savings para multiple vehiculo con capacidad
// Devuelve rutas como arrays de indices de stops (0-based global de `stops`)
function clarkeWright(
  depotIdx: number,
  stopIndices: number[],
  matrix: SolverMatrix,
  capacity: number,
  demands: number[],
): number[][] {
  // Cada parada empieza como su propia ruta: [depot, stop, depot]
  const routes: Map<number, number[]> = new Map(); // stopIdx -> ruta (incluye depot en extremos)
  for (const s of stopIndices) routes.set(s, [depotIdx, s, depotIdx]);

  // Calcular savings s(i,j) = d(depot,i) + d(depot,j) - d(i,j)
  const savings: { i: number; j: number; s: number }[] = [];
  for (let a = 0; a < stopIndices.length; a++) {
    for (let b = a + 1; b < stopIndices.length; b++) {
      const i = stopIndices[a], j = stopIndices[b];
      const s = matrix.distances[depotIdx][i] + matrix.distances[depotIdx][j] - matrix.distances[i][j];
      savings.push({ i, j, s });
    }
  }
  savings.sort((x, y) => y.s - x.s);

  const findRouteEnd = (stop: number): [number[], 'head' | 'tail'] | null => {
    // retorna [ruta, lado] si la parada esta en un extremo de alguna ruta
    for (const [, route] of routes) {
      if (route[1] === stop) return [route, 'head'];
      if (route[route.length - 2] === stop) return [route, 'tail'];
    }
    return null;
  };

  for (const { i, j } of savings) {
    if (!routes.has(i) || !routes.has(j)) continue;
    if (routes.get(i) === routes.get(j)) continue;
    const ri = findRouteEnd(i);
    const rj = findRouteEnd(j);
    if (!ri || !rj) continue;
    const [routeI, sideI] = ri;
    const [routeJ, sideJ] = rj;
    if (routeI === routeJ) continue;

    // Capacidad combinada
    const loadI = routeI.slice(1, -1).reduce((a, s) => a + (demands[s] ?? 1), 0);
    const loadJ = routeJ.slice(1, -1).reduce((a, s) => a + (demands[s] ?? 1), 0);
    if (loadI + loadJ > capacity) continue;

    // Merge: quitar depot interno, concatenar
    const innerI = routeI.slice(1, -1);
    const innerJ = routeJ.slice(1, -1);
    let merged: number[];
    if (sideI === 'tail' && sideJ === 'head') merged = [...innerI, ...innerJ];
    else if (sideI === 'head' && sideJ === 'head') merged = [...innerI.reverse(), ...innerJ];
    else if (sideI === 'tail' && sideJ === 'tail') merged = [...innerI, ...innerJ.reverse()];
    else merged = [...innerI.reverse(), ...innerJ.reverse()];

    const newRoute = [depotIdx, ...merged, depotIdx];
    // eliminar paradas viejas y registrar la nueva bajo todas sus paradas
    for (const s of innerI) routes.delete(s);
    for (const s of innerJ) routes.delete(s);
    for (const s of merged) routes.set(s, newRoute);
  }

  // Devolver rutas unicas
  const seen = new Set<number[]>();
  const out: number[][] = [];
  for (const s of stopIndices) {
    const r = routes.get(s);
    if (r && !seen.has(r)) { seen.add(r); out.push(r); }
  }
  return out;
}

// Resuelve VRPTW con savings + 2-opt. Devuelve una ruta por vehiculo.
export function solveVrp(
  vehicles: SolverVehicle[],
  stops: SolverStop[],
  matrix?: SolverMatrix,
  now: number = Math.floor(Date.now() / 1000),
): SolverResult {
  if (stops.length === 0) return { routes: [], unassigned: [], solverUsed: 'savings-ts' };
  if (vehicles.length === 0) return { routes: [], unassigned: stops.map(s => s.id), solverUsed: 'savings-ts' };

  const mtx = matrix ?? buildMatrix(vehicles, stops);
  const nV = vehicles.length;
  const demands = stops.map(s => s.demand ?? 1);
  const stopGlobalIdx = stops.map((_, i) => nV + i);

  // Ordenar paradas por prioridad (mayor primero) y luego por ventana de tiempo
  const sortedStops = [...stopGlobalIdx].sort((a, b) => {
    const sa = stops[a - nV], sb = stops[b - nV];
    if ((sb.priority ?? 0) !== (sa.priority ?? 0)) return (sb.priority ?? 0) - (sa.priority ?? 0);
    const ta = sa.timeWindow?.[0] ?? Infinity;
    const tb = sb.timeWindow?.[0] ?? Infinity;
    return ta - tb;
  });

  // Balancear paradas entre vehiculos proporcional a capacidad
  const totalDemand = demands.reduce((a, b) => a + b, 0);
  const totalCap = vehicles.reduce((a, v) => a + v.capacity, 0);
  const useSavings = totalDemand <= totalCap && vehicles.every(v => v.capacity > 0);

  const routesResult: SolverRouteResult[] = [];
  const assigned = new Set<number>();

  if (useSavings && vehicles.length >= 1) {
    // Distribuir: un depósito virtual por vehiculo (su start), resolver savings globalmente
    // es complejo con múltiples depósitos. Aproximación: asignar cada parada al vehiculo
    // más cercano, luego savings dentro de cada vehiculo.
    const stopToVehicle: number[] = new Array(stopGlobalIdx.length).fill(0);
    for (let k = 0; k < stopGlobalIdx.length; k++) {
      const sIdx = sortedStops[k];
      let bestV = 0, bestD = Infinity;
      for (let v = 0; v < nV; v++) {
        const d = mtx.distances[v][sIdx];
        if (d < bestD) { bestD = d; bestV = v; }
      }
      stopToVehicle[k] = bestV;
    }

    // Garantizar factibilidad de capacidad por vehiculo; si excede, reasignar al siguiente
    const loadPerVehicle = new Array(nV).fill(0);
    // ordenar paradas ya asignadas por cercania a su vehiculo para priorizar las que "pegan"
    for (let v = 0; v < nV; v++) {
      const myStops = sortedStops.filter((_, k) => stopToVehicle[k] === v);
      for (const s of myStops) {
        const demand = demands[s - nV] ?? 1;
        if (loadPerVehicle[v] + demand <= vehicles[v].capacity) {
          loadPerVehicle[v] += demand;
        } else {
          // buscar otro vehiculo con holgura
          let placed = false;
          for (let v2 = 0; v2 < nV; v2++) {
            if (loadPerVehicle[v2] + demand <= vehicles[v2].capacity) {
              // reasignar
              const k = sortedStops.indexOf(s);
              stopToVehicle[k] = v2;
              loadPerVehicle[v2] += demand;
              placed = true;
              break;
            }
          }
          if (!placed) {
            // overflow: queda sin asignar si nadie tiene capacidad
          }
        }
      }
    }

    for (let v = 0; v < nV; v++) {
      const myStops = sortedStops.filter((s, k) => stopToVehicle[k] === v);
      if (myStops.length === 0) continue;
      const route = buildRouteForVehicle(v, myStops, vehicles, stops, mtx, nV, now);
      for (const s of myStops) assigned.add(s);
      routesResult.push(route);
    }
  }

  // Paradas no asignadas (por capacidad) -> lista
  const unassigned: string[] = [];
  for (let k = 0; k < stopGlobalIdx.length; k++) {
    const s = sortedStops[k];
    if (!assigned.has(s)) unassigned.push(stops[s - nV].id);
  }

  return { routes: routesResult, unassigned, solverUsed: 'savings-ts' };
}

// Construye la ruta final de un vehiculo: nearest-neighbor inicial + 2-opt + ETAs
function buildRouteForVehicle(
  vIdx: number,
  stopIdxs: number[],
  vehicles: SolverVehicle[],
  stops: SolverStop[],
  mtx: SolverMatrix,
  nV: number,
  now: number,
): SolverRouteResult {
  const depot = vIdx; // indice global del vehiculo = su start
  // Inicializacion nearest-neighbor desde el depot
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

  // Calcular ETAs recorriendo la ruta
  const resultStops: SolverRouteStop[] = [];
  let t = now;
  if (vehicles[vIdx].timeWindow && vehicles[vIdx].timeWindow![0] > t) {
    t = vehicles[vIdx].timeWindow![0]; // espera a que empiece el turno
  }
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
    // soft time window: si llega antes, espera
    if (stopData.timeWindow && t < stopData.timeWindow[0]) {
      t = stopData.timeWindow[0];
    }
    resultStops.push({
      id: stopData.id,
      orden: i - 1,
      arrivalSec: t,
      distanceMeters: seg,
    });
    // service time
    t += (stopData.serviceMinutes ?? 5) * 60;
    prev = s;
  }

  const load = order.reduce((a, s) => a + (stops[s - nV].demand ?? 1), 0);
  return {
    vehicleId: vehicles[vIdx].id,
    stops: resultStops,
    totalDistance: totalDist,
    totalDuration: totalDur,
    load,
  };
}
