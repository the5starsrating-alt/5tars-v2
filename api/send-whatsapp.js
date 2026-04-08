export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if (req.method==='OPTIONS') return new Response('ok',{headers});
  if (req.method!=='POST') return new Response('Method not allowed',{status:405});
  try {
    const body = await req.json();
    const {type,phone,variables=[],message} = body;
    if (type==='ping') return new Response(JSON.stringify({ok:true}),{headers});

    const TOKEN = process.env.WHATSAPP_TOKEN || 'wrftf98sps2vrb2j';
    const INSTANCE_URL = process.env.WHATSAPP_URL || 'https://api.ultramsg.com/instance167279';

    let cleanPhone = (phone||'').replace(/\D/g,'');
    if (cleanPhone.startsWith('05') && cleanPhone.length===10) cleanPhone='966'+cleanPhone.slice(1);
    else if (cleanPhone.startsWith('5') && cleanPhone.length===9) cleanPhone='966'+cleanPhone;
    if (!cleanPhone.startsWith('+')) cleanPhone='+'+cleanPhone;

    // Build message text based on type
    const msgs = {
      review_request: '⭐ طلب تقييم\n\nأهلاً '+variables[0]+'،\n\nشكراً لاختياركم '+variables[1]+'! نتمنى أن تجربتكم كانت ممتازة 🌟\n\nنسعد بتقييمكم على Google:\n'+variables[2]+'\n\nرأيكم يساعدنا نتحسن ويساعد عملاء جدد 🙏',
      reply: '💬 رد على تقييمك\n\nأهلاً '+variables[0]+'، شكراً لتقييمك لـ'+variables[1]+'!\n\n'+variables[2],
      notification: '🔔 تقييم جديد!\n\n'+variables[0]
    };

    const text = message || msgs[type] || msgs.notification.replace(variables[0], body.text||'');

    const formData = new URLSearchParams({
      token: TOKEN,
      to: cleanPhone,
      body: text
    });

    const res = await fetch(INSTANCE_URL+'/messages/chat', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: formData.toString()
    });

    const data = await res.json();
    const success = data.sent==='true' || data.id || !!data.message;
    return new Response(JSON.stringify({success, messageId:data.id||data.message, raw:data}),{headers});
  } catch(e) {
    return new Response(JSON.stringify({success:false,error:e.message}),{status:500,headers});
  }
}
