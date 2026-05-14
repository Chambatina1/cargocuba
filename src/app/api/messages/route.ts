import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/messages - Send a message
export async function POST(req: NextRequest) {
  try {
    const { content, senderType, senderId, receiverType, receiverId } = await req.json()

    if (!content || !senderType || !senderId || !receiverType || !receiverId) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    const message = await db.message.create({
      data: {
        content: content.trim(),
        senderType,
        senderId,
        receiverType,
        receiverId,
      },
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
