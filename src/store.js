/**
 * طبقة البيانات على Firestore عبر REST API (بدون أي حزمة Firebase).
 * مصدر الحقيقة الوحيد للمنتجات والطلبات والإعدادات وحساب المسؤول.
 * يعمل على Vercel (serverless) لأنه لا يكتب على القرص إطلاقًا.
 *
 * ⚠️ يتطلب تفعيل Firestore وقواعد تسمح بالقراءة/الكتابة (وضع الاختبار):
 *   rules_version='2';
 *   service cloud.firestore { match /databases/{db}/documents {
 *     match /{document=**} { allow read, write: if true; } } }
 */
const { firebaseConfig } = require("./firebase");

const PROJECT = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const KEY = process.env.FIREBASE_API_KEY || firebaseConfig.apiKey;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ---------- محوّلات القيم بين JS و Firestore ----------
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
function toFields(obj) {
  const f = {};
  Object.keys(obj || {}).forEach((k) => { if (obj[k] !== undefined) f[k] = toValue(obj[k]); });
  return f;
}
function fromValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return ((v.arrayValue && v.arrayValue.values) || []).map(fromValue);
  if ("mapValue" in v) return fromFields((v.mapValue && v.mapValue.fields) || {});
  return null;
}
function fromFields(fields) {
  const o = {};
  Object.keys(fields || {}).forEach((k) => (o[k] = fromValue(fields[k])));
  return o;
}
function docId(name) { return String(name || "").split("/").pop(); }

// ---------- نداءات REST منخفضة المستوى ----------
async function req(method, pathAndQuery, body) {
  const url = `${BASE}${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}key=${KEY}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return { _notFound: true };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
    const err = new Error(`[firestore] ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function getDoc(coll, id) {
  const d = await req("GET", `/${coll}/${id}`);
  if (d._notFound) return null;
  return { id: docId(d.name), ...fromFields(d.fields) };
}
async function setDoc(coll, id, data) {
  const d = await req("PATCH", `/${coll}/${id}`, { fields: toFields(data) });
  return { id: docId(d.name), ...fromFields(d.fields) };
}
async function deleteDoc(coll, id) { await req("DELETE", `/${coll}/${id}`); return true; }

async function listDocs(coll) {
  let out = [], pageToken = "";
  do {
    const q = `/${coll}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const d = await req("GET", q);
    if (d._notFound) break;
    (d.documents || []).forEach((doc) => out.push({ id: docId(doc.name), ...fromFields(doc.fields) }));
    pageToken = d.nextPageToken || "";
  } while (pageToken);
  return out;
}

// ---------- العدّادات (تسلسل المعرّفات) ----------
async function nextId(kind) {
  const c = (await getDoc("meta", "counters")) || { products: 0, orders: 1000 };
  const cur = Number(c[kind] || (kind === "orders" ? 1000 : 0)) + 1;
  c[kind] = cur;
  await setDoc("meta", "counters", { products: c.products || 0, orders: c.orders || 1000 });
  return cur;
}

// ---------- المنتجات ----------
const num = (v) => (v == null || v === "" ? null : Number(v));
async function listProducts() {
  const items = await listDocs("products");
  items.sort((a, b) => (a.id - b.id));
  return items;
}
async function getProduct(id) { return getDoc("products", String(id)); }
async function createProduct(data) {
  const id = await nextId("products");
  const product = normalizeProduct(data, id);
  await setDoc("products", String(id), product);
  return product;
}
async function updateProduct(id, patch) {
  const cur = await getProduct(id);
  if (!cur) return null;
  const merged = { ...cur, ...patch, id: cur.id, updatedAt: new Date().toISOString() };
  delete merged._id;
  await setDoc("products", String(id), merged);
  return merged;
}
async function deleteProduct(id) { return deleteDoc("products", String(id)); }

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

// إنشاء مجمّع عبر commit واحد (حتى 500 مستند)
async function bulkCreateProducts(list) {
  if (!list.length) return [];
  // نحجز معرّفات متتالية عبر تحديث العدّاد مرة واحدة
  const c = (await getDoc("meta", "counters")) || { products: 0, orders: 1000 };
  let start = Number(c.products || 0);
  const products = list.map((b, i) => normalizeProduct(b, start + i + 1));
  c.products = start + list.length;
  await setDoc("meta", "counters", { products: c.products, orders: Number(c.orders || 1000) });

  const writes = products.map((p) => ({
    update: { name: `projects/${PROJECT}/databases/(default)/documents/products/${p.id}`, fields: toFields(p) },
  }));
  // commit على دفعات 450
  for (let i = 0; i < writes.length; i += 450) {
    await req("POST", `:commit`, { writes: writes.slice(i, i + 450) });
  }
  return products;
}

// ---------- الطلبات ----------
async function listOrders() {
  const items = await listDocs("orders");
  items.sort((a, b) => (b.id - a.id)); // الأحدث أولاً
  return items;
}
async function getOrder(id) { return getDoc("orders", String(id)); }
async function createOrder(order) {
  await setDoc("orders", String(order.id), order);
  return order;
}
async function updateOrder(id, order) { await setDoc("orders", String(id), order); return order; }
async function deleteOrder(id) { return deleteDoc("orders", String(id)); }

// ---------- الإعدادات وحساب المسؤول ----------
async function getSettings() { return (await getDoc("meta", "settings")) || null; }
async function saveSettings(data) { return setDoc("meta", "settings", data); }
async function getAdmin() { return (await getDoc("meta", "admin")) || null; }
async function saveAdmin(data) { return setDoc("meta", "admin", data); }

module.exports = {
  PROJECT, BASE,
  toFields, fromFields, toValue, fromValue,
  getDoc, setDoc, deleteDoc, listDocs, nextId, req,
  listProducts, getProduct, createProduct, updateProduct, deleteProduct, bulkCreateProducts, normalizeProduct,
  listOrders, getOrder, createOrder, updateOrder, deleteOrder,
  getSettings, saveSettings, getAdmin, saveAdmin,
};
