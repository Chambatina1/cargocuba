import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chambatina2025'

function verifyAdmin(request: NextRequest): boolean {
  // Check cookie (for page access)
  const cookie = request.cookies.get('cc-admin')
  if (cookie?.value === ADMIN_PASSWORD) return true

  // Check header (for API calls from admin page)
  const header = request.headers.get('x-admin-key')
  if (header === ADMIN_PASSWORD) return true

  return false
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method

  // Protect admin API write methods (PUT/DELETE/PATCH)
  // Drivers PUT is allowed (choferes update their own location/PP)
  // Pickups PUT/DELETE require admin auth
  if (['PUT', 'DELETE', 'PATCH'].includes(method) && pathname.startsWith('/api/pickups')) {
    if (!verifyAdmin(request)) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/pickups/:path*', '/api/drivers/:path*'],
}