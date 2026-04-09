export const config = { runtime: 'edge' };

async function findPlaceId(query, key) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,rating&key=${key}`
  );
  const d = await res.json();
  return d.status === 'OK' ? d.candidates?.[0]?.place_id : null;
}

async function getDetails(placeId, key) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews&language=ar&reviews_sort=newest&key=${key}`
  );
  const d = await res.json();
  return d.status === 'OK' ? d.result : null;
}

// Extract ChIJ place_id from a full Google Maps URL
function extractIdFromUrl(url) {
  const patterns = [
    /[?&]place_id=(ChIJ[^&]+)/,
    /!1s(ChIJ[^!]+)!/,
    /\/place\/[^/]+\/@[^/]+\/[^/]+\/[^/]+\/(ChIJ[^?/]+)/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

// Follow a short URL redirect using a fetch HEAD trick (works on Edge)
async function resolveShortUrl(url) {
  try {
    // Edge runtime supports redirect: 'manual' to catch Location header
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    const location = res.headers.get('location');
    if (location && location.includes('google.com/maps')) return location;
    // Some short URLs need a GET
    const res2 = await fetch(url, { redirect: 'manual' });
    const loc2 = res2.headers.get('location');
    if (loc2 && loc2.includes('google.com/maps')) return loc2;
  } catch (_) {}
  return null;
}

export default async function handler(req) {
  const h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const body = await req.json();
    const { mapsUrl, query } = body;

    if (!mapsUrl && !query) {
      return new Response(JSON.stringify({ success: false, error: 'mapsUrl or query required' }), { status: 400, headers: h });
    }

    const KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    let placeId = null;

    // Step 1: try to extract place_id directly from URL
    if (mapsUrl) {
      placeId = extractIdFromUrl(mapsUrl);
    }

    // Step 2: if short URL (maps.app.goo.gl or goo.gl), try to resolve redirect
    if (!placeId && mapsUrl && (mapsUrl.includes('maps.app.goo.gl') || mapsUrl.includes('goo.gl'))) {
      const resolved = await resolveShortUrl(mapsUrl);
      if (resolved) {
        placeId = extractIdFromUrl(resolved);
        // also try q= param from resolved URL
        if (!placeId) {
          try {
            const q = new URL(resolved).searchParams.get('q');
            if (q) placeId = await findPlaceId(q, KEY);
          } catch (_) {}
        }
      }
    }

    // Step 3: if full Google Maps URL, try q= param
    if (!placeId && mapsUrl && mapsUrl.includes('maps.google')) {
      try {
        const q = new URL(mapsUrl).searchParams.get('q');
        if (q) placeId = await findPlaceId(q, KEY);
      } catch (_) {}
    }

    // Step 4: use the whole mapsUrl as a text search query
    if (!placeId && mapsUrl) {
      placeId = await findPlaceId(mapsUrl, KEY);
    }

    // Step 5: fallback to explicit query (e.g. business name sent by dashboard)
    if (!placeId && query) {
      placeId = await findPlaceId(query, KEY);
    }

    if (!placeId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not find place. Try using the full Google Maps URL or the exact business name.' }),
        { status: 404, headers: h }
      );
    }

    const details = await getDetails(placeId, KEY);
    if (!details) throw new Error('Could not get place details');

    return new Response(JSON.stringify({
      success: true,
      placeId,
      name: details.name,
      rating: details.rating || 0,
      total: details.user_ratings_total || 0,
      reviews: (details.reviews || []).map(r => ({
        author: r.author_name,
        stars: r.rating,
        text: r.text,
        date: new Date(r.time * 1000).toISOString().slice(0, 10),
        avatar: r.profile_photo_url || null
      }))
    }), { headers: h });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: h });
  }
}
