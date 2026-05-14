import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/providers/seed-drivers - Restore the 5 original drivers from cargocuba
export async function POST() {
  try {
    const drivers = [
      {
        name: 'Alain Valle',
        phone: '5722044734',
        pin: '1234',
        serviceCategory: 'carga',
        vehicleType: 'camion_mediano',
        lat: 23.1136,
        lng: -82.3666,
        bio: 'Conductor de camión mediano con experiencia en transporte de carga.',
        available: false,
        rating: 5.0,
        totalJobs: 0,
      },
      {
        name: 'Boris',
        phone: '5352132015',
        pin: '1234',
        serviceCategory: 'pasaje',
        vehicleType: 'carro_moderno',
        lat: 22.8,
        lng: -83.6,
        bio: 'Transporte de pasajeros desde Sandino hasta el Aeropuerto Jose Marti.',
        route1From: 'Sandino',
        route1To: 'Aeropuerto Jose Marti',
        available: false,
        rating: 5.0,
        totalJobs: 0,
      },
      {
        name: 'Jorge Luis Carbo Perez',
        phone: '5355748655',
        pin: '1234',
        serviceCategory: 'pasaje',
        vehicleType: 'carro_moderno',
        lat: 22.4,
        lng: -79.96,
        bio: 'Ruta Santa Clara - La Habana. Carro moderno aire acondicionado.',
        route1From: 'Santa Clara',
        route1To: 'La Habana',
        available: false,
        rating: 5.0,
        totalJobs: 0,
      },
      {
        name: 'Geo',
        phone: '7869426904',
        pin: '1234',
        serviceCategory: 'pasaje',
        vehicleType: 'carro_moderno',
        lat: 28.5,
        lng: -81.3,
        bio: 'Transporte Orlando - Miami. Servicio puerta a puerta.',
        route1From: 'Orlando',
        route1To: 'Miami',
        available: false,
        rating: 5.0,
        totalJobs: 0,
      },
      {
        name: 'Vladimir Hernandez',
        phone: '56153292',
        pin: '1234',
        serviceCategory: 'pasaje',
        vehicleType: 'triciclo',
        lat: 23.1,
        lng: -82.4,
        bio: 'Triciclo por La Habana. Ruta Coppelia - La Ceguena.',
        route1From: 'Coppelia',
        route1To: 'La Ceguena',
        available: false,
        rating: 5.0,
        totalJobs: 0,
      },
    ]

    const results: Array<{ name: string; status: string; id?: string }> = []

    for (const d of drivers) {
      const existing = await db.provider.findUnique({ where: { phone: d.phone } })
      if (existing) {
        results.push({ name: d.name, status: 'already_exists', id: existing.id })
      } else {
        const provider = await db.provider.create({ data: d })
        results.push({ name: d.name, status: 'created', id: provider.id })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
