export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  
  try {
    const { mapsUrl } = await req.json();
    if (!mapsUrl) return new Response(JSON.stringify({ success: false, error: 'mapsUrl required' }), { status: 400, headers });

    const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
    
    if (!PLACES_KEY) {
      // Demo data بدون Google API Key
      return new Response(JSON.stringify({
        success: true,
        rating: 4.3,
        total: 47,
        placeId: 'demo',
        reviews: [
          { author: 'محمد العتيبي', stars: 5, text: 'خدمة ممتازة جداً، سأعود بالتأكيد', date: '2026-04-05', avatar: null },
          { author: 'نورة الشمري', stars: 5, text: 'تجربة رائعة والموظفون محترمون', date: '2026-04-04', avatar: null },
          { author: 'سارة المطيري', stars: 3, text: 'الانتظار كان طويل لكن الخدمة كويسة', date: '2026-04-03', avatar: null },
          { author: 'خالد الزهراني', stars: 1, text: 'سيئ! الطلب وصل متأخر ساعتين', date: '2026-04-02', avatar: null },
          { author: 'فاطمة القحطاني', stars: 5, text: 'ممتاز كالعادة', date: '2026-04-01', avatar: null },
        ],
        note: 'demo_mode'
      }), { headers });
    }

    // Extract place ID from URL
    let placeId = null;
    const patterns = [/place_id=([^&]+)/, /!1s([^!]+)!/, /\/place\/[^/]+\/([^/]+)/];
    for (const p of patterns) { const m = mapsUrl.match(p); if (m) { placeId = m[1]; break; } }
    
    if (!placeId) {
      // Try to search by URL
      const searchRes = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(mapsUrl)}&inputtype=textquery&fields=place_id&key=${PLACES_KEY}`);
      const searchData = await searchRes.json();
      placeId = searchData.candidates?.[0]?.place_id;
    }

    if (!placeId) return new Response(JSON.stringify({ success: false, error: 'Could not find place ID' }), { status: 400, headers });

    const detailsRes = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews&language=ar&reviews_sort=newest&key=${PLACES_KEY}`);
    const details = await detailsRes.json();
    const result = details.result || {};

    return new Response(JSON.stringify({
      success: true,
      placeId,
      rating: result.rating || 0,
      total: result.user_ratings_total || 0,
      reviews: (result.reviews || []).map(r => ({
        author: r.author_name,
        stars: r.rating,
        text: r.text,
        date: new Date(r.time * 1000).toISOString().slice(0,10),
        avatar: r.profile_photo_url || null
      }))
    }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
  }
}
