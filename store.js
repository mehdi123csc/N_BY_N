(() => {
  'use strict';
  const cfg = window.NBYN_CONFIG || {};
  const lib = window.supabase;
  const sb = (lib && cfg.SUPABASE_URL && cfg.SUPABASE_KEY) ? lib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;
  const $ = s => document.querySelector(s);
  const money = n => Number(n || 0).toLocaleString('fr-FR') + ' ' + (cfg.CURRENCY || 'QAR');
  let products = [], cart = JSON.parse(localStorage.getItem('nbyn_cart') || '[]');
  if (!Array.isArray(cart)) cart = [];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const toast = msg => { const e=$('#toast'); if(!e)return; e.textContent=msg;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2500); };
  const saveCart=()=>{localStorage.setItem('nbyn_cart',JSON.stringify(cart));updateCart();};
  const open=(id)=>{$('#'+id)?.classList.add('show');$('#'+id)?.setAttribute('aria-hidden','false');};
  const close=(id)=>{$('#'+id)?.classList.remove('show');$('#'+id)?.setAttribute('aria-hidden','true');};

  async function loadProducts(category='all', search='') {
    const box=$('#products'); if(box) box.innerHTML='<div class="loading">جاري تحميل المنتجات...</div>';
    if(!sb){ products=[]; return renderProducts(); }
    let q=sb.from('products').select('*').eq('active',true).order('created_at',{ascending:false});
    if(category==='men'||category==='women') q=q.eq('category',category);
    if(category==='offers') q=q.gt('discount_percent',0);
    const r=await q;
    if(r.error){console.error(r.error);if(box)box.innerHTML='<div class="loading">تعذر تحميل المنتجات. تحقق من Supabase.</div>';return;}
    products=(r.data||[]).filter(p=>!search||String(p.name+' '+(p.description||'')).toLowerCase().includes(search.toLowerCase()));
    renderProducts();
  }
  function imageList(p){
    let a=[]; try{a=Array.isArray(p.image_urls)?p.image_urls:JSON.parse(p.image_urls||'[]')}catch(_){a=[]}
    if(!a.length && p.image_url) a=[p.image_url]; return a.filter(Boolean);
  }
  function renderProducts(){
    const box=$('#products'); if(!box)return;
    if(!products.length){box.innerHTML='<div class="loading">لا توجد منتجات مطابقة.</div>';return;}
    box.innerHTML=products.map(p=>{
      const imgs=imageList(p), img=imgs[0]||''; const disc=Number(p.discount_percent||0); const old=Number(p.old_price||0); const cat=p.category==='women'?'نساء':'رجال';
      return `<article class="card"><div class="pic">${img?`<img class="productImage" src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">`:'<div style="display:grid;place-items:center;height:100%;font:700 65px Cormorant Garamond;color:#8a1538">N</div>'}${disc?`<span class="discount">-${disc}%</span>`:''}<button class="fav" data-fav="${esc(p.id)}">♡</button></div><div class="body"><small>${cat}</small><h3>${esc(p.name)}</h3><p>${esc(p.description||'')}</p><div class="price"><b>${money(p.price)}</b>${old?`<span class="old">${money(old)}</span>`:''}</div><div class="cardActions"><button data-add="${esc(p.id)}">أضف للسلة</button><button class="alt" data-view="${esc(p.id)}">عرض</button></div></div></article>`;
    }).join('');
    box.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addToCart(b.dataset.add));
    box.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showProduct(b.dataset.view));
    box.querySelectorAll('[data-fav]').forEach(b=>b.onclick=()=>{b.textContent=b.textContent==='♡'?'♥':'♡';toast('تم تحديث المفضلة');});
  }
  function addToCart(id){const p=products.find(x=>String(x.id)===String(id));if(!p)return;const existing=cart.find(x=>String(x.id)===String(id));if(existing)existing.quantity=Math.min(Number(existing.quantity||1)+1,Number(p.stock||99));else cart.push({id:p.id,name:p.name,price:Number(p.price||0),image_url:p.image_url||'',quantity:1});saveCart();toast('تمت إضافة المنتج إلى السلة');}
  function updateCart(){const c=$('#cartCount'), box=$('#cartItems'), total=$('#cartTotal');c&&(c.textContent=String(cart.reduce((n,x)=>n+Number(x.quantity||1),0)));if(box)box.innerHTML=cart.length?cart.map((p,i)=>`<div class="cartRow"><span>${esc(p.name)} × ${Number(p.quantity||1)}</span><b>${money(Number(p.price)*Number(p.quantity||1))}</b><button data-remove="${i}">×</button></div>`).join(''):'<p>السلة فارغة.</p>';box?.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);saveCart();});if(total)total.textContent=money(cart.reduce((s,p)=>s+Number(p.price)*Number(p.quantity||1),0));}
  function showProduct(id){const p=products.find(x=>String(x.id)===String(id));if(!p)return;const imgs=imageList(p), body=$('#productDetailBody');if(!body)return;body.innerHTML=`<div class="gallery">${imgs.map(i=>`<img src="${esc(i)}" alt="${esc(p.name)}">`).join('')}</div><span class="eyebrow">${p.category==='women'?'WOMEN':'MEN'}</span><h3>${esc(p.name)}</h3><p>${esc(p.description||'')}</p><div class="price"><b>${money(p.price)}</b>${p.old_price?`<span class="old">${money(p.old_price)}</span>`:''}</div><p class="muted">المقاسات: ${esc(p.sizes||'متوفر حسب المنتج')}</p><button class="goldBtn full" id="detailAdd">أضف إلى السلة</button>`;$('#detailAdd').onclick=()=>{addToCart(p.id);close('productModal');};open('productModal');}

  async function startCheckout(){if(!cart.length)return toast('السلة فارغة');if(!sb)return toast('Supabase غير متصل');const {data}=await sb.auth.getUser();if(!data?.user){open('account');$('#authMsg').textContent='سجّل الدخول أولًا لإتمام الطلب.';return;}const prof=await sb.from('profiles').select('full_name,phone').eq('id',data.user.id).maybeSingle();$('#checkoutName').value=prof.data?.full_name||data.user.user_metadata?.full_name||'';$('#checkoutPhone').value=prof.data?.phone||data.user.user_metadata?.phone||'';open('checkoutModal');}
  async function placeOrder(){const msg=$('#checkoutMsg');msg.textContent='جاري إرسال الطلب...';const name=$('#checkoutName').value.trim(),phone=$('#checkoutPhone').value.trim(),address=$('#checkoutAddress').value.trim();if(!name||phone.replace(/\D/g,'').length<8||address.length<6){msg.textContent='أدخل الاسم ورقم الهاتف/واتساب والعنوان بشكل صحيح.';return;}const items=cart.map(x=>({product_id:x.id,quantity:Number(x.quantity||1)}));const r=await sb.rpc('create_order',{p_customer_name:name,p_phone:phone,p_address:address,p_items:items});if(r.error){console.error(r.error);msg.textContent=r.error.message||'تعذر إنشاء الطلب.';return;}cart=[];saveCart();close('checkoutModal');close('cart');toast('تم إرسال طلبك بنجاح');}
  async function submitMessage(e){e.preventDefault();if(!sb)return toast('Supabase غير متصل');const d=Object.fromEntries(new FormData(e.currentTarget).entries());const r=await sb.from('messages').insert({name:String(d.name).trim(),email:String(d.email).trim(),phone:String(d.phone).trim(),message:String(d.message).trim()});if(r.error){toast('تعذر إرسال الرسالة');console.error(r.error);return;}e.currentTarget.reset();toast('تم إرسال رسالتك بنجاح');}
  async function signIn(){const msg=$('#authMsg'),email=$('#authEmail').value.trim(),password=$('#authPass').value;if(!email||!password){msg.textContent='أدخل البريد الإلكتروني وكلمة المرور.';return;}const r=await sb.auth.signInWithPassword({email,password});msg.textContent=r.error?r.error.message:'تم تسجيل الدخول بنجاح.';if(!r.error)updateAuth(r.data.session);}
  async function signUp(){const msg=$('#authMsg'),name=$('#authName').value.trim(),phone=$('#authPhone').value.trim(),email=$('#authEmail').value.trim(),password=$('#authPass').value;if(!name||phone.replace(/\D/g,'').length<8||!email||password.length<6){msg.textContent='أدخل الاسم والرقم والبريد وكلمة مرور 6 أحرف على الأقل.';return;}const r=await sb.auth.signUp({email,password,options:{data:{full_name:name,phone}}});if(r.error){msg.textContent=r.error.message;return;}if(r.data?.user?.id&&r.data?.session){await sb.from('profiles').upsert({id:r.data.user.id,full_name:name,phone,email,role:'customer'},{onConflict:'id'});}msg.textContent=r.data?.session?'تم إنشاء الحساب بنجاح.':'تم إنشاء الحساب. تحقق من بريدك الإلكتروني ثم سجّل الدخول.';}
  async function signOut(){await sb?.auth.signOut();updateAuth(null);$('#authMsg').textContent='تم تسجيل الخروج.';}
  function updateAuth(session){$('#signIn')?.classList.toggle('hidden',!!session);$('#signUp')?.classList.toggle('hidden',!!session);$('#signOut')?.classList.toggle('hidden',!session);if(session){$('#signupFields')?.classList.add('hidden');}}
  function setup(){
    $('#cartBtn').onclick=()=>open('cart');$('#closeCart').onclick=()=>close('cart');$('#checkout').onclick=startCheckout;$('#placeOrder').onclick=placeOrder;$('#accountBtn').onclick=()=>open('account');$('#signIn').onclick=signIn;$('#signUp').onclick=signUp;$('#signOut').onclick=signOut;$('#contactForm').onsubmit=submitMessage;
    document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>close(b.dataset.close));
    document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('active'));b.classList.add('active');loadProducts(b.dataset.cat,$('#searchInput').value.trim());});
    document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('active'));document.querySelector(`.filters button[data-cat="${b.dataset.cat}"]`)?.classList.add('active');document.querySelector('#shop').scrollIntoView({behavior:'smooth'});loadProducts(b.dataset.cat);});
    document.querySelectorAll('[data-jump]').forEach(a=>a.onclick=()=>{const c=a.dataset.jump;setTimeout(()=>loadProducts(c),0);});
    $('#showAll').onclick=(e)=>{e.preventDefault();document.querySelector('.filters button[data-cat="all"]').click();};
    let t;$('#searchInput').oninput=()=>{clearTimeout(t);t=setTimeout(()=>loadProducts(document.querySelector('.filters button.active')?.dataset.cat||'all',$('#searchInput').value.trim()),250);};
    if(sb){sb.auth.getSession().then(({data})=>updateAuth(data?.session||null));sb.auth.onAuthStateChange((_e,s)=>updateAuth(s));}
    updateCart();loadProducts();
  }
  window.NBYN={addToCart,removeCart:i=>{cart.splice(i,1);saveCart();}};
  setup();
})();
