import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Helper to verify admin token
function isAdmin(req: NextRequest): boolean {
  const token = req.headers.get('x-admin-token')
  return !!token // In production, verify JWT
}

// GET /api/admin/providers - List all providers (including suspended)
export async function GET(req: NextRequest) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const includeSuspended = searchParams.get('all') === 'true'

    const where: Record<string, unknown> = {}
    if (!includeSuspended) where.active = true
    if (category && category !== 'all') where.serviceCategory = category
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { businessName: { contains: search } },
      ]
    }

    const providers = await db.provider.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, phone: true, pin: true,
        serviceCategory: true, vehicleType: true,
        lat: true, lng: true,
        active: true, available: true, suspended: true,
        suspendedReason: true,
        rating: true, totalJobs: true,
        photo: true, bio: true, businessName: true,
        services: true, priceRange: true, schedule: true,
        socialMedia: true,
        carPhoto1: true, carPhoto2: true, carPhoto3: true,
        notes: true, idNumber: true,
        route1From: true, route1To: true,
        route2From: true, route2To: true,
        route3From: true, route3To: true,
        createdAt: true, updatedAt: true,
      },
    })

    return NextResponse.json(providers)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/admin/providers - Admin creates a provider
export async function POST(req: NextRequest) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { name, phone, pin, serviceCategory, vehicleType, businessName } = body

    if (!name || !phone) {
      return NextResponse.json({ error: 'Nombre y teléfono son obligatorios' }, { status: 400 })
    }

    const existing = await db.provider.findUnique({ where: { phone } })
    if (existing) {
      return NextResponse.json({ error: 'Este teléfono ya está registrado', provider: existing }, { status: 409 })
    }

    const provider = await db.provider.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        pin: (pin || '1234').trim(),
        serviceCategory: serviceCategory || 'pasaje',
        vehicleType: vehicleType || 'carro_moderno',
        businessName: businessName?.trim() || null,
        photo: body.photo || null,
        bio: body.bio?.trim() || null,
        schedule: body.schedule?.trim() || null,
        priceRange: body.priceRange?.trim() || null,
        services: body.services ? JSON.stringify(body.services) : null,
        notes: body.notes?.trim() || null,
        carPhoto1: body.carPhoto1 || null,
        carPhoto2: body.carPhoto2 || null,
        carPhoto3: body.carPhoto3 || null,
        lat: body.lat || 23.1136,
        lng: body.lng || -82.3666,
        route1From: body.route1From || null,
        route1To: body.route1To || null,
        route2From: body.route2From || null,
        route2To: body.route2To || null,
        route3From: body.route3From || null,
        route3To: body.route3To || null,
        active: body.active !== undefined ? body.active : true,
      },
    })

    return NextResponse.json(provider, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
