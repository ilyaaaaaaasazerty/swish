# نشر Swish على Vercel + Firebase

## 1) تفعيل قواعد Firestore (مطلوب — خطوة واحدة)
المتجر يحتاج صلاحية القراءة/الكتابة على Firestore. افتح:
**Firebase Console → Firestore Database → Rules**، والصق التالي ثم **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> هذا يفتح القراءة/الكتابة للجميع (مناسب لمتجر COD بلا تسجيل دخول للزوار).
> لاحقًا يُنصح بتقييد الكتابة عبر Cloud Function أو App Check.

## 2) تعبئة البيانات (مرة واحدة)
بعد فتح القواعد، شغّل محليًا:

```bash
npm install
npm run seed     # ينشئ: الإعدادات + المسؤول (admin/admin123) + 94 موديل من الصور
npm start        # تجربة محلية على http://localhost:3000
```

## 3) متغيّرات البيئة على Vercel
في **Vercel → Project → Settings → Environment Variables** أضِف:

| المفتاح | القيمة |
|--------|--------|
| `SESSION_SECRET` | سلسلة عشوائية طويلة (≥ 32 حرفًا) لتأمين جلسات لوحة التحكم |
| `NODE_ENV` | `production` |

(اختياري) `FIREBASE_API_KEY` و `FIREBASE_PROJECT_ID` لتجاوز القيم الافتراضية.

## 4) النشر
```bash
vercel --prod
```

## المعمارية على Vercel
- `public/` (الصفحة + الصور `/uploads/*.jpg`) تُخدَّم كملفات ثابتة عبر CDN — تحميل سريع.
- دالة serverless واحدة (`api/index.js` = تطبيق Express) تتولّى `/api/*` و `/admin/*`.
- قاعدة البيانات: **Firestore** (منتجات/طلبات/إعدادات/مسؤول) — لا كتابة على القرص.

## ملاحظة عن رفع الصور على Vercel
نظام ملفات Vercel مؤقت، لذا **رفع صورة جديدة من لوحة التحكم لا يبقى** على الإنتاج.
- كتالوج الـ94 صورة مرفوع كملفات ثابتة (يعمل دائمًا).
- لإضافة منتجات على الموقع المنشور: استخدم **رابط صورة** في نموذج المنتج،
  أو أضِف الصور محليًا في `public/uploads/` وأعد النشر، أو استخدم Firebase Storage.
- زر «إضافة مجمّعة» بخيار **العدد** (موديلات فارغة) يعمل على الإنتاج (بدون رفع ملفات).

## بيانات الدخول الافتراضية
`admin` / `admin123` — غيّرها فورًا من **الإعدادات → الأمان**.
