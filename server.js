/**
 * Swish — الخادم (Express) المتوافق مع Vercel/serverless
 * البيانات على Firestore (src/store.js) • الدفع عند الاستلام • Meta Pixel
 * يُصدّر التطبيق (module.exports = app) ولا يستمع إلا عند التشغيل المباشر.
 */
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const auth = require("./src/auth");
const { WILAYAS, getWilaya } = require("./src/wilayas");
const store = require("./src/store");

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_DIR = path.join(__dirname, "admin");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
try { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) {}

// ---- حالات الطلب ----
const ORDER_STATUSES = [
  { key: "pending", label: "قيد الانتظار", color: "#f59e0b" },
  { key: "confirmed", label: "مؤكَّد", color: "#3b82f6" },
  { key: "shipped", label: "تم الشحن", color: "#8b5cf6" },
  { key: "delivered", label: "تم التسليم", color: "#10b981" },
  { key: "cancelled", label: "ملغى", color: "#ef4444" },
  { key: "returned", label: "مُرتجع", color: "#6b7280" },
];
const STATUS_KEYS = ORDER_STATUSES.map((s) => s.key);

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
};

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// رفع الصور (محليًا فقط — على Vercel استخدم رابط صورة)
const ALLOWED_IMAGE = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `p_${Date.now()}_${Math.round(Math.random() * 1e6)}${ALLOWED_IMAGE[file.mimetype] || ".bin"}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (ALLOWED_IMAGE[file.mimetype] ? cb(null, true) : cb(new Error("صيغة غير مسموح بها (JPG/PNG/WEBP/GIF)"))),
});

// ============================================================
// أدوات مساعدة
// ============================================================
async function settingsOr() {
  try { return (await store.getSettings()) || { ...DEFAULT_SETTINGS }; }
  catch (_) { return { ...DEFAULT_SETTINGS }; }
}
function publicSettings(s) {
  return {
    storeName: s.storeName || "Swish",
    tagline: s.tagline || "",
    phone: s.phone || "",
    currency: s.currency || "دج",
    metaPixelId: s.metaPixelId || "",
    freeShippingThreshold: Number(s.freeShippingThreshold) || 0,
    announcement: s.announcement || "",
    facebookUrl: s.facebookUrl || "",
    instagramUrl: s.instagramUrl || "",
    ratingValue: s.ratingValue || 4.9,
    ratingCount: s.ratingCount || 0,
  };
}
function sanitizeProductPublic(p) {
  return {
    id: p.id, name: p.name, slug: p.slug, price: p.price, oldPrice: p.oldPrice || null,
    description: p.description || "", images: p.images || [], colors: p.colors || [],
    stock: typeof p.stock === "number" ? p.stock : null, badge: p.badge || "",
  };
}
const validatePhone = (phone) => /^0[567]\d{8}$/.test(String(phone || "").replace(/[\s-]/g, ""));
const isHttpUrl = (v) => { const s = String(v || "").trim(); return !s || /^https?:\/\/[^\s]+$/i.test(s); };
const sanitizePixelId = (v) => String(v || "").replace(/\D/g, "").slice(0, 20);
const asyncH = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error("[api]", e.message);
  if (!res.headersSent) res.status(500).json({ error: "حدث خطأ في الخادم" });
});

// ============================================================
// واجهة عامة
// ============================================================
app.get("/api/config", asyncH(async (req, res) => {
  res.json({ settings: publicSettings(await settingsOr()), wilayas: WILAYAS, statuses: ORDER_STATUSES });
}));

app.get("/api/products", asyncH(async (req, res) => {
  const items = (await store.listProducts()).filter((p) => p.active !== false).map(sanitizeProductPublic);
  res.json(items);
}));

app.get("/api/products/:id", asyncH(async (req, res) => {
  const p = await store.getProduct(req.params.id);
  if (!p || p.active === false) return res.status(404).json({ error: "المنتج غير موجود" });
  res.json(sanitizeProductPublic(p));
}));

app.post("/api/orders", asyncH(async (req, res) => {
  const b = req.body || {};
  const errors = [];
  const fullName = String(b.fullName || "").trim();
  const phone = String(b.phone || "").trim();
  const address = String(b.address || "").trim();
  const quantity = Math.max(1, Math.min(99, parseInt(b.quantity, 10) || 1));
  const deliveryType = b.deliveryType === "desk" ? "desk" : "home";
  let color = String(b.color || "").trim().slice(0, 60);
  const note = String(b.note || "").trim().slice(0, 500);

  if (fullName.length < 3) errors.push("الاسم الكامل مطلوب");
  if (!validatePhone(phone)) errors.push("رقم الهاتف غير صحيح");
  const wilaya = getWilaya(Number(b.wilaya));
  if (!wilaya) errors.push("يُرجى اختيار الولاية");
  if (address.length < 3 && deliveryType === "home") errors.push("العنوان مطلوب للتوصيل إلى المنزل");
  const product = await store.getProduct(b.productId);
  if (!product || product.active === false) errors.push("المنتج غير متوفر");
  if (errors.length) return res.status(400).json({ error: errors.join("، "), errors });

  if (Array.isArray(product.colors) && product.colors.length && color && !product.colors.includes(color)) color = "";

  const unitPrice = Number(product.price) || 0;
  const subtotal = unitPrice * quantity;
  const settings = await settingsOr();
  let deliveryFee = deliveryType === "desk" ? wilaya.desk : wilaya.home;
  const threshold = Number(settings.freeShippingThreshold) || 0;
  let freeShipping = false;
  if (threshold > 0 && subtotal >= threshold) { deliveryFee = 0; freeShipping = true; }
  const total = subtotal + deliveryFee;

  const id = await store.nextId("orders");
  const ref = `#${id}`;
  const now = new Date().toISOString();
  const order = {
    id, ref, status: "pending",
    customer: { fullName, phone },
    shipping: { wilayaCode: wilaya.code, wilayaName: wilaya.name, address, deliveryType },
    item: { productId: product.id, productName: product.name, color, unitPrice, quantity },
    pricing: { subtotal, deliveryFee, freeShipping, total, currency: settings.currency || "دج" },
    note,
    history: [{ status: "pending", at: now, by: "customer" }],
    createdAt: now, updatedAt: now,
  };
  await store.createOrder(order);
  res.status(201).json({ ok: true, ref, orderId: id, subtotal, total, currency: order.pricing.currency });
}));

// ============================================================
// مصادقة الإدارة (+ تحديد محاولات الدخول)
// ============================================================
const loginAttempts = new Map();
const LOGIN_MAX = 8, LOGIN_WINDOW = 6e5, LOGIN_BLOCK = 9e5;
function loginGuard(ip) {
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || now - rec.firstAt > LOGIN_WINDOW) { rec = { count: 0, firstAt: now, blockedUntil: 0 }; loginAttempts.set(ip, rec); }
  if (rec.blockedUntil && now < rec.blockedUntil) return { ok: false, retryMin: Math.ceil((rec.blockedUntil - now) / 6e4) };
  return { ok: true, rec };
}

app.post("/api/admin/login", asyncH(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").toString().split(",")[0].trim();
  const g = loginGuard(ip);
  if (!g.ok) return res.status(429).json({ error: `محاولات كثيرة. حاول بعد ${g.retryMin} دقيقة.` });
  const { username, password } = req.body || {};
  if (await auth.verifyLogin(username, password)) {
    loginAttempts.delete(ip);
    const admin = await auth.getAdmin();
    res.setHeader("Set-Cookie", auth.createSessionCookie(admin.username));
    return res.json({ ok: true, username: admin.username });
  }
  g.rec.count += 1;
  if (g.rec.count >= LOGIN_MAX) g.rec.blockedUntil = Date.now() + LOGIN_BLOCK;
  res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
}));

app.post("/api/admin/logout", (req, res) => { res.setHeader("Set-Cookie", auth.clearSessionCookie()); res.json({ ok: true }); });
app.get("/api/admin/me", auth.requireAuth, asyncH(async (req, res) => {
  res.json({ username: req.admin.u, isDefaultPassword: await auth.isDefaultPassword() });
}));

// ============================================================
// واجهة الإدارة (محميّة)
// ============================================================
const adminApi = express.Router();
adminApi.use(auth.requireAuth);

// --- المنتجات ---
adminApi.get("/products", asyncH(async (req, res) => res.json(await store.listProducts())));
adminApi.post("/products", asyncH(async (req, res) => res.status(201).json(await store.createProduct(req.body || {}))));
adminApi.post("/products/bulk", asyncH(async (req, res) => {
  const b = req.body || {};
  const images = Array.isArray(b.images) ? b.images.filter(Boolean) : [];
  let count = images.length > 0 ? images.length : Math.floor(Number(b.count) || 0);
  if (count < 1) return res.status(400).json({ error: "حدّد عدد الموديلات أو ارفع صورًا" });
  count = Math.min(count, 300);
  const baseProps = {
    name: b.name, price: b.price, oldPrice: b.oldPrice, badge: b.badge,
    active: b.active, colors: b.colors, description: b.description, slug: b.slug, stock: b.stock,
  };
  const list = [];
  for (let i = 0; i < count; i++) list.push({ ...baseProps, images: images[i] ? [images[i]] : [] });
  const created = await store.bulkCreateProducts(list);
  res.status(201).json({ ok: true, count: created.length });
}));
adminApi.put("/products/:id", asyncH(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ["name", "slug", "description", "badge"].forEach((k) => { if (b[k] !== undefined) patch[k] = String(b[k]); });
  if (b.price !== undefined) patch.price = Number(b.price) || 0;
  if (b.oldPrice !== undefined) patch.oldPrice = b.oldPrice ? Number(b.oldPrice) : null;
  if (b.stock !== undefined) patch.stock = b.stock === "" || b.stock === null ? null : Number(b.stock);
  if (b.colors !== undefined) patch.colors = Array.isArray(b.colors) ? b.colors.filter(Boolean) : [];
  if (b.images !== undefined) patch.images = Array.isArray(b.images) ? b.images.filter(Boolean) : [];
  if (b.active !== undefined) patch.active = b.active !== false;
  const updated = await store.updateProduct(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: "المنتج غير موجود" });
  res.json(updated);
}));
adminApi.delete("/products/:id", asyncH(async (req, res) => { await store.deleteProduct(req.params.id); res.json({ ok: true }); }));

adminApi.post("/upload", (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "لم يتم استلام أي ملف" });
    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
  });
});

// --- الطلبات ---
adminApi.get("/orders", asyncH(async (req, res) => {
  let items = await store.listOrders();
  const { status, q } = req.query;
  if (status && STATUS_KEYS.includes(status)) items = items.filter((o) => o.status === status);
  if (q) {
    const n = String(q).toLowerCase();
    items = items.filter((o) => (o.ref || "").toLowerCase().includes(n) || (o.customer && o.customer.fullName || "").toLowerCase().includes(n) || (o.customer && o.customer.phone || "").includes(n));
  }
  res.json(items);
}));
adminApi.get("/orders/:id", asyncH(async (req, res) => {
  const o = await store.getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
  res.json(o);
}));
adminApi.patch("/orders/:id/status", asyncH(async (req, res) => {
  const { status } = req.body || {};
  if (!STATUS_KEYS.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
  const o = await store.getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
  o.status = status; o.updatedAt = new Date().toISOString();
  o.history = o.history || []; o.history.push({ status, at: o.updatedAt, by: req.admin.u });
  await store.updateOrder(o.id, o);
  res.json({ ok: true, order: o });
}));
adminApi.delete("/orders/:id", asyncH(async (req, res) => { await store.deleteOrder(req.params.id); res.json({ ok: true }); }));

// --- الإحصائيات ---
adminApi.get("/stats", asyncH(async (req, res) => {
  const items = await store.listOrders();
  const settings = await settingsOr();
  const byStatus = {}; STATUS_KEYS.forEach((k) => (byStatus[k] = 0));
  let revenue = 0, pendingRevenue = 0;
  const tot = (o) => (o && o.pricing && Number(o.pricing.total)) || 0;
  items.forEach((o) => {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (o.status === "delivered") revenue += tot(o);
    if (["pending", "confirmed", "shipped"].includes(o.status)) pendingRevenue += tot(o);
  });
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = items.filter((o) => (o.createdAt || "").slice(0, 10) === today).length;
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = items.filter((o) => (o.createdAt || "").slice(0, 10) === key);
    last7.push({ date: key, count: day.length, revenue: day.filter((o) => o.status === "delivered").reduce((s, o) => s + tot(o), 0) });
  }
  const products = await store.listProducts();
  res.json({
    totalOrders: items.length, todayOrders, byStatus, revenue, pendingRevenue,
    productCount: products.length, activeProducts: products.filter((p) => p.active !== false).length,
    last7, currency: settings.currency || "دج",
  });
}));

// --- الإعدادات ---
adminApi.get("/settings", asyncH(async (req, res) => res.json(await settingsOr())));
adminApi.put("/settings", asyncH(async (req, res) => {
  const cur = await settingsOr();
  const b = req.body || {};
  const allowed = ["storeName", "tagline", "phone", "currency", "metaPixelId", "freeShippingThreshold", "announcement", "facebookUrl", "instagramUrl", "ratingValue", "ratingCount"];
  const next = { ...cur };
  allowed.forEach((k) => { if (b[k] !== undefined) next[k] = b[k]; });
  if (b.metaPixelId !== undefined) next.metaPixelId = sanitizePixelId(b.metaPixelId);
  if (b.facebookUrl !== undefined && !isHttpUrl(b.facebookUrl)) return res.status(400).json({ error: "رابط فيسبوك غير صالح" });
  if (b.instagramUrl !== undefined && !isHttpUrl(b.instagramUrl)) return res.status(400).json({ error: "رابط إنستغرام غير صالح" });
  next.freeShippingThreshold = Math.max(0, Number(next.freeShippingThreshold) || 0);
  next.ratingValue = Math.min(5, Math.max(0, Number(next.ratingValue) || 4.9));
  next.ratingCount = Math.max(0, Number(next.ratingCount) || 0);
  next.updatedAt = new Date().toISOString();
  await store.saveSettings(next);
  res.json(next);
}));

adminApi.get("/wilayas", (req, res) => res.json(WILAYAS));

adminApi.post("/account", asyncH(async (req, res) => {
  const { currentPassword, newPassword, newUsername } = req.body || {};
  const admin = await auth.getAdmin();
  if (!admin) return res.status(500).json({ error: "تعذّر قراءة حساب المسؤول" });
  if (!auth.verifyPassword(String(currentPassword || ""), admin.password)) return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
  if (newUsername && String(newUsername).trim().length >= 3) await auth.setAdminUsername(String(newUsername).trim());
  if (newPassword) {
    if (String(newPassword).length < 6) return res.status(400).json({ error: "كلمة المرور الجديدة قصيرة جدًا (6 أحرف على الأقل)" });
    await auth.setAdminPassword(String(newPassword));
  }
  const a = await auth.getAdmin();
  res.setHeader("Set-Cookie", auth.createSessionCookie(a.username));
  res.json({ ok: true });
}));

app.use("/api/admin", adminApi);
app.use("/api", (req, res) => res.status(404).json({ error: "المسار غير موجود" }));

// ============================================================
// صفحات HTML
// ============================================================
app.get(["/admin", "/admin/"], (req, res) => res.redirect("/admin/dashboard.html"));
["dashboard.html", "products.html", "orders.html", "settings.html"].forEach((page) => {
  app.get(`/admin/${page}`, auth.requireAuthPage, (req, res) => res.sendFile(path.join(ADMIN_DIR, page)));
});
app.use("/admin", express.static(ADMIN_DIR));
app.use(express.static(PUBLIC_DIR));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "غير موجود" });
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  🧢 Swish يعمل على http://localhost:${PORT}`);
    console.log(`  🔐 لوحة التحكم: http://localhost:${PORT}/admin\n`);
  });
}

module.exports = app;
