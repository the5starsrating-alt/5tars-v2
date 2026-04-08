export const config = { runtime: 'edge' };

const PLANS = {
  basic:    {price:4900,  name:'باقة أساسي - 5tars',    interval:'month'},
  pro:      {price:9900,  name:'باقة احترافي - 5tars',  interval:'month'},
  advanced: {price:19900, name:'باقة متقدم - 5tars',    interval:'month'}
};

export default async function handler(req) {
  const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if (req.method==='OPTIONS') return new Response('ok',{headers});
  if (req.method!=='POST') return new Response('Method not allowed',{status:405});
  try {
    const {plan,userId,email} = await req.json();
    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_51TJuXLCp8TqcE7uqQpEUnOT9JgNXoR9QCfAn3rSOGls4jZixUdeC6bvSZSPCqKTixT9dxvKY88qfZnnqrGMWiB8r00dWkvCTP7';
    const planData = PLANS[plan];
    if (!planData) return new Response(JSON.stringify({success:false,error:'Invalid plan'}),{status:400,headers});
    const origin = req.headers.get('origin')||'https://5tars-v2.vercel.app';
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions',{
      method:'POST',
      headers:{'Authorization':'Bearer '+STRIPE_KEY,'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        'mode':'subscription',
        'payment_method_types[]':'card',
        'line_items[0][price_data][currency]':'sar',
        'line_items[0][price_data][product_data][name]':planData.name,
        'line_items[0][price_data][unit_amount]':String(planData.price),
        'line_items[0][price_data][recurring][interval]':planData.interval,
        'line_items[0][quantity]':'1',
        'customer_email':email||'',
        'metadata[user_id]':userId||'',
        'metadata[plan]':plan,
        'success_url':origin+'/dashboard.html?payment=success&plan='+plan,
        'cancel_url':origin+'/signup.html?cancelled=true',
        'locale':'ar'
      })
    });
    const session = await res.json();
    if (!res.ok) return new Response(JSON.stringify({success:false,error:session.error?.message}),{status:400,headers});
    return new Response(JSON.stringify({success:true,url:session.url,sessionId:session.id}),{headers});
  } catch(e) {
    return new Response(JSON.stringify({success:false,error:e.message}),{status:500,headers});
  }
}
