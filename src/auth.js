/**
 * مصادقة المسؤول (متوافقة مع serverless / Vercel):
 * - حساب المسؤول مخزَّن في Firestore (meta/admin) عبر src/store.js
 * - كلمة المرور: scrypt(salt:hash)
 * - الجلسة: كوكي موقّعة بـ HMAC-SHA256 (httpOnly)، والسر من متغيّر البيئة SESSION_SECRET
 */
const crypto = require("crypto");
const store = require("./store");

const SESSION_DAYS = 7;
const COOKIE_NAME = "swish_session";
const COOKIE_SECURE = process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1";
const DEFAULT_PASSWORD = "admin123";

// السر: يجب ضبطه في الإنتاج عبر SESSION_SECRET. عند غيابه نولّد سرًا مؤقتًا (للتطوير فقط)
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex");
if (!process.env.SESSION_SECRET) {
  console.warn("[auth] ⚠️ SESSION_SECRET غير مضبوط — يُستخدم سر مؤقت (اضبطه في الإنتاج/Vercel).");
}

// ---- تجزئة كلمة المرور ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex"), b = Buffer.from(test, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
const DUMMY_HASH = hashPassword("__dummy__");
function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a || "")), bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ---- إدارة المسؤول (Firestore) ----
async function ensureAdmin() {
  const admin = await store.getAdmin();
  if (!admin || !admin.username) {
    await store.saveAdmin({ username: "admin", password: hashPassword(DEFAULT_PASSWORD), createdAt: new Date().toISOString() });
    console.log("[auth] تم إنشاء حساب مسؤول افتراضي → admin / admin123 (غيّره بعد الدخول).");
    return true;
  }
  return false;
}
async function getAdmin() { return store.getAdmin(); }
async function setAdminPassword(newPassword) {
  const admin = (await getAdmin()) || { username: "admin" };
  admin.password = hashPassword(newPassword);
  admin.updatedAt = new Date().toISOString();
  await store.saveAdmin(admin);
}
async function setAdminUsername(newUsername) {
  const admin = (await getAdmin()) || {};
  admin.username = newUsername;
  admin.updatedAt = new Date().toISOString();
  await store.saveAdmin(admin);
}
async function verifyLogin(username, password) {
  const admin = await getAdmin();
  const stored = admin && admin.password ? admin.password : DUMMY_HASH;
  const passOk = verifyPassword(String(password || ""), stored);
  const userOk = admin ? safeEqualStr(username, admin.username) : false;
  return !!admin && userOk && passOk;
}
async function isDefaultPassword() {
  const admin = await getAdmin();
  return !!(admin && verifyPassword(DEFAULT_PASSWORD, admin.password));
}

// ---- التوكن / الكوكي ----
function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function unsign(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch (_) { return null; }
}
function createSessionCookie(username) {
  const token = sign({ u: username, exp: Date.now() + SESSION_DAYS * 864e5 });
  const maxAge = SESSION_DAYS * 86400;
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE ? "; Secure" : ""}`;
}
function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`;
}
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > -1) { const k = part.slice(0, idx).trim(); if (k) out[k] = decodeURIComponent(part.slice(idx + 1).trim()); }
  });
  return out;
}
function getSession(req) { return unsign(parseCookies(req)[COOKIE_NAME]); }

// Middlewares (تتحقق من الكوكي فقط — بلا نداء قاعدة بيانات)
function requireAuth(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "غير مصرّح. يُرجى تسجيل الدخول." });
  req.admin = s; next();
}
function requireAuthPage(req, res, next) {
  const s = getSession(req);
  if (!s) return res.redirect("/admin/login.html");
  req.admin = s; next();
}

module.exports = {
  COOKIE_NAME, ensureAdmin, getAdmin, verifyPassword, verifyLogin, isDefaultPassword,
  setAdminPassword, setAdminUsername, hashPassword,
  createSessionCookie, clearSessionCookie, getSession, requireAuth, requireAuthPage,
};
