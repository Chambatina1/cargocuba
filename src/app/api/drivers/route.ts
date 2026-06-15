import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Auto-create table if missing
let driverTableReady = false;
async function ensureDriverTable() {
  if (driverTableReady) return;
  try {
    await prisma.driverLocation.count();
    driverTableReady = true;
  } catch {
    console.log('[Drivers] Creating DriverLocation table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DriverLocation" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "phone" TEXT NOT NULL UNIQUE,
        "nombre" TEXT NOT NULL,
        "lat" DOUBLE PRECISION NOT NULL,
        "lng" DOUBLE PRECISION NOT NULL,
        "activo" BOOLEAN NOT NULL DEFAULT true,
        "mensaje" TEXT DEFAULT 'Voy a salir para Chambatina',
        "precioServicio" TEXT,
        "direccionRecojo" TEXT,
        "comunidad" TEXT,
        "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "DriverLocation_phone_idx" ON "DriverLocation"("phone");
      CREATE INDEX IF NOT EXISTS "DriverLocation_activo_idx" ON "DriverLocation"("activo");
    `);
    // Add new columns if they don't exist (for existing deployments)
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "DriverLocation" ADD COLUMN IF NOT EXISTS "mensaje" TEXT DEFAULT 'Voy a salir para Chambatina';`); } catch {}
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "DriverLocation" ADD COLUMN IF NOT EXISTS "precioServicio" TEXT;`); } catch {}
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "DriverLocation" ADD COLUMN IF NOT EXISTS "direccionRecojo" TEXT;`); } catch {}
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "DriverLocation" ADD COLUMN IF NOT EXISTS "comunidad" TEXT;`); } catch {}
    driverTableReady = true;
    console.log('[Drivers] Table created/updated');
  }
}

// GET — list active drivers (anyone can see)
export async function GET() {
  try {
    await ensureDriverTable();
    const drivers = await prisma.driverLocation.findMany({
      where: { activo: true },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ ok: true, data: drivers });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// POST — register or update driver location (chofer sends GPS + instructions)
export async function POST(req: NextRequest) {
  try {
    await ensureDriverTable();
    const { phone, nombre, lat, lng, activo, mensaje, precioServicio, direccionRecojo, comunidad } = await req.json();

    if (!phone || !nombre || lat == null || lng == null) {
      return NextResponse.json({ ok: false, error: 'Phone, nombre, lat y lng son requeridos' }, { status: 400 });
    }

    const updateData: any = { nombre, lat, lng, activo: activo !== undefined ? activo : true };
    if (mensaje !== undefined) updateData.mensaje = mensaje;
    if (precioServicio !== undefined) updateData.precioServicio = precioServicio;
    if (direccionRecojo !== undefined) updateData.direccionRecojo = direccionRecojo;
    if (comunidad !== undefined) updateData.comunidad = comunidad;

    const driver = await prisma.driverLocation.upsert({
      where: { phone },
      update: updateData,
      create: {
        phone, nombre, lat, lng,
        activo: activo !== undefined ? activo : true,
        mensaje: mensaje || 'Voy a salir para Chambatina',
        precioServicio: precioServicio || null,
        direccionRecojo: direccionRecojo || null,
        comunidad: comunidad || null,
      },
    });

    return NextResponse.json({ ok: true, data: driver });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// PUT — toggle driver active/inactive
export async function PUT(req: NextRequest) {
  try {
    await ensureDriverTable();
    const { phone, activo, lat, lng, mensaje, precioServicio, direccionRecojo, comunidad } = await req.json();
    if (!phone) return NextResponse.json({ ok: false, error: 'Phone requerido' }, { status: 400 });

    const updateData: any = {};
    if (activo !== undefined) updateData.activo = activo;
    if (lat != null) updateData.lat = lat;
    if (lng != null) updateData.lng = lng;
    if (mensaje !== undefined) updateData.mensaje = mensaje;
    if (precioServicio !== undefined) updateData.precioServicio = precioServicio;
    if (direccionRecojo !== undefined) updateData.direccionRecojo = direccionRecojo;
    if (comunidad !== undefined) updateData.comunidad = comunidad;

    const driver = await prisma.driverLocation.update({
      where: { phone },
      data: updateData,
    });
    return NextResponse.json({ ok: true, data: driver });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}