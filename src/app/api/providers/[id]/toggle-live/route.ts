import { NextRequest, NextResponse } from 'next/server'
import { db, verifyProviderSession } from '@/lib/db'

// POST /api/providers/[id]/toggle-live - Toggle provider availability (go live/offline)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { token, pin, lat, lng } = await req.json()

    const provider = await db.provider.findUnique({ where: { id } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    // Verify auth
    if (token) {
      const valid = await verifyProviderSession(id, token)
      if (!valid) {
        return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
      }
    } else if (pin) {
      if (provider.pin !== pin) {
        return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
      }
    }

    const newStatus = !provider.available

    const updated = await db.provider.update({
      where: { id },
      data: {
        available: newStatus,
        ...(lat !== undefined ? { lat: Number(lat) } : {}),
        ...(lng !== undefined ? { lng: Number(lng) } : {}),
      },
    })

    return NextResponse.json({
      success: true,
      available: newStatus,
      provider: updated,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
