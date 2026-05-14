import { NextRequest, NextResponse } from 'next/server'
import { db, verifyProviderSession } from '@/lib/db'

// GET /api/providers/[id] - Get single provider profile
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const provider = await db.provider.findUnique({ where: { id } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }
    return NextResponse.json(provider)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PUT /api/providers/[id] - Update provider profile (PIN-protected)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { pin, token, ...updateData } = body

    // Verify session or PIN
    const provider = await db.provider.findUnique({ where: { id } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    if (token) {
      const valid = await verifyProviderSession(id, token)
      if (!valid) {
        return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
      }
    } else if (pin) {
      if (provider.pin !== pin) {
        return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
      }
    } else {
      return NextResponse.json({ error: 'Se requiere PIN o token de sesión' }, { status: 401 })
    }

    // Clean and prepare update data
    const clean: Record<string, unknown> = {}
    const allowedFields = [
      'name', 'phone', 'pin', 'serviceCategory', 'vehicleType',
      'photo', 'bio', 'businessName', 'services', 'priceRange',
      'schedule', 'socialMedia', 'carPhoto1', 'carPhoto2', 'carPhoto3',
      'notes', 'lat', 'lng',
      'route1From', 'route1To', 'route1FromLat', 'route1FromLng', 'route1ToLat', 'route1ToLng',
      'route2From', 'route2To', 'route2FromLat', 'route2FromLng', 'route2ToLat', 'route2ToLng',
      'route3From', 'route3To', 'route3FromLat', 'route3FromLng', 'route3ToLat', 'route3ToLng',
    ]

    // Photo fields should NOT be trimmed (they are base64)
    const photoFields = ['photo', 'carPhoto1', 'carPhoto2', 'carPhoto3']

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        if (photoFields.includes(field)) {
          // For photos: empty string → null, otherwise keep as-is
          const val = updateData[field]
          clean[field] = (typeof val === 'string' && val.trim() === '') ? null : val
        } else {
          clean[field] = typeof updateData[field] === 'string' ? (updateData[field] as string).trim() || null : updateData[field]
        }
      }
    }

    if (clean.services && Array.isArray(clean.services)) {
      clean.services = JSON.stringify(clean.services)
    }

    const updated = await db.provider.update({
      where: { id },
      data: clean,
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
