export const config = { runtime: 'edge' };

export default async function handler(req) {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { place_id } = await req.json();
    if (!place_id) return new Response(JSON.stringify({ success: false, error: 'place_id required' }), { status: 400, headers: h });

    const KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!KEY) return new Response(JSON.stringify({ success: false, error: 'Google API not configured' }), { status: 503, headers: h });

    const res = await fetch(
      'https://places.googleapis.com/v1/places/' + encodeURIComponent(place_id),
      {
        headers: {
          'X-Goog-Api-Key': KEY,
          'X-Goog-FieldMask': 'rating,userRatingCount',
          'Accept-Language': 'ar'
        }
      }
    );

    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ success: false, error: `places ${res.status}: ${t.slice(0, 120)}` }), { status: 400, headers: h });
    }

    const data = await res.json();

    return new Response(JSON.stringify({
      success: true,
      rating: data.rating ?? null,
      total: data.userRatingCount ?? null
    }), { headers: { ...h, 'Cache-Control': 's-maxage=120, stale-while-revalidate=600' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: h });
  }
}
