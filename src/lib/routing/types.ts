// =============================================
// Tipos VRP compartidos entre la API de routing y el frontend
// =============================================

export interface Vehicle {
  id: string;
  start: [number, number];        // [lat, lng] - punto de partida / deposito del chofer
  end?: [number, number];
  capacity: number;
  timeWindow?: [number, number];  // [startSec, endSec] epoch
}

export interface RoutingStop {
  id: string;
  lat: number;
  lng: number;
  demand?: number;
  serviceMinutes?: number;
  timeWindow?: [number, number];
  priority?: number;
}

export interface SolverRouteStop {
  id: string;
  orden: number;
  arrivalSec: number;
  distanceMeters: number;
}

export interface SolverRouteResult {
  vehicleId: string;
  stops: SolverRouteStop[];
  totalDistance: number;
  totalDuration: number;
  load: number;
}

export interface SolverResult {
  routes: SolverRouteResult[];
  unassigned: string[];
  solverUsed: string;
}

// Respuesta de /api/routing: rutas persistidas con su ID de DB
export interface PersistedRoute extends SolverRouteResult {
  routeId: number;
  choferPhone: string;
  polyline?: [number, number][];
}

export interface RoutingResponse {
  ok: boolean;
  routes: PersistedRoute[];
  unassigned: string[];
  solverUsed: string;
  ms?: number;
  error?: string;
}
