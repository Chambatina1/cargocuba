// =============================================
// NextAuth config + helper requireAdmin
// =============================================
// Sustituye al esquema anterior (clave "chambatina2025" hardcodeada en el
// bundle del cliente + flag en localStorage). Ahora la autenticacion es real:
//   - Provider Credentials (password o PIN) contra variables de entorno
//   - Sesion JWT firmada con NEXTAUTH_SECRET
//   - requireAdmin() reutilizable en cada route handler de escritura
//
// Variables de entorno requeridas:
//   ADMIN_PASSWORD  - clave de admin principal
//   ADMIN_PIN       - (opcional) PIN corto alternativo
//   NEXTAUTH_SECRET - secreto para firmar el JWT (generar con `openssl rand -base64 32`)
//   NEXTAUTH_URL    - URL publica del deploy (https://cargocuba.onrender.com)
// =============================================

import type { NextRequest } from 'next/server';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

// Longitud minima razonable para no aceptar cadenas vacias o basura
function isValidCredential(v: string | undefined): v is string {
  return typeof v === 'string' && v.trim().length >= 4;
}

export const authOptions: NextAuthOptions = {
  // JWT firmado: nada se guarda en DB, la cookie httpOnly contiene el token.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 }, // 7 dias
  providers: [
    CredentialsProvider({
      name: 'Admin',
      credentials: {
        password: { label: 'Clave', type: 'password' },
      },
      async authorize(credentials) {
        const password = credentials?.password ?? '';
        const adminPassword = process.env.ADMIN_PASSWORD;
        const adminPin = process.env.ADMIN_PIN;
        // Si no hay credenciales configuradas en env, fallamos cerrado (no abrimos)
        const matchesPassword = isValidCredential(adminPassword) && password === adminPassword;
        const matchesPin = isValidCredential(adminPin) && password === adminPin;
        if (matchesPassword || matchesPin) {
          return { id: 'admin', name: 'Admin', role: 'admin' } as any;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = (user as any).role ?? 'admin';
      return token;
    },
    async session({ session, token }) {
      (session as any).role = token.role;
      return session;
    },
  },
  pages: { signIn: '/admin/login' },
  secret: process.env.NEXTAUTH_SECRET,
};

// Helper para route handlers: devuelve la sesion del admin o null.
// Uso:  const admin = await requireAdmin(req); if (!admin) return 401;
import { getServerSession } from 'next-auth/next';
export async function requireAdmin(req?: NextRequest) {
  try {
    // getServerSession necesita los headers para leer la cookie
    const session = await getServerSession(authOptions);
    if (!session) return null;
    return session;
  } catch {
    return null;
  }
}
