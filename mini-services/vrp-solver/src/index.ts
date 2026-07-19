// =============================================
// vrp-solver — mini-servicio HTTP para optimizacion VRP
// POST /solve  { vehicles, stops, matrix? }  ->  { routes, unassigned, solverUsed }
// GET  /health -> { ok: true, ortools: bool }
//
// Se construye con `bun build` (.zscripts/mini-services-build.sh) y arranca
// con `bun mini-service-vrp-solver.js` (.zscripts/mini-services-start.sh).
// El puerto lo asigna el entorno (process.env.PORT), con fallback 3010.
// =============================================

import http from 'node:http';
import { solve, isOrtoolsAvailable } from './ortools-solver.js';
import type { SolverVehicle, SolverStop, SolverMatrix } from './savings-solver.js';

const PORT = parseInt(process.env.PORT || '3010', 10);

function send(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(json);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 5_000_000) reject(new Error('payload too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { ok: true, ortools: isOrtoolsAvailable(), solver: isOrtoolsAvailable() ? 'ortools' : 'savings-ts' });
  }
  if (req.method === 'POST' && req.url === '/solve') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as {
        vehicles: SolverVehicle[];
        stops: SolverStop[];
        matrix?: SolverMatrix;
      };
      if (!Array.isArray(payload.vehicles) || !Array.isArray(payload.stops)) {
        return send(res, 400, { ok: false, error: 'vehicles y stops deben ser arrays' });
      }
      const t0 = Date.now();
      const result = await solve(payload.vehicles, payload.stops, payload.matrix);
      const ms = Date.now() - t0;
      console.log(`[vrp-solver] solve: ${payload.vehicles.length} vehiculos, ${payload.stops.length} paradas -> ${result.routes.length} rutas, ${result.unassigned.length} sin asignar (${result.solverUsed}, ${ms}ms)`);
      return send(res, 200, { ok: true, data: result, ms });
    } catch (e: any) {
      console.error('[vrp-solver] error:', e);
      return send(res, 500, { ok: false, error: e?.message || String(e) });
    }
  }
  return send(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`[vrp-solver] escuchando en http://localhost:${PORT} (ortools=${isOrtoolsAvailable()})`);
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    console.log(`[vrp-solver] ${sig} recibido, cerrando...`);
    server.close(() => process.exit(0));
  });
}
