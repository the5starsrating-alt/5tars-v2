export const config = { runtime: 'edge' };

const PLAN_LIMITS = { trial: 10, free: 5, basic: 50, pro: 200, advanced: 999999 };

export default async function handler(req) {
  const h = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { businessName='محلك', businessType='restaurant', rating=5,
            reviewText='', dialect='saudi', userId, plan='trial' } = await req.json();

    // Rate limit check via Supabase
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const dailyLimit = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;

    if (userId && SUPABASE_URL && SUPABASE_KEY) {
      const today = new Date().toISOString().slice(0, 10);
      const usageRes = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_usage?user_id=eq.${userId}&created_at=gte.${today}T00:00:00&select=id`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const usage = await usageRes.json();
      if (Array.isArray(usage) && usage.length >= dailyLimit) {
        return new Response(JSON.stringify({
          success: false, error: 'limit_reached',
          message: `وصلت للحد اليومي (${dailyLimit} رد). رقّي باقتك للحصول على المزيد.`
        }), { status: 429, headers: h });
      }
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');

    const typeMap = { restaurant:'مطعم', cafe:'كافيه', salon:'صالون تجميل',
      clinic:'عيادة', retail:'متجر', gym:'نادي رياضي', hotel:'فندق', other:'نشاط تجاري' };
    const bizType = typeMap[businessType] || 'نشاط تجاري';
    const tone = rating>=4 ? 'شاكراً وحماسي' : rating===3 ? 'مهذب وإيجابي' : 'معتذر وحلّال مشاكل';

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 180, temperature: 0.75,
        messages: [
          { role: 'system', content: `أنت مدير ${bizType} اسمه "${businessName}". اكتب رداً ${tone} على تقييم العميل. اللهجة: ${dialect==='saudi'?'سعودية خليجية':'عربية مبسطة'}. لا تزيد عن 3 جمل. إيموجي واحد في النهاية.` },
          { role: 'user', content: `تقييم: ${rating} نجوم${reviewText?'\nتعليق: "'+reviewText+'"':''}` }
        ]
      })
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('No reply from OpenAI');

    const tokens = data.usage?.total_tokens || 0;
    const cost = tokens * 0.00000015;

    // Log usage
    if (userId && SUPABASE_URL && SUPABASE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/ai_usage`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId, feature: 'reply', model: 'gpt-4o-mini',
          tokens_in: data.usage?.prompt_tokens||0, tokens_out: data.usage?.completion_tokens||0, cost_usd: cost })
      });
    }

    return new Response(JSON.stringify({ reply, source: 'openai', tokens, cost }), { headers: h });

  } catch (e) {
    // Fallback templates
    const t = {
      5: ['شكراً جزيلاً على كلامك الجميل! يسعدنا أن تجربتك كانت ممتازة 🌟',
          'والله يسعدنا نسمع كلام حلو! زيارتك الجاية ما تنتظر 😊'],
      4: ['شكراً لتقييمك الإيجابي! نعمل باستمرار لنكون عند توقعاتك 😊'],
      3: ['شكراً لمشاركتك رأيك! نأخذ ملاحظاتك بجدية ونعمل على التحسين 🙏'],
      2: ['نعتذر عن تجربتك! تواصل معنا مباشرة حتى نعوضك 🙏'],
      1: ['نأسف بشدة على تجربتك! تواصل معنا فوراً وسنعوضك 💙']
    };
    const r = parseInt(e.message) || 3;
    const bucket = t[Math.min(5,Math.max(1,r))] || t[3];
    return new Response(JSON.stringify({
      reply: bucket[Math.floor(Math.random()*bucket.length)], source: 'template'
    }), { headers: h });
  }
}
