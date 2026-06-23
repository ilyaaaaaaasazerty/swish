/**
 * تهيئة Firebase Admin SDK (صلاحيات كاملة من جهة الخادم).
 * - يتجاوز قواعد Firestore، لذا يمكن قفل القواعد (deny all) للزوار.
 * - بيانات الاعتماد:
 *     1) متغيّر البيئة FIREBASE_SERVICE_ACCOUNT (JSON كامل) — مستخدم على Vercel.
 *     2) ملف محلي service-account.json (مُستثنى من git) — للتطوير.
 */
const { initializeApp, getApps, cert, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function loadCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.error("[firebase-admin] تعذّر تحليل FIREBASE_SERVICE_ACCOUNT:", e.message);
    }
  }
  try {
    return require("../service-account.json");
  } catch (_) {
    return null;
  }
}

if (!getApps().length) {
  const creds = loadCredentials();
  if (creds) {
    initializeApp({ credential: cert(creds) });
  } else {
    console.error("[firebase-admin] ⚠️ لا توجد بيانات اعتماد — اضبط FIREBASE_SERVICE_ACCOUNT أو ضع service-account.json");
    try { initializeApp({ credential: applicationDefault() }); } catch (_) { initializeApp(); }
  }
}

const db = getFirestore();
try { db.settings({ ignoreUndefinedProperties: true }); } catch (_) {}

module.exports = { db };
