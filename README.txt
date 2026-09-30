N BY N — FINAL STORE
====================

النسخة تتضمن:
- تصميم فاخر عنابي/ذهبي قريب من المرجع المرسل.
- متجر متجاوب للهاتف والكمبيوتر.
- بحث وتصنيفات رجال/نساء/عروض.
- سلة مشتريات.
- تسجيل العملاء بالبريد + رقم الهاتف/WhatsApp + كلمة مرور.
- حفظ العملاء في Supabase.
- Checkout مع الاسم والهاتف والعنوان.
- إنشاء الطلب والتحقق من المخزون وحساب الإجمالي داخل قاعدة البيانات.
- لوحة إدارة للمنتجات والطلبات والعملاء والرسائل والمخزون والكوبونات.
- إضافة/تعديل المنتجات ورفع حتى 5 صور لكل منتج من الهاتف مباشرة إلى Supabase Storage.
- ضغط الصور تلقائياً قبل الرفع.
- صلاحيات RLS وحماية رفع الصور للمدير فقط.

النشر على GitHub Pages:
1) ارفع محتويات هذا المجلد إلى مستودع GitHub.
2) فعّل GitHub Pages من Settings > Pages > Deploy from branch > main.
3) افتح index.html من رابط GitHub Pages.

Supabase:
1) افتح Supabase > SQL Editor.
2) شغّل ملف SUPABASE_SETUP.sql مرة واحدة.
3) أنشئ حساب المدير في Authentication > Users.
4) خذ UUID للحساب ثم نفّذ:
   update public.profiles set role='admin' where id='YOUR_AUTH_USER_UUID';
5) لا تضع Secret/Service Role key في الموقع. استخدم Publishable key فقط.

الدومين:
يمكن ربط www.nbyn.com لاحقاً مع الاستضافة (GitHub Pages أو Netlify) بعد ضبط DNS.

ملاحظة:
العملة الحالية QAR ويمكن تغييرها من config.js في السطر CURRENCY.
