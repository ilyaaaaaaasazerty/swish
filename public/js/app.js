/* ===================== Swish — landing logic ===================== */
(function () {
  "use strict";

  const state = {
    settings: {}, wilayas: [], products: [], current: null, index: 0,
    pixel: { viewed: new Set(), checkout: false },
    wilayaSel: null, colorSel: null,
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
    if (state.products.length) chooseHat(state.products[0], true);
  }

  function renderHeader() {
    const s = state.settings;
    $("#year").textContent = new Date().getFullYear();
    if (s.tagline) $("#kicker").textContent = s.tagline;
    $$(".cur").forEach((el) => (el.textContent = cur()));
    $("#pkCur").textContent = cur();
    document.title = `${s.storeName || "Swish"} — قبعات ستريت وير | الدفع عند الاستلام`;
  }

  const disc = (p) => (p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);

  // ---------- carousel ----------
  function buildCarousel() {
    const track = $("#carTrack");
    if (!state.products.length) {
      track.innerHTML = `<div class="slide"><div class="slide-body"><p class="slide-desc">لا توجد منتجات متاحة حاليًا.</p></div></div>`;
      $("#carPrev").hidden = $("#carNext").hidden = true; return;
    }
    track.innerHTML = state.products.map((p, i) => {
      const d = disc(p), img = (p.images && p.images[0]) || placeholder;
      return `
      <div class="slide" data-i="${i}">
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
            <button type="button" class="choose" data-id="${p.id}"><svg aria-hidden="true"><use href="#i-chev-l"/></svg><span>اختر</span></button>
          </div>
        </div>
      </div>`;
    }).join("");
    $("#carDots").innerHTML = state.products.map((_, i) => `<button class="dot${i === 0 ? " active" : ""}" data-dot="${i}" aria-label="موديل ${i + 1}"></button>`).join("");
    track.addEventListener("click", (e) => { const b = e.target.closest(".choose"); if (!b) return; const p = state.products.find((x) => x.id === Number(b.dataset.id)); if (p) chooseHat(p); });
    $("#carDots").addEventListener("click", (e) => { const d = e.target.closest(".dot"); if (d) go(Number(d.dataset.dot)); });
  }

  function go(i) {
    const n = state.products.length; if (!n) return;
    state.index = Math.max(0, Math.min(n - 1, i));
    $("#carTrack").style.transform = `translateX(${-state.index * 100}%)`;
    $$("#carDots .dot").forEach((d, k) => d.classList.toggle("active", k === state.index));
  }

  function initCarousel() {
    const vp = $("#carViewport"), track = $("#carTrack");
    $("#carPrev").addEventListener("click", () => go(state.index - 1));
    $("#carNext").addEventListener("click", () => go(state.index + 1));
    let startX = 0, dragging = false, delta = 0;
    vp.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; dragging = true; startX = e.clientX; delta = 0; track.style.transition = "none"; });
    window.addEventListener("pointermove", (e) => { if (!dragging) return; delta = e.clientX - startX; track.style.transform = `translateX(calc(${-state.index * 100}% + ${delta}px))`; });
    const up = () => { if (!dragging) return; dragging = false; track.style.transition = ""; const w = vp.clientWidth || 1; if (Math.abs(delta) > w * 0.16) go(state.index + (delta < 0 ? 1 : -1)); else go(state.index); delta = 0; };
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    window.addEventListener("resize", () => go(state.index));
    vp.setAttribute("tabindex", "0");
    vp.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") go(state.index + 1); if (e.key === "ArrowRight") go(state.index - 1); });
  }

  // ---------- choose ----------
  function chooseHat(p, silent) {
    state.current = p;
    $("#pkImg").src = (p.images && p.images[0]) || placeholder;
    $("#pkName").textContent = p.name;
    $("#pkNow").textContent = fmt(p.price);
    $("#pkOld").textContent = p.oldPrice ? `${fmt(p.oldPrice)} ${cur()}` : "";
    // اللون
    if (p.colors && p.colors.length) {
      state.colorSel.setOptions(p.colors.map((c) => ({ value: c, label: c })));
      state.colorSel.setValue(p.colors[0]);
      $("#colorFld").style.display = "";
    } else { $("#colorFld").style.display = "none"; if (state.colorSel) state.colorSel.setOptions([]); }

    $$(".choose").forEach((b) => {
      const on = Number(b.dataset.id) === p.id;
      b.classList.toggle("is-picked", on);
      b.querySelector("span").textContent = on ? "تم الاختيار" : "اختر";
      b.querySelector("use").setAttribute("href", on ? "#i-check" : "#i-chev-l");
    });

    updateTotals();
    if (!state.pixel.viewed.has(p.id)) {
      track("ViewContent", { content_name: p.name, content_ids: [String(p.id)], content_type: "product", value: p.price, currency: "DZD" });
      state.pixel.viewed.add(p.id);
    }
    if (!silent) {
      const pk = $("#picked"); pk.classList.remove("flash"); void pk.offsetWidth; pk.classList.add("flash");
      if (window.matchMedia("(max-width: 920px)").matches) $("#picked").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // ---------- custom glass select ----------
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
      mount.classList.toggle("has-val", !!value);
      mount.classList.remove("invalid");
      hidden.value = value;
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
      render(search ? search.value : "");
    }
    function setOptions(op) { options = op || []; value = ""; hidden.value = ""; valEl.textContent = opts.placeholder || "اختر"; mount.classList.remove("has-val"); render(""); }
    setOptions(opts.options || []);
    return { setOptions, setValue, getValue: () => value, markInvalid: (b) => mount.classList.toggle("invalid", !!b) };
  }

  function buildSelects() {
    state.wilayaSel = makeSelect("#wilayaCs", "#fWilaya", { placeholder: "اختر الولاية", searchable: true, icon: "i-pin" });
    state.colorSel = makeSelect("#colorCs", "#fColor", { placeholder: "اختر اللون" });
    $("#fWilaya").addEventListener("change", () => { updateDeliv(); updateTotals(); });
    $("#fColor").addEventListener("change", updateTotals);
  }

  function populateWilayas() {
    state.wilayaSel.setOptions(state.wilayas.map((w) => ({ value: w.code, label: `${w.code} - ${w.name}` })));
  }
  const selWilaya = () => state.wilayas.find((w) => w.code === Number($("#fWilaya").value)) || null;
  const delivType = () => (document.querySelector('input[name="deliveryType"]:checked') || {}).value || "home";

  function updateDeliv() {
    const w = selWilaya();
    $("#pHome").textContent = w ? `${fmt(w.home)} ${cur()}` : "—";
    $("#pDesk").textContent = w ? `${fmt(w.desk)} ${cur()}` : "—";
  }
  const qty = () => Math.max(1, Math.min(99, parseInt($("#fQty").value, 10) || 1));

  function updateTotals() {
    const p = state.current; if (!p) return;
    const q = qty(), sub = p.price * q, w = selWilaya();
    let fee = w ? (delivType() === "desk" ? w.desk : w.home) : null;
    const thr = Number(state.settings.freeShippingThreshold) || 0;
    let free = false;
    if (w && thr > 0 && sub >= thr) { fee = 0; free = true; }
    const total = sub + (fee || 0);
    $("#tSub").textContent = fmt(sub);
    const saved = p.oldPrice && p.oldPrice > p.price ? (p.oldPrice - p.price) * q : 0;
    if (saved > 0) { $("#tSave").textContent = `${fmt(saved)} ${cur()}`; $("#tSaveRow").hidden = false; } else $("#tSaveRow").hidden = true;
    $("#tDeliv").textContent = fee === null ? "اختر الولاية" : free ? "مجاني" : `${fmt(fee)} ${cur()}`;
    $("#tTotal").textContent = fmt(total);
  }

  // ---------- form ----------
  function bindForm() {
    $("#qMinus").addEventListener("click", () => { $("#fQty").value = Math.max(1, qty() - 1); updateTotals(); });
    $("#qPlus").addEventListener("click", () => { $("#fQty").value = Math.min(99, qty() + 1); updateTotals(); });
    $("#fQty").addEventListener("input", updateTotals);
    $$('input[name="deliveryType"]').forEach((r) => r.addEventListener("change", () => { toggleAddr(); updateTotals(); }));
    toggleAddr();
    ["#fName", "#fPhone"].forEach((id) => $(id).addEventListener("focus", () => {
      if (!state.pixel.checkout && state.current) {
        track("InitiateCheckout", { content_ids: [String(state.current.id)], content_name: state.current.name, content_type: "product", num_items: qty(), value: state.current.price * qty(), currency: "DZD" });
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
    if (!state.current) { formErr("اختر موديل القبعة أولًا"); return; }
    if (!validate()) { document.querySelector(".invalid")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const btn = $("#submitBtn"), label = btn.querySelector("span").textContent;
    btn.disabled = true; btn.querySelector("span").textContent = "جاري الإرسال...";
    const payload = {
      productId: state.current.id, fullName: $("#fName").value.trim(), phone: $("#fPhone").value.trim(),
      wilaya: $("#fWilaya").value, address: $("#fAddress").value.trim(), deliveryType: delivType(),
      color: state.current.colors && state.current.colors.length ? $("#fColor").value : "", quantity: qty(),
    };
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذّر إرسال الطلب");
      track("Purchase", { content_ids: [String(state.current.id)], content_name: state.current.name, content_type: "product", num_items: payload.quantity, value: data.total, currency: "DZD" }, { eventID: "order_" + data.orderId });
      $("#okRef").textContent = data.ref; openModal();
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
