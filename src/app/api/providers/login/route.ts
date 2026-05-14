import { NextRequest, NextResponse } from 'next/server'
import { db, createProviderSession } from '@/lib/db'

// POST /api/providers/login - Login with phone + PIN
export async function POST(req: NextRequest) {
  try {
    const { phone, pin } = await req.json()

    if (!phone || !pin) {
      return NextResponse.json({ error: 'Teléfono y PIN son obligatorios' }, { status: 400 })
    }

    const provider = await db.provider.findUnique({ where: { phone: phone.trim() } })

    if (!provider) {
      return NextResponse.json({ error: 'No se encontró un proveedor con este teléfono' }, { status: 404 })
    }

    if (provider.pin !== pin.trim()) {
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
    }

    if (provider.suspended) {
      return NextResponse.json({ error: `Cuenta suspendida: ${provider.suspendedReason || 'Contacte soporte'}` }, { status: 403 })
    }

    // Create session
    const token = await createProviderSession(provider.id)

    return NextResponse.json({
      success: true,
      provider,
      token,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
