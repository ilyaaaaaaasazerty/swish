/**
 * طبقة البيانات على Firestore عبر Firebase Admin SDK.
 * صلاحيات كاملة من الخادم → يمكن قفل قواعد Firestore تمامًا (الزوار لا يصلون للبيانات مباشرة).
 * نفس الواجهة السابقة (نفس أسماء الدوال) ليبقى بقية الكود دون تغيير.
 */
const { db } = require("./firebaseAdmin");

// ---------- مساعدات عامة على المستندات ----------
async function getDoc(coll, id) {
  const snap = await db.collection(coll).doc(String(id)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}
async function setDoc(coll, id, data) {
  await db.collection(coll).doc(String(id)).set(data);
  return { id: String(id), ...data };
}
async function deleteDoc(coll, id) {
  await db.collection(coll).doc(String(id)).delete();
  return true;
}
async function listDocs(coll) {
  const snap = await db.collection(coll).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- العدّادات (تسلسل المعرّفات) عبر معاملة ذرية ----------
async function nextId(kind) {
  const ref = db.collection("meta").doc("counters");
  return db.runTransaction(async (tx) => {
    const d = await tx.get(ref);
    const data = d.exists ? d.data() : { products: 0, orders: 1000 };
    const cur = Number(data[kind] || (kind === "orders" ? 1000 : 0)) + 1;
    data[kind] = cur;
    tx.set(ref, { products: Number(data.products) || 0, orders: Number(data.orders) || 1000 }, { merge: true });
    return cur;
  });
}

// ---------- المنتجات ----------
function normalizeProduct(b, id) {
  return {
    id,
    name: String(b.name || "").trim() || "منتج بدون اسم",
    slug: String(b.slug || "").trim() || `product-${id}`,
    price: Number(b.price) || 0,
    oldPrice: b.oldPrice ? Number(b.oldPrice) : null,
    description: String(b.description || ""),
    images: Array.isArray(b.images) ? b.images.filter(Boolean) : [],
    colors: Array.isArray(b.colors) ? b.colors.filter(Boolean) : [],
    stock: b.stock !== undefined && b.stock !== "" && b.stock !== null ? Number(b.stock) : null,
    badge: String(b.badge || ""),
    active: b.active !== false,
    createdAt: new Date().toISOString(),
  };
}

async function listProducts() {
  const items = (await listDocs("products")).map((p) => ({ ...p, id: Number(p.id) }));
  items.sort((a, b) => a.id - b.id);
  return items;
}
async function getProduct(id) {
  const p = await getDoc("products", id);
  return p ? { ...p, id: Number(p.id) } : null;
}
async function createProduct(data) {
  const id = await nextId("products");
  const product = normalizeProduct(data, id);
  await setDoc("products", id, product);
  return product;
}
async function updateProduct(id, patch) {
  const cur = await getProduct(id);
  if (!cur) return null;
  const merged = { ...cur, ...patch, id: Number(id), updatedAt: new Date().toISOString() };
  await setDoc("products", id, merged);
  return merged;
}
async function deleteProduct(id) { return deleteDoc("products", id); }

// إنشاء مجمّع: حجز معرّفات متتالية عبر معاملة ثم كتابة على دفعات
async function bulkCreateProducts(list) {
  if (!list.length) return [];
  const ref = db.collection("meta").doc("counters");
  const start = await db.runTransaction(async (tx) => {
    const d = await tx.get(ref);
    const data = d.exists ? d.data() : { products: 0, orders: 1000 };
    const s = Number(data.products) || 0;
    tx.set(ref, { products: s + list.length, orders: Number(data.orders) || 1000 }, { merge: true });
    return s;
  });
  const products = list.map((b, i) => normalizeProduct(b, start + i + 1));
  for (let i = 0; i < products.length; i += 450) {
    const batch = db.batch();
    products.slice(i, i + 450).forEach((p) => batch.set(db.collection("products").doc(String(p.id)), p));
    await batch.commit();
  }
  return products;
}

// ---------- الطلبات ----------
async function listOrders() {
  const items = (await listDocs("orders")).map((o) => ({ ...o, id: Number(o.id) }));
  items.sort((a, b) => b.id - a.id);
  return items;
}
async function getOrder(id) {
  const o = await getDoc("orders", id);
  return o ? { ...o, id: Number(o.id) } : null;
}
async function createOrder(order) { await setDoc("orders", order.id, order); return order; }
async function updateOrder(id, order) { await setDoc("orders", id, order); return order; }
async function deleteOrder(id) { return deleteDoc("orders", id); }

// ---------- الإعدادات وحساب المسؤول ----------
async function getSettings() { return getDoc("meta", "settings"); }
async function saveSettings(data) { return setDoc("meta", "settings", data); }
async function getAdmin() { return getDoc("meta", "admin"); }
async function saveAdmin(data) { return setDoc("meta", "admin", data); }

module.exports = {
  db,
  getDoc, setDoc, deleteDoc, listDocs, nextId,
  listProducts, getProduct, createProduct, updateProduct, deleteProduct, bulkCreateProducts, normalizeProduct,
  listOrders, getOrder, createOrder, updateOrder, deleteOrder,
  getSettings, saveSettings, getAdmin, saveAdmin,
};
