import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/providers/set-photo - Admin endpoint to set all photos for a provider
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { providerId, photo, carPhoto1, carPhoto2, carPhoto3 } = body

    if (!providerId) {
      return NextResponse.json({ error: 'providerId is required' }, { status: 400 })
    }

    const provider = await db.provider.findUnique({ where: { id: providerId } })
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    const updateData: Record<string, string | null> = {}
    if (photo !== undefined) updateData.photo = photo || null
    if (carPhoto1 !== undefined) updateData.carPhoto1 = carPhoto1 || null
    if (carPhoto2 !== undefined) updateData.carPhoto2 = carPhoto2 || null
    if (carPhoto3 !== undefined) updateData.carPhoto3 = carPhoto3 || null

    const updated = await db.provider.update({
      where: { id: providerId },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      name: updated.name,
      hasPhoto: !!updated.photo,
      hasCarPhoto1: !!updated.carPhoto1,
      hasCarPhoto2: !!updated.carPhoto2,
      hasCarPhoto3: !!updated.carPhoto3,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
