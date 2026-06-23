/**
 * إعدادات Firebase (Web config).
 * مفتاح الويب ليس سرًا — الحماية عبر قواعد Firestore.
 * يمكن تجاوز القيم عبر متغيرات البيئة على Vercel.
 */
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBBH2Nvi0JuxY73F68MbI5Nq0yi3gdAl9w",
  authDomain: "swish-150d7.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "swish-150d7",
  storageBucket: "swish-150d7.firebasestorage.app",
  messagingSenderId: "547161328091",
  appId: "1:547161328091:web:7e94ae3d7ed6a54325fffe",
};

module.exports = { firebaseConfig };
