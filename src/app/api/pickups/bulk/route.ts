import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { solveVrpFallback } from '@/lib/routing/fallback-solver';

// =============================================
// POST /api/pickups/bulk
// Recibe texto crudo con lineas "Nombre — direccion" (o "Nombre: direccion",
// "Nombre, direccion", "Nombre - direccion") y crea todas las casas de una vez,
// geocodificando cada direccion en paralelo. Opcionalmente optimiza el orden.
//
// Body:
//   { text: string, choferAsignado?: string, puntoPartida?: [lat,lng], optimize?: boolean }
// Respuesta:
//   { ok, creadas: [{id,nombre,direccion,lat,lng,source}], fallidas: [{linea, error}], optimizada?: SolverResult }
// =============================================

interface ParsedLine { nombre: string; direccion: string; raw: string }

// Parsea una linea en (nombre, direccion). Acepta separadores: — – - : , | tab
function parseLine(raw: string): ParsedLine | null {
  const line = raw.trim();
  if (!line) return null;
  // Separadores comunes (probar en orden de preferencia)
  const separators = ['—', '–', ' - ', ' — ', ' – ', ':', '|', '\t', '   '];
  for (const sep of separators) {
    const idx = line.indexOf(sep);
    if (idx > 0 && idx < line.length - 2) {
      const nombre = line.slice(0, idx).trim();
      const direccion = line.slice(idx + sep.length).trim();
      if (nombre && direccion) return { nombre, direccion, raw: line };
    }
  }
  // Fallback: coma como separador (pero solo si hay al menos 2 palabras en direccion)
  const commaIdx = line.indexOf(',');
  if (commaIdx > 2 && commaIdx < line.length - 5) {
    const nombre = line.slice(0, commaIdx).trim();
    const direccion = line.slice(commaIdx + 1).trim();
    if (nombre && direccion) return { nombre, direccion, raw: line };
  }
  return null;
}

// Geocodifica una direccion usando nuestro propio endpoint /api/geocode
async function geocodeOne(direccion: string): Promise<{ lat: number; lng: number; display: string; source: string } | null> {
  try {
    const r = await fetch(`https://cargocuba.onrender.com/api/geocode?q=${encodeURIComponent(direccion)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    const first = (j.results || [])[0];
    if (first && first.lat && first.lon) {
      return { lat: parseFloat(first.lat), lng: parseFloat(first.lon), display: first.display_name, source: first.source };
    }
  } catch {}
  // Fallback directo a Nominatim (en caso de que /api/geocode no ande)
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(direccion + ', Florida, USA')}&format=json&limit=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'CargoCuba-App/1.0' }, signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (Array.isArray(j) && j[0]) {
      return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), display: j[0].display_name, source: 'nominatim-fallback' };
    }
  } catch {}
  return null;
}

// Auto-create tables (sigue el patron del resto de los endpoints)
let bulkReady = false;
async function ensureTable() {
  if (bulkReady) return;
  try {
    await db.pickupRequest.count();
    bulkReady = true;
  } catch {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PickupRequest" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "nombre" TEXT NOT NULL,
      "telefono" TEXT,
      "direccion" TEXT NOT NULL,
      "lat" DOUBLE PRECISION NOT NULL,
      "lng" DOUBLE PRECISION NOT NULL,
      "notas" TEXT,
      "horarioReady" TEXT,
      "area" TEXT,
      "estado" TEXT NOT NULL DEFAULT 'esperando',
      "choferAsignado" TEXT,
      "ordenRuta" INTEGER,
      "fechaRecogida" TIMESTAMP(6),
      "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
    bulkReady = true;
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json();
    const text: string = body?.text || '';
    const choferAsignado: string | undefined = body?.choferAsignado || 'Yandier';
    const puntoPartida: [number, number] | undefined = body?.puntoPartida; // [lat,lng] del chofer
    const optimize: boolean = body?.optimize !== false; // default: true

    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: 'Texto vacío' }, { status: 400 });
    }

    // 1) Parsear todas las lineas
    const lines = text.split(/\r?\n/);
    const parsed: ParsedLine[] = [];
    for (const l of lines) {
      const p = parseLine(l);
      if (p) parsed.push(p);
    }
    if (parsed.length === 0) {
      return NextResponse.json({ ok: false, error: 'No se reconocieron líneas con formato "Nombre — Dirección"' }, { status: 400 });
    }

    // 2) Geocodificar todas en paralelo (lotes de 5 para no saturar APIs)
    const results: { parsed: ParsedLine; geo: { lat: number; lng: number; display: string; source: string } | null }[] = [];
    for (let i = 0; i < parsed.length; i += 5) {
      const batch = parsed.slice(i, i + 5);
      const geos = await Promise.all(batch.map(p => geocodeOne(p.direccion)));
      for (let j = 0; j < batch.length; j++) {
        results.push({ parsed: batch[j], geo: geos[j] });
      }
    }

    // 3) Crear las casas que sí se geocodificaron
    const creadas: any[] = [];
    const fallidas: any[] = [];
    for (const { parsed, geo } of results) {
      if (!geo) {
        fallidas.push({ nombre: parsed.nombre, direccion: parsed.direccion, error: 'No se encontró la dirección' });
        continue;
      }
      try {
        const created = await db.pickupRequest.create({
          data: {
            nombre: parsed.nombre,
            direccion: geo.display || parsed.direccion,
            lat: geo.lat,
            lng: geo.lng,
            estado: 'esperando',
            choferAsignado: choferAsignado || null,
          },
        });
        creadas.push({ id: created.id, nombre: parsed.nombre, direccion: created.direccion, lat: geo.lat, lng: geo.lng, source: geo.source });
      } catch (e: any) {
        fallidas.push({ nombre: parsed.nombre, direccion: parsed.direccion, error: e.message });
      }
    }

    // 4) Optimizar si se pidio y hay punto de partida
    let optimizada: any = null;
    if (optimize && puntoPartida && creadas.length > 0) {
      const vehicles = [{ id: choferAsignado || 'chofer', start: puntoPartida, capacity: 50 }];
      const stops = creadas.map(c => ({ id: String(c.id), lat: c.lat, lng: c.lng }));
      const result = solveVrpFallback(vehicles, stops);
      // Persistir el orden en cada pickup
      for (const r of result.routes) {
        for (const s of r.stops) {
          try {
            await db.pickupRequest.update({
              where: { id: Number(s.id) },
              data: { ordenRuta: s.orden, choferAsignado: choferAsignado || null },
            });
          } catch {}
        }
      }
      optimizada = { solverUsed: result.solverUsed, ruta: result.routes[0]?.stops.map(s => {
        const c = creadas.find(x => String(x.id) === s.id);
        return { orden: s.orden + 1, nombre: c?.nombre, direccion: c?.direccion, lat: c?.lat, lng: c?.lng, eta: new Date(s.arrivalSec * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) };
      }), distancia: result.routes[0]?.totalDistance, duracion: result.routes[0]?.totalDuration };
    }

    return NextResponse.json({
      ok: true,
      creadas,
      fallidas,
      total: creadas.length,
      optimizada,
    });
  } catch (err: any) {
    console.error('[bulk] error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'error interno' }, { status: 500 });
  }
}
