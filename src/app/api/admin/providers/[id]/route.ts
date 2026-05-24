import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function isAdmin(req: NextRequest): boolean {
  return !!req.headers.get('x-admin-token')
}

// PUT /api/admin/providers/[id] - Admin edits any provider field
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()

    const provider = await db.provider.findUnique({ where: { id } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    const clean: Record<string, unknown> = {}
    const allowedFields = [
      'name', 'phone', 'pin', 'carBrand', 'carModel',
      'photo', 'bio', 'businessName', 'services', 'priceRange',
      'schedule', 'socialMedia', 'carPhoto1', 'carPhoto2', 'carPhoto3',
      'notes', 'lat', 'lng', 'active', 'available',
      'suspended', 'suspendedReason', 'idNumber', 'rating', 'totalJobs',
    ]

    const photoFields = ['photo', 'carPhoto1', 'carPhoto2', 'carPhoto3']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (photoFields.includes(field)) {
          const val = body[field]
          clean[field] = (typeof val === 'string' && val.trim() === '') ? null : val
        } else {
          clean[field] = typeof body[field] === 'string' ? (body[field] as string).trim() || null : body[field]
        }
      }
    }

    if (clean.services && Array.isArray(clean.services)) {
      clean.services = JSON.stringify(clean.services)
    }

    const updated = await db.provider.update({ where: { id }, data: clean })

    return NextResponse.json({ success: true, provider: updated })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/admin/providers/[id] - Admin deletes a provider
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const provider = await db.provider.findUnique({ where: { id } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    await db.provider.delete({ where: { id } })

    return NextResponse.json({ success: true, deletedName: provider.name })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
