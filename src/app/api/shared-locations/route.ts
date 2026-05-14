import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET /api/shared-locations — Get recent shared locations (last 24h)
export async function GET() {
  try {
    const oneDayAgo = new Date()
    oneDayAgo.setHours(oneDayAgo.getHours() - 24)

    const locations = await prisma.sharedLocation.findMany({
      where: {
        createdAt: { gte: oneDayAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json(locations)
  } catch (error) {
    console.error('Error fetching shared locations:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST /api/shared-locations — Create a new shared location
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientName, clientPhoto, providerId, lat, lng, address } = body

    if (!clientName || !providerId || lat == null || lng == null) {
      return NextResponse.json(
        { error: 'Nombre, proveedor y ubicación son obligatorios' },
        { status: 400 }
      )
    }

    // Clean up old shared locations for this provider (keep last 10)
    const existingCount = await prisma.sharedLocation.count({
      where: { providerId },
    })
    if (existingCount >= 10) {
      const oldLocations = await prisma.sharedLocation.findMany({
        where: { providerId },
        orderBy: { createdAt: 'asc' },
        take: existingCount - 9,
      })
      if (oldLocations.length > 0) {
        await prisma.sharedLocation.deleteMany({
          where: { id: { in: oldLocations.map(l => l.id) } },
        })
      }
    }

    const location = await prisma.sharedLocation.create({
      data: {
        clientName: String(clientName).slice(0, 100),
        clientPhoto: clientPhoto ? String(clientPhoto).slice(0, 100000) : null,
        providerId: String(providerId),
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address: address ? String(address).slice(0, 200) : null,
      },
    })

    return NextResponse.json(location, { status: 201 })
  } catch (error) {
    console.error('Error creating shared location:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// DELETE /api/shared-locations — Delete old locations (cleanup)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    await prisma.sharedLocation.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting shared location:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
