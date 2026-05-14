import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/forums/seed - Seed the 3 default forums
export async function POST() {
  try {
    // Check if forums already exist
    const existing = await db.forum.count()
    if (existing > 0) {
      return NextResponse.json({ message: 'Los foros ya existen', count: existing })
    }

    const forums = await Promise.all([
      db.forum.create({
        data: {
          title: 'Servicios y Ofertas',
          description: 'Comparte tus servicios, ofertas especiales y promociones. Encuentra lo que necesitas cerca de ti.',
          icon: '🏷️',
          color: '#ea580c',
          order: 0,
          postsCount: 0,
        },
      }),
      db.forum.create({
        data: {
          title: 'Experiencias y Recomendaciones',
          description: 'Cuenta tu experiencia con los servicios de la comunidad. Recomienda a los mejores proveedores.',
          icon: '⭐',
          color: '#16a34a',
          order: 1,
          postsCount: 0,
        },
      }),
      db.forum.create({
        data: {
          title: 'Consejos y Comunidad',
          description: 'Comparte tips, consejos y todo lo relacionado con el mundo de los servicios móviles en Cuba.',
          icon: '🤝',
          color: '#2563eb',
          order: 2,
          postsCount: 0,
        },
      }),
    ])

    return NextResponse.json({ message: 'Foros creados exitosamente', forums }, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
