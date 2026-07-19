// =============================================
// tracking-server — hub Socket.IO para tracking de choferes en tiempo real
//
// Roles:
//   - chofer  (rol "driver")  -> emite "driver-location" con su GPS
//   - watcher (rol "map")     -> ve el mapa, recibe "driver-moved" / "route-progress"
//
// Eventos:
//   IN  driver-location  {phone,lat,lng,heading?,speed?,ts?}
//   IN  driver-online    {phone,nombre}
//   IN  driver-offline   {phone}
//   IN  route-progress   {phone,eta,progress,currentStopId,routeId}  (lo emite el que calcula progreso)
//   IN  join-map         {}  (cliente se suscribe a actualizaciones de mapa)
//   OUT driver-moved     {phone,lat,lng,heading,speed,ts}
//   OUT route-progress   {phone,eta,progress,currentStopId,routeId}
//   OUT driver-online    {phone,nombre}
//   OUT driver-offline   {phone}
//   OUT drivers-snapshot {[{phone,nombre,lat,lng,...}]}  (al unirse al mapa)
//
// Mantiene en memoria el snapshot de cada chofer para que nuevos observadores
// reciban el estado actual sin esperar al siguiente update.
// =============================================

import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = parseInt(process.env.PORT || '3011', 10);

// --- Estado en memoria (declarado antes del servidor para que el handler /health lo vea) ---
interface DriverState {
  phone: string;
  nombre?: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  ts: number;
  active: boolean;
  // progreso de ruta (lo calcula el cliente/app del admin, no el chofer)
  routeId?: number;
  currentStopId?: number;
  eta?: string;       // ISO
  progress?: number;  // 0..1
}
const drivers = new Map<string, DriverState>();

// Suscriptores al mapa (reciben driver-moved)
const mapWatchers = new Set<string>();

// Socket.IO adjunta su propio request listener al httpServer; cuando llega
// una peticion a un path que no reconoce responde "Transport unknown".
// Para servir /health, registramos nuestro listener con prependListener
// DESPUES de crear el Server de Socket.IO, asi queda primero en la cadena y
// puede responder antes de que Socket.IO toque la respuesta.
const httpServer = createServer();

const io = new Server(httpServer, {
  // path "/tracking" deja libres /health y demas rutas HTTP. Caddy rutea por
  // puerto via ?XTransformPort, asi que el path de Socket.IO es libre.
  path: '/tracking',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

//.prependListener: nuestro handler de /health se ejecuta ANTES que el de Socket.IO
httpServer.prependListener('request', (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      drivers: drivers.size,
      activeDrivers: Array.from(drivers.values()).filter(d => d.active).length,
      watchers: mapWatchers.size,
    }));
    return;
  }
  // no es /health: no respondemos -> los siguientes listeners (Socket.IO) actuan
});


function broadcastToMap(event: string, payload: unknown) {
  for (const sid of mapWatchers) {
    io.to(sid).emit(event, payload);
  }
}

function snapshot() {
  return Array.from(drivers.values());
}

io.on('connection', (socket) => {
  console.log(`[tracking] connect ${socket.id}`);

  // --- Observadores del mapa ---
  socket.on('join-map', () => {
    mapWatchers.add(socket.id);
    socket.emit('drivers-snapshot', { drivers: snapshot() });
    console.log(`[tracking] ${socket.id} joined map (${mapWatchers.size} watchers)`);
  });

  // --- Chofer envia GPS ---
  socket.on('driver-location', (data: {
    phone: string; lat: number; lng: number;
    heading?: number; speed?: number; ts?: number; nombre?: string;
  }) => {
    if (!data?.phone || typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
    const prev = drivers.get(data.phone);
    const state: DriverState = {
      phone: data.phone,
      nombre: data.nombre ?? prev?.nombre,
      lat: data.lat,
      lng: data.lng,
      heading: data.heading ?? prev?.heading,
      speed: data.speed ?? prev?.speed,
      ts: data.ts ?? Date.now(),
      active: true,
      routeId: prev?.routeId,
      currentStopId: prev?.currentStopId,
      eta: prev?.eta,
      progress: prev?.progress,
    };
    drivers.set(data.phone, state);
    broadcastToMap('driver-moved', state);
  });

  // --- Chofer online (sin GPS todavia, o reactivando) ---
  socket.on('driver-online', (data: { phone: string; nombre?: string }) => {
    if (!data?.phone) return;
    const prev = drivers.get(data.phone);
    const state: DriverState = prev
      ? { ...prev, active: true, nombre: data.nombre ?? prev.nombre }
      : { phone: data.phone, nombre: data.nombre, lat: 0, lng: 0, ts: Date.now(), active: true };
    drivers.set(data.phone, state);
    broadcastToMap('driver-online', { phone: state.phone, nombre: state.nombre });
  });

  // --- Chofer offline ---
  socket.on('driver-offline', (data: { phone: string }) => {
    if (!data?.phone) return;
    const prev = drivers.get(data.phone);
    if (prev) {
      prev.active = false;
      drivers.set(data.phone, prev);
    }
    broadcastToMap('driver-offline', { phone: data.phone });
  });

  // --- Progreso de ruta (lo emite quien calcula: admin/app del chofer) ---
  socket.on('route-progress', (data: {
    phone: string; eta?: string; progress?: number;
    currentStopId?: number; routeId?: number;
  }) => {
    if (!data?.phone) return;
    const prev = drivers.get(data.phone);
    if (!prev) return;
    if (data.eta !== undefined) prev.eta = data.eta;
    if (data.progress !== undefined) prev.progress = data.progress;
    if (data.currentStopId !== undefined) prev.currentStopId = data.currentStopId;
    if (data.routeId !== undefined) prev.routeId = data.routeId;
    drivers.set(data.phone, prev);
    broadcastToMap('route-progress', {
      phone: data.phone,
      eta: prev.eta,
      progress: prev.progress,
      currentStopId: prev.currentStopId,
      routeId: prev.routeId,
    });
  });

  socket.on('disconnect', () => {
    mapWatchers.delete(socket.id);
    console.log(`[tracking] disconnect ${socket.id} (${mapWatchers.size} watchers)`);
  });

  socket.on('error', (err) => console.error(`[tracking] socket error ${socket.id}:`, err));
});

httpServer.listen(PORT, () => {
  console.log(`[tracking] Socket.IO escuchando en http://localhost:${PORT} (path=/tracking) - health en GET /health`);
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    console.log(`[tracking] ${sig} recibido, cerrando...`);
    io.close(() => httpServer.close(() => process.exit(0)));
  });
}
