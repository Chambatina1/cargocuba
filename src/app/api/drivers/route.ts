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
        "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "DriverLocation_phone_idx" ON "DriverLocation"("phone");
      CREATE INDEX IF NOT EXISTS "DriverLocation_activo_idx" ON "DriverLocation"("activo");
    `);
    driverTableReady = true;
    console.log('[Drivers] Table created');
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

// POST — register or update driver location (chofer sends GPS)
export async function POST(req: NextRequest) {
  try {
    await ensureDriverTable();
    const { phone, nombre, lat, lng, activo } = await req.json();

    if (!phone || !nombre || lat == null || lng == null) {
      return NextResponse.json({ ok: false, error: 'Phone, nombre, lat y lng son requeridos' }, { status: 400 });
    }

    const driver = await prisma.driverLocation.upsert({
      where: { phone },
      update: { nombre, lat, lng, activo: activo !== undefined ? activo : true },
      create: { phone, nombre, lat, lng, activo: activo !== undefined ? activo : true },
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
    const { phone, activo, lat, lng } = await req.json();
    if (!phone) return NextResponse.json({ ok: false, error: 'Phone requerido' }, { status: 400 });

    const updateData: any = {};
    if (activo !== undefined) updateData.activo = activo;
    if (lat != null) updateData.lat = lat;
    if (lng != null) updateData.lng = lng;

    const driver = await prisma.driverLocation.update({
      where: { phone },
      data: updateData,
    });
    return NextResponse.json({ ok: true, data: driver });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}