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
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=rating,user_ratings_total&key=${KEY}`
    );
    const data = await res.json();

    if (data.status !== 'OK') {
      return new Response(JSON.stringify({ success: false, error: data.status }), { status: 400, headers: h });
    }

    return new Response(JSON.stringify({
      success: true,
      rating: data.result.rating ?? null,
      total: data.result.user_ratings_total ?? null
    }), { headers: h });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: h });
  }
}
