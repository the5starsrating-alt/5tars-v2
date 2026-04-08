export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if (req.method==='OPTIONS') return new Response('ok',{headers});
  if (req.method!=='POST') return new Response('Method not allowed',{status:405});
  try {
    const {mapsUrl} = await req.json();
    if (!mapsUrl) return new Response(JSON.stringify({success:false,error:'mapsUrl required'}),{status:400,headers});
    const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyBcTfCWAcgcfhf3y9_bYxRaBXjEJYDcrI8';

    // Extract place ID
    let placeId = null;
    const patterns = [/place_id=([^&]+)/,/!1s([^!]+)!/,/\/maps\/place\/[^/]+\/@[^/]+\/([A-Za-z0-9_-]{20,})/];
    for (const p of patterns) { const m=mapsUrl.match(p); if(m){placeId=m[1];break;} }

    // If short URL or no place_id, try text search
    if (!placeId) {
      const searchRes = await fetch('https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input='+encodeURIComponent(mapsUrl)+'&inputtype=textquery&fields=place_id&key='+PLACES_KEY);
      if (searchRes.ok) {
        const sd = await searchRes.json();
        placeId = sd.candidates?.[0]?.place_id;
      }
    }

    if (!placeId) {
      // Return demo if can't find place
      return new Response(JSON.stringify({success:true,rating:4.3,total:47,placeId:'demo',reviews:[
        {author:'محمد العتيبي',stars:5,text:'خدمة ممتازة جداً!',date:'2026-04-05',avatar:null},
        {author:'نورة الشمري',stars:5,text:'تجربة رائعة',date:'2026-04-04',avatar:null},
        {author:'سارة المطيري',stars:3,text:'الانتظار طويل',date:'2026-04-03',avatar:null},
        {author:'خالد الزهراني',stars:1,text:'سيئ جداً',date:'2026-04-02',avatar:null},
        {author:'فاطمة القحطاني',stars:5,text:'ممتاز كالعادة',date:'2026-04-01',avatar:null},
      ],note:'demo_mode'}),{headers});
    }

    const detailsRes = await fetch('https://maps.googleapis.com/maps/api/place/details/json?place_id='+placeId+'&fields=name,rating,user_ratings_total,reviews&language=ar&reviews_sort=newest&key='+PLACES_KEY);
    if (!detailsRes.ok) throw new Error('Google API error');
    const details = await detailsRes.json();
    if (details.status !== 'OK') throw new Error('Google: '+details.status);
    const r = details.result||{};
    return new Response(JSON.stringify({
      success:true,placeId,
      rating:r.rating||0,total:r.user_ratings_total||0,
      reviews:(r.reviews||[]).map(rv=>({
        author:rv.author_name,stars:rv.rating,text:rv.text,
        date:new Date(rv.time*1000).toISOString().slice(0,10),
        avatar:rv.profile_photo_url||null
      }))
    }),{headers});
  } catch(e) {
    return new Response(JSON.stringify({success:false,error:e.message}),{status:500,headers});
  }
}
