(() => {
  'use strict';

  const cfg = window.NBYN_CONFIG || {};
  const lib = window.supabase;

  const sb =
    (lib && cfg.SUPABASE_URL && cfg.SUPABASE_KEY)
      ? lib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY)
      : null;

  const $ = s => document.querySelector(s);

  const money = n =>
    Number(n || 0).toLocaleString('fr-FR') +
    ' ' +
    (cfg.CURRENCY || 'QAR');

  let products = [];

  let cart =
    JSON.parse(
      localStorage.getItem('nbyn_cart') || '[]'
    );

  let favorites =
    JSON.parse(
      localStorage.getItem('nbyn_favorites') || '[]'
    );

  if (!Array.isArray(cart))
    cart = [];

  if (!Array.isArray(favorites))
    favorites = [];

  const esc = v =>
    String(v ?? '').replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[c])
    );

  const toast = msg => {
    const e = $('#toast');

    if (!e)
      return;

    e.textContent = msg;
    e.classList.add('show');

    clearTimeout(toast.t);

    toast.t =
      setTimeout(
        () => e.classList.remove('show'),
        2500
      );
  };

  const saveCart = () => {
    localStorage.setItem(
      'nbyn_cart',
      JSON.stringify(cart)
    );

    updateCart();
  };

  const saveFavorites = () =>
    localStorage.setItem(
      'nbyn_favorites',
      JSON.stringify(favorites)
    );

  const open = id => {
    $('#' + id)?.classList.add('show');
    $('#' + id)?.setAttribute(
      'aria-hidden',
      'false'
    );
  };

  const close = id => {
    $('#' + id)?.classList.remove('show');
    $('#' + id)?.setAttribute(
      'aria-hidden',
      'true'
    );
  };


  async function loadProducts(
    category = 'all',
    search = ''
  ) {

    const box = $('#products');

    if (box)
      box.innerHTML =
        '<div class="loading">جاري تحميل المنتجات...</div>';

    if (!sb) {
      products = [];
      return renderProducts();
    }

    let q =
      sb
        .from('products')
        .select('*')
        .eq('active', true)
        .order(
          'created_at',
          { ascending: false }
        );

    if (
      category === 'men' ||
      category === 'women'
    )
      q = q.eq('category', category);

    if (category === 'offers')
      q = q.gt('discount_percent', 0);

    const r = await q;

    if (r.error) {
      console.error(r.error);

      if (box)
        box.innerHTML =
          '<div class="loading">تعذر تحميل المنتجات. تحقق من Supabase.</div>';

      return;
    }

    products =
      (r.data || []).filter(
        p =>
          !search ||
          String(
            p.name +
            ' ' +
            (p.description || '')
          )
            .toLowerCase()
            .includes(
              search.toLowerCase()
            )
      );

    renderProducts();
  }


  function imageList(p) {

    let a = [];

    try {
      a =
        Array.isArray(p.image_urls)
          ? p.image_urls
          : JSON.parse(
              p.image_urls || '[]'
            );
    } catch (_) {
      a = [];
    }

    if (
      !a.length &&
      p.image_url
    )
      a = [p.image_url];

    return a.filter(Boolean);
  }


  function renderProducts() {

    const box = $('#products');

    if (!box)
      return;

    if (!products.length) {
      box.innerHTML =
        '<div class="loading">لا توجد منتجات مطابقة.</div>';

      return;
    }

    box.innerHTML =
      products
        .map(p => {

          const imgs = imageList(p);
          const img = imgs[0] || '';

          const disc =
            Number(
              p.discount_percent || 0
            );

          const old =
            Number(
              p.old_price || 0
            );

          const cat =
            p.category === 'women'
              ? 'نساء'
              : 'رجال';

          return `
            <article class="card">

              <div class="pic">

                ${
                  img
                    ? `
                      <img
                        class="productImage"
                        src="${esc(img)}"
                        alt="${esc(p.name)}"
                        loading="lazy">
                    `
                    : `
                      <div
                        style="display:grid;place-items:center;height:100%;font:700 65px Cormorant Garamond;color:#8a1538">
                        N
                      </div>
                    `
                }

                ${
                  disc
                    ? `
                      <span class="discount">
                        -${disc}%
                      </span>
                    `
                    : ''
                }

                <button
                  class="fav"
                  aria-label="المفضلة"
                  data-fav="${esc(p.id)}">

                  ${
                    favorites.includes(
                      String(p.id)
                    )
                      ? '♥'
                      : '♡'
                  }

                </button>

              </div>

              <div class="body">

                <small>${cat}</small>

                <h3>
                  ${esc(p.name)}
                </h3>

                <p>
                  ${esc(
                    p.description || ''
                  )}
                </p>

                <div class="price">

                  <b>
                    ${money(p.price)}
                  </b>

                  ${
                    old
                      ? `
                        <span class="old">
                          ${money(old)}
                        </span>
                      `
                      : ''
                  }

                </div>

                <div class="cardActions">

                  <button
                    data-add="${esc(p.id)}">
                    أضف للسلة
                  </button>

                  <button
                    class="alt"
                    data-view="${esc(p.id)}">
                    عرض
                  </button>

                </div>

              </div>

            </article>
          `;

        })
        .join('');

    box
      .querySelectorAll('[data-add]')
      .forEach(
        b =>
          b.onclick =
            () =>
              addToCart(
                b.dataset.add
              )
      );

    box
      .querySelectorAll('[data-view]')
      .forEach(
        b =>
          b.onclick =
            () =>
              showProduct(
                b.dataset.view
              )
      );

    box
      .querySelectorAll('[data-fav]')
      .forEach(
        b =>
          b.onclick = () => {

            const id =
              String(
                b.dataset.fav
              );

            if (
              favorites.includes(id)
            ) {

              favorites =
                favorites.filter(
                  x =>
                    String(x) !== id
                );

              b.textContent = '♡';

              toast(
                'تمت إزالة المنتج من المفضلة'
              );

            } else {

              favorites.push(id);

              b.textContent = '♥';

              toast(
                'تمت إضافة المنتج إلى المفضلة'
              );
            }

            saveFavorites();
          }
      );
  }


  function addToCart(id) {

    const p =
      products.find(
        x =>
          String(x.id) ===
          String(id)
      );

    if (!p)
      return;

    const existing =
      cart.find(
        x =>
          String(x.id) ===
          String(id)
      );

    if (existing) {

      existing.quantity =
        Math.min(
          Number(
            existing.quantity || 1
          ) + 1,
          Number(
            p.stock || 99
          )
        );

    } else {

      cart.push({
        id: p.id,
        name: p.name,
        price: Number(
          p.price || 0
        ),
        image_url:
          p.image_url || '',
        quantity: 1
      });

    }

    saveCart();

    toast(
      'تمت إضافة المنتج إلى السلة'
    );
  }


  function updateCart() {

    const c = $('#cartCount');
    const box = $('#cartItems');
    const total = $('#cartTotal');

    if (c)
      c.textContent =
        String(
          cart.reduce(
            (n, x) =>
              n +
              Number(
                x.quantity || 1
              ),
            0
          )
        );

    if (box)
      box.innerHTML =
        cart.length
          ? cart
              .map(
                (p, i) => `
                  <div class="cartRow">

                    <span>
                      ${esc(p.name)}
                      ×
                      ${Number(
                        p.quantity || 1
                      )}
                    </span>

                    <b>
                      ${money(
                        Number(p.price) *
                        Number(
                          p.quantity || 1
                        )
                      )}
                    </b>

                    <button
                      data-remove="${i}">
                      ×
                    </button>

                  </div>
                `
              )
              .join('')

          : '<p>السلة فارغة.</p>';

    box
      ?.querySelectorAll(
        '[data-remove]'
      )
      .forEach(
        b =>
          b.onclick = () => {

            cart.splice(
              Number(
                b.dataset.remove
              ),
              1
            );

            saveCart();
          }
      );

    if (total)
      total.textContent =
        money(
          cart.reduce(
            (s, p) =>
              s +
              Number(p.price) *
              Number(
                p.quantity || 1
              ),
            0
          )
        );
  }


  function showProduct(id) {

    const p =
      products.find(
        x =>
          String(x.id) ===
          String(id)
      );

    if (!p)
      return;

    const imgs =
      imageList(p);

    const body =
      $('#productDetailBody');

    if (!body)
      return;

    body.innerHTML = `
      <div class="gallery">

        ${imgs
          .map(
            i => `
              <img
                src="${esc(i)}"
                alt="${esc(p.name)}">
            `
          )
          .join('')}

      </div>

      <span class="eyebrow">
        ${
          p.category === 'women'
            ? 'WOMEN'
            : 'MEN'
        }
      </span>

      <h3>
        ${esc(p.name)}
      </h3>

      <p>
        ${esc(
          p.description || ''
        )}
      </p>

      <div class="price">

        <b>
          ${money(p.price)}
        </b>

        ${
          p.old_price
            ? `
              <span class="old">
                ${money(p.old_price)}
              </span>
            `
            : ''
        }

      </div>

      <p class="muted">
        المقاسات:
        ${esc(
          p.sizes ||
          'متوفر حسب المنتج'
        )}
      </p>

      <button
        class="goldBtn full"
        id="detailAdd">
        أضف إلى السلة
      </button>
    `;

    $('#detailAdd').onclick = () => {
      addToCart(p.id);
      close('productModal');
    };

    open('productModal');
  }


  async function startCheckout() {

    if (!cart.length)
      return toast(
        'السلة فارغة'
      );

    if (!sb)
      return toast(
        'Supabase غير متصل'
      );

    const {
      data
    } =
      await sb.auth.getUser();

    if (!data?.user) {

      open('account');

      $('#authMsg').textContent =
        'سجّل الدخول أولًا لإتمام الطلب.';

      return;
    }

    const prof =
      await sb
        .from('profiles')
        .select(
          'full_name,phone'
        )
        .eq(
          'id',
          data.user.id
        )
        .maybeSingle();

    $('#checkoutName').value =
      prof.data?.full_name ||
      data.user.user_metadata?.full_name ||
      '';

    $('#checkoutPhone').value =
      prof.data?.phone ||
      data.user.user_metadata?.phone ||
      '';

    open('checkoutModal');
  }


  async function placeOrder() {

    const msg =
      $('#checkoutMsg');

    msg.textContent =
      'جاري إرسال الطلب...';

    const name =
      $('#checkoutName')
        .value
        .trim();

    const phone =
      $('#checkoutPhone')
        .value
        .trim();

    const address =
      $('#checkoutAddress')
        .value
        .trim();

    if (
      !name ||
      phone.replace(
        /\D/g,
        ''
      ).length < 8 ||
      address.length < 6
    ) {

      msg.textContent =
        'أدخل الاسم ورقم الهاتف/واتساب والعنوان بشكل صحيح.';

      return;
    }

    const items =
      cart.map(
        x => ({
          product_id: x.id,
          quantity:
            Number(
              x.quantity || 1
            )
        })
      );

    const coupon =
      (
        $('#checkoutCoupon')
          ?.value || ''
      )
        .trim()
        .toUpperCase();

    const r =
      await sb.rpc(
        'create_order',
        {
          p_customer_name:
            name,
          p_phone:
            phone,
          p_address:
            address,
          p_items:
            items,
          p_coupon_code:
            coupon
        }
      );

    if (r.error) {

      console.error(
        r.error
      );

      msg.textContent =
        r.error.message ||
        'تعذر إنشاء الطلب.';

      return;
    }

    cart = [];

    saveCart();

    close(
      'checkoutModal'
    );

    close('cart');

    const result =
      r.data || {};

    toast(
      result.total != null
        ? `تم إرسال الطلب. الإجمالي: ${money(result.total)}`
        : 'تم إرسال طلبك بنجاح'
    );
  }


  async function showMyOrders() {

    if (!sb)
      return;

    const {
      data
    } =
      await sb.auth.getUser();

    if (!data?.user) {

      open('account');

      $('#authMsg').textContent =
        'سجّل الدخول لعرض طلباتك.';

      return;
    }

    const r =
      await sb
        .from('orders')
        .select(
          'id,customer_name,phone,address,total,status,created_at,coupon_code,discount_amount'
        )
        .eq(
          'user_id',
          data.user.id
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        );

    if (r.error) {

      toast(
        'تعذر تحميل الطلبات'
      );

      return;
    }

    const labels = {
      new: 'جديد',
      confirmed: 'مؤكد',
      preparing: 'قيد التجهيز',
      shipped: 'تم الشحن',
      delivered: 'تم التسليم',
      cancelled: 'ملغى'
    };

    const body =
      $('#ordersBody');

    body.innerHTML =
      (r.data || []).length

        ? (r.data || [])
            .map(
              o => `
                <div class="orderCard">

                  <div>

                    <b>
                      طلب #
                      ${esc(
                        String(
                          o.id
                        )
                          .slice(
                            0,
                            8
                          )
                          .toUpperCase()
                      )}
                    </b>

                    <span>
                      ${
                        new Date(
                          o.created_at
                        ).toLocaleString(
                          'ar-DZ'
                        )
                      }
                    </span>

                  </div>

                  <p>
                    الحالة:
                    <strong>
                      ${
                        labels[
                          o.status
                        ] ||
                        o.status
                      }
                    </strong>
                  </p>

                  <p>
                    المجموع:
                    <strong>
                      ${money(
                        o.total
                      )}
                    </strong>
                  </p>

                </div>
              `
            )
            .join('')

        : '<p>لا توجد طلبات حتى الآن.</p>';

    open(
      'ordersModal'
    );
  }


  /*
   * إرسال رسالة التواصل
   * تم تعديل هذا الجزء فقط:
   * بعد نجاح الإرسال يتم استبدال النموذج
   * برسالة نجاح لمنع الضغط المتكرر.
   */
  async function submitMessage(e) {

    e.preventDefault();

    const form =
      e.currentTarget;

    const button =
      form.querySelector(
        'button[type="submit"]'
      );

    if (!sb) {
      toast(
        'Supabase غير متصل'
      );
      return;
    }

    if (button)
      button.disabled = true;

    const d =
      Object.fromEntries(
        new FormData(form).entries()
      );

    const r =
      await sb
        .from('messages')
        .insert({
          name:
            String(
              d.name
            ).trim(),

          email:
            String(
              d.email
            ).trim(),

          phone:
            String(
              d.phone
            ).trim(),

          message:
            String(
              d.message
            ).trim()
        });

    if (r.error) {

      toast(
        'تعذر إرسال الرسالة'
      );

      console.error(
        r.error
      );

      if (button)
        button.disabled = false;

      return;
    }

    /*
     * بعد نجاح الإرسال:
     * إخفاء النموذج وإظهار رسالة نجاح.
     */
    form.innerHTML = `
      <div
        class="message"
        style="
          text-align:center;
          padding:25px 10px;
        "
      >

        <strong
          style="
            display:block;
            font-size:20px;
            margin-bottom:8px;
          "
        >
          ✅ لقد تم إرسال رسالتك بنجاح
        </strong>

        <span>
          شكرًا لتواصلك معنا، سنرد عليك قريبًا.
        </span>

      </div>
    `;

    toast(
      'تم إرسال رسالتك بنجاح'
    );
  }


  async function signIn() {

    const msg =
      $('#authMsg');

    const email =
      $('#authEmail')
        .value
        .trim();

    const password =
      $('#authPass')
        .value;

    if (
      !email ||
      !password
    ) {

      msg.textContent =
        'أدخل البريد الإلكتروني وكلمة المرور.';

      return;
    }

    const r =
      await sb.auth
        .signInWithPassword({
          email,
          password
        });

    msg.textContent =
      r.error
        ? r.error.message
        : 'تم تسجيل الدخول بنجاح.';

    if (!r.error)
      updateAuth(
        r.data.session
      );
  }


  async function signUp() {

    const msg =
      $('#authMsg');

    const name =
      $('#authName')
        .value
        .trim();

    const phone =
      $('#authPhone')
        .value
        .trim();

    const email =
      $('#authEmail')
        .value
        .trim();

    const password =
      $('#authPass')
        .value;

    if (
      !name ||
      phone.replace(
        /\D/g,
        ''
      ).length < 8 ||
      !email ||
      password.length < 6
    ) {

      msg.textContent =
        'أدخل الاسم والرقم والبريد وكلمة مرور 6 أحرف على الأقل.';

      return;
    }

    const r =
      await sb.auth.signUp({
        email,
        password,

        options: {
          data: {
            full_name:
              name,
            phone:
              phone
          }
        }
      });

    if (r.error) {

      msg.textContent =
        r.error.message;

      return;
    }

    msg.textContent =
      r.data?.session
        ? 'تم إنشاء الحساب بنجاح.'
        : 'تم إنشاء الحساب. تحقق من بريدك الإلكتروني ثم سجّل الدخول.';
  }

async function signOut() {
  await sb?.auth.signOut();

  updateAuth(null);

  $('#authMsg').textContent = 'تم تسجيل الخروج بنجاح.';
}

function updateAuth(session) {
  $('#signIn')?.classList.toggle('hidden', !!session);
  $('#signUp')?.classList.toggle('hidden', !!session);
  $('#signOut')?.classList.toggle('hidden', !session);

  if (session) {
    $('#signupFields')?.classList.add('hidden');
    $('#myOrders')?.classList.remove('hidden');
  } else {
    $('#signupFields')?.classList.remove('hidden');
    $('#myOrders')?.classList.add('hidden');
  }
}

function setup() {
  $('#cartBtn').onclick = () => open('cart');
  $('#closeCart').onclick = () => close('cart');
  $('#checkout').onclick = startCheckout;
  $('#placeOrder').onclick = placeOrder;

  $('#applyCoupon').onclick = async () => {
    const code = $('#checkoutCoupon').value.trim().toUpperCase();
    const m = $('#couponMsg');

    if (!code) {
      m.textContent = 'أدخل رمز الكوبون.';
      return;
    }

    const r = await sb.rpc('validate_coupon', {
      p_code: code
    });

    if (r.error || !r.data?.valid) {
      m.textContent = 'الكوبون غير صالح أو منتهي.';
      return;
    }

    m.textContent =
      `تم تطبيق خصم ${r.data.discount_percent}% عند تأكيد الطلب.`;
  };

  $('#accountBtn').onclick = () => open('account');
  $('#myOrders').onclick = showMyOrders;
  $('#signIn').onclick = signIn;
  $('#signUp').onclick = signUp;
  $('#signOut').onclick = signOut;
  $('#contactForm').onsubmit = submitMessage;

  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => close(b.dataset.close);
  });

  document.querySelectorAll('.filters button').forEach(b => {
    b.onclick = () => {
      document
        .querySelectorAll('.filters button')
        .forEach(x => x.classList.remove('active'));

      b.classList.add('active');

      loadProducts(
        b.dataset.cat,
        $('#searchInput').value.trim()
      );
    };
  });

  document.querySelectorAll('[data-cat]').forEach(b => {
    b.onclick = () => {
      document
        .querySelectorAll('.filters button')
        .forEach(x => x.classList.remove('active'));

      document
        .querySelector(`.filters button[data-cat="${b.dataset.cat}"]`)
        ?.classList.add('active');

      document
        .querySelector('#shop')
        .scrollIntoView({ behavior: 'smooth' });

      loadProducts(b.dataset.cat);
    };
  });

  document.querySelectorAll('[data-jump]').forEach(a => {
    a.onclick = () => {
      const c = a.dataset.jump;
      setTimeout(() => loadProducts(c), 0);
    };
  });

  $('#showAll').onclick = e => {
    e.preventDefault();

    document
      .querySelector('.filters button[data-cat="all"]')
      .click();
  };

  let t;

  $('#searchInput').oninput = () => {
    clearTimeout(t);

    t = setTimeout(() => {
      loadProducts(
        document
          .querySelector('.filters button.active')
          ?.dataset.cat || 'all',
        $('#searchInput').value.trim()
      );
    }, 250);
  };

  if (sb) {
    sb.auth
      .getSession()
      .then(({ data }) => updateAuth(data?.session || null));

    sb.auth.onAuthStateChange((_e, s) => {
      updateAuth(s);
    });
  }

  updateCart();
  loadProducts();
}

window.NBYN = {
  addToCart,

  removeCart: i => {
    cart.splice(i, 1);
    saveCart();
  }
};

setup();

})();
