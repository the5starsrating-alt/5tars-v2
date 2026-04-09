export const config = { runtime: 'edge' };

const TAG_PROMPT = `أنت مصنّف تقييمات. بناءً على نجوم التقييم ونصه، أعطِ له وسوم من القائمة التالية فقط:
خدمة_ممتازة، سعر_مناسب، جودة_عالية، موظفون_محترمون، سرعة_التسليم، نظافة، موقع_مميز،
خدمة_سيئة، سعر_مرتفع، جودة_منخفضة، بطء_الخدمة، مشكلة_في_الطلب، رد_فعل_سلبي

قواعد:
- اختر 1-3 وسوم فقط
- أجب بـ JSON فقط: {"tags": ["وسم1", "وسم2"]}
- لا تضف أي نص آخر`;

export default async function handler(req) {
  const h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { reviewId, stars, text, userId } = await req.json();
    if (!reviewId || !userId) {
      return new Response(JSON.stringify({ success: false, error: 'reviewId and userId required' }), { status: 400, headers: h });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!OPENAI_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing env vars');
    }

    // Generate tags via OpenAI
    let tags = [];
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 60,
          temperature: 0.2,
          messages: [
            { role: 'system', content: TAG_PROMPT },
            { role: 'user', content: `نجوم: ${stars}\nنص: ${text || '(بدون تعليق)'}` }
          ]
        })
      });
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [];
    } catch (_) {
      // Fallback: simple rule-based tags
      tags = stars >= 4 ? ['خدمة_ممتازة'] : stars <= 2 ? ['خدمة_سيئة'] : [];
    }

    // Save tags to Supabase
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/reviews?id=eq.${reviewId}&user_id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ tags })
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.text();
      throw new Error('DB update failed: ' + err);
    }

    return new Response(JSON.stringify({ success: true, tags }), { headers: h });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: h });
  }
}
