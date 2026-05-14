import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/forums/[id] - Get single forum with posts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const forum = await db.forum.findUnique({
      where: { id },
      include: {
        posts: {
          orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        },
      },
    })

    if (!forum) {
      return NextResponse.json({ error: 'Foro no encontrado' }, { status: 404 })
    }

    return NextResponse.json(forum)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
