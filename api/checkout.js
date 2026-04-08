export const config = { runtime: 'edge' };

const PLANS = {
  basic:    { price: 4900,  name: 'باقة أساسي', interval: 'month' },
  pro:      { price: 9900,  name: 'باقة احترافي', interval: 'month' },
  advanced: { price: 19900, name: 'باقة متقدم', interval: 'month' }
};

export default async function handler(req) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { plan, userId, email } = await req.json();
    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

    if (!STRIPE_KEY) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Stripe not configured',
        setup_needed: 'Add STRIPE_SECRET_KEY to Vercel environment variables'
      }), { status: 503, headers });
    }

    const planData = PLANS[plan];
    if (!planData) return new Response(JSON.stringify({ success: false, error: 'Invalid plan' }), { status: 400, headers });

    const origin = req.headers.get('origin') || 'https://5tars-v2.vercel.app';

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'payment_method_types[]': 'card',
        'line_items[0][price_data][currency]': 'sar',
        'line_items[0][price_data][product_data][name]': planData.name,
        'line_items[0][price_data][unit_amount]': String(planData.price),
        'line_items[0][price_data][recurring][interval]': planData.interval,
        'line_items[0][quantity]': '1',
        'customer_email': email || '',
        'metadata[user_id]': userId || '',
        'metadata[plan]': plan,
        'success_url': `${origin}/dashboard.html?payment=success&plan=${plan}`,
        'cancel_url': `${origin}/signup.html?plan=${plan}&cancelled=true`,
      })
    });

    const session = await res.json();
    if (!res.ok) return new Response(JSON.stringify({ success: false, error: session.error?.message }), { status: 400, headers });

    return new Response(JSON.stringify({ success: true, url: session.url, sessionId: session.id }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
  }
}
