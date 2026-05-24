import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/setup-db - Apply database schema changes
// This is a one-time migration endpoint
export async function GET() {
  try {
    const results: string[] = []

    // Add carBrand column if not exists
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "carBrand" TEXT;`
      )
      results.push('carBrand column added/exists')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error'
      results.push(`carBrand: ${msg}`)
    }

    // Add carModel column if not exists
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "carModel" TEXT;`
      )
      results.push('carModel column added/exists')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error'
      results.push(`carModel: ${msg}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Database schema updated',
      results,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
