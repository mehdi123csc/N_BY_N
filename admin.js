(() => {
'use strict';

const cfg = window.NBYN_CONFIG || {};
const lib = window.supabase;

const sb = (lib && cfg.SUPABASE_URL && cfg.SUPABASE_KEY)
  ? lib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY)
  : null;

const $ = s => document.querySelector(s);
const money = n => Number(n || 0).toLocaleString('fr-FR') + ' DA';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#039;'
}[c]));

function msg(t) {
  if ($('#loginMsg')) $('#loginMsg').textContent = t || '';
}

function hideApp() {
  $('#login')?.classList.remove('hidden');
  $('#app')?.classList.add('hidden');
}

function showApp() {
  $('#login')?.classList.add('hidden');
  $('#app')?.classList.remove('hidden');
}

function mfaBox(title, body) {
  $('#login').innerHTML = `
    <div class="loginBox">
      <img src="./logo.jpg" alt="N by N">
      <span class="eyebrow">N BY N SECURITY</span>
      <h1>${esc(title)}</h1>
      ${body}
    </div>
  `;
}

/* =========================
   MFA
========================= */

async function getAAL() {
  const r = await sb.auth.mfa.getAuthenticatorAssuranceLevel();

  if (r.error) throw r.error;

  return r.data;
}

async function getVerifiedTotpFactor() {
  const r = await sb.auth.mfa.listFactors();

  if (r.error) throw r.error;

  const factors = r.data?.totp || [];

  return factors.find(f => f.status === 'verified') || null;
}

async function enrollMFA() {
  try {
    mfaBox(
      'تفعيل الحماية الإضافية',
      `
      <p>
        لحماية لوحة الإدارة، يجب تفعيل المصادقة الثنائية
        باستخدام تطبيق Authenticator.
      </p>

      <p>
        افتح Google Authenticator أو Microsoft Authenticator
        أو تطبيقًا مشابهًا، ثم امسح رمز QR أدناه.
      </p>

      <div id="mfaSetupArea" class="form">
        <p id="mfaSetupMsg" class="message">جاري إنشاء رمز MFA...</p>
      </div>
      `
    );

    const r = await sb.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'N by N Admin'
    });

    if (r.error) throw r.error;

    const factor = r.data;

    if (!factor?.id || !factor?.totp?.qr_code) {
      throw new Error('تعذر إنشاء رمز MFA.');
    }

    $('#mfaSetupArea').innerHTML = `
      <div style="text-align:center">

        <p>
          امسح رمز QR باستخدام تطبيق Authenticator.
        </p>

        <img
          src="${esc(factor.totp.qr_code)}"
          alt="MFA QR Code"
          style="
            width:220px;
            max-width:100%;
            background:#fff;
            padding:12px;
            border-radius:12px;
            display:block;
            margin:15px auto;
          "
        >

        <p>
          بعد إضافة الحساب في تطبيق Authenticator،
          أدخل رمز التحقق المكوّن من 6 أرقام:
        </p>

        <input
          id="mfaCode"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          pattern="[0-9]{6}"
          placeholder="000000"
          style="text-align:center;letter-spacing:8px;font-size:22px"
        >

        <button
          id="mfaVerifyBtn"
          class="primary"
          type="button"
        >
          تأكيد وتفعيل MFA
        </button>

        <p id="mfaSetupMsg" class="message"></p>

      </div>
    `;

    $('#mfaVerifyBtn').onclick = async () => {
      const code = $('#mfaCode').value.trim();
      const status = $('#mfaSetupMsg');

      if (!/^\d{6}$/.test(code)) {
        status.textContent = 'أدخل رمزًا مكوّنًا من 6 أرقام.';
        return;
      }

      $('#mfaVerifyBtn').disabled = true;
      status.textContent = 'جاري التحقق...';

      try {
        const challenge = await sb.auth.mfa.challenge({
          factorId: factor.id
        });

        if (challenge.error) throw challenge.error;

        const verify = await sb.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challenge.data.id,
          code
        });

        if (verify.error) throw verify.error;

        const aal = await getAAL();

        if (aal.currentLevel !== 'aal2') {
          throw new Error('لم يتم رفع مستوى الحماية إلى AAL2.');
        }

        await boot();

      } catch (e) {
        console.error(e);
        status.textContent = e.message || 'رمز MFA غير صحيح.';
        $('#mfaVerifyBtn').disabled = false;
      }
    };

  } catch (e) {
    console.error(e);

    mfaBox(
      'تعذر إعداد MFA',
      `
      <p id="loginMsg" class="message">
        ${esc(e.message || 'حدث خطأ أثناء إعداد المصادقة الثنائية.')}
      </p>

      <button
        id="mfaBackBtn"
        class="primary"
        type="button"
      >
        العودة
      </button>
      `
    );

    $('#mfaBackBtn').onclick = async () => {
      await sb.auth.signOut();
      location.reload();
    };
  }
}

async function verifyMFA(factor) {
  mfaBox(
    'رمز التحقق',
    `
    <p>
      أدخل رمز التحقق المكوّن من 6 أرقام
      من تطبيق Authenticator.
    </p>

    <div class="form">

      <input
        id="mfaCode"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        pattern="[0-9]{6}"
        placeholder="000000"
        style="text-align:center;letter-spacing:8px;font-size:22px"
      >

      <button
        id="mfaVerifyBtn"
        class="primary"
        type="button"
      >
        تحقق ودخول
      </button>

      <p id="mfaMsg" class="message"></p>

      <button
        id="mfaLogoutBtn"
        type="button"
      >
        إلغاء وتسجيل الخروج
      </button>

    </div>
    `
  );

  const verifyButton = $('#mfaVerifyBtn');
  const codeInput = $('#mfaCode');
  const status = $('#mfaMsg');

  const doVerify = async () => {
    const code = codeInput.value.trim();

    if (!/^\d{6}$/.test(code)) {
      status.textContent = 'أدخل رمزًا مكوّنًا من 6 أرقام.';
      return;
    }

    verifyButton.disabled = true;
    status.textContent = 'جاري التحقق...';

    try {
      const challenge = await sb.auth.mfa.challenge({
        factorId: factor.id
      });

      if (challenge.error) throw challenge.error;

      const verify = await sb.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code
      });

      if (verify.error) throw verify.error;

      const aal = await getAAL();

      if (aal.currentLevel !== 'aal2') {
        throw new Error('تعذر تأكيد مستوى MFA.');
      }

      await boot();

    } catch (e) {
      console.error(e);
      status.textContent = e.message || 'رمز MFA غير صحيح.';
      verifyButton.disabled = false;
      codeInput.select();
    }
  };

  verifyButton.onclick = doVerify;

  codeInput.onkeydown = e => {
    if (e.key === 'Enter') doVerify();
  };

  $('#mfaLogoutBtn').onclick = async () => {
    await sb.auth.signOut();
    location.reload();
  };

  setTimeout(() => codeInput.focus(), 100);
}

async function requireMFA() {
  const aal = await getAAL();

  if (aal.currentLevel === 'aal2') {
    return true;
  }

  const factor = await getVerifiedTotpFactor();

  if (!factor) {
    await enrollMFA();
    return false;
  }

  await verifyMFA(factor);
  return false;
}

/* =========================
   LOGIN
========================= */

async function login() {
  if (!sb) {
    msg('تعذر الاتصال بـ Supabase.');
    return;
  }

  const email = $('#email')?.value.trim();
  const password = $('#password')?.value;

  if (!email || !password) {
    msg('أدخل البريد وكلمة المرور.');
    return;
  }

  const r = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (r.error) {
    msg(r.error.message);
    return;
  }

  try {
    const { data } = await sb.auth.getSession();

    if (!data?.session?.user) {
      msg('تعذر إنشاء جلسة تسجيل الدخول.');
      return;
    }

    const u = data.session.user;

    const p = await sb
      .from('profiles')
      .select('role,full_name')
      .eq('id', u.id)
      .single();

    if (p.error || p.data?.role !== 'admin') {
      await sb.auth.signOut();
      msg('هذا الحساب ليس مديراً.');
      return;
    }

    await requireMFA();

  } catch (e) {
    console.error(e);
    msg(e.message || 'حدث خطأ أثناء تسجيل الدخول.');
  }
}

/* =========================
   BOOT
========================= */

async function boot() {
  if (!sb) return;

  const { data } = await sb.auth.getSession();
  const u = data?.session?.user;

  if (!u) {
    hideApp();
    return;
  }

  try {
    const aal = await getAAL();

    if (aal.currentLevel !== 'aal2') {
      const factor = await getVerifiedTotpFactor();

      if (!factor) {
        await enrollMFA();
      } else {
        await verifyMFA(factor);
      }

      return;
    }

    const p = await sb
      .from('profiles')
      .select('role,full_name')
      .eq('id', u.id)
      .single();

    if (p.error || p.data?.role !== 'admin') {
      await sb.auth.signOut();
      hideApp();
      msg('هذا الحساب ليس مديراً.');
      return;
    }

    showApp();

    await show('dashboard');

  } catch (e) {
    console.error(e);

    await sb.auth.signOut();

    hideApp();

    msg(
      e.message ||
      'تعذر التحقق من حماية حساب المدير.'
    );
  }
}

/* =========================
   DASHBOARD
========================= */

async function show(page) {
  const titles = {
    dashboard:'لوحة التحكم',
    products:'المنتجات',
    orders:'الطلبات',
    customers:'العملاء',
    messages:'الرسائل',
    inventory:'المخزون',
    coupons:'الكوبونات',
    settings:'الإعدادات'
  };

  $('#title').textContent =
    titles[page] || 'لوحة التحكم';

  const pages = {
    dashboard,
    products:productsPage,
    orders:ordersPage,
    customers:customersPage,
    messages:messagesPage,
    inventory:inventoryPage,
    coupons:couponsPage,
    settings:settingsPage
  };

  if (pages[page]) {
    await pages[page]();
  }
}

async function getProducts() {
  const r = await sb
    .from('products')
    .select('*')
    .order('created_at',{ascending:false});

  if (r.error) {
    showError(r.error.message);
    return [];
  }

  return r.data || [];
}

function showError(t) {
  $('#page').innerHTML =
    `<div class="panel error">${esc(t)}</div>`;
}

async function dashboard() {
  const [p,o,c,m] = await Promise.all([
    sb.from('products').select('id,stock,active'),
    sb.from('orders').select('id,total,status'),
    sb.from('profiles').select('id'),
    sb.from('messages').select('id,status').eq('status','unread')
  ]);

  if (p.error || o.error) {
    return showError((p.error || o.error).message);
  }

  const products = p.data || [];
  const orders = o.data || [];

  const sales = orders
    .filter(x => x.status !== 'cancelled')
    .reduce((s,x) => s + Number(x.total || 0),0);

  const stock = products
    .reduce((s,x) => s + Number(x.stock || 0),0);

  $('#page').innerHTML = `
    <div class="stats">
      <div class="stat">
        <small>المنتجات</small>
        <strong>${products.length}</strong>
      </div>

      <div class="stat">
        <small>الطلبات</small>
        <strong>${orders.length}</strong>
      </div>

      <div class="stat">
        <small>المبيعات</small>
        <strong>${money(sales)}</strong>
      </div>

      <div class="stat">
        <small>المخزون</small>
        <strong>${stock}</strong>
      </div>
    </div>

    <div class="panel">
      <h3>مؤشرات</h3>

      <p>
        العملاء: ${c.data?.length || 0}
        —
        الرسائل غير المقروءة: ${m.data?.length || 0}
      </p>

      <p class="notice">
        رفع صور المنتجات يتم مباشرة إلى Supabase Storage
        بعد التحقق من صلاحية المدير.
      </p>
    </div>
  `;
}

/* =========================
   PRODUCTS
========================= */

async function productsPage() {
  const list = await getProducts();

  $('#page').innerHTML = `
    <div class="panel">

      <div class="panelHead">
        <div>
          <h3>إدارة المنتجات</h3>
          <p>
            أضف المنتج مع صورة أو عدة صور،
            وعدّل السعر والمخزون والحالة.
          </p>
        </div>

        <button class="primary" id="addProductBtn">
          + إضافة منتج
        </button>
      </div>

      <div class="tableWrap">
        <table>
          <tr>
            <th>الصورة</th>
            <th>الاسم</th>
            <th>الفئة</th>
            <th>السعر</th>
            <th>الخصم</th>
            <th>المخزون</th>
            <th>الحالة</th>
            <th>إجراء</th>
          </tr>

          ${list.map(x => `
            <tr>
              <td>
                ${
                  x.image_url
                  ? `<img class="tableImg" src="${esc(x.image_url)}">`
                  : '—'
                }
              </td>

              <td>${esc(x.name)}</td>

              <td>
                ${x.category === 'women' ? 'نساء' : 'رجال'}
              </td>

              <td>${money(x.price)}</td>

              <td>${Number(x.discount_percent || 0)}%</td>

              <td>${Number(x.stock || 0)}</td>

              <td>${x.active ? 'فعال' : 'مخفي'}</td>

              <td>
                <button
                  class="primary mini"
                  data-edit="${x.id}"
                >
                  تعديل
                </button>

                <button
                  class="danger"
                  data-delete="${x.id}"
                >
                  حذف
                </button>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `;

  $('#addProductBtn').onclick = () => productModal();

  document.querySelectorAll('[data-edit]')
    .forEach(b => b.onclick = () =>
      productModal(b.dataset.edit)
    );

  document.querySelectorAll('[data-delete]')
    .forEach(b => b.onclick = () =>
      del(b.dataset.delete)
    );
}

async function productModal(id) {
  let p = {
    name:'',
    category:'men',
    price:'',
    old_price:'',
    discount_percent:0,
    stock:0,
    sizes:'',
    description:'',
    active:true,
    image_url:'',
    image_urls:[]
  };

  if (id) {
    const r = await sb
      .from('products')
      .select('*')
      .eq('id',id)
      .single();

    if (r.error) {
      return alert(r.error.message);
    }

    p = r.data;

    try {
      p.image_urls = Array.isArray(p.image_urls)
        ? p.image_urls
        : JSON.parse(p.image_urls || '[]');
    } catch (_) {
      p.image_urls = [];
    }

    if (!p.image_urls.length && p.image_url) {
      p.image_urls = [p.image_url];
    }
  }

  openModal(
    id ? 'تعديل المنتج' : 'إضافة منتج',
    `
    <div class="form">

      <label>
        اسم المنتج
        <input id="pn" value="${esc(p.name)}">
      </label>

      <label>
        الفئة
        <select id="pc">
          <option value="men"
            ${p.category === 'men' ? 'selected' : ''}>
            رجال
          </option>

          <option value="women"
            ${p.category === 'women' ? 'selected' : ''}>
            نساء
          </option>
        </select>
      </label>

      <div class="grid2">
        <label>
          السعر
          <input
            id="pp"
            type="number"
            min="0"
            step="0.01"
            value="${p.price ?? ''}"
          >
        </label>

        <label>
          السعر القديم
          <input
            id="po"
            type="number"
            min="0"
            step="0.01"
            value="${p.old_price ?? ''}"
          >
        </label>
      </div>

      <div class="grid2">
        <label>
          نسبة الخصم %
          <input
            id="pdsc"
            type="number"
            min="0"
            max="100"
            value="${p.discount_percent ?? 0}"
          >
        </label>

        <label>
          المخزون
          <input
            id="ps"
            type="number"
            min="0"
            step="1"
            value="${p.stock ?? 0}"
          >
        </label>
      </div>

      <label>
        المقاسات
        <input
          id="psz"
          value="${esc(p.sizes || '')}"
          placeholder="S, M, L, XL"
        >
      </label>

      <label>
        صور المنتج

        <input
          id="pfiles"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
        >

        <small>
          يمكن رفع حتى 5 صور،
          كل صورة 5MB كحد أقصى.
        </small>
      </label>

      <div id="existingImgs" class="existingImgs">
        ${(p.image_urls || [])
          .map(u => `<img src="${esc(u)}">`)
          .join('')}
      </div>

      <label>
        الوصف
        <textarea id="pdesc">
${esc(p.description || '')}
        </textarea>
      </label>

      <label class="check">
        <input
          id="pactive"
          type="checkbox"
          ${p.active !== false ? 'checked' : ''}
        >
        المنتج ظاهر في المتجر
      </label>

      <button
        class="primary"
        id="saveProduct"
      >
        ${id ? 'حفظ التعديلات' : 'إضافة المنتج'}
      </button>

      <p id="uploadMsg" class="message"></p>

    </div>
    `
  );

  $('#saveProduct').onclick =
    () => saveProduct(id,p);
}

async function compressImage(file) {
  return new Promise((resolve,reject) => {

    if (!file.type.startsWith('image/')) {
      return reject(new Error('الملف ليس صورة'));
    }

    if (file.size > 5 * 1024 * 1024) {
      return reject(
        new Error('حجم الصورة أكبر من 5MB')
      );
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const max = 1600;

      const scale =
        Math.min(
          1,
          max / Math.max(img.width,img.height)
        );

      const c = document.createElement('canvas');

      c.width =
        Math.max(1,Math.round(img.width * scale));

      c.height =
        Math.max(1,Math.round(img.height * scale));

      c.getContext('2d')
        .drawImage(
          img,
          0,
          0,
          c.width,
          c.height
        );

      c.toBlob(
        b => {
          URL.revokeObjectURL(url);

          b
            ? resolve(b)
            : reject(
                new Error('تعذر ضغط الصورة')
              );
        },
        'image/webp',
        .86
      );
    };

    img.onerror = () =>
      reject(new Error('تعذر قراءة الصورة'));

    img.src = url;
  });
}

async function uploadImages(files) {
  const urls = [];

  for (
    const file of Array.from(files).slice(0,5)
  ) {
    const blob = await compressImage(file);

    const name =
      `${crypto.randomUUID()}.webp`;

    const path =
      `products/${name}`;

    const r =
      await sb.storage
        .from('product-images')
        .upload(
          path,
          blob,
          {
            contentType:'image/webp',
            upsert:false
          }
        );

    if (r.error) throw r.error;

    const g =
      sb.storage
        .from('product-images')
        .getPublicUrl(path);

    urls.push(g.data.publicUrl);
  }

  return urls;
}

async function saveProduct(id,old) {
  const m = $('#uploadMsg');

  m.textContent = 'جاري الحفظ...';

  const name =
    $('#pn').value.trim();

  const category =
    $('#pc').value;

  const price =
    Number($('#pp').value);

  const old_price =
    Number($('#po').value || 0);

  const discount_percent =
    Number($('#pdsc').value || 0);

  const stock =
    Number($('#ps').value);

  const sizes =
    $('#psz').value.trim();

  const description =
    $('#pdesc').value.trim();

  const active =
    $('#pactive').checked;

  if (
    !name ||
    price < 0 ||
    stock < 0 ||
    discount_percent < 0 ||
    discount_percent > 100
  ) {
    m.textContent =
      'تحقق من بيانات المنتج.';
    return;
  }

  let imgs =
    old.image_urls || [];

  try {
    const files =
      $('#pfiles').files;

    if (files.length) {
      m.textContent =
        'جاري رفع الصور...';

      const newImgs =
        await uploadImages(files);

      imgs =
        [...imgs,...newImgs].slice(-5);
    }

  } catch (e) {
  m.textContent = e.message || 'تعذر رفع الصورة';
  return;
}

const data = {
  name,
  category,
  price,
  old_price,
  discount_percent,
  stock,
  sizes,
  description,
  active,
  image_urls: imgs,
  image_url: imgs[0] || ''
};

const r = id
  ? await sb.from('products').update(data).eq('id', id)
  : await sb.from('products').insert(data);

if (r.error) {
  m.textContent = r.error.message;
  return;
}

closeModal();
await productsPage();
}

async function del(id) {
  if (!confirm('حذف المنتج نهائيًا؟')) return;

  const r = await sb
    .from('products')
    .delete()
    .eq('id', id);

  if (r.error) {
    alert(r.error.message);
  } else {
    await productsPage();
  }
}

async function ordersPage() {
  const r = await sb
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (r.error) return showError(r.error.message);

  $('#page').innerHTML = `
    <div class="panel">
      <h3>الطلبات</h3>

      <div class="tableWrap">
        <table>
          <tr>
            <th>العميل</th>
            <th>الهاتف</th>
            <th>العنوان</th>
            <th>المجموع</th>
            <th>الحالة</th>
            <th>التاريخ</th>
          </tr>

          ${(r.data || []).map(o => `
            <tr>
              <td>${esc(o.customer_name)}</td>
              <td>${esc(o.phone || '—')}</td>
              <td class="messageCell">${esc(o.address || '—')}</td>
              <td>${money(o.total)}</td>

              <td>
                <select data-status="${o.id}">
                  ${[
                    'new',
                    'confirmed',
                    'preparing',
                    'shipped',
                    'delivered',
                    'cancelled'
                  ].map(s => `
                    <option value="${s}" ${o.status === s ? 'selected' : ''}>
                      ${s}
                    </option>
                  `).join('')}
                </select>
              </td>

              <td>
                ${o.created_at
                  ? new Date(o.created_at).toLocaleString('ar-DZ')
                  : '—'}
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `;

  document
    .querySelectorAll('[data-status]')
    .forEach(s => {
      s.onchange = () =>
        updateStatus(s.dataset.status, s.value);
    });
}

async function updateStatus(id, status) {
  const r = await sb
    .from('orders')
    .update({ status })
    .eq('id', id);

  if (r.error) {
    alert(r.error.message);
  }
}

async function customersPage() {
  const r = await sb
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (r.error) return showError(r.error.message);

  $('#page').innerHTML = `
    <div class="panel">
      <h3>العملاء</h3>

      <div class="tableWrap">
        <table>
          <tr>
            <th>الاسم</th>
            <th>البريد</th>
            <th>الهاتف / WhatsApp</th>
            <th>الدور</th>
            <th>التاريخ</th>
          </tr>

          ${(r.data || []).map(x => `
            <tr>
              <td>${esc(x.full_name || '—')}</td>
              <td>${esc(x.email || '—')}</td>
              <td>${esc(x.phone || '—')}</td>
              <td>${esc(x.role || 'customer')}</td>
              <td>
                ${x.created_at
                  ? new Date(x.created_at).toLocaleDateString('ar-DZ')
                  : '—'}
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `;
}

async function messagesPage() {
  const r = await sb
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false });

  if (r.error) return showError(r.error.message);

  $('#page').innerHTML = `
    <div class="panel">
      <h3>رسائل العملاء</h3>

      <div class="tableWrap">
        <table>
          <tr>
            <th>الاسم</th>
            <th>البريد</th>
            <th>الهاتف</th>
            <th>الرسالة</th>
            <th>الحالة</th>
          </tr>

          ${(r.data || []).map(x => `
            <tr>
              <td>${esc(x.name)}</td>
              <td>${esc(x.email)}</td>
              <td>${esc(x.phone || '—')}</td>
              <td class="messageCell">${esc(x.message)}</td>

              <td>
                <select data-msg="${x.id}">
                  <option value="unread" ${x.status === 'unread' ? 'selected' : ''}>
                    غير مقروء
                  </option>

                  <option value="read" ${x.status === 'read' ? 'selected' : ''}>
                    مقروء
                  </option>

                  <option value="closed" ${x.status === 'closed' ? 'selected' : ''}>
                    مغلق
                  </option>
                </select>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `;

  document
    .querySelectorAll('[data-msg]')
    .forEach(s => {
      s.onchange = async () => {
        const r = await sb
          .from('messages')
            .select('*')
    .order('created_at', { ascending: false });

  if (r.error) return showError(r.error.message);

  $('#page').innerHTML = `
    <div class="panel">
      <h3>رسائل العملاء</h3>

      <div class="tableWrap">
        <table>
          <tr>
            <th>الاسم</th>
            <th>البريد</th>
            <th>الهاتف</th>
            <th>الرسالة</th>
            <th>الحالة</th>
          </tr>

          ${(r.data || []).map(x => `
            <tr>
              <td>${esc(x.name)}</td>
              <td>${esc(x.email)}</td>
              <td>${esc(x.phone || '—')}</td>
              <td class="messageCell">${esc(x.message)}</td>
              <td>
                <select data-msg="${x.id}">
                  <option value="unread" ${x.status === 'unread' ? 'selected' : ''}>
                    غير مقروء
                  </option>

                  <option value="read" ${x.status === 'read' ? 'selected' : ''}>
                    مقروء
                  </option>

                  <option value="closed" ${x.status === 'closed' ? 'selected' : ''}>
                    مغلق
                  </option>
                </select>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `;

  document
    .querySelectorAll('[data-msg]')
    .forEach(s => {
      s.onchange = async () => {
        const r = await sb
          .from('messages')
          .update({ status: s.value })
          .eq('id', s.dataset.msg);

        if (r.error) {
          alert(r.error.message);
        }
      };
    });
}

async function inventoryPage() {
  const list = await getProducts();

  $('#page').innerHTML = `
    <div class="panel">
      <h3>المخزون</h3>

      <div class="tableWrap">
        <table>
          <tr>
            <th>المنتج</th>
            <th>المخزون</th>
            <th>الحالة</th>
          </tr>

          ${list.map(x => `
            <tr>
              <td>${esc(x.name)}</td>
              <td>${x.stock}</td>
              <td>
                <span class="stock ${Number(x.stock) < 10 ? 'low' : 'ok'}">
                  ${Number(x.stock) < 10 ? 'منخفض' : 'متوفر'}
                </span>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `;
}

async function couponsPage() {
  const r = await sb
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (r.error) return showError(r.error.message);

  $('#page').innerHTML = `
    <div class="panel">
      <div class="panelHead">
        <h3>الكوبونات</h3>
        <button class="primary" id="addCoupon">
          + كوبون
        </button>
      </div>

      <div class="tableWrap">
        <table>
          <tr>
            <th>الكود</th>
            <th>الخصم</th>
            <th>فعال</th>
            <th>انتهاء</th>
          </tr>

          ${(r.data || []).map(x => `
            <tr>
              <td>${esc(x.code)}</td>
              <td>${x.discount_percent}%</td>
              <td>${x.active ? 'نعم' : 'لا'}</td>
              <td>${esc(x.expires_at || '—')}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `;

  $('#addCoupon').onclick = () => couponModal();
}

function couponModal() {
  openModal(
    'كوبون جديد',
    `
      <div class="form">
        <input id="cc" placeholder="CODE">

        <input
          id="cd"
          type="number"
          min="0"
          max="100"
          placeholder="نسبة الخصم"
        >

        <input
          id="ce"
          type="datetime-local"
        >

        <button class="primary" id="saveCoupon">
          حفظ
        </button>
      </div>
    `
  );

  $('#saveCoupon').onclick = addCoupon;
}

async function addCoupon() {
  const code = $('#cc').value.trim().toUpperCase();
  const discount_percent = Number($('#cd').value || 0);
  const expires_at = $('#ce').value || null;

  if (
    !code ||
    discount_percent < 0 ||
    discount_percent > 100
  ) {
    return alert('بيانات غير صحيحة');
  }

  const r = await sb
    .from('coupons')
    .insert({
      code,
      discount_percent,
      expires_at
    });

  if (r.error) {
    return alert(r.error.message);
  }

  closeModal();
  await couponsPage();
}

function settingsPage() {
  $('#page').innerHTML = `
    <div class="panel">
      <h3>إعدادات الأمان والتشغيل</h3>

      <div class="notice">
        <b>مهم:</b>
        الموقع يستخدم Publishable/Anon key فقط في المتصفح.
        لا تضع Secret / Service Role key داخل GitHub.

        <br><br>

        صور المنتجات تحفظ في Supabase Storage داخل bucket باسم
        <b>product-images</b>،
        والرفع محصور بحسابات الإدارة.

        <br><br>

        الطلبات تُنشأ بواسطة دالة آمنة في قاعدة البيانات
        تتحقق من المخزون وتحسب الإجمالي على الخادم.
      </div>
    </div>
  `;
}

function openModal(t, b) {
  $('#modalTitle').textContent = t;
  $('#modalBody').innerHTML = b;
  $('#modal').classList.remove('hidden');
  $('#modal').setAttribute('aria-hidden', 'false');
}

function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modal').setAttribute('aria-hidden', 'true');
}

$('#loginBtn').onclick = login;

$('#password').onkeydown = e => {
  if (e.key === 'Enter') {
    login();
  }
};

$('#logout').onclick = async () => {
  await sb?.auth.signOut();
  location.reload();
};

$('#modalClose').onclick = closeModal;

document.querySelectorAll('.nav').forEach(b => {
  b.onclick = async () => {
    document
      .querySelectorAll('.nav')
      .forEach(x => x.classList.remove('active'));

    b.classList.add('active');

    await show(b.dataset.page);
  };
});

if (sb) {
  sb.auth.getSession().then(({ data }) => {
    if (data?.session) {
      boot();
    }
  });
} else {
  msg('تعذر قراءة config.js');
}

window.NBYN_ADMIN = {
  show
};

})();
