# 🚀 إعداد قاعدة البيانات — 5tars v2

## الخطوات (مرة واحدة فقط):

### 1. نفّذ SQL في Supabase
ادخل على: https://supabase.com/dashboard/project/bxlvcdfqpkxyrqjdnchi/sql/new

انسخ محتوى ملف `database.sql` من الريبو وشغّله.

### 2. عيّن نفسك مالكاً
في نفس SQL Editor نفّذ:
```sql
UPDATE profiles SET role = 'owner' WHERE email = 'the5starsrating@gmail.com';
```

### 3. انشر على Vercel
- ادخل vercel.com/new
- اختر ريبو `5tars-v2`
- اضغط Deploy

### 4. أضف Redirect URLs في Supabase Auth
ادخل: https://supabase.com/dashboard/project/bxlvcdfqpkxyrqjdnchi/auth/url-configuration

أضف:
- `https://YOUR-DOMAIN.vercel.app/dashboard.html`
- `http://localhost:3000/dashboard.html`

### 5. صفحة المال (للمالك فقط)
بعد تسجيل الدخول افتح: `/finance.html`
