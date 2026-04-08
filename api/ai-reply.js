export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { businessName = 'محلك', businessType = 'restaurant', rating = 5, reviewText = '', dialect = 'saudi' } = await req.json();

    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    if (OPENAI_KEY) {
      const typeMap = { restaurant:'مطعم', cafe:'كافيه', salon:'صالون تجميل', clinic:'عيادة', retail:'متجر', gym:'نادي رياضي', hotel:'فندق', other:'نشاط تجاري' };
      const bizType = typeMap[businessType] || 'نشاط تجاري';
      const tone = rating >= 4 ? 'شاكراً وحماسي ومرحّب' : rating === 3 ? 'مهذب وإيجابي ومحسّن' : 'معتذر ومتعاون وحلّال مشاكل';
      const lengthGuide = rating >= 4 ? '2-3 جمل قصيرة' : '3-4 جمل مع وعد بالتحسين';

      const systemPrompt = `أنت مدير ${bizType} محترف اسم المكان "${businessName}".
اكتب رداً ${tone} على تقييم العميل.
اللهجة: ${dialect === 'saudi' ? 'سعودية خليجية' : 'عربية فصيحة مبسطة'}.
الطول: ${lengthGuide}.
قواعد: لا تذكر اسم العميل إذا لم تعرفه. لا تكرر نفس الكلمات. أضف إيموجي واحد مناسب فقط في النهاية.`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 200,
          temperature: 0.7,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `تقييم: ${rating} نجوم${reviewText ? `\nتعليق العميل: "${reviewText}"` : ''}` }
          ]
        })
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) {
          // Log usage for cost tracking
          const tokens = data.usage?.total_tokens || 0;
          const cost = tokens * 0.00000015; // gpt-4o-mini pricing
          return new Response(JSON.stringify({ reply, source: 'openai', tokens, cost }), { headers });
        }
      }
    }

    // Professional templates (fallback + when no OpenAI key)
    const name = businessName;
    const templates = {
      5: [
        `شكراً جزيلاً على كلامك الجميل! يسعدنا دائماً أن تجربتك كانت على أعلى مستوى. نتطلع لخدمتك مجدداً قريباً 🌟`,
        `والله يسعدنا نسمع كلام حلو منك! هذا يشجّعنا نواصل تقديم أفضل خدمة. زيارتك الجاية ما تنتظر 😊`,
        `مشكور من القلب على تقييمك الرائع! فريق ${name} يعمل بجد عشان تجربتك تكون دايماً ممتازة ⭐`
      ],
      4: [
        `شكراً لتقييمك الإيجابي! سعداء بخدمتك ونعمل باستمرار على التحسين لنكون دايماً عند توقعاتك 😊`,
        `نقدّر تقييمك ونشكرك! رأيك يهمنا ويساعدنا نرتقي بخدماتنا أكثر. نتطلع لخدمتك مجدداً 💙`
      ],
      3: [
        `شكراً لمشاركتك رأيك معنا! نأخذ ملاحظاتك بجدية تامة ونعمل على تحسين تجربتك في الزيارات القادمة. تواصل معنا إذا تبغى تفاصيل أكثر 🙏`,
        `نقدّر صراحتك ونعتذر إذا لم تكن التجربة بمستوى توقعاتك. نعمل يومياً على التطوير وننتظر زيارتك القادمة لنثبت لك التحسن 💪`
      ],
      2: [
        `نعتذر عن تجربتك! هذا لا يعكس المستوى الذي نسعى إليه. يرجى التواصل معنا مباشرة حتى نتمكن من تعويضك وحل أي مشكلة واجهتها 🙏`,
        `آسفين جداً على هذه التجربة. رأيك يهمنا كثيراً وسنعمل فوراً على معالجة ما ذكرته. تواصل معنا مباشرة ونعدك بالتصحيح 💙`
      ],
      1: [
        `نأسف بشدة على تجربتك هذه وهي بالتأكيد لا تعبّر عن مستوانا الحقيقي. تواصل معنا مباشرة الآن وسنعوضك بكل تأكيد ونحل المشكلة 🙏`,
        `عذراً من القلب! هذا المستوى غير مقبول عندنا وسنحاسب على ذلك. تواصل معنا فوراً ونضمن لك تجربة مختلفة تماماً في المرة القادمة 💙`
      ]
    };

    const bucket = templates[Math.min(5, Math.max(1, Math.round(rating)))] || templates[3];
    const reply = bucket[Math.floor(Math.random() * bucket.length)];

    return new Response(JSON.stringify({ reply, source: 'template' }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({
      reply: 'شكراً على تقييمك الكريم! نقدّر وقتك ونسعى دائماً لتقديم أفضل تجربة ممكنة 🙏',
      source: 'fallback'
    }), { headers });
  }
}
