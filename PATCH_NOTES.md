# 5tars core fix patch

## الملفات المعدلة
- `vercel.json`
- `dashboard.html`
- `review.html`
- `qr-print.html`
- `signup.html`
- `setup_db.html`
- `api/track-click.js`
- `api/health.js`
- `database_patch.sql`

## خطوات التطبيق
1. طبّق `database_patch.sql` في Supabase SQL Editor
2. أضف متغيرات Vercel التالية:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. ارفع الملفات المعدلة ثم أعد النشر
4. سجّل دخولك إلى لوحة التحكم
5. احفظ إعدادات النشاط مرة واحدة أو احفظ رابط Google
6. أعد توليد QR واطبعه من جديد

## ماذا أصلح هذا الباتش؟
- يحذف اعتماد QR على `uid`
- يحوّل QR إلى token ثابت وآمن نسبيًا
- يجعل صفحة `review.html` تعمل للعامة
- يفصل tracking عن جدول `reviews`
- يضيف API فعلي لتسجيل النقرات
- يمنع setup العام غير الآمن من الواجهة
- يجعل signup أقل تخبيصًا في الـ redirect

## ملاحظة
هذا الباتش يصلح القلب الأساسي للمسار، لكنه لا يبني APIs الأخرى مثل:
- `get-reviews`
- `ai-reply`
- `send-whatsapp`

هذه تحتاج patch ثانية منفصلة.
