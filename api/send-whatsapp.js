export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  
  try {
    const { type, phone, variables } = await req.json();
    if (type === 'ping') return new Response(JSON.stringify({ ok: true }), { headers });

    const WA_TOKEN = process.env.WHATSAPP_TOKEN;
    const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

    if (!WA_TOKEN || !WA_PHONE_ID) {
      // Simulate success in demo mode
      console.log(`WhatsApp [demo]: type=${type} phone=${phone}`);
      return new Response(JSON.stringify({ success: true, messageId: 'demo_' + Date.now(), mode: 'demo' }), { headers });
    }

    const templates = {
      review_request: { name: 'review_request', params: variables || [] },
      reply: { name: 'review_reply', params: variables || [] },
      notification: { name: 'new_review_alert', params: variables || [] }
    };

    const tmpl = templates[type] || templates.notification;
    const cleanPhone = phone.replace(/\D/g, '');

    const res = await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: tmpl.name,
          language: { code: 'ar' },
          components: tmpl.params.length ? [{
            type: 'body',
            parameters: tmpl.params.map(p => ({ type: 'text', text: String(p) }))
          }] : []
        }
      })
    });

    const data = await res.json();
    return new Response(JSON.stringify({
      success: !!data.messages?.[0]?.id,
      messageId: data.messages?.[0]?.id,
      error: data.error?.message
    }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
  }
}
