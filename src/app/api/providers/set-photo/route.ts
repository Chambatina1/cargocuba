import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/providers/set-photo - Admin endpoint to set a provider's photo
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { providerId, photo } = body

    if (!providerId || !photo) {
      return NextResponse.json({ error: 'providerId and photo are required' }, { status: 400 })
    }

    const provider = await db.provider.findUnique({ where: { id: providerId } })
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    const updated = await db.provider.update({
      where: { id: providerId },
      data: { photo },
    })

    return NextResponse.json({ success: true, name: updated.name })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
