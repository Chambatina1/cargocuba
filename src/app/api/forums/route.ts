import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/forums - List all forums with post counts
export async function GET() {
  try {
    const forums = await db.forum.findMany({
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { posts: true } },
        posts: {
          take: 3,
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    return NextResponse.json(forums)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/forums - Create a new forum (admin)
export async function POST(req: NextRequest) {
  try {
    const { title, description, icon, color, order } = await req.json()

    if (!title || !description) {
      return NextResponse.json({ error: 'Título y descripción son obligatorios' }, { status: 400 })
    }

    const forum = await db.forum.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        icon: icon || '💬',
        color: color || '#ea580c',
        order: order ?? 0,
      },
    })

    return NextResponse.json(forum, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
