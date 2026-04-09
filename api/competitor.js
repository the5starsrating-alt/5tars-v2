export const config = { runtime: 'edge' };

export default async function handler(req) {
  const h = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS' };
  if (req.method==='OPTIONS') return new Response('ok',{headers:h});
  if (req.method!=='POST') return new Response('Method not allowed',{status:405});

  try {
    const { query, myPlaceId } = await req.json();
    if (!query) return new Response(JSON.stringify({success:false,error:'query required'}),{status:400,headers:h});

    const KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!KEY) throw new Error('Google API not configured');

    // بحث عن المنافس
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,rating,user_ratings_total&key=${KEY}`
    );
    const searchData = await searchRes.json();
    if (searchData.status !== 'OK' || !searchData.candidates?.length) {
      return new Response(JSON.stringify({success:false,error:'لم يُعثر على المنافس'}),{headers:h});
    }

    const competitor = searchData.candidates[0];

    // تفاصيل المنافس
    const detRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${competitor.place_id}&fields=name,rating,user_ratings_total,reviews,formatted_address&language=ar&key=${KEY}`
    );
    const detData = await detRes.json();
    const comp = detData.result || {};

    // تفاصيل مشروعنا (إذا عندنا place_id)
    let mine = null;
    if (myPlaceId) {
      const myRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${myPlaceId}&fields=name,rating,user_ratings_total&language=ar&key=${KEY}`
      );
      const myData = await myRes.json();
      mine = myData.result || null;
    }

    // تحليل المقارنة
    const compRating = comp.rating || 0;
    const myRating = mine?.rating || 0;
    const compTotal = comp.user_ratings_total || 0;
    const myTotal = mine?.user_ratings_total || 0;

    const insights = [];
    if (myRating > 0) {
      if (compRating > myRating) insights.push(`⚠️ المنافس أعلى منك بـ ${(compRating-myRating).toFixed(1)} نجمة`);
      else if (myRating > compRating) insights.push(`✅ أنت أعلى من المنافس بـ ${(myRating-compRating).toFixed(1)} نجمة`);
      else insights.push('🟡 نفس التقييم');

      if (compTotal > myTotal * 2) insights.push(`⚠️ المنافس عنده ${compTotal} تقييم — أنت ${myTotal} فقط`);
      else if (compTotal > myTotal) insights.push(`📊 المنافس أكثر منك بـ ${compTotal-myTotal} تقييم`);
    }

    // أبرز ما يقوله عملاء المنافس
    const positives = (comp.reviews||[]).filter(r=>r.rating>=4).slice(0,2).map(r=>r.text?.slice(0,100));
    const negatives = (comp.reviews||[]).filter(r=>r.rating<=2).slice(0,2).map(r=>r.text?.slice(0,100));

    return new Response(JSON.stringify({
      success: true,
      competitor: {
        name: comp.name,
        address: comp.formatted_address,
        rating: compRating,
        total: compTotal,
        placeId: competitor.place_id
      },
      mine: mine ? { name: mine.name, rating: myRating, total: myTotal } : null,
      insights,
      competitorPositives: positives,
      competitorNegatives: negatives
    }), {headers:h});

  } catch(e) {
    return new Response(JSON.stringify({success:false,error:e.message}),{status:500,headers:h});
  }
}
