import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/forums/[id]/posts - Get posts for a forum
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const posts = await db.forumPost.findMany({
      where: { forumId: id },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json(posts)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/forums/[id]/posts - Create a new post
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { authorName, authorPhone, title, content } = await req.json()

    if (!authorName || !title || !content) {
      return NextResponse.json({ error: 'Nombre, título y contenido son obligatorios' }, { status: 400 })
    }

    const post = await db.forumPost.create({
      data: {
        forumId: id,
        authorName: authorName.trim(),
        authorPhone: authorPhone?.trim() || null,
        title: title.trim(),
        content: content.trim(),
      },
    })

    // Update forum post count
    const count = await db.forumPost.count({ where: { forumId: id } })
    await db.forum.update({
      where: { id },
      data: { postsCount: count },
    })

    return NextResponse.json(post, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
