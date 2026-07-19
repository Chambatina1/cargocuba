import { NextResponse } from 'next/server'

// Credencial desde env. NUNCA hardcodeada: si falta, el login falla cerrado.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

export async function POST(request: Request) {
  try {
    const { password } = await request.json()
    if (!ADMIN_PASSWORD || password === ADMIN_PASSWORD) {
      // Si no hay ADMIN_PASSWORD configurado, no se permite login (fail closed)
      if (!ADMIN_PASSWORD) {
        return NextResponse.json({ ok: false, error: 'ADMIN_PASSWORD no configurado' }, { status: 503 })
      }
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