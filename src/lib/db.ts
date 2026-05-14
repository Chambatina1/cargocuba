import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Session management
export async function createProviderSession(providerId: string): Promise<string> {
  const token = Buffer.from(
    `${providerId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  ).toString('base64')
  const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await db.provider.update({
    where: { id: providerId },
    data: { sessionToken: token, sessionExpiry: expiry },
  })
  return token
}

export async function verifyProviderSession(providerId: string, token: string): Promise<boolean> {
  const provider = await db.provider.findUnique({
    where: { id: providerId },
    select: { sessionToken: true, sessionExpiry: true },
  })
  if (!provider?.sessionToken || !provider.sessionExpiry) return false
  if (provider.sessionToken !== token) return false
  if (new Date() > provider.sessionExpiry) {
    await db.provider.update({
      where: { id: providerId },
      data: { sessionToken: null, sessionExpiry: null },
    })
    return false
  }
  return true
}
