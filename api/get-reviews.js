export const config = { runtime: 'edge' };

async function findPlaceId(query, key) {
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,rating&key=${key}`);
  const d = await res.json();
  return d.status==='OK' ? d.candidates?.[0]?.place_id : null;
}

async function getDetails(placeId, key) {
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews&language=ar&reviews_sort=newest&key=${key}`);
  const d = await res.json();
  return d.status==='OK' ? d.result : null;
}

function extractId(url) {
  const ps = [/[?&]place_id=([^&]+)/,/!1s(ChIJ[^!]+)!/];
  for (const p of ps) { const m=url.match(p); if(m) return m[1]; }
  return null;
}

export default async function handler(req) {
  const h = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS' };
  if (req.method==='OPTIONS') return new Response('ok',{headers:h});
  if (req.method!=='POST') return new Response('Method not allowed',{status:405});
  try {
    const { mapsUrl } = await req.json();
    if (!mapsUrl) return new Response(JSON.stringify({success:false,error:'mapsUrl required'}),{status:400,headers:h});
    const KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    let placeId = extractId(mapsUrl) || await findPlaceId(mapsUrl, KEY);
    if (!placeId && mapsUrl.includes('maps.google')) {
      try { const q=new URL(mapsUrl).searchParams.get('q'); if(q) placeId=await findPlaceId(q,KEY); } catch{}
    }
    if (!placeId) placeId = await findPlaceId(mapsUrl, KEY);
    if (!placeId) return new Response(JSON.stringify({success:false,error:'Could not find place'}),{status:404,headers:h});

    const details = await getDetails(placeId, KEY);
    if (!details) throw new Error('Could not get place details');

    return new Response(JSON.stringify({
      success: true, placeId, name: details.name,
      rating: details.rating||0, total: details.user_ratings_total||0,
      reviews: (details.reviews||[]).map(r=>({
        author: r.author_name, stars: r.rating, text: r.text,
        date: new Date(r.time*1000).toISOString().slice(0,10),
        avatar: r.profile_photo_url||null
      }))
    }), {headers:h});
  } catch(e) {
    return new Response(JSON.stringify({success:false,error:e.message}),{status:500,headers:h});
  }
}
