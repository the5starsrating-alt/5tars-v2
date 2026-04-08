export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  
  try {
    const { businessName, businessType, rating, reviewText, dialect } = await req.json();
    
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      // بدون OpenAI — نرجع رد جاهز بناءً على النجوم
      const replies = {
        5: `شكراً جزيلاً على كلامك الجميل! يسعدنا أن تجربتك كانت ممتازة. نتطلع لخدمتك دائماً 🌟`,
        4: `شكراً على تقييمك الإيجابي! سعداء بخدمتك ونعمل باستمرار على التحسين 😊`,
        3: `شكراً على ملاحظتك! نأخذ آراء عملائنا بجدية ونسعى للتحسين المستمر.`,
        2: `نعتذر عن تجربتك. نرجو التواصل معنا مباشرة لنعوضك ونحل أي مشكلة 🙏`,
        1: `نأسف جداً على هذه التجربة. تواصل معنا مباشرة وسنعوضك بكل تأكيد 💙`
      };
      const reply = replies[rating] || replies[3];
      return new Response(JSON.stringify({ reply, source: 'template' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const typeMap = { restaurant:'مطعم', cafe:'كافيه', salon:'صالون', clinic:'عيادة', retail:'متجر', other:'نشاط تجاري' };
    const bizType = typeMap[businessType] || 'نشاط تجاري';
    const tone = rating >= 4 ? 'شاكراً ومتحمساً' : rating === 3 ? 'مهذباً وإيجابياً' : 'معتذراً وحل مشكلة';

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        messages: [
          { role: 'system', content: `أنت مدير ${bizType} اسمه "${businessName}". اكتب رداً ${tone} على تقييم العميل باللهجة السعودية. لا تزيد عن 3 جمل.` },
          { role: 'user', content: `التقييم: ${rating} نجوم. التعليق: "${reviewText || 'بدون تعليق'}"` }
        ]
      })
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'شكراً على تقييمك!';
    return new Response(JSON.stringify({ reply, source: 'openai' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ reply: 'شكراً على تقييمك الكريم! 🙏', source: 'fallback' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
