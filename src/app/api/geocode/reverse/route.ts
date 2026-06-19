import { NextRequest, NextResponse } from 'next/server';

// ─── Clean CJK characters ─────────────────────────────────────────────
function cleanAddress(raw: string): string {
  let clean = raw.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g, '').trim();
  clean = clean.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').replace(/,,+/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
  return clean || raw;
}

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get('lat');
  const lon = req.nextUrl.searchParams.get('lon');
  if (!lat || !lon) {
    return NextResponse.json({ display_name: '' });
  }

  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es,en`,
      { headers: { 'User-Agent': 'CargoCuba-App/1.0' }, signal: AbortSignal.timeout(5000) }
    );
    const j = await r.json();
    const raw = j.display_name || '';
    return NextResponse.json({ display_name: cleanAddress(raw) });
  } catch {
    return NextResponse.json({ display_name: '' });
  }
}