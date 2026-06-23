/* ============ لوحة التحكم — منطق مشترك + موجّه الصفحات ============ */
(function () {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const page = document.body.dataset.page;

  // حالة عامة
  let STATUSES = [];
  let CURRENCY = "دج";
  const statusMap = {};

  // ---------- أدوات ----------
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const money = (n) => `${fmt(n)} ${CURRENCY}`;
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("ar-DZ", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function toast(msg, type = "ok") {
    const wrap = $("#toastWrap");
    if (!wrap) return alert(msg);
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  async function api(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (res.status === 401 && page !== "login") {
      window.location.href = "/admin/login.html";
      throw new Error("غير مصرّح");
    }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error((data && data.error) || "حدث خطأ في الخادم");
    return data;
  }

  function statusBadge(key) {
    const s = statusMap[key] || { label: key, color: "#6b7280" };
    return `<span class="badge" style="background:${s.color}"><span class="dot"></span>${escapeHtml(s.label)}</span>`;
  }

  // ---------- القائمة الجانبية (موبايل) ----------
  function initSidebar() {
    const toggle = $("#menuToggle");
    const sb = $("#sidebar");
    const backdrop = $("#sbBackdrop");
    if (toggle && sb) {
      toggle.addEventListener("click", () => {
        sb.classList.toggle("open");
        if (backdrop) backdrop.classList.toggle("show");
      });
      if (backdrop) backdrop.addEventListener("click", () => {
        sb.classList.remove("open");
        backdrop.classList.remove("show");
      });
    }
    // إغلاق أي مودال مفتوح عبر مفتاح Escape
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      ["#productModal", "#orderModal"].forEach((sel) => {
        const m = $(sel);
        if (m && !m.hidden) m.hidden = true;
      });
    });

    const logout = $("#logoutBtn");
    if (logout) logout.addEventListener("click", async () => {
      try { await api("/admin/logout", { method: "POST" }); } catch (_) {}
      window.location.href = "/admin/login.html";
    });
  }

  // تحميل الإعدادات العامة (الحالات + العملة)
  async function loadCommon() {
    try {
      const cfg = await fetch("/api/config").then((r) => r.json());
      STATUSES = cfg.statuses || [];
      CURRENCY = (cfg.settings && cfg.settings.currency) || "دج";
      STATUSES.forEach((s) => (statusMap[s.key] = s));
    } catch (_) {}
  }

  // ============================================================
  // صفحة الدخول
  // ============================================================
  function initLogin() {
    const form = $("#loginForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#loginBtn");
      const err = $("#loginErr");
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = "جاري الدخول...";
      try {
        await api("/admin/login", {
          method: "POST",
          body: JSON.stringify({ username: $("#username").value, password: $("#password").value }),
        });
        window.location.href = "/admin/dashboard.html";
      } catch (e2) {
        err.textContent = e2.message;
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = "دخول";
      }
    });
  }

  // ============================================================
  // لوحة المعلومات
  // ============================================================
  async function initDashboard() {
    // تحذير كلمة المرور الافتراضية
    try {
      const me = await api("/admin/me");
      if (me && me.isDefaultPassword) {
        const main = document.querySelector(".main");
        const topbar = document.querySelector(".topbar");
        const banner = document.createElement("div");
        banner.className = "warn-banner";
        banner.innerHTML = '⚠️ أنت تستخدم كلمة المرور الافتراضية. <a href="/admin/settings.html">غيّرها الآن من الإعدادات ←</a>';
        main.insertBefore(banner, topbar.nextSibling);
      }
    } catch (e) { /* ignore */ }

    try {
      const stats = await api("/admin/stats");
      CURRENCY = stats.currency || CURRENCY;
      renderStats(stats);
      renderChart(stats.last7 || []);
    } catch (e) { toast(e.message, "err"); }

    try {
      const orders = await api("/admin/orders");
      renderRecent(orders.slice(0, 8));
    } catch (e) { /* ignore */ }
  }

  function renderStats(s) {
    const cards = [
      { ic: "📦", bg: "#eef2ff", color: "#4f46e5", v: fmt(s.totalOrders), l: "إجمالي الطلبات" },
      { ic: "🆕", bg: "#fff7ed", color: "#ea580c", v: fmt(s.todayOrders), l: "طلبات اليوم" },
      { ic: "⏳", bg: "#fefce8", color: "#ca8a04", v: fmt(s.byStatus.pending || 0), l: "قيد الانتظار" },
      { ic: "✅", bg: "#ecfdf5", color: "#059669", v: fmt(s.byStatus.delivered || 0), l: "تم التسليم" },
      { ic: "💰", bg: "#ecfdf5", color: "#059669", v: money(s.revenue), l: "الإيرادات (مُسلّمة)" },
      { ic: "🕒", bg: "#eff6ff", color: "#2563eb", v: money(s.pendingRevenue), l: "إيرادات متوقعة" },
      { ic: "🧢", bg: "#fdf4ff", color: "#a21caf", v: `${fmt(s.activeProducts)}/${fmt(s.productCount)}`, l: "منتجات مُفعّلة" },
    ];
    $("#statsGrid").innerHTML = cards
      .map((c) => `
        <div class="stat-card">
          <div class="stat-ic" style="background:${c.bg};color:${c.color}">${c.ic}</div>
          <div class="stat-meta"><div class="v">${c.v}</div><div class="l">${c.l}</div></div>
        </div>`)
      .join("");
  }

  function renderChart(last7) {
    const max = Math.max(1, ...last7.map((d) => d.count));
    const bars = last7
      .map((d) => {
        const h = Math.round((d.count / max) * 130) + 4;
        const day = new Date(d.date).toLocaleDateString("ar-DZ", { weekday: "short", day: "numeric" });
        return `
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex:1">
            <div style="font-weight:800;font-size:.85rem">${d.count}</div>
            <div title="${d.count} طلب" style="width:100%;max-width:46px;height:${h}px;background:linear-gradient(180deg,#e8852b,#cf6f17);border-radius:8px 8px 0 0"></div>
            <div style="font-size:.78rem;color:var(--muted)">${day}</div>
          </div>`;
      })
      .join("");
    $("#chart7").innerHTML = `<div style="display:flex;align-items:flex-end;gap:10px;height:180px;padding-top:10px">${bars}</div>`;
  }

  function renderRecent(orders) {
    const body = $("#recentOrders");
    if (!orders.length) { body.innerHTML = `<tr><td colspan="6" class="empty">لا توجد طلبات بعد</td></tr>`; return; }
    body.innerHTML = orders
      .map((o) => `
        <tr>
          <td><b>${escapeHtml(o.ref)}</b></td>
          <td>${escapeHtml(o.customer.fullName)}</td>
          <td>${escapeHtml(o.item.productName)}</td>
          <td>${escapeHtml(o.shipping.wilayaName)}</td>
          <td><b>${money(o.pricing.total)}</b></td>
          <td>${statusBadge(o.status)}</td>
        </tr>`)
      .join("");
  }

  // ============================================================
  // المنتجات
  // ============================================================
  let productImages = [];

  async function initProducts() {
    $("#addProductBtn").addEventListener("click", () => openProductModal());
    initBulk();
    $$("[data-close]").forEach((b) => b.addEventListener("click", closeProductModal));
    $("#productModal").addEventListener("click", (e) => { if (e.target.id === "productModal") closeProductModal(); });
    $("#saveProduct").addEventListener("click", saveProduct);

    // رفع الصور
    $("#uploader").addEventListener("click", () => $("#imgInput").click());
    $("#imgInput").addEventListener("change", handleUpload);
    $("#imgUrl").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const url = $("#imgUrl").value.trim();
        if (url) { productImages.push(url); $("#imgUrl").value = ""; renderImages(); }
      }
    });

    await loadProducts();
  }

  async function loadProducts() {
    try {
      const items = await api("/admin/products");
      const body = $("#productsBody");
      if (!items.length) { body.innerHTML = `<tr><td colspan="6" class="empty">لا توجد منتجات. اضغط «إضافة منتج».</td></tr>`; return; }
      body.innerHTML = items
        .map((p) => `
          <tr>
            <td><div class="product-mini"><img src="${(p.images && p.images[0]) || placeholder()}" alt=""><span>${escapeHtml(p.name)}</span></div></td>
            <td><b>${money(p.price)}</b></td>
            <td>${p.oldPrice ? `<s style="color:var(--muted)">${money(p.oldPrice)}</s>` : "—"}</td>
            <td>${p.stock == null ? "—" : fmt(p.stock)}</td>
            <td>${p.active !== false ? '<span class="chip" style="color:#059669">مُفعّل</span>' : '<span class="chip" style="color:#ef4444">مخفي</span>'}</td>
            <td>
              <button class="btn btn-ghost btn-sm" data-edit="${p.id}">✏️ تعديل</button>
              <button class="btn btn-danger btn-sm" data-del="${p.id}">🗑️</button>
            </td>
          </tr>`)
        .join("");
      $$("[data-edit]").forEach((b) => b.addEventListener("click", () => openProductModal(items.find((x) => x.id === Number(b.dataset.edit)))));
      $$("[data-del]").forEach((b) => b.addEventListener("click", () => deleteProduct(Number(b.dataset.del))));
    } catch (e) { toast(e.message, "err"); }
  }

  function openProductModal(p) {
    $("#pmTitle").textContent = p ? "تعديل منتج" : "إضافة منتج";
    $("#pId").value = p ? p.id : "";
    $("#pName").value = p ? p.name : "";
    $("#pPrice").value = p ? p.price : "";
    $("#pOldPrice").value = p && p.oldPrice ? p.oldPrice : "";
    $("#pStock").value = p && p.stock != null ? p.stock : "";
    $("#pDesc").value = p ? p.description || "" : "";
    $("#pColors").value = p && p.colors ? p.colors.join(", ") : "";
    $("#pBadge").value = p ? p.badge || "" : "";
    $("#pActive").checked = p ? p.active !== false : true;
    productImages = p && p.images ? [...p.images] : [];
    renderImages();
    $("#productModal").hidden = false;
  }
  function closeProductModal() { $("#productModal").hidden = true; }

  function renderImages() {
    $("#imgList").innerHTML = productImages
      .map((src, i) => `<div class="img-thumb"><img src="${escapeHtml(src)}" alt=""><button type="button" data-rmimg="${i}">✕</button></div>`)
      .join("");
    $$("[data-rmimg]").forEach((b) => b.addEventListener("click", () => { productImages.splice(Number(b.dataset.rmimg), 1); renderImages(); }));
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (res.status === 401) { window.location.href = "/admin/login.html"; return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الرفع");
      productImages.push(data.url);
      renderImages();
      toast("تم رفع الصورة");
    } catch (err) { toast(err.message, "err"); }
    e.target.value = "";
  }

  async function saveProduct() {
    const id = $("#pId").value;
    const splitList = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);
    const payload = {
      name: $("#pName").value.trim(),
      price: Number($("#pPrice").value) || 0,
      oldPrice: $("#pOldPrice").value ? Number($("#pOldPrice").value) : null,
      stock: $("#pStock").value === "" ? null : Number($("#pStock").value),
      description: $("#pDesc").value.trim(),
      colors: splitList($("#pColors").value),
      badge: $("#pBadge").value.trim(),
      active: $("#pActive").checked,
      images: productImages,
    };
    if (!payload.name) return toast("اسم المنتج مطلوب", "err");
    if (!payload.price) return toast("السعر مطلوب", "err");
    const btn = $("#saveProduct");
    btn.disabled = true;
    try {
      if (id) await api(`/admin/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/admin/products", { method: "POST", body: JSON.stringify(payload) });
      toast("تم حفظ المنتج");
      closeProductModal();
      loadProducts();
    } catch (e) { toast(e.message, "err"); }
    finally { btn.disabled = false; }
  }

  async function deleteProduct(id) {
    if (!confirm("هل تريد حذف هذا المنتج نهائيًا؟")) return;
    try { await api(`/admin/products/${id}`, { method: "DELETE" }); toast("تم الحذف"); loadProducts(); }
    catch (e) { toast(e.message, "err"); }
  }

  // ===== الإضافة المجمّعة =====
  let bulkFiles = [];
  function initBulk() {
    const open = () => { $("#bulkModal").hidden = false; };
    const close = () => { $("#bulkModal").hidden = true; };
    $("#bulkBtn").addEventListener("click", open);
    $$("[data-bulkclose]").forEach((b) => b.addEventListener("click", close));
    $("#bulkModal").addEventListener("click", (e) => { if (e.target.id === "bulkModal") close(); });
    $("#bulkUploader").addEventListener("click", () => $("#bulkFiles").click());
    $("#bulkFiles").addEventListener("change", (e) => {
      bulkFiles = Array.from(e.target.files || []);
      $("#bulkPreview").innerHTML = bulkFiles
        .map((f) => `<div class="img-thumb"><img src="${URL.createObjectURL(f)}" alt=""></div>`)
        .join("");
      $("#bulkStatus").textContent = bulkFiles.length ? `${bulkFiles.length} صورة جاهزة` : "";
    });
    $("#bulkSave").addEventListener("click", saveBulk);
  }

  async function saveBulk() {
    const name = $("#bName").value.trim();
    if (!name) return toast("الاسم المشترك مطلوب", "err");
    const base = {
      name,
      price: Number($("#bPrice").value) || 0,
      oldPrice: $("#bOldPrice").value ? Number($("#bOldPrice").value) : null,
      badge: $("#bBadge").value.trim(),
      active: true,
    };
    const btn = $("#bulkSave");
    btn.disabled = true;
    try {
      let images = [];
      if (bulkFiles.length) {
        for (let i = 0; i < bulkFiles.length; i++) {
          $("#bulkStatus").textContent = `جاري رفع الصورة ${i + 1} من ${bulkFiles.length}...`;
          const fd = new FormData();
          fd.append("image", bulkFiles[i]);
          const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
          if (res.status === 401) { window.location.href = "/admin/login.html"; return; }
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "فشل رفع صورة");
          images.push(data.url);
        }
      }
      const count = images.length ? images.length : Number($("#bCount").value) || 0;
      if (!images.length && count < 1) return toast("ارفع صورًا أو حدّد عددًا", "err");
      $("#bulkStatus").textContent = "جاري إنشاء الموديلات...";
      const r = await api("/admin/products/bulk", { method: "POST", body: JSON.stringify({ ...base, images, count }) });
      toast(`تم إنشاء ${r.count} موديل`);
      $("#bulkModal").hidden = true;
      bulkFiles = []; $("#bulkPreview").innerHTML = ""; $("#bulkStatus").textContent = ""; $("#bulkForm").reset();
      loadProducts();
    } catch (e) { toast(e.message, "err"); $("#bulkStatus").textContent = ""; }
    finally { btn.disabled = false; }
  }

  // ============================================================
  // الطلبات
  // ============================================================
  let currentFilter = "";
  let searchTerm = "";
  let currentOrder = null;

  async function initOrders() {
    // تبويبات الحالة
    const tabs = $("#statusTabs");
    const allTab = `<button class="status-tab active" data-status="">الكل</button>`;
    tabs.innerHTML = allTab + STATUSES.map((s) => `<button class="status-tab" data-status="${s.key}">${escapeHtml(s.label)}</button>`).join("");
    $$(".status-tab", tabs).forEach((t) =>
      t.addEventListener("click", () => {
        $$(".status-tab", tabs).forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        currentFilter = t.dataset.status;
        loadOrders();
      })
    );

    // قائمة الحالة في المودال
    $("#statusSelect").innerHTML = STATUSES.map((s) => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join("");

    $("#searchInput").addEventListener("input", debounce(() => { searchTerm = $("#searchInput").value.trim(); loadOrders(); }, 300));
    $("#refreshBtn").addEventListener("click", loadOrders);
    $$("[data-close]").forEach((b) => b.addEventListener("click", closeOrderModal));
    $("#orderModal").addEventListener("click", (e) => { if (e.target.id === "orderModal") closeOrderModal(); });
    $("#saveStatus").addEventListener("click", saveStatus);
    $("#deleteOrder").addEventListener("click", deleteOrder);

    await loadOrders();
  }

  async function loadOrders() {
    const body = $("#ordersBody");
    body.innerHTML = `<tr><td colspan="9" class="spinner">جاري التحميل...</td></tr>`;
    try {
      const params = new URLSearchParams();
      if (currentFilter) params.set("status", currentFilter);
      if (searchTerm) params.set("q", searchTerm);
      const items = await api(`/admin/orders?${params.toString()}`);
      if (!items.length) { body.innerHTML = `<tr><td colspan="9" class="empty">لا توجد طلبات مطابقة</td></tr>`; return; }
      body.innerHTML = items
        .map((o) => `
          <tr>
            <td><b>${escapeHtml(o.ref)}</b></td>
            <td style="font-size:.85rem;color:var(--muted)">${fmtDate(o.createdAt)}</td>
            <td>${escapeHtml(o.customer.fullName)}</td>
            <td dir="ltr" style="text-align:right">${escapeHtml(o.customer.phone)}</td>
            <td>${escapeHtml(o.item.productName)} <span class="chip">×${o.item.quantity}</span></td>
            <td>${escapeHtml(o.shipping.wilayaName)}</td>
            <td><b>${money(o.pricing.total)}</b></td>
            <td>${statusBadge(o.status)}</td>
            <td><button class="btn btn-ghost btn-sm" data-view="${o.id}">👁️ عرض</button></td>
          </tr>`)
        .join("");
      $$("[data-view]").forEach((b) => b.addEventListener("click", () => openOrder(Number(b.dataset.view))));
    } catch (e) { body.innerHTML = `<tr><td colspan="9" class="empty">${escapeHtml(e.message)}</td></tr>`; }
  }

  async function openOrder(id) {
    try {
      const o = await api(`/admin/orders/${id}`);
      currentOrder = o;
      $("#omTitle").textContent = `الطلب ${o.ref}`;
      const dt = o.shipping.deliveryType === "desk" ? "مكتب التوصيل" : "إلى المنزل";
      const variant = o.item.color || "—";
      const timeline = (o.history || [])
        .map((h) => `<div class="tl-item"><span class="tl-dot" style="background:${(statusMap[h.status] || {}).color || "#999"}"></span> ${escapeHtml((statusMap[h.status] || {}).label || h.status)} — <span style="color:var(--muted)">${fmtDate(h.at)}</span></div>`)
        .join("");
      $("#orderDetail").innerHTML = `
        <div class="detail-grid">
          <div class="detail-box">
            <h4>👤 معلومات العميل</h4>
            <div class="detail-row"><span>الاسم</span><b>${escapeHtml(o.customer.fullName)}</b></div>
            <div class="detail-row"><span>الهاتف</span><b dir="ltr">${escapeHtml(o.customer.phone)}</b></div>
            <div class="detail-row"><span>الولاية</span><b>${escapeHtml(o.shipping.wilayaName)}</b></div>
            <div class="detail-row"><span>التوصيل</span><b>${dt}</b></div>
            <div class="detail-row"><span>العنوان</span><b class="wrap">${escapeHtml(o.shipping.address || "—")}</b></div>
          </div>
          <div class="detail-box">
            <h4>🧢 تفاصيل الطلب</h4>
            <div class="detail-row"><span>المنتج</span><b>${escapeHtml(o.item.productName)}</b></div>
            <div class="detail-row"><span>اللون</span><b>${escapeHtml(variant)}</b></div>
            <div class="detail-row"><span>الكمية</span><b>${o.item.quantity}</b></div>
            <div class="detail-row"><span>سعر الوحدة</span><b>${money(o.item.unitPrice)}</b></div>
            <div class="detail-row"><span>المجموع الفرعي</span><b>${money(o.pricing.subtotal)}</b></div>
            <div class="detail-row"><span>التوصيل</span><b>${o.pricing.freeShipping ? "مجاني" : money(o.pricing.deliveryFee)}</b></div>
            <div class="detail-row" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px"><span>المجموع الكلي</span><b style="color:var(--brand);font-size:1.1rem">${money(o.pricing.total)}</b></div>
          </div>
        </div>
        ${o.note ? `<div class="detail-box" style="margin-top:16px"><h4>📝 ملاحظة العميل</h4><div>${escapeHtml(o.note)}</div></div>` : ""}
        <div class="detail-box" style="margin-top:16px">
          <h4>🕒 سجلّ الحالة</h4>
          <div class="timeline">${timeline}</div>
        </div>`;
      $("#statusSelect").value = o.status;
      $("#orderModal").hidden = false;
    } catch (e) { toast(e.message, "err"); }
  }

  function closeOrderModal() { $("#orderModal").hidden = true; currentOrder = null; }

  async function saveStatus() {
    if (!currentOrder) return;
    const status = $("#statusSelect").value;
    const btn = $("#saveStatus");
    btn.disabled = true;
    try {
      await api(`/admin/orders/${currentOrder.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast("تم تحديث الحالة");
      closeOrderModal();
      loadOrders();
    } catch (e) { toast(e.message, "err"); }
    finally { btn.disabled = false; }
  }

  async function deleteOrder() {
    if (!currentOrder) return;
    if (!confirm(`حذف الطلب ${currentOrder.ref} نهائيًا؟`)) return;
    try { await api(`/admin/orders/${currentOrder.id}`, { method: "DELETE" }); toast("تم حذف الطلب"); closeOrderModal(); loadOrders(); }
    catch (e) { toast(e.message, "err"); }
  }

  // ============================================================
  // الإعدادات
  // ============================================================
  async function initSettings() {
    try {
      const s = await api("/admin/settings");
      $("#sPixel").value = s.metaPixelId || "";
      $("#sStoreName").value = s.storeName || "";
      $("#sPhone").value = s.phone || "";
      $("#sTagline").value = s.tagline || "";
      $("#sAnnouncement").value = s.announcement || "";
      $("#sCurrency").value = s.currency || "دج";
      $("#sFreeShip").value = s.freeShippingThreshold || 0;
      $("#sWhatsapp").value = s.whatsapp || "";
      $("#sFacebook").value = s.facebookUrl || "";
      $("#sInstagram").value = s.instagramUrl || "";
      $("#sRatingValue").value = s.ratingValue || 4.8;
      $("#sRatingCount").value = s.ratingCount || 0;
      updatePixelStatus(s.metaPixelId);
    } catch (e) { toast(e.message, "err"); }

    $("#savePixel").addEventListener("click", async () => {
      try {
        const metaPixelId = $("#sPixel").value.trim();
        await api("/admin/settings", { method: "PUT", body: JSON.stringify({ metaPixelId }) });
        updatePixelStatus(metaPixelId);
        toast("تم حفظ معرّف Meta Pixel");
      } catch (e) { toast(e.message, "err"); }
    });

    $("#saveSettings").addEventListener("click", saveSettings);
    $("#saveAccount").addEventListener("click", saveAccount);
  }

  function updatePixelStatus(id) {
    const el = $("#pixelStatus");
    el.innerHTML = id
      ? `✅ البيكسل مُفعّل — المعرّف: <b>${escapeHtml(id)}</b>`
      : `⚠️ لم يتم ضبط البيكسل بعد. ألصق المعرّف لتفعيل التتبّع.`;
  }

  async function saveSettings() {
    const payload = {
      storeName: $("#sStoreName").value.trim(),
      phone: $("#sPhone").value.trim(),
      tagline: $("#sTagline").value.trim(),
      announcement: $("#sAnnouncement").value.trim(),
      currency: $("#sCurrency").value.trim() || "دج",
      freeShippingThreshold: Number($("#sFreeShip").value) || 0,
      whatsapp: $("#sWhatsapp").value.trim(),
      facebookUrl: $("#sFacebook").value.trim(),
      instagramUrl: $("#sInstagram").value.trim(),
      ratingValue: Number($("#sRatingValue").value) || 4.8,
      ratingCount: Number($("#sRatingCount").value) || 0,
      metaPixelId: $("#sPixel").value.trim(),
    };
    const btn = $("#saveSettings");
    btn.disabled = true;
    try { await api("/admin/settings", { method: "PUT", body: JSON.stringify(payload) }); toast("تم حفظ الإعدادات"); }
    catch (e) { toast(e.message, "err"); }
    finally { btn.disabled = false; }
  }

  async function saveAccount() {
    const currentPassword = $("#aCurrent").value;
    const newUsername = $("#aUsername").value.trim();
    const newPassword = $("#aPassword").value;
    if (!currentPassword) return toast("أدخل كلمة المرور الحالية", "err");
    if (!newUsername && !newPassword) return toast("لا يوجد تغيير لحفظه", "err");
    const btn = $("#saveAccount");
    btn.disabled = true;
    try {
      await api("/admin/account", { method: "POST", body: JSON.stringify({ currentPassword, newUsername, newPassword }) });
      toast("تم تحديث بيانات الدخول");
      $("#aCurrent").value = ""; $("#aPassword").value = "";
    } catch (e) { toast(e.message, "err"); }
    finally { btn.disabled = false; }
  }

  // ---------- أدوات عامة ----------
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function placeholder() {
    return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='100%' height='100%' fill='#eef'/><text x='50%' y='50%' font-size='36' text-anchor='middle' dy='.35em'>🧢</text></svg>`);
  }

  // ============================================================
  // التشغيل
  // ============================================================
  async function main() {
    if (page === "login") { initLogin(); return; }
    initSidebar();
    await loadCommon();
    if (page === "dashboard") initDashboard();
    else if (page === "products") initProducts();
    else if (page === "orders") initOrders();
    else if (page === "settings") initSettings();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
