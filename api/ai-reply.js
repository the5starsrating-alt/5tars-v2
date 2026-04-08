export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if (req.method==='OPTIONS') return new Response('ok',{headers});
  if (req.method!=='POST') return new Response('Method not allowed',{status:405});
  try {
    const {businessName='محلك',businessType='restaurant',rating=5,reviewText='',dialect='saudi'} = await req.json();
    const OPENAI_KEY = process.env.OPENAI_API_KEY || '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';
    const typeMap = {restaurant:'مطعم',cafe:'كافيه',salon:'صالون تجميل',clinic:'عيادة',retail:'متجر',gym:'نادي رياضي',hotel:'فندق',other:'نشاط تجاري'};
    const bizType = typeMap[businessType]||'نشاط تجاري';
    const tone = rating>=4?'شاكراً وحماسي ومرحّب':rating===3?'مهذب وإيجابي ومحسّن':'معتذر ومتعاون وحلّال مشاكل';
    const res = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},
      body:JSON.stringify({
        model:'gpt-4o-mini',max_tokens:180,temperature:0.75,
        messages:[
          {role:'system',content:'أنت مدير '+bizType+' محترف اسمه "'+businessName+'". اكتب رداً '+tone+' على تقييم العميل. اللهجة: '+(dialect==='saudi'?'سعودية خليجية':'عربية فصيحة')+'. لا تزيد عن 3 جمل. أضف إيموجي واحد مناسب في النهاية.'},
          {role:'user',content:'تقييم: '+rating+' نجوم'+(reviewText?'\nتعليق: "'+reviewText+'"':'')}
        ]
      })
    });
    if (res.ok) {
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) {
        const tokens = data.usage?.total_tokens||0;
        return new Response(JSON.stringify({reply,source:'openai',tokens,cost:tokens*0.00000015}),{headers});
      }
    }
    // fallback templates
    const t={5:['شكراً جزيلاً على كلامك الجميل! يسعدنا أن تجربتك كانت ممتازة. نتطلع لخدمتك دائماً 🌟','والله يسعدنا نسمع كلام حلو منك! زيارتك الجاية ما تنتظر 😊'],4:['شكراً لتقييمك! نعمل باستمرار على التحسين لنكون عند توقعاتك 😊'],3:['شكراً لمشاركتك رأيك! نأخذ ملاحظاتك بجدية ونعمل على التحسين 🙏'],2:['نعتذر عن تجربتك! تواصل معنا مباشرة حتى نعوضك 🙏'],1:['نأسف بشدة! تواصل معنا فوراً وسنعوضك بكل تأكيد 💙']};
    const bucket=t[Math.min(5,Math.max(1,Math.round(rating)))]||t[3];
    return new Response(JSON.stringify({reply:bucket[Math.floor(Math.random()*bucket.length)],source:'template'}),{headers});
  } catch(e) {
    return new Response(JSON.stringify({reply:'شكراً على تقييمك الكريم! 🙏',source:'error'}),{headers});
  }
}
