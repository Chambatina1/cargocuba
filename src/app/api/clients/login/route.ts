import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/clients/login - Login client by phone only
export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json()

    if (!phone) {
      return NextResponse.json({ error: 'El teléfono es obligatorio' }, { status: 400 })
    }

    const cleanPhone = phone.trim()
    const client = await db.client.findUnique({ where: { phone: cleanPhone } })

    if (!client) {
      return NextResponse.json({ error: 'No se encontró un cliente con este teléfono' }, { status: 404 })
    }

    return NextResponse.json({ success: true, client })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
