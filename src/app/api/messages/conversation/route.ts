import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/messages/conversation - Get conversation between two users
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const user1Type = searchParams.get('user1Type')
    const user1Id = searchParams.get('user1Id')
    const user2Type = searchParams.get('user2Type')
    const user2Id = searchParams.get('user2Id')

    if (!user1Type || !user1Id || !user2Type || !user2Id) {
      return NextResponse.json({ error: 'Parámetros incompletos' }, { status: 400 })
    }

    const messages = await db.message.findMany({
      where: {
        OR: [
          { senderType: user1Type, senderId: user1Id, receiverType: user2Type, receiverId: user2Id },
          { senderType: user2Type, senderId: user2Id, receiverType: user1Type, receiverId: user1Id },
        ],
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(messages)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
