// =============================================
// Wrapper de Google OR-Tools para VRPTW (multi-vehiculo, capacidad, ventanas de tiempo)
//
// OR-Tools se publica como paquete npm "node_or_tools" (binding nativo C++).
// Si no esta instalado o falla al cargar, este modulo exporta `ortoolsAvailable=false`
// y el servidor usa el fallback savings-solver.ts. Asi el deploy nunca se cae
// aunque el binario nativo no compile en el entorno.
// =============================================

import {
  solveVrp as solveSavings,
  buildMatrix,
  type SolverVehicle, type SolverStop, type SolverMatrix, type SolverResult,
} from './savings-solver.js';

// Intento perezoso de cargar el binding nativo. Cualquier error -> fallback.
let ortoolsSolver: ((v: SolverVehicle[], s: SolverStop[], m?: SolverMatrix) => SolverResult) | null = null;
let ortoolsLoadTried = false;

async function tryLoadOrtools(): Promise<void> {
  if (ortoolsLoadTried) return;
  ortoolsLoadTried = true;
  try {
    // Probamos los bindings conocidos del ecosistema. node_or_tools es el mas usado.
    const mod: any = await import(/* @vite-ignore */ 'node_or_tools');
    if (mod && typeof mod.Worker === 'function') {
      ortoolsSolver = wrapOrtools(mod);
      console.log('[ortools-solver] OR-Tools nativo cargado correctamente');
    }
  } catch (e: any) {
    console.warn('[ortools-solver] OR-Tools no disponible, usando fallback savings-TS:', e?.message || e);
  }
}

// Traduce el formato Solver* a llamadas del binding node_or_tools y vuelta.
function wrapOrtools(mod: any): (v: SolverVehicle[], s: SolverStop[], m?: SolverMatrix) => SolverResult {
  return (vehicles, stops, matrix) => {
    const mtx = matrix ?? buildMatrix(vehicles, stops);
    const nV = vehicles.length;
    try {
      const wr = new mod.Worker({
        numNodes: nV + stops.length,
        vehicles: vehicles.length,
        vehicleCapacity: vehicles.map(v => v.capacity),
      });
      for (let i = 0; i < mtx.distances.length; i++) {
        for (let j = 0; j < mtx.distances.length; j++) {
          wr.setDistance(i, j, mtx.distances[i][j]);
          wr.setTime(i, j, mtx.durations[i][j]);
        }
      }
      for (let v = 0; v < vehicles.length; v++) {
        if (vehicles[v].timeWindow) {
          wr.setVehicleTimeWindow(v, vehicles[v].timeWindow![0], vehicles[v].timeWindow![1]);
        }
      }
      stops.forEach((s, i) => {
        const idx = nV + i;
        wr.setDemandOnNode(idx, s.demand ?? 1);
        if (s.timeWindow) wr.setTimeWindowForNode(idx, s.timeWindow[0], s.timeWindow[1]);
        wr.setServiceTimeForNode(idx, (s.serviceMinutes ?? 5) * 60);
      });
      const sol = wr.solve();
      const routes = (sol?.routes || []).map((r: any, vIdx: number) => {
        const resultStops = (r.path || [])
          .filter((nodeIdx: number) => nodeIdx >= nV)
          .map((nodeIdx: number, orden: number) => ({
            id: stops[nodeIdx - nV].id,
            orden,
            arrivalSec: 0,
            distanceMeters: 0,
          }));
        return {
          vehicleId: vehicles[vIdx].id,
          stops: resultStops,
          totalDistance: 0,
          totalDuration: 0,
          load: 0,
        };
      });
      return { routes, unassigned: [], solverUsed: 'ortools' };
    } catch (e: any) {
      console.warn('[ortools-solver] fallo en solve, usando fallback:', e?.message);
      return solveSavings(vehicles, stops, mtx);
    }
  };
}

export async function solve(
  vehicles: SolverVehicle[],
  stops: SolverStop[],
  matrix?: SolverMatrix,
): Promise<SolverResult> {
  await tryLoadOrtools();
  if (ortoolsSolver) return ortoolsSolver(vehicles, stops, matrix);
  return solveSavings(vehicles, stops, matrix);
}

export function isOrtoolsAvailable(): boolean {
  return ortoolsSolver !== null;
}
