/**
 * تهيئة Firestore: الإعدادات + حساب المسؤول + المنتجات (94 موديل من الصور المرفقة).
 * شغّله مرة واحدة بعد تفعيل Firestore:  npm run seed
 * آمن لإعادة التشغيل: لا يكرّر المنتجات إن كانت موجودة.
 */
const fs = require("fs");
const path = require("path");
const store = require("../src/store");
const auth = require("../src/auth");

const UNIVERSAL_NAME = "Swish Cap"; // الاسم المشترك لكل الموديلات
const PRICE = 2500;
const OLD_PRICE = 3500;
const DESCRIPTION = "قبعة ستريت وير أصلية بخامة فاخرة — ستايل أمريكي هيب هوب.";

const DEFAULT_SETTINGS = {
  storeName: "Swish",
  tagline: "قبعات ستريت وير أمريكية — الدفع عند الاستلام",
  phone: "",
  currency: "دج",
  metaPixelId: "",
  freeShippingThreshold: 0,
  announcement: "",
  facebookUrl: "",
  instagramUrl: "",
  ratingValue: 4.9,
  ratingCount: 1240,
  updatedAt: new Date().toISOString(),
};

async function main() {
  console.log("→ التحقق من اتصال Firestore...");

  // 1) الإعدادات
  const settings = await store.getSettings();
  if (!settings) { await store.saveSettings(DEFAULT_SETTINGS); console.log("✓ تم إنشاء الإعدادات الافتراضية."); }
  else console.log("• الإعدادات موجودة مسبقًا.");

  // 2) حساب المسؤول
  const created = await auth.ensureAdmin();
  console.log(created ? "✓ تم إنشاء المسؤول (admin / admin123)." : "• حساب المسؤول موجود مسبقًا.");

  // 3) العدّادات
  const counters = await store.getDoc("meta", "counters");
  if (!counters) { await store.setDoc("meta", "counters", { products: 0, orders: 1000 }); console.log("✓ تم إنشاء العدّادات (الطلبات تبدأ من 1001)."); }

  // 4) المنتجات من الصور
  const existing = await store.listProducts();
  if (existing.length > 0) {
    console.log(`• توجد ${existing.length} منتجات مسبقًا — تخطّي إنشاء المنتجات.`);
  } else {
    const dir = path.join(__dirname, "..", "public", "uploads");
    const files = fs.readdirSync(dir).filter((f) => /^swish-\d+\.jpg$/i.test(f)).sort();
    if (!files.length) { console.log("⚠️ لا توجد صور swish-*.jpg في public/uploads."); }
    else {
      const list = files.map((f) => ({
        name: UNIVERSAL_NAME,
        price: PRICE,
        oldPrice: OLD_PRICE,
        description: DESCRIPTION,
        images: [`/uploads/${f}`],
        colors: [],
        active: true,
        badge: "",
      }));
      const made = await store.bulkCreateProducts(list);
      console.log(`✓ تم إنشاء ${made.length} موديل باسم «${UNIVERSAL_NAME}».`);
    }
  }

  console.log("\n✅ اكتملت التهيئة على Firestore.");
}

main().catch((e) => { console.error("\n❌ فشلت التهيئة:", e.message); process.exit(1); });
