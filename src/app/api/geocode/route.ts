import { NextRequest, NextResponse } from 'next/server';

// ─── Types ─────────────────────────────────────────────────────────────
interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
  source: string;
}

// ─── Clean CJK characters ─────────────────────────────────────────────
function cleanAddress(raw: string): string {
  let clean = raw.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g, '').trim();
  clean = clean.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').replace(/,,+/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
  return clean || raw;
}

// ─── 1. US Census Geocoding (best US address coverage) ─────────────────
async function censusGeocode(query: string): Promise<GeoResult[]> {
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(query)}&benchmark=2020&format=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    const matches = j?.result?.addressMatches;
    if (!matches || matches.length === 0) return [];

    return matches.slice(0, 3).map((m: Record<string, unknown>) => {
      const coords = m.coordinates as { x: number; y: number };
      const addr = m.addressComponents as Record<string, string>;
      const display = [
        addr.streetName ? `${addr.fromAddress || ''} ${addr.streetName} ${addr.suffixType || addr.preType || ''}`.trim() : '',
        addr.city || '', addr.state || '', addr.zip || ''
      ].filter(Boolean).join(', ');
      return {
        display_name: cleanAddress(display || query),
        lat: String(coords.y),
        lon: String(coords.x),
        source: 'census'
      };
    });
  } catch {
    return [];
  }
}

// ─── 2. Nominatim (OpenStreetMap) ──────────────────────────────────────
async function nominatimSearch(query: string): Promise<GeoResult[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&accept-language=es,en`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'CargoCuba-App/1.0' },
      signal: AbortSignal.timeout(4000)
    });
    const j = await r.json();
    if (!Array.isArray(j)) return [];
    return j.slice(0, 5).map((s: { display_name: string; lat: string; lon: string }) => ({
      display_name: cleanAddress(s.display_name),
      lat: s.lat,
      lon: s.lon,
      source: 'nominatim'
    }));
  } catch {
    return [];
  }
}

// ─── 3. Photon (Komoot - excellent address search) ─────────────────────
async function photonSearch(query: string): Promise<GeoResult[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    if (!j?.features) return [];
    return j.features.slice(0, 5).map((f: Record<string, unknown>) => {
      const props = f.properties as Record<string, string>;
      const geo = f.geometry as { coordinates: [number, number] };
      const name = props.name || '';
      const street = props.street || '';
      const city = props.city || '';
      const state = props.state || '';
      const postcode = props.postcode || '';
      const country = props.country || '';
      const display = [name, street, city, state, postcode, country].filter(Boolean).join(', ');
      return {
        display_name: cleanAddress(display || name),
        lat: String(geo.coordinates[1]),
        lon: String(geo.coordinates[0]),
        source: 'photon'
      };
    });
  } catch {
    return [];
  }
}

// ─── 4. Nominatim with Florida context ─────────────────────────────────
async function nominatimFlorida(query: string): Promise<GeoResult[]> {
  try {
    // Remove any existing "Florida" or "FL" from query to avoid duplication
    let q = query.replace(/,\s*florida\s*/i, ', ').replace(/,\s*fl\s*/i, ', ').trim();
    q = `${q}, Florida, USA`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=3&accept-language=es,en&viewbox=-87.6,31.0,-79.8,25.0&bounded=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'CargoCuba-App/1.0' },
      signal: AbortSignal.timeout(4000)
    });
    const j = await r.json();
    if (!Array.isArray(j)) return [];
    return j.slice(0, 3).map((s: { display_name: string; lat: string; lon: string }) => ({
      display_name: cleanAddress(s.display_name),
      lat: s.lat,
      lon: s.lon,
      source: 'nominatim-fl'
    }));
  } catch {
    return [];
  }
}

// ─── 5. Nominatim with Cuba context ────────────────────────────────────
async function nominatimCuba(query: string): Promise<GeoResult[]> {
  try {
    let q = query.replace(/,\s*cuba\s*/i, ', ').trim();
    q = `${q}, Cuba`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=3&accept-language=es,en&viewbox=-85.0,23.2,-74.0,19.8&bounded=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'CargoCuba-App/1.0' },
      signal: AbortSignal.timeout(4000)
    });
    const j = await r.json();
    if (!Array.isArray(j)) return [];
    return j.slice(0, 3).map((s: { display_name: string; lat: string; lon: string }) => ({
      display_name: cleanAddress(s.display_name),
      lat: s.lat,
      lon: s.lon,
      source: 'nominatim-cu'
    }));
  } catch {
    return [];
  }
}

// ─── DEDUPLICATE by lat,lon (within ~10m) ──────────────────────────────
function dedupe(results: GeoResult[]): GeoResult[] {
  const seen = new Map<string, GeoResult>();
  for (const r of results) {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    // Round to 4 decimal places (~11m precision) for dedup key
    const key = `${Math.round(lat * 10000)},${Math.round(lon * 10000)}`;
    // Prefer census results over others for same location
    if (!seen.has(key)) {
      seen.set(key, r);
    } else {
      const existing = seen.get(key)!;
      const priority: Record<string, number> = { census: 0, photon: 1, nominatim: 2, 'nominatim-fl': 3, 'nominatim-cu': 4 };
      if ((priority[r.source] ?? 5) < (priority[existing.source] ?? 5)) {
        seen.set(key, r);
      }
    }
  }
  return Array.from(seen.values());
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Run ALL sources in parallel for maximum speed
  const [census, nomDirect, photon, nomFL, nomCU] = await Promise.all([
    censusGeocode(q),
    nominatimSearch(q),
    photonSearch(q),
    nominatimFlorida(q),
    nominatimCuba(q),
  ]);

  // Combine: Census first (most precise for US), then others
  const all = [...census, ...photon, ...nomDirect, ...nomFL, ...nomCU];
  const deduped = dedupe(all);

  // Sort: census results first, then by source quality
  const sourceOrder: Record<string, number> = { census: 0, photon: 1, nominatim: 2, 'nominatim-fl': 3, 'nominatim-cu': 4 };
  deduped.sort((a, b) => (sourceOrder[a.source] ?? 9) - (sourceOrder[b.source] ?? 9));

  return NextResponse.json({
    results: deduped.slice(0, 8)
  });
}