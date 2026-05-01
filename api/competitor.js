export const config = { runtime: 'edge' };

const FIELDS_FULL  = 'id,displayName,formattedAddress,rating,userRatingCount,reviews';
const FIELDS_BASIC = 'id,displayName,rating,userRatingCount';

async function resolveShortUrl(url, maxHops = 5) {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    try {
      const res = await fetch(current, { method: 'GET', redirect: 'manual' });
      const loc = res.headers.get('location');
      if (!loc) return res.url && res.url !== current ? res.url : current;
      current = new URL(loc, current).toString();
      if (!/goo\.gl|maps\.app/.test(current)) return current;
    } catch (e) {
      try { const r2 = await fetch(current, { redirect: 'follow' }); return r2.url || current; }
      catch (_) { return current; }
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
    const m = s.match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
    if (m) return m[1];
  } catch (e) {}
  return null;
}

async function findByText(query, key) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount'
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'ar' })
  });
  if (!res.ok) throw new Error(`searchText ${res.status}`);
  const j = await res.json();
  return j.places?.[0] || null;
}

async function getDetails(placeId, key, fields = FIELDS_FULL) {
  const res = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId), {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fields,
      'Accept-Language': 'ar'
    }
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  return res.json();
}

export default async function handler(req) {
  const h = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    let { query, myPlaceId } = await req.json();
    if (!query) return new Response(JSON.stringify({ success:false, error:'query required' }), { status:400, headers:h });

    const KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    // 1) Try resolving as a maps URL/Place ID first
    if (/goo\.gl|maps\.app/.test(query)) query = await resolveShortUrl(query);
    let competitorId = extractPlaceId(query);
    let competitorBasic = null;

    if (!competitorId) {
      // text search
      const found = await findByText(query, KEY);
      if (!found) return new Response(JSON.stringify({ success:false, error:'لم يُعثر على المنافس' }), { headers:h });
      competitorId = found.id;
      competitorBasic = found;
    }

    // 2) Full details + reviews
    const comp = await getDetails(competitorId, KEY, FIELDS_FULL);

    // 3) Mine (basic only)
    let mine = null;
    if (myPlaceId) {
      try {
        const m = await getDetails(myPlaceId, KEY, FIELDS_BASIC);
        mine = {
          name: m.displayName?.text || '',
          rating: m.rating || 0,
          total: m.userRatingCount || 0
        };
      } catch (_) {}
    }

    const compRating = comp.rating || 0;
    const myRating   = mine?.rating || 0;
    const compTotal  = comp.userRatingCount || 0;
    const myTotal    = mine?.total || 0;

    const insights = [];
    if (myRating > 0) {
      if (compRating > myRating) insights.push(`⚠️ المنافس أعلى منك بـ ${(compRating-myRating).toFixed(1)} نجمة`);
      else if (myRating > compRating) insights.push(`✅ أنت أعلى من المنافس بـ ${(myRating-compRating).toFixed(1)} نجمة`);
      else insights.push('🟡 نفس التقييم');
      if (compTotal > myTotal * 2) insights.push(`⚠️ المنافس عنده ${compTotal} تقييم — أنت ${myTotal} فقط`);
      else if (compTotal > myTotal) insights.push(`📊 المنافس أكثر منك بـ ${compTotal-myTotal} تقييم`);
    }

    const allReviews = (comp.reviews || []).map(r => ({
      stars: r.rating || 0,
      text:  r.text?.text || r.originalText?.text || ''
    }));
    const positives = allReviews.filter(r => r.stars >= 4).slice(0, 2).map(r => r.text.slice(0, 100));
    const negatives = allReviews.filter(r => r.stars <= 2).slice(0, 2).map(r => r.text.slice(0, 100));

    return new Response(JSON.stringify({
      success: true,
      competitor: {
        name: comp.displayName?.text || competitorBasic?.displayName?.text || '',
        address: comp.formattedAddress || '',
        rating: compRating,
        total: compTotal,
        placeId: comp.id || competitorId
      },
      mine,
      insights,
      competitorPositives: positives,
      competitorNegatives: negatives
    }), { headers: h });

  } catch (e) {
    return new Response(JSON.stringify({ success:false, error:e.message }), { status:500, headers:h });
  }
}
