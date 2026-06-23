/* ===================== Swish — landing logic (cart + bundle) ===================== */
(function () {
  "use strict";

  const state = {
    settings: {}, wilayas: [], products: [], index: 0,
    cart: new Map(), // productId -> { product, qty, color }
    pixel: { viewed: new Set(), checkout: false },
    wilayaSel: null, manyDots: false,
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const cur = () => state.settings.currency || "دج";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const placeholder = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='100%' height='100%' fill='#16161b'/><text x='50%' y='52%' font-family='Arial' font-size='40' fill='#444' text-anchor='middle'>SWISH</text></svg>");

  // ---------- Meta Pixel ----------
  function initPixel(id) {
    if (!id) return;
    /* eslint-disable */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", id); window.fbq("track", "PageView");
  }
  const track = (ev, p, o) => { if (window.fbq) window.fbq("track", ev, p || {}, o || undefined); };

  // ---------- boot ----------
  async function boot() {
    try {
      const [cfg, prod] = await Promise.all([fetch("/api/config").then((r) => r.json()), fetch("/api/products").then((r) => r.json())]);
      state.settings = cfg.settings || {}; state.wilayas = cfg.wilayas || []; state.products = prod || [];
    } catch (e) { console.error("load failed", e); }
    initPixel(state.settings.metaPixelId);
    renderHeader();
    buildCarousel(); initCarousel();
    buildSelects(); populateWilayas();
    bindForm(); bindModal();
    renderCart(); updateTotals();
  }

  function renderHeader() {
    const s = state.settings;
    $("#year").textContent = new Date().getFullYear();
    if (s.tagline) $("#kicker").textContent = s.tagline;
    $$(".cur").forEach((el) => (el.textContent = cur()));
    document.title = `${s.storeName || "Swish"} — قبعات ستريت وير | الدفع عند الاستلام`;
    // عرض الباقة
    if (s.bundleEnabled && s.bundlePrice > 0) {
      $("#bundleText").textContent = `العرض: ${s.bundleSize} قطع بـ ${fmt(s.bundlePrice)} ${cur()} فقط — اختر أكثر ووفّر!`;
      $("#bundleBanner").hidden = false;
    }
  }

  const disc = (p) => (p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);

  // ---------- carousel ----------
  function buildCarousel() {
    const track = $("#carTrack");
    if (!state.products.length) {
      track.innerHTML = `<div class="slide is-active"><div class="slide-body"><p class="slide-desc">لا توجد منتجات متاحة حاليًا.</p></div></div>`;
      $("#carPrev").hidden = $("#carNext").hidden = true; return;
    }
    track.innerHTML = state.products.map((p, i) => {
      const d = disc(p), img = (p.images && p.images[0]) || placeholder;
      return `
      <div class="slide${i === 0 ? " is-active" : ""}" data-i="${i}">
        <div class="slide-media">
          <img src="${esc(img)}" alt="${esc(p.name)}" ${i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} draggable="false" />
          ${p.badge ? `<span class="slide-badge">${esc(p.badge)}</span>` : ""}
          ${d ? `<span class="slide-disc">-${d}%</span>` : ""}
        </div>
        <div class="slide-body">
          <div class="slide-name">${esc(p.name)}</div>
          ${p.description ? `<div class="slide-desc">${esc(p.description)}</div>` : ""}
          <div class="slide-row">
            <div class="slide-price">
              <span class="slide-now">${fmt(p.price)}</span><span class="slide-cur">${cur()}</span>
              ${p.oldPrice ? `<span class="slide-old">${fmt(p.oldPrice)}</span>` : ""}
            </div>
            <button type="button" class="choose" data-id="${p.id}"><svg aria-hidden="true"><use href="#i-plus"/></svg><span>أضِف</span></button>
          </div>
        </div>
      </div>`;
    }).join("");
    state.manyDots = state.products.length > 12;
    $("#carDots").innerHTML = state.manyDots
      ? `<span class="car-count"><b id="carIdx">1</b> / ${state.products.length}</span>`
      : state.products.map((_, i) => `<button class="dot${i === 0 ? " active" : ""}" data-dot="${i}" aria-label="موديل ${i + 1}"></button>`).join("");
    track.addEventListener("click", (e) => { const b = e.target.closest(".choose"); if (!b) return; const p = state.products.find((x) => x.id === Number(b.dataset.id)); if (p) toggleCart(p); });
    $("#carDots").addEventListener("click", (e) => { const d = e.target.closest(".dot"); if (d) go(Number(d.dataset.dot)); });
  }

  function go(i) {
    const n = state.products.length; if (!n) return;
    state.index = Math.max(0, Math.min(n - 1, i));
    $("#carTrack").style.transform = `translateX(${-state.index * 100}%)`;
    $$("#carTrack .slide").forEach((s, k) => s.classList.toggle("is-active", k === state.index));
    if (state.manyDots) { const idx = document.getElementById("carIdx"); if (idx) idx.textContent = state.index + 1; }
    else $$("#carDots .dot").forEach((d, k) => d.classList.toggle("active", k === state.index));
  }

  function initCarousel() {
    const vp = $("#carViewport"), track = $("#carTrack");
    $("#carPrev").addEventListener("click", () => go(state.index - 1));
    $("#carNext").addEventListener("click", () => go(state.index + 1));
    let startX = 0, lastX = 0, lastT = 0, vel = 0, dragging = false, delta = 0;
    vp.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true; startX = lastX = e.clientX; lastT = e.timeStamp || 0; vel = 0; delta = 0;
      track.style.transition = "none"; track.classList.add("dragging");
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      delta = e.clientX - startX;
      const dt = (e.timeStamp || 0) - lastT;
      if (dt > 0) vel = (e.clientX - lastX) / dt; // px/ms
      lastX = e.clientX; lastT = e.timeStamp || 0;
      // مقاومة خفيفة عند الأطراف
      let d = delta;
      if ((state.index === 0 && d > 0) || (state.index === state.products.length - 1 && d < 0)) d *= 0.35;
      track.style.transform = `translateX(calc(${-state.index * 100}% + ${d}px))`;
    });
    const up = () => {
      if (!dragging) return;
      dragging = false; track.style.transition = ""; track.classList.remove("dragging");
      const w = vp.clientWidth || 1;
      // flick سريع أو سحب كافٍ
      if (vel < -0.45 || delta < -w * 0.18) go(state.index + 1);
      else if (vel > 0.45 || delta > w * 0.18) go(state.index - 1);
      else go(state.index);
      delta = 0; vel = 0;
    };
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    window.addEventListener("resize", () => go(state.index));
    vp.setAttribute("tabindex", "0");
    vp.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") go(state.index + 1); if (e.key === "ArrowRight") go(state.index - 1); });
  }

  // ---------- cart ----------
  function toggleCart(p) {
    if (state.cart.has(p.id)) state.cart.delete(p.id);
    else state.cart.set(p.id, { product: p, qty: 1, color: (p.colors && p.colors[0]) || "" });
    updateChooseButtons();
    renderCart(); updateTotals();
    // Pixel: ViewContent مرة لكل منتج عند أول إضافة
    if (state.cart.has(p.id) && !state.pixel.viewed.has(p.id)) {
      track("ViewContent", { content_name: p.name, content_ids: [String(p.id)], content_type: "product", value: p.price, currency: "DZD" });
      state.pixel.viewed.add(p.id);
    }
    const c = $("#cart"); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash");
    if (state.cart.has(p.id) && window.matchMedia("(max-width: 920px)").matches) $("#cart").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function updateChooseButtons() {
    $$(".choose").forEach((b) => {
      const on = state.cart.has(Number(b.dataset.id));
      b.classList.toggle("is-picked", on);
      b.querySelector("span").textContent = on ? "أُضيف" : "أضِف";
      b.querySelector("use").setAttribute("href", on ? "#i-check" : "#i-plus");
    });
  }

  function renderCart() {
    const box = $("#cart");
    if (!state.cart.size) {
      box.innerHTML = `<div class="cart-empty"><svg aria-hidden="true"><use href="#i-bag"/></svg> اختر قبعة أو أكثر من الأعلى</div>`;
      return;
    }
    box.innerHTML = [...state.cart.values()].map((l) => {
      const p = l.product;
      const colorSel = (p.colors && p.colors.length)
        ? `<select class="cart-color" data-id="${p.id}">${p.colors.map((c) => `<option value="${esc(c)}"${c === l.color ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>`
        : "";
      return `
      <div class="cart-line" data-id="${p.id}">
        <img class="cart-thumb" src="${esc((p.images && p.images[0]) || placeholder)}" alt="" />
        <div class="cart-info">
          <div class="cart-name">${esc(p.name)}</div>
          <div class="cart-price">${fmt(p.price)} ${cur()}</div>
          ${colorSel}
        </div>
        <div class="cart-qty">
          <button type="button" data-dec="${p.id}" aria-label="إنقاص"><svg aria-hidden="true"><use href="#i-minus"/></svg></button>
          <span>${l.qty}</span>
          <button type="button" data-inc="${p.id}" aria-label="زيادة"><svg aria-hidden="true"><use href="#i-plus"/></svg></button>
        </div>
        <button type="button" class="cart-remove" data-remove="${p.id}" aria-label="حذف"><svg aria-hidden="true"><use href="#i-x"/></svg></button>
      </div>`;
    }).join("");

    box.querySelectorAll("[data-inc]").forEach((b) => b.addEventListener("click", () => changeQty(Number(b.dataset.inc), 1)));
    box.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => changeQty(Number(b.dataset.dec), -1)));
    box.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => { state.cart.delete(Number(b.dataset.remove)); updateChooseButtons(); renderCart(); updateTotals(); }));
    box.querySelectorAll(".cart-color").forEach((sel) => sel.addEventListener("change", () => { const l = state.cart.get(Number(sel.dataset.id)); if (l) l.color = sel.value; }));
  }

  function changeQty(id, d) {
    const l = state.cart.get(id); if (!l) return;
    l.qty = Math.max(1, Math.min(99, l.qty + d));
    renderCart(); updateTotals();
  }

  // ---------- custom glass select (wilaya) ----------
  function makeSelect(mountId, hiddenId, opts) {
    opts = opts || {};
    const mount = $(mountId), hidden = $(hiddenId);
    let options = [], open = false, value = "";
    mount.innerHTML =
      `<button type="button" class="cs-btn"><svg class="cs-ic" aria-hidden="true"><use href="#${opts.icon || "i-chev-d"}"/></svg><span class="cs-val">${esc(opts.placeholder || "اختر")}</span><svg class="cs-chev" aria-hidden="true"><use href="#i-chev-d"/></svg></button>
       <div class="cs-panel glass" hidden>${opts.searchable ? '<div class="cs-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input type="text" placeholder="ابحث عن ولايتك..." /></div>' : ""}<div class="cs-list"></div></div>`;
    const btn = mount.querySelector(".cs-btn"), panel = mount.querySelector(".cs-panel"),
      list = mount.querySelector(".cs-list"), valEl = mount.querySelector(".cs-val"),
      search = mount.querySelector(".cs-search input");
    function render(filter) {
      const f = (filter || "").trim().toLowerCase();
      const rows = options.filter((o) => !f || o.label.toLowerCase().includes(f));
      list.innerHTML = rows.length
        ? rows.map((o) => `<button type="button" class="cs-opt${String(o.value) === value ? " sel" : ""}" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join("")
        : '<div class="cs-empty">لا نتائج</div>';
    }
    function openP() { open = true; panel.hidden = false; mount.classList.add("open"); if (search) { search.value = ""; render(""); setTimeout(() => search.focus(), 30); } }
    function closeP() { open = false; panel.hidden = true; mount.classList.remove("open"); }
    btn.addEventListener("click", () => (open ? closeP() : openP()));
    if (search) search.addEventListener("input", () => render(search.value));
    list.addEventListener("click", (e) => { const o = e.target.closest(".cs-opt"); if (!o) return; setValue(o.dataset.v); closeP(); });
    document.addEventListener("click", (e) => { if (open && !mount.contains(e.target)) closeP(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) closeP(); });
    function setValue(v) {
      value = String(v);
      const o = options.find((x) => String(x.value) === value);
      valEl.textContent = o ? o.label : (opts.placeholder || "اختر");
      mount.classList.toggle("has-val", !!value); mount.classList.remove("invalid");
      hidden.value = value; hidden.dispatchEvent(new Event("change", { bubbles: true }));
      render(search ? search.value : "");
    }
    function setOptions(op) { options = op || []; render(""); }
    setOptions(opts.options || []);
    return { setOptions, setValue, getValue: () => value, markInvalid: (b) => mount.classList.toggle("invalid", !!b) };
  }
  function buildSelects() {
    state.wilayaSel = makeSelect("#wilayaCs", "#fWilaya", { placeholder: "اختر الولاية", searchable: true, icon: "i-pin" });
    $("#fWilaya").addEventListener("change", () => { updateDeliv(); updateTotals(); });
  }
  function populateWilayas() { state.wilayaSel.setOptions(state.wilayas.map((w) => ({ value: w.code, label: `${w.code} - ${w.name}` }))); }
  const selWilaya = () => state.wilayas.find((w) => w.code === Number($("#fWilaya").value)) || null;
  const delivType = () => (document.querySelector('input[name="deliveryType"]:checked') || {}).value || "home";
  function updateDeliv() {
    const w = selWilaya();
    $("#pHome").textContent = w ? `${fmt(w.home)} ${cur()}` : "—";
    $("#pDesk").textContent = w ? `${fmt(w.desk)} ${cur()}` : "—";
  }

  // ---------- bundle pricing (mirror of server) ----------
  function bundlePricing(units) {
    const s = state.settings;
    const regular = units.reduce((a, b) => a + b, 0);
    if (!s.bundleEnabled || !(s.bundlePrice > 0) || units.length < s.bundleSize) return { subtotal: regular, regular, savings: 0 };
    const N = Math.floor(s.bundleSize), X = Number(s.bundlePrice);
    const sorted = [...units].sort((a, b) => b - a);
    const packs = Math.floor(sorted.length / N);
    const remainder = sorted.slice(packs * N).reduce((a, b) => a + b, 0);
    const subtotal = packs * X + remainder;
    return { subtotal, regular, savings: Math.max(0, regular - subtotal) };
  }

  function updateTotals() {
    const lines = [...state.cart.values()];
    const units = [];
    lines.forEach((l) => { for (let i = 0; i < l.qty; i++) units.push(l.product.price); });
    const totalQty = units.length;
    const { subtotal, regular, savings } = bundlePricing(units);
    const w = selWilaya();
    let fee = w ? (delivType() === "desk" ? w.desk : w.home) : null;
    const thr = Number(state.settings.freeShippingThreshold) || 0;
    let free = false;
    if (w && thr > 0 && subtotal >= thr) { fee = 0; free = true; }
    const total = subtotal + (fee || 0);
    $("#tQty").textContent = totalQty;
    $("#tSub").textContent = fmt(regular);
    if (savings > 0) { $("#tSave").textContent = `- ${fmt(savings)} ${cur()}`; $("#tSaveRow").hidden = false; } else $("#tSaveRow").hidden = true;
    $("#tDeliv").textContent = !totalQty ? "—" : fee === null ? "اختر الولاية" : free ? "مجاني" : `${fmt(fee)} ${cur()}`;
    $("#tTotal").textContent = fmt(total);
  }

  // ---------- form ----------
  function bindForm() {
    $$('input[name="deliveryType"]').forEach((r) => r.addEventListener("change", () => { toggleAddr(); updateTotals(); }));
    toggleAddr();
    ["#fName", "#fPhone"].forEach((id) => $(id).addEventListener("focus", () => {
      if (!state.pixel.checkout && state.cart.size) {
        const ids = [...state.cart.keys()].map(String);
        const units = []; [...state.cart.values()].forEach((l) => { for (let i = 0; i < l.qty; i++) units.push(l.product.price); });
        track("InitiateCheckout", { content_ids: ids, content_type: "product", num_items: units.length, value: bundlePricing(units).subtotal, currency: "DZD" });
        state.pixel.checkout = true;
      }
    }, { once: true }));
    $("#orderForm").addEventListener("submit", onSubmit);
  }
  function toggleAddr() {
    const home = delivType() === "home";
    $("#addrFld").querySelector("label").innerHTML = home ? 'العنوان / البلدية <i>*</i>' : "العنوان / البلدية (اختياري)";
  }
  function setErr(fld, err, msg) { $(fld).classList.toggle("invalid", !!msg); $(err).textContent = msg || ""; }
  function formErr(msg) { const b = $("#formErr"); if (msg) { b.textContent = msg; b.hidden = false; b.scrollIntoView({ behavior: "smooth", block: "center" }); } else { b.hidden = true; } }

  function validate() {
    let ok = true;
    const name = $("#fName").value.trim(), digits = $("#fPhone").value.replace(/[\s-]/g, "");
    if (name.length < 3) { setErr("#fName", "#errName", "أدخل الاسم الكامل"); ok = false; } else setErr("#fName", "#errName", "");
    if (!/^0[567]\d{8}$/.test(digits)) { setErr("#fPhone", "#errPhone", "رقم هاتف غير صحيح (مثال: 0555000000)"); ok = false; } else setErr("#fPhone", "#errPhone", "");
    if (!$("#fWilaya").value) { state.wilayaSel.markInvalid(true); $("#errWilaya").textContent = "اختر الولاية"; ok = false; } else { state.wilayaSel.markInvalid(false); $("#errWilaya").textContent = ""; }
    if (delivType() === "home" && $("#fAddress").value.trim().length < 3) { setErr("#addrFld", "#errAddress", "العنوان مطلوب للتوصيل المنزلي"); ok = false; } else setErr("#addrFld", "#errAddress", "");
    return ok;
  }

  async function onSubmit(e) {
    e.preventDefault(); formErr("");
    if (!state.cart.size) { formErr("اختر قبعة واحدة على الأقل من الأعلى"); return; }
    if (!validate()) { document.querySelector(".invalid")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const btn = $("#submitBtn"), label = btn.querySelector("span").textContent;
    btn.disabled = true; btn.querySelector("span").textContent = "جاري الإرسال...";
    const items = [...state.cart.values()].map((l) => ({ productId: l.product.id, quantity: l.qty, color: l.color || "" }));
    const payload = {
      items, fullName: $("#fName").value.trim(), phone: $("#fPhone").value.trim(),
      wilaya: $("#fWilaya").value, address: $("#fAddress").value.trim(), deliveryType: delivType(),
    };
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذّر إرسال الطلب");
      const ids = items.map((i) => String(i.productId)), numItems = items.reduce((s, i) => s + i.quantity, 0);
      track("Purchase", { content_ids: ids, content_type: "product", num_items: numItems, value: data.total, currency: "DZD" }, { eventID: "order_" + data.orderId });
      $("#okRef").textContent = data.ref; openModal();
      state.cart.clear(); updateChooseButtons(); renderCart();
      $("#orderForm").reset(); state.wilayaSel.setOptions(state.wilayas.map((w) => ({ value: w.code, label: `${w.code} - ${w.name}` }))); toggleAddr(); updateDeliv(); updateTotals();
    } catch (err) { formErr((err.message || "حدث خطأ") + " — حاول مرة أخرى"); }
    finally { btn.disabled = false; btn.querySelector("span").textContent = label; }
  }

  // ---------- modal ----------
  let lastFocus = null;
  function openModal() { lastFocus = document.activeElement; $("#okModal").hidden = false; $("#okClose").focus(); }
  function closeModal() { $("#okModal").hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function bindModal() {
    $("#okClose").addEventListener("click", closeModal);
    $("#okModal").addEventListener("click", (e) => { if (e.target.id === "okModal") closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#okModal").hidden) closeModal(); });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
