export const config = { runtime: 'edge' };

export default async function handler(req) {
  const h = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS' };
  if (req.method==='OPTIONS') return new Response('ok',{headers:h});
  if (req.method!=='POST') return new Response('Method not allowed',{status:405});
  try {
    const { type, phone, variables=[], message } = await req.json();
    if (type==='ping') return new Response(JSON.stringify({ok:true}),{headers:h});

    const TOKEN = process.env.WHATSAPP_TOKEN;
    const WA_URL = process.env.WHATSAPP_URL;
    if (!TOKEN || !WA_URL) throw new Error('WhatsApp not configured');

    let p = (phone||'').replace(/\D/g,'');
    if (p.startsWith('05')&&p.length===10) p='966'+p.slice(1);
    else if (p.startsWith('5')&&p.length===9) p='966'+p;
    if (!p.startsWith('+')) p='+'+p;

    const msgs = {
      review_request: `⭐ طلب تقييم\n\nأهلاً ${variables[0]||''},\n\nشكراً لاختياركم ${variables[1]||''}! 🌟\n\nنسعد بتقييمكم على Google:\n${variables[2]||''}\n\nرأيكم يساعدنا نتحسن 🙏`,
      reply: `💬 رد على تقييمك\n\nأهلاً ${variables[0]||''}،\nشكراً لتقييمك لـ ${variables[1]||''}!\n\n${variables[2]||''}`,
      notification: `🔔 تقييم جديد!\n\n${variables[0]||''}`
    };

    const text = message || msgs[type] || msgs.notification;
    const res = await fetch(`${WA_URL}/messages/chat`, {
      method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: TOKEN, to: p, body: text }).toString()
    });
    const data = await res.json();
    return new Response(JSON.stringify({
      success: data.sent==='true'||!!data.id||!!data.message,
      messageId: data.id||data.message
    }), {headers:h});
  } catch(e) {
    return new Response(JSON.stringify({success:false,error:e.message}),{status:500,headers:h});
  }
}
