import { NextRequest, NextResponse } from 'next/server'

// POST /api/admin/login - Simple admin password authentication
export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chambita2025'

    if (password === ADMIN_PASSWORD) {
      // Simple token (in production, use JWT)
      const token = Buffer.from(`admin:${Date.now()}`).toString('base64')
      return NextResponse.json({ success: true, token })
    }

    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
