// =============================================
// /api/routing - endpoint de optimizacion VRP
// =============================================
// POST: optimiza la asignacion de recogidas a choferes activos y persiste rutas.
//
// Body (opcional, si se omite usa todos los choferes activos + recogidas esperando):
//   { driverPhones?: string[], pickupIds?: number[], persist?: boolean }
//
// Respuesta: { ok, routes: PersistedRoute[], unassigned, solverUsed, ms }
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { callSolver } from '@/lib/routing/solver-client';
import { calcRoute } from '@/lib/routing/osrm';
import type { Vehicle, RoutingStop, PersistedRoute } from '@/lib/routing/types';
import { requireAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // La optimizacion es accion de admin. Si NEXTAUTH_SECRET no esta configurado
    // (ej. entorno de desarrollo), se permite; en produccion se requiere sesion.
    if (process.env.NEXTAUTH_SECRET) {
      const admin = await requireAdmin(req);
      if (!admin) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const driverPhones: string[] | undefined = body?.driverPhones;
    const pickupIds: number[] | undefined = body?.pickupIds;
    const persist: boolean = body?.persist !== false; // default true

    // 1) Choferes activos (o los indicados)
    const drivers = await db.driverLocation.findMany({
      where: driverPhones?.length ? { phone: { in: driverPhones } } : { activo: true },
    });
    if (drivers.length === 0) {
      return NextResponse.json({ ok: false, error: 'no hay choferes activos' }, { status: 400 });
    }

    // 2) Recogidas pendientes (o las indicadas)
    const pickups = await db.pickupRequest.findMany({
      where: pickupIds?.length
        ? { id: { in: pickupIds } }
        : { estado: { in: ['esperando', 'asignado', 'en_camino'] } },
    });
    if (pickups.length === 0) {
      return NextResponse.json({ ok: false, error: 'no hay recogidas para optimizar' }, { status: 400 });
    }

    // 3) Armar payload del solver
    const vehicles: Vehicle[] = drivers.map(d => ({
      id: d.phone,
      // Punto de partida = sede del chofer, o su posicion actual si no tiene
      start: [
        d.puntoPartidaLat ?? d.lat,
        d.puntoPartidaLng ?? d.lng,
      ] as [number, number],
      capacity: d.capacidad || 20,
    }));

    const stops: RoutingStop[] = pickups.map(p => ({
      id: String(p.id),
      lat: p.lat,
      lng: p.lng,
      demand: p.paquetes || 1,
      serviceMinutes: p.serviceMinutes || 5,
      priority: p.priority || 0,
      ...(p.timeWindowStart && p.timeWindowEnd
        ? { timeWindow: [Math.floor(p.timeWindowStart.getTime() / 1000), Math.floor(p.timeWindowEnd.getTime() / 1000)] as [number, number] }
        : {}),
    }));

    const t0 = Date.now();
    const result = await callSolver(vehicles, stops);
    const ms = Date.now() - t0;

    if (!persist) {
      return NextResponse.json({
        ok: true,
        routes: result.routes.map(r => ({ ...r, routeId: 0, choferPhone: r.vehicleId })),
        unassigned: result.unassigned,
        solverUsed: result.solverUsed,
        ms,
      });
    }

    // 4) Persistir: una Route por chofer + RouteStop por parada + OSRM polyline
    const persisted: PersistedRoute[] = [];
    for (const route of result.routes) {
      const choferPhone = route.vehicleId;
      const driver = drivers.find(d => d.phone === choferPhone)!;

      // Polyline OSRM de la ruta completa (depot -> paradas -> depot)
      const pathPoints = [
        { lat: driver.puntoPartidaLat ?? driver.lat, lng: driver.puntoPartidaLng ?? driver.lng },
        ...route.stops.map(s => {
          const p = pickups.find(pp => String(pp.id) === s.id)!;
          return { lat: p.lat, lng: p.lng };
        }),
        { lat: driver.puntoPartidaLat ?? driver.lat, lng: driver.puntoPartidaLng ?? driver.lng },
      ];
      const osrm = await calcRoute(pathPoints);
      const polyline: [number, number][] = osrm?.route ?? pathPoints.map(p => [p.lat, p.lng] as [number, number]);

      // Marcar rutas anteriores del chofer como completadas/superseded
      await db.route.updateMany({
        where: { choferPhone, estado: { in: ['planeada', 'activa'] } },
        data: { estado: 'cancelada' },
      });

      const created = await db.route.create({
        data: {
          choferPhone,
          estado: 'activa',
          secuencia: route.stops.map(s => ({
            pickupId: Number(s.id), orden: s.orden, arrivalSec: s.arrivalSec,
          })),
          polyline,
          distanciaTotal: route.totalDistance,
          duracionTotal: route.totalDuration,
          paradasTotal: route.stops.length,
          paradasHechas: 0,
          solverUsed: result.solverUsed,
          startedAt: new Date(),
        },
      });

      // RouteStop + actualizar PickupRequest
      for (const s of route.stops) {
        const pickupId = Number(s.id);
        await db.routeStop.create({
          data: {
            routeId: created.id,
            pickupId,
            orden: s.orden,
            estado: 'pendiente',
            llegadaEstimada: new Date(s.arrivalSec * 1000),
          },
        }).catch(() => {/* unique constraint pickupId si ya existia */});
        await db.pickupRequest.update({
          where: { id: pickupId },
          data: {
            choferAsignado: choferPhone,
            ordenRuta: s.orden,
            routeId: created.id,
            estado: 'asignado',
          },
        });
      }

      // Snapshot de la ruta activa en el chofer (para que el frontend interpole)
      await db.driverLocation.update({
        where: { phone: choferPhone },
        data: {
          rutaActiva: { polyline, routeId: created.id, stops: route.stops } as any,
          currentStopId: null,
          progreso: 0,
          etaActual: route.stops[0] ? new Date(route.stops[0].arrivalSec * 1000) : null,
        },
      });

      persisted.push({ ...route, routeId: created.id, choferPhone, polyline });
    }

    return NextResponse.json({
      ok: true,
      routes: persisted,
      unassigned: result.unassigned,
      solverUsed: result.solverUsed,
      ms,
    });
  } catch (err: any) {
    console.error('[routing] error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'error interno' }, { status: 500 });
  }
}

// GET - lista rutas activas (para el mapa / panel)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get('estado') || 'activa';
    const routes = await db.route.findMany({
      where: { estado },
      include: { stops: { orderBy: { orden: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ ok: true, data: routes });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
