export const config = { runtime: 'edge', maxDuration: 30 };

export default async function handler(req) {
  const h = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' };
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const SUPABASE_URL  = process.env.SUPABASE_URL;
  const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const OPENAI_KEY    = process.env.OPENAI_API_KEY;
  const WA_TOKEN      = process.env.WHATSAPP_TOKEN;
  const WA_URL        = process.env.WHATSAPP_URL;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 503, headers: h });
  }

  try {
    const { userId, reviewId, mode = 'notify' } = await req.json();

    // جلب بيانات المستخدم والتقييم
    const [profileRes, reviewRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }),
      fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${reviewId}&select=*`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
    ]);

    const [profiles, reviews] = await Promise.all([profileRes.json(), reviewRes.json()]);
    const profile = profiles[0];
    const review  = reviews[0];
    if (!profile || !review) throw new Error('Profile or review not found');

    const results = { notified: false, replied: false, autoReplied: false };

    // ── 1. WhatsApp notification ──
    if (WA_TOKEN && WA_URL && profile.phone) {
      const stars = '⭐'.repeat(Math.min(5, review.stars||1));
      const msg = `🔔 تقييم جديد على ${profile.full_name||'مشروعك'}\n\n${stars} (${review.stars}/5)\n👤 ${review.author_name||'مجهول'}\n💬 ${review.review_text||'بدون تعليق'}\n\n${review.stars<=2?'⚠️ تقييم سلبي — يحتاج ردك فوراً!':'✅ رد عليه من لوحة التحكم'}`;
      let p = profile.phone.replace(/\D/g,'');
      if (p.startsWith('05')&&p.length===10) p='966'+p.slice(1);
      else if (p.startsWith('5')&&p.length===9) p='966'+p;
      if (!p.startsWith('+')) p='+'+p;

      const waRes = await fetch(`${WA_URL}/messages/chat`, {
        method: 'POST',
        headers: { 'Content-Type':'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: WA_TOKEN, to: p, body: msg }).toString()
      });
      const waData = await waRes.json();
      results.notified = waData.sent==='true' || !!waData.id;
    }

    // ── 2. Auto AI reply (if mode=auto and plan allows) ──
    const autoReplyPlans = ['pro','advanced'];
    if (mode==='auto' && autoReplyPlans.includes(profile.plan) && OPENAI_KEY && !review.replied) {
      const typeMap = { restaurant:'مطعم', cafe:'كافيه', salon:'صالون',
        clinic:'عيادة', retail:'متجر', other:'نشاط تجاري' };
      const bizType = typeMap[profile.business_type]||'نشاط تجاري';
      const tone = review.stars>=4?'شاكر وحماسي':review.stars===3?'مهذب وإيجابي':'معتذر ومتعاون';

      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini', max_tokens: 150, temperature: 0.7,
          messages: [
            { role:'system', content:`أنت مدير ${bizType} "${profile.full_name||'محلك'}". اكتب رداً ${tone} باللهجة السعودية. 2-3 جمل فقط. إيموجي واحد.` },
            { role:'user', content:`تقييم: ${review.stars} نجوم${review.review_text?'\nتعليق: "'+review.review_text+'"':''}` }
          ]
        })
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const reply = aiData.choices?.[0]?.message?.content?.trim();
        if (reply) {
          // حفظ الرد في Supabase
          await fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${reviewId}`, {
            method: 'PATCH',
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type':'application/json', Prefer:'return=minimal' },
            body: JSON.stringify({ replied: true, reply_text: reply })
          });

          // تسجيل استهلاك AI
          const tokens = aiData.usage?.total_tokens||0;
          await fetch(`${SUPABASE_URL}/rest/v1/ai_usage`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type':'application/json', Prefer:'return=minimal' },
            body: JSON.stringify({ user_id: userId, feature:'reply', model:'gpt-4o-mini',
              tokens_in: aiData.usage?.prompt_tokens||0, tokens_out: aiData.usage?.completion_tokens||0,
              cost_usd: tokens*0.00000015 })
          });
          results.autoReplied = true;
          results.reply = reply;
        }
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), { headers: h });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: h });
  }
}
