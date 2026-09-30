(() => {
  "use strict";

  const cfg = window.NBYN_CONFIG || {};
  const supabaseLib = window.supabase;
  const sb = (supabaseLib && typeof cfg.SUPABASE_URL === "string" && cfg.SUPABASE_URL.startsWith("https://") && cfg.SUPABASE_KEY)
    ? supabaseLib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY)
    : null;

  const $ = (selector) => document.querySelector(selector);
  const money = (n) => Number(n || 0).toLocaleString("fr-FR") + " DA";

  function message(text) {
    const el = $("#loginMsg");
    if (el) el.textContent = text || "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    }[c]));
  }

  async function login() {
    if (!sb) return message("تعذر الاتصال بـ Supabase. تحقق من config.js.");

    const email = $("#email")?.value.trim();
    const password = $("#password")?.value;

    if (!email || !password) return message("أدخل البريد الإلكتروني وكلمة المرور.");

    const result = await sb.auth.signInWithPassword({ email, password });
    if (result.error) return message(result.error.message);

    await boot();
  }

  async function boot() {
    if (!sb) return;

    const sessionResult = await sb.auth.getSession();
    const user = sessionResult.data?.session?.user;

    if (!user) {
      $("#login")?.classList.remove("hidden");
      $("#app")?.classList.add("hidden");
      return;
    }

    const profileResult = await sb.from("profiles").select("role").eq("id", user.id).single();

    if (profileResult.error || profileResult.data?.role !== "admin") {
      await sb.auth.signOut();
      message("هذا الحساب ليس مديراً.");
      return;
    }

    $("#login")?.classList.add("hidden");
    $("#app")?.classList.remove("hidden");
    show("dashboard");
  }

  async function show(page) {
    const titles = {
      dashboard:"لوحة التحكم",
      products:"المنتجات",
      orders:"الطلبات",
      customers:"العملاء",
      messages:"الرسائل",
      inventory:"المخزون",
      coupons:"الكوبونات",
      settings:"الإعدادات"
    };

    $("#title").textContent = titles[page] || "لوحة التحكم";

    const pages = {
      dashboard,
      products: productsPage,
      orders: ordersPage,
      customers: customersPage,
      messages: messagesPage,
      inventory: inventoryPage,
      coupons: couponsPage,
      settings: settingsPage
    };

    if (pages[page]) await pages[page]();
  }

  async function getProducts() {
    const result = await sb.from("products").select("*").order("created_at", { ascending:false });
    if (result.error) {
      showError(result.error.message);
      return [];
    }
    return result.data || [];
  }

  function showError(text) {
    $("#page").innerHTML = `<div class="panel error">${escapeHtml(text)}</div>`;
  }

  async function dashboard() {
    const [p, o] = await Promise.all([
      sb.from("products").select("id,stock"),
      sb.from("orders").select("id,total,status")
    ]);

    if (p.error || o.error) {
      return showError((p.error || o.error).message);
    }

    const products = p.data || [];
    const orders = o.data || [];
    const sales = orders.reduce((sum, x) => sum + Number(x.total || 0), 0);
    const stock = products.reduce((sum, x) => sum + Number(x.stock || 0), 0);

    $("#page").innerHTML = `
      <div class="stats">
        <div class="stat"><small>المنتجات</small><strong>${products.length}</strong></div>
        <div class="stat"><small>الطلبات</small><strong>${orders.length}</strong></div>
        <div class="stat"><small>المبيعات</small><strong>${money(sales)}</strong></div>
        <div class="stat"><small>المخزون</small><strong>${stock}</strong></div>
      </div>
      <div class="panel">
        <h3>حالة النظام</h3>
        <p>تم الاتصال بقاعدة بيانات N by N. صلاحية المدير فعالة.</p>
      </div>`;
  }

  async function productsPage() {
    const list = await getProducts();

    $("#page").innerHTML = `
      <div class="panel">
        <div class="panelHead">
          <h3>إدارة المنتجات</h3>
          <button class="primary" id="addProductBtn" type="button">+ منتج</button>
        </div>
        <div class="tableWrap">
          <table>
            <tr><th>الصورة</th><th>الاسم</th><th>الفئة</th><th>السعر</th><th>المخزون</th><th>الحالة</th><th></th></tr>
            ${list.map(x => `
              <tr>
                <td>${x.image_url ? `<img class="tableImg" src="${escapeHtml(x.image_url)}" alt="">` : "—"}</td>
                <td>${escapeHtml(x.name)}</td>
                <td>${x.category === "women" ? "نساء" : "رجال"}</td>
                <td>${money(x.price)}</td>
                <td>${Number(x.stock || 0)}</td>
                <td>${x.active ? "فعال" : "مخفي"}</td>
                <td><button class="danger" type="button" data-delete="${escapeHtml(x.id)}">حذف</button></td>
              </tr>`).join("")}
          </table>
        </div>
      </div>`;

    $("#addProductBtn")?.addEventListener("click", productModal);
    document.querySelectorAll("[data-delete]").forEach(btn => {
      btn.addEventListener("click", () => del(btn.dataset.delete));
    });
  }

  function productModal() {
    openModal("إضافة منتج", `
      <div class="form">
        <input id="pn" placeholder="اسم المنتج">
        <select id="pc">
          <option value="men">رجال</option>
          <option value="women">نساء</option>
        </select>
        <input id="pp" type="number" min="0" step="0.01" placeholder="السعر">
        <input id="ps" type="number" min="0" step="1" placeholder="المخزون">
        <input id="pi" type="url" placeholder="رابط صورة المنتج (اختياري)">
        <textarea id="pd" placeholder="الوصف"></textarea>
        <button class="primary" id="saveProduct" type="button">حفظ</button>
      </div>`);

    $("#saveProduct")?.addEventListener("click", addProduct);
  }

  async function addProduct() {
    const name = $("#pn")?.value.trim();
    const category = $("#pc")?.value;
    const price = Number($("#pp")?.value || 0);
    const stock = Number($("#ps")?.value || 0);
    const image_url = $("#pi")?.value.trim() || "";
    const description = $("#pd")?.value.trim() || "";

    if (!name || price < 0 || stock < 0) {
      alert("أدخل بيانات المنتج بشكل صحيح.");
      return;
    }

    const result = await sb.from("products").insert({
      name, category, price, stock, image_url, description, active:true
    });

    if (result.error) return alert(result.error.message);

    closeModal();
    await productsPage();
  }

  async function del(id) {
    if (!confirm("هل تريد حذف المنتج؟")) return;

    const result = await sb.from("products").delete().eq("id", id);
    if (result.error) alert(result.error.message);
    else await productsPage();
  }

  async function ordersPage() {
    const result = await sb.from("orders").select("*").order("created_at", { ascending:false });
    if (result.error) return showError(result.error.message);

    $("#page").innerHTML = `
      <div class="panel">
        <h3>الطلبات</h3>
        <div class="tableWrap">
          <table>
            <tr><th>العميل</th><th>الهاتف</th><th>المجموع</th><th>الحالة</th><th>التاريخ</th></tr>
            ${(result.data || []).map(o => `
              <tr>
                <td>${escapeHtml(o.customer_name)}</td>
                <td>${escapeHtml(o.phone || "—")}</td>
                <td>${money(o.total)}</td>
                <td>
                  <select data-status="${escapeHtml(o.id)}">
                    ${["new","confirmed","preparing","shipped","delivered","cancelled"].map(s =>
                      `<option value="${s}" ${o.status === s ? "selected" : ""}>${s}</option>`
                    ).join("")}
                  </select>
                </td>
                <td>${o.created_at ? new Date(o.created_at).toLocaleString("ar-DZ") : "—"}</td>
              </tr>`).join("")}
          </table>
        </div>
      </div>`;

    document.querySelectorAll("[data-status]").forEach(select => {
      select.addEventListener("change", () => updateStatus(select.dataset.status, select.value));
    });
  }

  async function updateStatus(id, status) {
    const result = await sb.from("orders").update({ status }).eq("id", id);
    if (result.error) alert(result.error.message);
  }

  async function customersPage() {
    const result = await sb.from("profiles").select("*").order("created_at", { ascending:false });
    if (result.error) return showError(result.error.message);

    $("#page").innerHTML = `
      <div class="panel">
        <h3>العملاء</h3>
        <div class="tableWrap">
          <table>
            <tr><th>الاسم</th><th>الهاتف</th><th>الصلاحية</th><th>التاريخ</th></tr>
            ${(result.data || []).map(x => `
              <tr>
                <td>${escapeHtml(x.full_name || "—")}</td>
                <td>${escapeHtml(x.phone || "—")}</td>
                <td>${escapeHtml(x.role || "customer")}</td>
                <td>${x.created_at ? new Date(x.created_at).toLocaleDateString("ar-DZ") : "—"}</td>
              </tr>`).join("")}
          </table>
        </div>
      </div>`;
  }

  async function messagesPage() {
    const result = await sb.from("messages").select("*").order("created_at", { ascending:false });
    if (result.error) return showError(result.error.message);

    $("#page").innerHTML = `
      <div class="panel">
        <h3>رسائل خدمة العملاء</h3>
        <div class="tableWrap">
          <table>
            <tr><th>الاسم</th><th>البريد</th><th>الرسالة</th><th>الحالة</th></tr>
            ${(result.data || []).map(x => `
              <tr>
                <td>${escapeHtml(x.name)}</td>
                <td>${escapeHtml(x.email)}</td>
                <td class="messageCell">${escapeHtml(x.message)}</td>
                <td>${escapeHtml(x.status)}</td>
              </tr>`).join("")}
          </table>
        </div>
      </div>`;
  }

  async function inventoryPage() {
    const list = await getProducts();

    $("#page").innerHTML = `
      <div class="panel">
        <h3>المخزون</h3>
        <div class="tableWrap">
          <table>
            <tr><th>المنتج</th><th>المخزون</th><th>الحالة</th></tr>
            ${list.map(x => `
              <tr>
                <td>${escapeHtml(x.name)}</td>
                <td>${Number(x.stock || 0)}</td>
                <td><span class="stock ${Number(x.stock || 0) < 10 ? "low" : "ok"}">${Number(x.stock || 0) < 10 ? "منخفض" : "متوفر"}</span></td>
              </tr>`).join("")}
          </table>
        </div>
      </div>`;
  }

  async function couponsPage() {
    const result = await sb.from("coupons").select("*").order("created_at", { ascending:false });
    if (result.error) return showError(result.error.message);

    $("#page").innerHTML = `
      <div class="panel">
        <div class="panelHead">
          <h3>الكوبونات</h3>
          <button class="primary" id="addCouponBtn" type="button">+ كوبون</button>
        </div>
        <div class="tableWrap">
          <table>
            <tr><th>الكود</th><th>الخصم</th><th>فعال</th><th>انتهاء</th></tr>
            ${(result.data || []).map(x => `
              <tr>
                <td>${escapeHtml(x.code)}</td>
                <td>${Number(x.discount_percent || 0)}%</td>
                <td>${x.active ? "نعم" : "لا"}</td>
                <td>${escapeHtml(x.expires_at || "—")}</td>
              </tr>`).join("")}
          </table>
        </div>
      </div>`;

    $("#addCouponBtn")?.addEventListener("click", couponModal);
  }

  function couponModal() {
    openModal("كوبون جديد", `
      <div class="form">
        <input id="cc" placeholder="CODE">
        <input id="cd" type="number" min="0" max="100" step="0.01" placeholder="نسبة الخصم">
        <input id="ce" type="datetime-local">
        <button class="primary" id="saveCoupon" type="button">حفظ</button>
      </div>`);

    $("#saveCoupon")?.addEventListener("click", addCoupon);
  }

  async function addCoupon() {
    const code = $("#cc")?.value.trim().toUpperCase();
    const discount_percent = Number($("#cd")?.value || 0);
    const expires_at = $("#ce")?.value || null;

    if (!code || discount_percent < 0 || discount_percent > 100) {
      alert("أدخل بيانات الكوبون بشكل صحيح.");
      return;
    }

    const result = await sb.from("coupons").insert({ code, discount_percent, expires_at });
    if (result.error) return alert(result.error.message);

    closeModal();
    await couponsPage();
  }

  function settingsPage() {
    $("#page").innerHTML = `
      <div class="panel">
        <h3>الإعدادات</h3>
        <div class="notice">
          <strong>N by N</strong><br>
          الواجهة متصلة بـ Supabase باستخدام Publishable key.
          لا تضع Secret / Service Role key داخل ملفات الموقع.
        </div>
      </div>`;
  }

  function openModal(title, body) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = body;
    $("#modal").classList.remove("hidden");
    $("#modal").setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    $("#modal").classList.add("hidden");
    $("#modal").setAttribute("aria-hidden", "true");
  }

  $("#loginBtn")?.addEventListener("click", login);
  $("#password")?.addEventListener("keydown", e => { if (e.key === "Enter") login(); });
  $("#logout")?.addEventListener("click", async () => {
    if (sb) await sb.auth.signOut();
    location.reload();
  });

  document.querySelectorAll(".nav").forEach(button => {
    button.addEventListener("click", async () => {
      document.querySelectorAll(".nav").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      await show(button.dataset.page);
    });
  });

  $("#modalClose")?.addEventListener("click", closeModal);

  if (sb) {
    sb.auth.getSession().then(({ data }) => {
      if (data?.session) boot();
    });
  } else {
    message("تعذر قراءة إعدادات Supabase من config.js.");
  }

  window.NBYN_ADMIN = { show, productsPage, ordersPage };
})();