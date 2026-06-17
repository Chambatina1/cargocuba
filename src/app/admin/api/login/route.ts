import { NextResponse } from 'next/server'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chambatina2025'

export async function POST(request: Request) {
  try {
    const { password } = await request.json()
    if (password === ADMIN_PASSWORD) {
      const response = NextResponse.json({ ok: true })
      response.cookies.set('cc-admin', ADMIN_PASSWORD, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      })
      return response
    }
    return NextResponse.json({ ok: false, error: 'Contrasena incorrecta' }, { status: 401 })
  } catch {
    return NextResponse.json({ ok: false, error: 'Error' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('cc-admin', '', { maxAge: 0, path: '/' })
  return response
}