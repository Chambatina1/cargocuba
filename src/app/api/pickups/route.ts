import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// No password — admin is open access

// Auto-create table if missing (for first deploy)
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  try {
    await prisma.pickupRequest.count();
    tableReady = true;
  } catch {
    console.log('[Pickups] Creating PickupRequest table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PickupRequest" (
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
      );
      CREATE INDEX IF NOT EXISTS "PickupRequest_estado_idx" ON "PickupRequest"("estado");
      CREATE INDEX IF NOT EXISTS "PickupRequest_choferAsignado_idx" ON "PickupRequest"("choferAsignado");
      CREATE INDEX IF NOT EXISTS "PickupRequest_fechaRecogida_idx" ON "PickupRequest"("fechaRecogida");
      CREATE INDEX IF NOT EXISTS "PickupRequest_createdAt_idx" ON "PickupRequest"("createdAt");
    `);
    // VRPTW columns (idempotent - safe for existing deployments)
    const cols: [string, string][] = [
      ['"timeWindowStart"', 'TIMESTAMP(6)'],
      ['"timeWindowEnd"',   'TIMESTAMP(6)'],
      ['"serviceMinutes"',  'INTEGER NOT NULL DEFAULT 5'],
      ['"paquetes"',        'INTEGER NOT NULL DEFAULT 1'],
      ['"priority"',        'INTEGER NOT NULL DEFAULT 0'],
      ['"origen"',          "TEXT NOT NULL DEFAULT 'cliente'"],
      ['"routeId"',         'INTEGER'],
    ];
    for (const [col, type] of cols) {
      try { await prisma.$executeRawUnsafe(`ALTER TABLE "PickupRequest" ADD COLUMN IF NOT EXISTS ${col} ${type};`); } catch {}
    }
    try { await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PickupRequest_routeId_idx" ON "PickupRequest"("routeId");`); } catch {}
    tableReady = true;
    console.log('[Pickups] Table created/updated');
  }
}

// GET — list pickups
export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get('estado') || undefined;
    const chofer = searchParams.get('chofer') || undefined;
    const hoy = searchParams.get('hoy') === 'true';

    const where: any = {};
    if (estado) where.estado = estado;
    if (chofer) where.choferAsignado = chofer;
    if (hoy) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    const data = await prisma.pickupRequest.findMany({
      where,
      orderBy: [{ horarioReady: 'asc' }, { ordenRuta: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// POST — create pickup (anyone)
export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const {
      nombre, telefono, direccion, lat, lng, notas, horarioReady, area,
      // VRPTW fields (optional)
      timeWindowStart, timeWindowEnd, serviceMinutes, paquetes, priority,
    } = await req.json();

    if (!nombre || !direccion || lat == null || lng == null) {
      return NextResponse.json({ ok: false, error: 'Nombre, direccion y ubicacion son requeridos' }, { status: 400 });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ ok: false, error: 'Coordenadas invalidas' }, { status: 400 });
    }

    const pickup = await prisma.pickupRequest.create({
      data: {
        nombre,
        telefono: telefono || null,
        direccion,
        lat, lng,
        notas: notas || null,
        horarioReady: horarioReady || null,
        area: area || null,
        timeWindowStart: timeWindowStart ? new Date(timeWindowStart) : null,
        timeWindowEnd: timeWindowEnd ? new Date(timeWindowEnd) : null,
        serviceMinutes: typeof serviceMinutes === 'number' ? serviceMinutes : 5,
        paquetes: typeof paquetes === 'number' ? paquetes : 1,
        priority: typeof priority === 'number' ? priority : 0,
      },
    });

    return NextResponse.json({ ok: true, data: pickup });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// PUT — update pickup (admin)
export async function PUT(req: NextRequest) {
  try {
    await ensureTable();
    const {
      id, estado, choferAsignado, ordenRuta, notas, horarioReady, fechaRecogida, area,
      timeWindowStart, timeWindowEnd, serviceMinutes, paquetes, priority, routeId,
    } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: 'ID requerido' }, { status: 400 });

    const updateData: any = {};
    if (estado !== undefined) updateData.estado = estado;
    if (choferAsignado !== undefined) updateData.choferAsignado = choferAsignado;
    if (ordenRuta !== undefined) updateData.ordenRuta = ordenRuta;
    if (notas !== undefined) updateData.notas = notas;
    if (horarioReady !== undefined) updateData.horarioReady = horarioReady || null;
    if (fechaRecogida !== undefined) updateData.fechaRecogida = fechaRecogida ? new Date(fechaRecogida) : null;
    if (area !== undefined) updateData.area = area || null;
    if (timeWindowStart !== undefined) updateData.timeWindowStart = timeWindowStart ? new Date(timeWindowStart) : null;
    if (timeWindowEnd !== undefined) updateData.timeWindowEnd = timeWindowEnd ? new Date(timeWindowEnd) : null;
    if (serviceMinutes !== undefined) updateData.serviceMinutes = serviceMinutes;
    if (paquetes !== undefined) updateData.paquetes = paquetes;
    if (priority !== undefined) updateData.priority = priority;
    if (routeId !== undefined) updateData.routeId = routeId;

    const pickup = await prisma.pickupRequest.update({ where: { id }, data: updateData });
    return NextResponse.json({ ok: true, data: pickup });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// DELETE — delete pickup (admin)
export async function DELETE(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get('id') || '0');
    if (!id) return NextResponse.json({ ok: false, error: 'ID requerido' }, { status: 400 });

    await prisma.pickupRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}