import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Flujo de autenticacion:
//  - Si NEXTAUTH_SECRET esta configurado (produccion): se exige JWT de NextAuth
//    (cookie next-auth.session-token). El header x-admin-key legacy se ignora.
//  - Si NEXTAUTH_SECRET no esta configurado (dev sin auth): se admite el header
//    x-admin-key con valor igual a ADMIN_PASSWORD (env), o la cookie cc-admin.
//    NUNCA se acepta el fallback hardcodeado: si ADMIN_PASSWORD falta, falla cerrado.
function verifyAdmin(request: NextRequest): boolean {
  const cookie = request.cookies.get('cc-admin')
  const header = request.headers.get('x-admin-key')
  const adminPassword = process.env.ADMIN_PASSWORD
  // Solo comparamos si hay un ADMIN_PASSWORD configurado en env
  if (adminPassword) {
    if (cookie?.value === adminPassword) return true
    if (header === adminPassword) return true
  }
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method

  // Proteger escrituras de pickups y routing (admin-only).
  // Drivers PUT queda abierto porque los choferes actualizan su propia ubicacion.
  const isProtectedWrite =
    ['PUT', 'DELETE', 'PATCH'].includes(method) && pathname.startsWith('/api/pickups') ||
    (method === 'POST' && pathname === '/api/routing')

  if (isProtectedWrite) {
    // 1) Si NextAuth esta configurado, validar JWT
    if (process.env.NEXTAUTH_SECRET) {
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
      if (!token) {
        return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
      }
      return NextResponse.next()
    }
    // 2) Sin NextAuth: esquema legacy con ADMIN_PASSWORD (env), nunca hardcodeado
    if (!verifyAdmin(request)) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/pickups/:path*', '/api/drivers/:path*', '/api/routing/:path*'],
}
