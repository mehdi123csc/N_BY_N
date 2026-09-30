(() => {
  "use strict";

  const cfg = window.NBYN_CONFIG || {};
  const supabaseLib = window.supabase;

  let sb = null;
  if (supabaseLib && typeof cfg.SUPABASE_URL === "string" && cfg.SUPABASE_URL.startsWith("https://") && cfg.SUPABASE_KEY) {
    sb = supabaseLib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  }

  const $ = (selector) => document.querySelector(selector);
  const money = (value) => Number(value || 0).toLocaleString("fr-FR") + " DA";

  let products = [];
  let cart = [];
  try {
    cart = JSON.parse(localStorage.getItem("nbyn_cart") || "[]");
    if (!Array.isArray(cart)) cart = [];
  } catch (_) {
    cart = [];
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    }[c]));
  }

  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => el.classList.remove("show"), 2200);
  }

  function saveCart() {
    localStorage.setItem("nbyn_cart", JSON.stringify(cart));
    updateCart();
  }

  async function loadProducts(category = "all") {
    const box = $("#products");
    if (box) box.innerHTML = '<div class="loading">جاري تحميل المنتجات...</div>';

    if (!sb) {
      products = [
        { id:"demo-1", name:"Classic Blazer", category:"men", price:8500, stock:18, image_url:"" },
        { id:"demo-2", name:"Urban Shirt", category:"men", price:4200, stock:30, image_url:"" },
        { id:"demo-3", name:"Elegant Dress", category:"women", price:9800, stock:12, image_url:"" },
        { id:"demo-4", name:"Luxury Set", category:"women", price:11500, stock:9, image_url:"" }
      ].filter(p => category === "all" || p.category === category);
      renderProducts();
      return;
    }

    let query = sb.from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending:false });

    if (category !== "all") query = query.eq("category", category);

    const result = await query;
    if (result.error) {
      console.error(result.error);
      products = [];
      if (box) box.innerHTML = '<div class="loading">تعذر تحميل المنتجات. تحقق من اتصال Supabase.</div>';
      return;
    }

    products = result.data || [];
    renderProducts();
  }

  function renderProducts() {
    const box = $("#products");
    if (!box) return;

    if (!products.length) {
      box.innerHTML = '<div class="loading">لا توجد منتجات حالياً.</div>';
      return;
    }

    box.innerHTML = products.map((p) => {
      const categoryName = p.category === "women" ? "نساء" : "رجال";
      const visual = p.image_url
        ? `<img class="productImage" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="picFallback">${p.category === "women" ? "N♀" : "N♂"}</div>`
        : `<div class="picFallback">${p.category === "women" ? "N♀" : "N♂"}</div>`;

      return `
        <article class="card">
          <div class="pic">${visual}</div>
          <div class="body">
            <small>${categoryName}</small>
            <h3>${escapeHtml(p.name)}</h3>
            ${p.description ? `<p class="productDesc">${escapeHtml(p.description)}</p>` : ""}
            <b>${money(p.price)}</b>
            <button type="button" onclick="window.NBYN.addToCart('${String(p.id)}')">أضف إلى السلة</button>
          </div>
        </article>`;
    }).join("");
  }

  function addToCart(id) {
    const product = products.find(p => String(p.id) === String(id));
    if (!product) return;

    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      image_url: product.image_url || ""
    });

    saveCart();
    toast("تمت إضافة المنتج إلى السلة");
  }

  function removeCart(index) {
    cart.splice(index, 1);
    saveCart();
  }

  function updateCart() {
    const count = $("#cartCount");
    const items = $("#cartItems");
    const total = $("#cartTotal");

    if (count) count.textContent = String(cart.length);

    if (items) {
      items.innerHTML = cart.length
        ? cart.map((p, i) => `
          <div class="cartRow">
            <span>${escapeHtml(p.name)}</span>
            <b>${money(p.price)}</b>
            <button type="button" onclick="window.NBYN.removeCart(${i})" aria-label="حذف">×</button>
          </div>`).join("")
        : "<p>السلة فارغة</p>";
    }

    if (total) {
      total.textContent = money(cart.reduce((sum, p) => sum + Number(p.price || 0), 0));
    }
  }

  async function checkout() {
    if (!cart.length) return toast("السلة فارغة");
    if (!sb) return toast("Supabase غير متصل");

    const userResult = await sb.auth.getUser();
    const user = userResult.data?.user;
    if (!user) {
      openAccount();
      return;
    }

    const total = cart.reduce((sum, p) => sum + Number(p.price || 0), 0);

    const orderResult = await sb.from("orders").insert({
      user_id: user.id,
      customer_name: user.email || "Customer",
      total,
      status: "new"
    }).select().single();

    if (orderResult.error) {
      console.error(orderResult.error);
      return toast("تعذر إنشاء الطلب");
    }

    const items = cart.map(p => ({
      order_id: orderResult.data.id,
      product_id: p.id,
      product_name: p.name,
      quantity: 1,
      unit_price: Number(p.price || 0)
    }));

    const itemsResult = await sb.from("order_items").insert(items);
    if (itemsResult.error) {
      console.error(itemsResult.error);
      return toast("تم إنشاء الطلب لكن تعذر حفظ تفاصيل المنتجات");
    }

    cart = [];
    saveCart();
    closeCart();
    toast("تم إرسال الطلب بنجاح");
  }

  async function submitMessage(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    if (!sb) return toast("Supabase غير متصل");

    const result = await sb.from("messages").insert({
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      message: String(data.get("message") || "").trim()
    });

    if (result.error) {
      console.error(result.error);
      toast("تعذر إرسال الرسالة");
      return;
    }

    form.reset();
    toast("تم إرسال رسالتك بنجاح");
  }

  function openCart() {
    const el = $("#cart");
    if (!el) return;
    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
  }

  function closeCart() {
    const el = $("#cart");
    if (!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
  }

  function openAccount() {
    const el = $("#account");
    if (!el) return;
    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    const el = $("#" + id);
    if (!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
  }

  async function signIn() {
    if (!sb) return $("#authMsg").textContent = "Supabase غير متصل.";

    const email = $("#authEmail")?.value.trim();
    const password = $("#authPass")?.value;

    if (!email || !password) {
      $("#authMsg").textContent = "أدخل البريد الإلكتروني وكلمة المرور.";
      return;
    }

    const result = await sb.auth.signInWithPassword({ email, password });
    $("#authMsg").textContent = result.error ? result.error.message : "تم تسجيل الدخول بنجاح.";
  }

  async function signUp() {
    if (!sb) return $("#authMsg").textContent = "Supabase غير متصل.";

    const email = $("#authEmail")?.value.trim();
    const password = $("#authPass")?.value;

    if (!email || !password) {
      $("#authMsg").textContent = "أدخل البريد الإلكتروني وكلمة المرور.";
      return;
    }

    if (password.length < 6) {
      $("#authMsg").textContent = "كلمة المرور يجب أن تكون 6 أحرف على الأقل.";
      return;
    }

    const result = await sb.auth.signUp({ email, password });
    $("#authMsg").textContent = result.error
      ? result.error.message
      : "تم إنشاء الحساب. تحقق من بريدك إذا كان التحقق مفعلاً.";
  }

  async function signOut() {
    if (sb) await sb.auth.signOut();
    $("#authMsg").textContent = "تم تسجيل الخروج.";
    updateAuthButtons(null);
  }

  function updateAuthButtons(session) {
    $("#signIn")?.classList.toggle("hidden", !!session);
    $("#signUp")?.classList.toggle("hidden", !!session);
    $("#signOut")?.classList.toggle("hidden", !session);
  }

  function setup() {
    $("#cartBtn")?.addEventListener("click", openCart);
    $("#closeCart")?.addEventListener("click", closeCart);
    $("#checkout")?.addEventListener("click", checkout);
    $("#accountBtn")?.addEventListener("click", openAccount);
    $("#signIn")?.addEventListener("click", signIn);
    $("#signUp")?.addEventListener("click", signUp);
    $("#signOut")?.addEventListener("click", signOut);

    document.querySelectorAll("[data-close]").forEach(btn => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });

    document.querySelectorAll(".filters button").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filters button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        loadProducts(btn.dataset.cat || "all");
      });
    });

    $("#contactForm")?.addEventListener("submit", submitMessage);

    if (sb) {
      sb.auth.getSession().then(({ data }) => updateAuthButtons(data?.session || null));
      sb.auth.onAuthStateChange((_event, session) => updateAuthButtons(session));
    }

    updateCart();
    loadProducts();
  }

  window.NBYN = {
    addToCart,
    removeCart,
    openCart,
    closeCart,
    openAccount,
    checkout
  };

  setup();
})();