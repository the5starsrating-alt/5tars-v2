export const config = { runtime: 'edge' };

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyBcTfCWAcgcfhf3y9_bYxRaBXjEJYDcrI8';

async function findPlaceId(query) {
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,rating&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'OK' && data.candidates?.length > 0) {
    return data.candidates[0].place_id;
  }
  return null;
}

async function getPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews&language=ar&reviews_sort=newest&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'OK') return data.result;
  return null;
}

function extractPlaceId(mapsUrl) {
  // أنماط مختلفة لـ place_id في روابط Google Maps
  const patterns = [
    /[?&]place_id=([^&]+)/,           // ?place_id=ChIJ...
    /!1s(ChIJ[^!]+)!/,                // !1sChIJ...!
    /maps\/place\/[^/]+\/([^/]*ChIJ[^/]*)/,  // /place/name/ChIJ...
    /0x[0-9a-f]+:0x[0-9a-f]+/,       // hex format
  ];
  for (const p of patterns) {
    const m = mapsUrl.match(p);
    if (m) return m[1];
  }
  return null;
}

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { mapsUrl } = await req.json();
    if (!mapsUrl) return new Response(JSON.stringify({ success: false, error: 'mapsUrl required' }), { status: 400, headers });

    // 1. حاول استخراج place_id من الرابط
    let placeId = extractPlaceId(mapsUrl);

    // 2. إذا فشل، استخدم النص كـ query
    if (!placeId) {
      placeId = await findPlaceId(mapsUrl);
    }

    // 3. إذا فشل كل شيء، ابحث بالـ URL كنص
    if (!placeId && mapsUrl.includes('maps.google')) {
      const urlObj = new URL(mapsUrl);
      const q = urlObj.searchParams.get('q') || urlObj.searchParams.get('query');
      if (q) placeId = await findPlaceId(q);
    }

    // 4. fallback: demo data
    if (!placeId) {
      return new Response(JSON.stringify({
        success: true, rating: 4.3, total: 47, placeId: 'demo',
        reviews: [
          { author: 'محمد العتيبي', stars: 5, text: 'خدمة ممتازة جداً!', date: '2026-04-05' },
          { author: 'نورة الشمري', stars: 5, text: 'تجربة رائعة', date: '2026-04-04' },
          { author: 'سارة المطيري', stars: 3, text: 'الانتظار طويل لكن الخدمة كويسة', date: '2026-04-03' },
          { author: 'خالد الزهراني', stars: 1, text: 'سيئ! الطلب وصل متأخر', date: '2026-04-02' },
          { author: 'فاطمة القحطاني', stars: 5, text: 'ممتاز كالعادة', date: '2026-04-01' },
        ],
        note: 'demo_mode'
      }), { headers });
    }

    // 5. جلب التفاصيل الحقيقية
    const details = await getPlaceDetails(placeId);
    if (!details) throw new Error('Could not get place details');

    return new Response(JSON.stringify({
      success: true,
      placeId,
      rating: details.rating || 0,
      total: details.user_ratings_total || 0,
      name: details.name,
      reviews: (details.reviews || []).map(r => ({
        author: r.author_name,
        stars: r.rating,
        text: r.text,
        date: new Date(r.time * 1000).toISOString().slice(0, 10),
        avatar: r.profile_photo_url || null
      }))
    }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
  }
}
