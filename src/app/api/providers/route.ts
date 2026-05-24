import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/providers - List all active providers
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const available = searchParams.get('available')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = { active: true, suspended: false }

    if (available === 'true') {
      where.available = true
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { businessName: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const providers = await db.provider.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { available: 'desc' },
    })

    return NextResponse.json(providers)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/providers - Register a new provider
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, phone, pin, carBrand, carModel } = body

    if (!name || !phone || !pin) {
      return NextResponse.json({ error: 'Nombre, teléfono y PIN son obligatorios' }, { status: 400 })
    }

    if (pin.length < 4 || pin.length > 6) {
      return NextResponse.json({ error: 'El PIN debe tener entre 4 y 6 dígitos' }, { status: 400 })
    }

    // Check if phone already exists
    const existing = await db.provider.findUnique({ where: { phone } })
    if (existing) {
      return NextResponse.json({
        error: 'Este teléfono ya está registrado',
        provider: existing,
        alreadyExists: true,
      }, { status: 409 })
    }

    const provider = await db.provider.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        pin: pin.trim(),
        carBrand: carBrand?.trim() || null,
        carModel: carModel?.trim() || null,
        photo: body.photo || null,
        bio: body.bio?.trim() || null,
        schedule: body.schedule?.trim() || null,
        priceRange: body.priceRange?.trim() || null,
        services: body.services ? JSON.stringify(body.services) : null,
        notes: body.notes?.trim() || null,
        carPhoto1: body.carPhoto1 || null,
        carPhoto2: body.carPhoto2 || null,
        carPhoto3: body.carPhoto3 || null,
      },
    })

    return NextResponse.json(provider, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
