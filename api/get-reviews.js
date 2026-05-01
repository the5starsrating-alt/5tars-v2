export const config = { runtime: 'edge' };

const PLACE_FIELDS = 'id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews';

// Resolve maps.app.goo.gl / goo.gl by manually walking redirects.
// Vercel Edge fetch with redirect:'follow' sometimes loses the final URL.
async function resolveShortUrl(url, maxHops = 5) {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    try {
      const res = await fetch(current, { method: 'GET', redirect: 'manual' });
      const loc = res.headers.get('location');
      if (!loc) {
        if (res.url && res.url !== current) return res.url;
        return current;
      }
      current = new URL(loc, current).toString();
      if (!/goo\.gl|maps\.app/.test(current)) return current;
    } catch (e) {
      try {
        const res2 = await fetch(current, { redirect: 'follow' });
        return res2.url || current;
      } catch (e2) { return current; }
    }
  }
  return current;
}

function extractPlaceId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^(ChIJ|GhIJ|EhIJ|EkIJ|EiIJ|EhEJ)[A-Za-z0-9_-]{10,}/.test(s)) return s;
  if (/^[A-Za-z0-9_-]{20,}$/.test(s) && !s.includes('://')) return s;
  try {
    const url = new URL(s);
    const qPid = url.searchParams.get('place_id');
    if (qPid) return qPid;
    const q = url.searchParams.get('q');
    if (q && q.startsWith('place_id:')) return q.replace('place_id:', '');
    const m = s.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
    if (m) return m[1];
    const m2 = s.match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
    if (m2) return m2[1];
  } catch (e) {}
  return null;
}

async function findPlaceIdByText(query, key) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName'
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'ar' })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`searchText ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  return j.places?.[0]?.id || null;
}

async function getDetails(placeId, key) {
  const url = 'https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': PLACE_FIELDS,
      'Accept-Language': 'ar'
    }
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`places ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

function queryFromMapsUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const m = url.pathname.match(/\/place\/([^/]+)/);
    if (m) return decodeURIComponent(m[1]).replace(/\+/g, ' ');
    const q = url.searchParams.get('q');
    if (q && !q.startsWith('place_id:')) return q;
  } catch (e) {}
  return null;
}

export default async function handler(req) {
  const h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });

  try {
    const body = await req.json();
    let mapsUrl = (body.mapsUrl || '').trim();
    if (!mapsUrl) throw new Error('mapsUrl is required');

    const KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    if (/goo\.gl|maps\.app/.test(mapsUrl)) {
      mapsUrl = await resolveShortUrl(mapsUrl);
    }

    let placeId = extractPlaceId(mapsUrl);

    if (!placeId) {
      const q = queryFromMapsUrl(mapsUrl);
      if (q) placeId = await findPlaceIdByText(q, KEY);
    }

    if (!placeId) {
      placeId = await findPlaceIdByText(mapsUrl, KEY);
    }

    if (!placeId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not find place. Try a Place ID (ChIJ...) or a full Google Maps URL.'
      }), { status: 404, headers: h });
    }

    const data = await getDetails(placeId, KEY);

    const reviews = (data.reviews || [])
      .map(r => ({
        author: r.authorAttribution?.displayName || 'مجهول',
        avatar: r.authorAttribution?.photoUri || null,
        uri:    r.authorAttribution?.uri || null,
        stars:  r.rating || 0,
        text:   r.text?.text || r.originalText?.text || '',
        date:   r.publishTime ? r.publishTime.slice(0, 10) : null,
        publishTime: r.publishTime || null
      }))
      .sort((a, b) => (b.publishTime || '').localeCompare(a.publishTime || ''));

    return new Response(JSON.stringify({
      success: true,
      placeId: data.id || placeId,
      name: data.displayName?.text || '',
      address: data.formattedAddress || '',
      googleMapsUri: data.googleMapsUri || '',
      rating: data.rating || 0,
      total: data.userRatingCount || 0,
      reviews,
      fetchedAt: new Date().toISOString()
    }), {
      headers: {
        ...h,
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message || 'Unknown error'
    }), { status: 500, headers: h });
  }
}
