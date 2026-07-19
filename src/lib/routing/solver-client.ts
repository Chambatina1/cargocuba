// =============================================
// Cliente HTTP hacia el mini-servicio vrp-solver
// =============================================
// Llama al mini-servicio OR-Tools/savings-TS. Si el mini-servicio no responde
// (caida, no levantado), hace fallback al solver savings-TS que vive dentro de
// la propia app (src/lib/routing/fallback-solver) para que la optimizacion
// nunca falle del lado del usuario.
// =============================================

import { solveVrpFallback, buildMatrixFallback } from './fallback-solver';
import type { Vehicle, RoutingStop, SolverResult } from './types';

// El puerto del mini-servicio. Lo asigna el runtime de mini-services (Render/zscripts)
// via env VRP_SOLVER_PORT; fallback a localhost:3010 cuando se corre en dev local.
const SOLVER_BASE_URL =
  process.env.VRP_SOLVER_URL ||
  `http://localhost:${process.env.VRP_SOLVER_PORT || '3010'}`;

export async function callSolver(
  vehicles: Vehicle[],
  stops: RoutingStop[],
): Promise<SolverResult> {
  // Intentar el mini-servicio primero
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${SOLVER_BASE_URL}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicles, stops }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json = await res.json();
      if (json?.ok && json?.data) return json.data as SolverResult;
    }
    throw new Error(`solver responded ${res.status}`);
  } catch (e: any) {
    console.warn('[routing] mini-servicio vrp-solver no disponible, usando fallback TS:', e?.message);
  }

  // Fallback: resolver en proceso (sin mini-servicio)
  const matrix = buildMatrixFallback(vehicles, stops);
  return solveVrpFallback(vehicles, stops, matrix);
}
