import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/reviews - Create a review
export async function POST(req: NextRequest) {
  try {
    const { targetType, targetId, reviewerType, reviewerId, rating, comment, punctual, respectful, careful, recommended } = await req.json()

    if (!targetType || !targetId || !reviewerType || !reviewerId || !rating) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'La calificación debe ser entre 1 y 5' }, { status: 400 })
    }

    const review = await db.review.create({
      data: {
        targetType,
        targetId,
        reviewerType,
        reviewerId,
        rating: Number(rating),
        comment: comment?.trim() || null,
        punctual: punctual ?? false,
        respectful: respectful ?? false,
        careful: careful ?? false,
        recommended: recommended ?? false,
      },
    })

    // Update provider average rating
    if (targetType === 'provider') {
      const allReviews = await db.review.findMany({
        where: { targetType: 'provider', targetId },
      })
      const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      await db.provider.update({
        where: { id: targetId },
        data: { rating: Math.round(avgRating * 10) / 10 },
      })
    }

    return NextResponse.json(review, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
