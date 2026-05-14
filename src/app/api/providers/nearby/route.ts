import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/providers/nearby - Get providers near a location
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const lat = parseFloat(searchParams.get('lat') || '23.1136')
    const lng = parseFloat(searchParams.get('lng') || '-82.3666')
    const radius = parseFloat(searchParams.get('radius') || '50000') // 50km default
    const category = searchParams.get('category')

    const where: Record<string, unknown> = {
      active: true,
      suspended: false,
    }

    if (category && category !== 'all') {
      where.serviceCategory = category
    }

    const providers = await db.provider.findMany({
      where,
    })

    // Filter by distance using Haversine
    const R = 6371000 // Earth radius in meters
    const nearby = providers.filter((p) => {
      const dLat = ((p.lat - lat) * Math.PI) / 180
      const dLng = ((p.lng - lng) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((p.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const distance = R * c
      return distance <= radius
    })

    return NextResponse.json(nearby)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
