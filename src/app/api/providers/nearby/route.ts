import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/providers/nearby - Get providers near a location (GEOLOCATION PREMISA)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const lat = parseFloat(searchParams.get('lat') || '23.1136')
    const lng = parseFloat(searchParams.get('lng') || '-82.3666')
    const radius = parseFloat(searchParams.get('radius') || '1500000') // 1500km default (Cuba + Florida + Caribe)
    const category = searchParams.get('category')
    const available = searchParams.get('available')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {
      active: true,
      suspended: false,
    }

    if (category && category !== 'all') {
      where.serviceCategory = category
    }
    if (available === 'true') {
      where.available = true
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { businessName: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const providers = await db.provider.findMany({
      where: Object.keys(where).length > 1 || where.OR ? where : { active: true, suspended: false },
    })

    // Filter and sort by distance using Haversine
    const R = 6371000 // Earth radius in meters
    const withDistance = providers.map((p) => {
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
      return { ...p, distanceKm: Math.round(distance / 10) / 100 }
    })

    // Filter by radius and sort by distance
    const nearby = withDistance
      .filter((p) => p.distanceKm <= radius / 1000)
      .sort((a, b) => a.distanceKm - b.distanceKm)

    return NextResponse.json(nearby)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
