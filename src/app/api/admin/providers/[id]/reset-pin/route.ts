import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function isAdmin(req: NextRequest): boolean {
  return !!req.headers.get('x-admin-token')
}

// POST /api/admin/providers/[id]/reset-pin - Generate new PIN for driver
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const newPin = body.pin || String(Math.floor(1000 + Math.random() * 9000))

    const provider = await db.provider.findUnique({ where: { id } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    const updated = await db.provider.update({
      where: { id },
      data: { pin: newPin },
    })

    return NextResponse.json({
      success: true,
      name: updated.name,
      phone: updated.phone,
      newPin,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
