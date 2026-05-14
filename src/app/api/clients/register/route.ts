import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/clients/register - Register new client (phone-only, no PIN)
export async function POST(req: NextRequest) {
  try {
    const { name, phone, photo } = await req.json()

    if (!name || !phone) {
      return NextResponse.json({ error: 'Nombre y teléfono son obligatorios' }, { status: 400 })
    }

    const cleanPhone = phone.trim()

    // If phone already exists, return existing client (auto-login)
    const existing = await db.client.findUnique({ where: { phone: cleanPhone } })
    if (existing) {
      return NextResponse.json({
        success: true,
        client: existing,
        alreadyExists: true,
      })
    }

    // Create new client
    const client = await db.client.create({
      data: {
        name: name.trim(),
        phone: cleanPhone,
        photo: photo || null,
      },
    })

    return NextResponse.json({ success: true, client }, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
