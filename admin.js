(() => {
'use strict';
const cfg=window.NBYN_CONFIG||{},lib=window.supabase;
const sb=lib&&cfg.SUPABASE_URL&&cfg.SUPABASE_KEY?lib.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY):null;
const $=s=>document.querySelector(s),money=n=>Number(n||0).toLocaleString('fr-FR')+' DA';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function msg(t){if($('#loginMsg'))$('#loginMsg').textContent=t||''}

function removeMfa(){document.querySelector('#adminMfaBox')?.remove()}

function mfaBox(html){
  removeMfa();
  const r=document.querySelector('.loginBox');
  if(!r)return null;
  const b=document.createElement('div');
  b.id='adminMfaBox';
  b.innerHTML=html;
  r.appendChild(b);
  return b
}

async function verifiedFactor(){
  const r=await sb.auth.mfa.listFactors();
  if(r.error)throw r.error;
  return (r.data?.totp||[]).find(f=>f.status==='verified')||null
}

async function verifyFactor(id,code){
  code=String(code||'').replace(/\s/g,'');
  if(!/^\d{6}$/.test(code))
    throw new Error('أدخل رمز Authenticator المكوّن من 6 أرقام.');

  const c=await sb.auth.mfa.challenge({factorId:id});
  if(c.error)throw c.error;

  const v=await sb.auth.mfa.verify({
    factorId:id,
    challengeId:c.data.id,
    code
  });

  if(v.error)throw v.error
}

async function challengeMfa(f){
  const b=mfaBox(`
    <div class="mfaTitle">التحقق بخطوتين</div>
    <p>أدخل رمز الـ6 أرقام من تطبيق Authenticator.</p>
    <input
      id="mfaCode"
      inputmode="numeric"
      autocomplete="one-time-code"
      maxlength="6"
      placeholder="000000">
    <button id="mfaVerifyBtn" class="primary" type="button">
      تحقق ودخول
    </button>
    <p id="mfaMsg" class="message"></p>
  `);

  if(!b)return;

  const i=$('#mfaCode'),
        bt=$('#mfaVerifyBtn'),
        s=$('#mfaMsg');

  i.focus();

  const run=async()=>{
    bt.disabled=true;
    s.textContent='جاري التحقق...';

    try{
      await verifyFactor(f.id,i.value);
      removeMfa();
      await openAdmin();
    }catch(e){
      s.textContent=e?.message||'رمز التحقق غير صحيح.';
      i.value='';
      i.focus();
    }finally{
      bt.disabled=false
    }
  };

  bt.onclick=run;
  i.onkeydown=e=>{
    if(e.key==='Enter')run()
  }
}

async function enrollMfa(){
  const b=mfaBox(`
    <div class="mfaTitle">إعداد MFA للمدير</div>

    <p>
      امسح رمز QR بتطبيق Google Authenticator
      أو Microsoft Authenticator،
      ثم أدخل الرمز المكوّن من 6 أرقام.
    </p>

    <div id="mfaQr" style="text-align:center;margin:12px 0">
      جاري إنشاء QR...
    </div>

    <p id="mfaSecret" class="message"></p>

    <input
      id="mfaEnrollCode"
      inputmode="numeric"
      autocomplete="one-time-code"
      maxlength="6"
      placeholder="رمز Authenticator">

    <button id="mfaEnrollBtn" class="primary" type="button">
      تفعيل MFA
    </button>

    <p id="mfaEnrollMsg" class="message"></p>
  `);

  if(!b)return;

  const q=$('#mfaQr'),
        se=$('#mfaSecret'),
        i=$('#mfaEnrollCode'),
        bt=$('#mfaEnrollBtn'),
        s=$('#mfaEnrollMsg');

  try{
    const r=await sb.auth.mfa.enroll({
      factorType:'totp',
      issuer:'N by N',
      friendlyName:'N by N Admin'
    });

    if(r.error)throw r.error;

    const f=r.data;

    if(!f.totp?.qr_code)
      throw new Error('لم يتم إنشاء QR من Supabase.');

    q.innerHTML=`
      <img
        alt="MFA QR Code"
        style="max-width:260px;width:100%"
        src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.totp.qr_code)}">
    `;

    if(f.totp.secret)
      se.textContent='المفتاح اليدوي: '+f.totp.secret;

    i.focus();

    const finish=async()=>{
      const code=i.value.replace(/\s/g,'');

      if(!/^\d{6}$/.test(code)){
        s.textContent='أدخل رمزًا صحيحًا من 6 أرقام.';
        return
      }

      bt.disabled=true;
      s.textContent='جاري تفعيل MFA...';

      try{
        const c=await sb.auth.mfa.challenge({
          factorId:f.id
        });

        if(c.error)throw c.error;

        const v=await sb.auth.mfa.verify({
          factorId:f.id,
          challengeId:c.data.id,
          code
        });

        if(v.error)throw v.error;

        const a=await sb.auth.mfa.getAuthenticatorAssuranceLevel();

        if(
          a.error||
          a.data?.currentLevel!=='aal2'
        ){
          throw new Error('لم يصل الحساب إلى AAL2.');
        }

        removeMfa();
        await openAdmin();

      }catch(e){
        s.textContent=e?.message||'تعذر تفعيل MFA.';
        i.value='';
        i.focus();
      }finally{
        bt.disabled=false
      }
    };

    bt.onclick=finish;

    i.onkeydown=e=>{
      if(e.key==='Enter')finish()
    }

  }catch(e){
    s.textContent=e?.message||'تعذر إنشاء عامل MFA.'
  }
}

async function openAdmin(){
  if(!sb)return;

  const {data}=await sb.auth.getSession(),
        u=data?.session?.user;

  if(!u){
    $('#login')?.classList.remove('hidden');
    $('#app')?.classList.add('hidden');
    removeMfa();
    return;
  }

  const p=await sb
    .from('profiles')
    .select('role,full_name')
    .eq('id',u.id)
    .single();

  if(
    p.error||
    p.data?.role!=='admin'
  ){
    await sb.auth.signOut();
    return msg('هذا الحساب ليس مديراً.');
  }

  const a=await sb.auth.mfa.getAuthenticatorAssuranceLevel();

  if(a.error){
    return msg(a.error.message);
  }

  const f=await verifiedFactor();

  /*
   * لا يوجد MFA بعد:
   * نسمح للمدير بإعداد Authenticator.
   */
  if(
    a.data?.currentLevel==='aal1' &&
    a.data?.nextLevel==='aal1' &&
    !f
  ){
    $('#login')?.classList.add('hidden');
    $('#app')?.classList.add('hidden');

    return enrollMfa();
  }

  /*
   * يوجد MFA لكن لم يتم إدخال الرمز بعد.
   */
  if(
    a.data?.currentLevel==='aal1' &&
    f
  ){
    $('#login')?.classList.add('hidden');
    $('#app')?.classList.add('hidden');

    return challengeMfa(f);
  }

  /*
   * تم التحقق بنجاح.
   */
  if(a.data?.currentLevel==='aal2'){

    removeMfa();

    $('#login')?.classList.add('hidden');
    $('#app')?.classList.remove('hidden');

    await show('dashboard');

    return;
  }

  return msg(
    'يجب إكمال التحقق بخطوتين للدخول إلى لوحة الإدارة.'
  );
}
async function show(page){
  const t={
    dashboard:'لوحة التحكم',
    products:'المنتجات',
    orders:'الطلبات',
    customers:'العملاء',
    messages:'الرسائل',
    inventory:'المخزون',
    coupons:'الكوبونات',
    settings:'الإعدادات'
  };

  $('#title').textContent=t[page]||'لوحة التحكم';

  const p={
    dashboard,
    products:productsPage,
    orders:ordersPage,
    customers:customersPage,
    messages:messagesPage,
    inventory:inventoryPage,
    coupons:couponsPage,
    settings:settingsPage
  };

  if(p[page])
    await p[page]()
}

async function getProducts(){
  const r=await sb
    .from('products')
    .select('*')
    .order('created_at',{ascending:false});

  if(r.error){
    showError(r.error.message);
    return []
  }

  return r.data||[]
}

function showError(t){
  $('#page').innerHTML=
    `<div class="panel error">${esc(t)}</div>`
}

async function dashboard(){
  const [p,o,c,m]=await Promise.all([
    sb.from('products').select('id,stock,active'),
    sb.from('orders').select('id,total,status'),
    sb.from('profiles').select('id'),
    sb.from('messages').select('id,status').eq('status','unread')
  ]);

  if(p.error||o.error)
    return showError((p.error||o.error).message);

  const ps=p.data||[],
        os=o.data||[];

  const sales=os
    .filter(x=>x.status!=='cancelled')
    .reduce(
      (s,x)=>s+Number(x.total||0),
      0
    );

  const stock=ps.reduce(
    (s,x)=>s+Number(x.stock||0),
    0
  );

  $('#page').innerHTML=`
    <div class="stats">

      <div class="stat">
        <small>المنتجات</small>
        <strong>${ps.length}</strong>
      </div>

      <div class="stat">
        <small>الطلبات</small>
        <strong>${os.length}</strong>
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
        العملاء: ${c.data?.length||0}
        —
        الرسائل غير المقروءة: ${m.data?.length||0}
      </p>

      <p class="notice">
        رفع صور المنتجات يتم مباشرة إلى Supabase Storage
        بعد التحقق من صلاحية المدير.
      </p>
    </div>
  `
}

async function productsPage(){
  const list=await getProducts();

  $('#page').innerHTML=`
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

          ${list.map(x=>`
            <tr>

              <td>
                ${
                  x.image_url
                  ?`<img class="tableImg" src="${esc(x.image_url)}">`
                  :'—'
                }
              </td>

              <td>${esc(x.name)}</td>

              <td>
                ${x.category==='women'?'نساء':'رجال'}
              </td>

              <td>${money(x.price)}</td>

              <td>
                ${Number(x.discount_percent||0)}%
              </td>

              <td>
                ${Number(x.stock||0)}
              </td>

              <td>
                ${x.active?'فعال':'مخفي'}
              </td>

              <td>
                <button
                  class="primary mini"
                  data-edit="${x.id}">
                  تعديل
                </button>

                <button
                  class="danger"
                  data-delete="${x.id}">
                  حذف
                </button>
              </td>

            </tr>
          `).join('')}

        </table>
      </div>

    </div>
  `;

  $('#addProductBtn').onclick=()=>productModal();

  document
    .querySelectorAll('[data-edit]')
    .forEach(b=>
      b.onclick=()=>productModal(b.dataset.edit)
    );

  document
    .querySelectorAll('[data-delete]')
    .forEach(b=>
      b.onclick=()=>del(b.dataset.delete)
    )
}

async function productModal(id){

  let p={
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

  if(id){

    const r=await sb
      .from('products')
      .select('*')
      .eq('id',id)
      .single();

    if(r.error)
      return alert(r.error.message);

    p=r.data;

    try{
      p.image_urls=
        Array.isArray(p.image_urls)
        ?p.image_urls
        :JSON.parse(p.image_urls||'[]')
    }catch(_){
      p.image_urls=[]
    }

    if(
      !p.image_urls.length&&
      p.image_url
    )
      p.image_urls=[p.image_url]
  }

  openModal(
    id?'تعديل المنتج':'إضافة منتج',
    `
    <div class="form">

      <label>
        اسم المنتج
        <input
          id="pn"
          value="${esc(p.name)}">
      </label>

      <label>
        الفئة

        <select id="pc">

          <option
            value="men"
            ${p.category==='men'?'selected':''}>
            رجال
          </option>

          <option
            value="women"
            ${p.category==='women'?'selected':''}>
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
            value="${p.price??''}">
        </label>

        <label>
          السعر القديم
          <input
            id="po"
            type="number"
            min="0"
            step="0.01"
            value="${p.old_price??''}">
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
            value="${p.discount_percent??0}">
        </label>

        <label>
          المخزون
          <input
            id="ps"
            type="number"
            min="0"
            step="1"
            value="${p.stock??0}">
        </label>

      </div>

      <label>
        المقاسات

        <input
          id="psz"
          value="${esc(p.sizes||'')}"
          placeholder="S, M, L, XL">
      </label>

      <label>
        صور المنتج

        <input
          id="pfiles"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple>

        <small>
          يمكن رفع حتى 5 صور،
          كل صورة 5MB كحد أقصى.
        </small>
      </label>

      <div id="existingImgs" class="existingImgs">
        ${(p.image_urls||[])
          .map(u=>`<img src="${esc(u)}">`)
          .join('')}
      </div>

      <label>
        الوصف

        <textarea id="pdesc">
${esc(p.description||'')}</textarea>
      </label>

      <label class="check">

        <input
          id="pactive"
          type="checkbox"
          ${p.active!==false?'checked':''}>

        المنتج ظاهر في المتجر

      </label>

      <button
        class="primary"
        id="saveProduct">

        ${id?'حفظ التعديلات':'إضافة المنتج'}

      </button>

      <p
        id="uploadMsg"
        class="message">
      </p>

    </div>
    `
  );

  $('#saveProduct').onclick=
    ()=>saveProduct(id,p)
}

async function compressImage(file){

  return new Promise((resolve,reject)=>{

    if(!file.type.startsWith('image/'))
      return reject(
        new Error('الملف ليس صورة')
      );

    if(file.size>5*1024*1024)
      return reject(
        new Error('حجم الصورة أكبر من 5MB')
      );

    const img=new Image(),
          url=URL.createObjectURL(file);

    img.onload=()=>{

      const max=1600,
            scale=Math.min(
              1,
              max/Math.max(
                img.width,
                img.height
              )
            );

      const c=document.createElement('canvas');

      c.width=Math.max(
        1,
        Math.round(img.width*scale)
      );

      c.height=Math.max(
        1,
        Math.round(img.height*scale)
      );

      c.getContext('2d')
        .drawImage(
          img,
          0,
          0,
          c.width,
          c.height
        );

      c.toBlob(
        b=>{
          URL.revokeObjectURL(url);

          b
            ?resolve(b)
            :reject(
              new Error('تعذر ضغط الصورة')
            )
        },
        'image/webp',
        .86
      )
    };

    img.onerror=()=>{
      URL.revokeObjectURL(url);
      reject(
        new Error('تعذر قراءة الصورة')
      )
    };

    img.src=url
  })
}

async function uploadImages(files){

  const urls=[];

  for(
    const file of Array.from(files).slice(0,5)
  ){

    const blob=await compressImage(file),
          name=`${crypto.randomUUID()}.webp`,
          path=`products/${name}`,
          r=await sb
            .storage
            .from('product-images')
            .upload(
              path,
              blob,
              {
                contentType:'image/webp',
                upsert:false
              }
            );

    if(r.error)
      throw r.error;

    urls.push(
      sb
        .storage
        .from('product-images')
        .getPublicUrl(path)
        .data
        .publicUrl
    )
  }

  return urls
}

async function saveProduct(id,old){

  const m=$('#uploadMsg');

  m.textContent='جاري الحفظ...';

  const name=$('#pn').value.trim(),
        category=$('#pc').value,
        price=Number($('#pp').value),
        old_price=Number($('#po').value||0),
        discount_percent=Number(
          $('#pdsc').value||0
        ),
        stock=Number($('#ps').value),
        sizes=$('#psz').value.trim(),
        description=$('#pdesc').value.trim(),
        active=$('#pactive').checked;

  if(
    !name||
    price<0||
    stock<0||
    discount_percent<0||
    discount_percent>100
  ){
    m.textContent='تحقق من بيانات المنتج.';
    return
  }

  let imgs=old.image_urls||[];

  try{

    const files=$('#pfiles').files;

    if(files.length){

      m.textContent='جاري رفع الصور...';

      imgs=[
        ...imgs,
        ...await uploadImages(files)
      ].slice(-5)
    }

  }catch(e){

    m.textContent=
      e.message||
      'تعذر رفع الصورة';

    return
  }

  const data={
    name,
    category,
    price,
    old_price,
    discount_percent,
    stock,
    sizes,
    description,
    active,
    image_urls:imgs,
    image_url:imgs[0]||''
  };

  const r=id
    ?await sb
      .from('products')
      .update(data)
      .eq('id',id)
    :await sb
      .from('products')
      .insert(data);

  if(r.error){
    m.textContent=r.error.message;
    return
  }

  closeModal();
  await productsPage()
}

async function del(id){

  if(!confirm('حذف المنتج نهائيًا؟'))
    return;

  const r=await sb
    .from('products')
    .delete()
    .eq('id',id);

  if(r.error)
    alert(r.error.message);
  else
    await productsPage()
}

async function ordersPage(){

  const r=await sb
    .from('orders')
    .select('*')
    .order(
      'created_at',
      {ascending:false}
    );

  if(r.error)
    return showError(r.error.message);

  $('#page').innerHTML=`
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

          ${(r.data||[]).map(o=>`

            <tr>

              <td>
                ${esc(o.customer_name)}
              </td>

              <td>
                ${esc(o.phone||'—')}
              </td>

              <td class="messageCell">
                ${esc(o.address||'—')}
              </td>

              <td>
                ${money(o.total)}
              </td>

              <td>

                <select
                  data-status="${o.id}">

                  ${
                    [
                      'new',
                      'confirmed',
                      'preparing',
                      'shipped',
                      'delivered',
                      'cancelled'
                    ]
                    .map(s=>`
                      <option
                        value="${s}"
                        ${o.status===s?'selected':''}>
                        ${s}
                      </option>
                    `)
                    .join('')
                  }

                </select>

              </td>

              <td>
                ${
                  o.created_at
                  ?new Date(o.created_at)
                    .toLocaleString('ar-DZ')
                  :'—'
                }
              </td>

            </tr>

          `).join('')}

        </table>

      </div>

    </div>
  `;

  document
    .querySelectorAll('[data-status]')
    .forEach(
      s=>
        s.onchange=()=>
          updateStatus(
            s.dataset.status,
            s.value
          )
    )
}

async function updateStatus(id,status){

  const r=await sb
    .from('orders')
    .update({status})
    .eq('id',id);

  if(r.error)
    alert(r.error.message)
}

async function customersPage(){

  const r=await sb
    .from('profiles')
    .select('*')
    .order(
      'created_at',
      {ascending:false}
    );

  if(r.error)
    return showError(r.error.message);

  $('#page').innerHTML=`
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

          ${(r.data||[]).map(x=>`

            <tr>

              <td>
                ${esc(x.full_name||'—')}
              </td>

              <td>
                ${esc(x.email||'—')}
              </td>

              <td>
                ${esc(x.phone||'—')}
              </td>

              <td>
                ${esc(x.role||'customer')}
              </td>

              <td>
                ${
                  x.created_at
                  ?new Date(x.created_at)
                    .toLocaleDateString('ar-DZ')
                  :'—'
                }
              </td>

            </tr>

          `).join('')}

        </table>

      </div>

    </div>
  `;
}

async function messagesPage(){

  const r=await sb
    .from('messages')
    .select('*')
    .order(
      'created_at',
      {ascending:false}
    );

  if(r.error)
    return showError(r.error.message);

  $('#page').innerHTML=`
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

          ${(r.data||[]).map(x=>`

            <tr>

              <td>
                ${esc(x.name)}
              </td>

              <td>
                ${esc(x.email)}
              </td>

              <td>
                ${esc(x.phone||'—')}
              </td>

              <td class="messageCell">
                ${esc(x.message)}
              </td>

              <td>

                <select data-msg="${x.id}">

                  <option
                    value="unread"
                    ${x.status==='unread'?'selected':''}>
                    غير مقروء
                  </option>

                  <option
                    value="read"
                    ${x.status==='read'?'selected':''}>
                    مقروء
                  </option>

                  <option
                    value="closed"
                    ${x.status==='closed'?'selected':''}>
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
    .forEach(
      s=>
        s.onchange=async()=>{

          const r=await sb
            .from('messages')
            .update({
              status:s.value
            })
            .eq('id',s.dataset.msg);

          if(r.error)
            alert(r.error.message);
        }
    );
}

async function inventoryPage(){

  const list=await getProducts();

  $('#page').innerHTML=`
    <div class="panel">

      <h3>المخزون</h3>

      <div class="tableWrap">

        <table>

          <tr>
            <th>المنتج</th>
            <th>المخزون</th>
            <th>الحالة</th>
          </tr>

          ${list.map(x=>`

            <tr>

              <td>
                ${esc(x.name)}
              </td>

              <td>
                ${x.stock}
              </td>

              <td>

                <span
                  class="stock ${
                    Number(x.stock)<10
                    ?'low'
                    :'ok'
                  }">

                  ${
                    Number(x.stock)<10
                    ?'منخفض'
                    :'متوفر'
                  }

                </span>

              </td>

            </tr>

          `).join('')}

        </table>

      </div>

    </div>
  `;
}

async function couponsPage(){

  const r=await sb
    .from('coupons')
    .select('*')
    .order(
      'created_at',
      {ascending:false}
    );

  if(r.error)
    return showError(r.error.message);

  $('#page').innerHTML=`
    <div class="panel">

      <div class="panelHead">

        <h3>الكوبونات</h3>

        <button
          class="primary"
          id="addCoupon">
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

          ${(r.data||[]).map(x=>`

            <tr>

              <td>
                ${esc(x.code)}
              </td>

              <td>
                ${x.discount_percent}%
              </td>

              <td>
                ${x.active?'نعم':'لا'}
              </td>

              <td>
                ${esc(x.expires_at||'—')}
              </td>

            </tr>

          `).join('')}

        </table>

      </div>

    </div>
  `;

  $('#addCoupon').onclick=()=>{
    couponModal();
  };
}

function couponModal(){

  openModal(
    'كوبون جديد',
    `
    <div class="form">

      <input
        id="cc"
        placeholder="CODE">

      <input
        id="cd"
        type="number"
        min="0"
        max="100"
        placeholder="نسبة الخصم">

      <input
        id="ce"
        type="datetime-local">

      <button
        class="primary"
        id="saveCoupon">
        حفظ
      </button>

    </div>
    `
  );

  $('#saveCoupon').onclick=addCoupon;
}

async function addCoupon(){

  const code=$('#cc')
    .value
    .trim()
    .toUpperCase();

  const discount_percent=
    Number($('#cd').value||0);

  const expires_at=
    $('#ce').value||null;

  if(
    !code||
    discount_percent<0||
    discount_percent>100
  ){
    return alert('بيانات غير صحيحة');
  }

  const r=await sb
    .from('coupons')
    .insert({
      code,
      discount_percent,
      expires_at
    });

  if(r.error)
    return alert(r.error.message);

  closeModal();

  await couponsPage();
}

function settingsPage(){

  $('#page').innerHTML=`

    <div class="panel">

      <h3>
        إعدادات الأمان والتشغيل
      </h3>

      <div class="notice">

        <b>مهم:</b>

        الموقع يستخدم
        Publishable/Anon key فقط في المتصفح.
        لا تضع Secret / Service Role key
        داخل GitHub.

        <br><br>

        <b>MFA:</b>

        حسابات الإدارة مطالبة بالتحقق
        بخطوتين باستخدام تطبيق Authenticator.

        <br><br>

        صور المنتجات تحفظ في Supabase Storage
        داخل bucket باسم
        <b>product-images</b>،
        والرفع محصور بحسابات الإدارة.

        <br><br>

        الطلبات تُنشأ بواسطة دالة آمنة
        في قاعدة البيانات تتحقق من المخزون
        وتحسب الإجمالي على الخادم.

      </div>

    </div>

  `;
}

function openModal(t,b){

  $('#modalTitle').textContent=t;

  $('#modalBody').innerHTML=b;

  $('#modal')
    .classList
    .remove('hidden');

  $('#modal')
    .setAttribute(
      'aria-hidden',
      'false'
    );
}

function closeModal(){

  $('#modal')
    .classList
    .add('hidden');

  $('#modal')
    .setAttribute(
      'aria-hidden',
      'true'
    );
}

$('#loginBtn').onclick=login;

$('#password').onkeydown=e=>{
  if(e.key==='Enter')
    login();
};

$('#logout').onclick=async()=>{
  await sb?.auth.signOut();
  location.reload();
};

$('#modalClose').onclick=closeModal;

document
  .querySelectorAll('.nav')
  .forEach(
    b=>
      b.onclick=async()=>{

        document
          .querySelectorAll('.nav')
          .forEach(
            x=>x.classList.remove('active')
          );

        b.classList.add('active');

        await show(b.dataset.page);
      }
  );

if(sb){

  sb.auth
    .getSession()
    .then(({data})=>{

      if(data?.session)
        openAdmin();

    });

  sb.auth
    .onAuthStateChange(event=>{

      if(event==='SIGNED_OUT')
        location.reload();

    });

}else{

  msg('تعذر قراءة config.js');

}

window.NBYN_ADMIN={
  show
};

})();
