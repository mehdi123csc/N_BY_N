const cfg=window.NBYN_CONFIG||{};let sb=null;
if(window.supabase&&cfg.SUPABASE_URL.startsWith("http")) sb=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
let products=[],cart=JSON.parse(localStorage.getItem("nbyn_cart")||"[]");
const $=s=>document.querySelector(s),money=n=>Number(n||0).toLocaleString("fr-FR")+" DA";
async function loadProducts(cat="all"){
 let q=sb?sb.from("products").select("*").eq("active",true).order("created_at",{ascending:false}):null;
 if(q&&cat!=="all")q=q.eq("category",cat);
 if(q){let r=await q;if(!r.error)products=r.data||[]}
 if(!products.length&&!sb) products=[
 {id:1,name:"Classic Blazer",category:"men",price:8500,stock:18},{id:2,name:"Urban Shirt",category:"men",price:4200,stock:30},{id:3,name:"Elegant Dress",category:"women",price:9800,stock:12},{id:4,name:"Luxury Set",category:"women",price:11500,stock:9}];
 render();
}
function render(){if(!products.length){$("#products").innerHTML='<div class="loading">لا توجد منتجات حالياً.</div>';return}
$("#products").innerHTML=products.map(p=>`<article class="card"><div class="pic">${p.category==="women"?"N♀":"N♂"}</div><div class="body"><small>${p.category==="women"?"نساء":"رجال"}</small><h3>${p.name}</h3><b>${money(p.price)}</b><button onclick="add('${p.id}')">أضف إلى السلة</button></div></article>`).join("")}
function add(id){let p=products.find(x=>String(x.id)===String(id));if(!p)return;cart.push(p);localStorage.setItem("nbyn_cart",JSON.stringify(cart));updateCart();toast("تمت إضافة المنتج")}
function updateCart(){$("#cartCount").textContent=cart.length;$("#cartItems").innerHTML=cart.length?cart.map((p,i)=>`<div class="cartRow"><span>${p.name}</span><b>${money(p.price)}</b><button onclick="removeCart(${i})">×</button></div>`).join(""):"<p>السلة فارغة</p>";$("#cartTotal").textContent=money(cart.reduce((a,p)=>a+Number(p.price),0))}
function removeCart(i){cart.splice(i,1);localStorage.setItem("nbyn_cart",JSON.stringify(cart));updateCart()}
async function checkout(){if(!cart.length)return toast("السلة فارغة");if(!sb)return toast("أكمل إعداد Supabase أولاً");let {data:{user}}=await sb.auth.getUser();if(!user){$("#account").classList.add("show");return}let total=cart.reduce((a,p)=>a+Number(p.price),0);let o=await sb.from("orders").insert({user_id:user.id,customer_name:user.email,total,status:"new"}).select().single();if(o.error)return toast("تعذر إنشاء الطلب");let items=cart.map(p=>({order_id:o.data.id,product_id:p.id,product_name:p.name,quantity:1,unit_price:p.price}));await sb.from("order_items").insert(items);cart=[];localStorage.setItem("nbyn_cart","[]");updateCart();toast("تم إرسال الطلب")}
$("#cartBtn").onclick=()=>$("#cart").classList.add("show");$("#closeCart").onclick=()=>$("#cart").classList.remove("show");$("#checkout").onclick=checkout;
document.querySelectorAll(".filters button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".filters button").forEach(x=>x.classList.remove("active"));b.classList.add("active");loadProducts(b.dataset.cat)});
$("#contactForm").onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);if(!sb)return toast("أكمل إعداد Supabase أولاً");let r=await sb.from("messages").insert({name:f.get("name"),email:f.get("email"),message:f.get("message")});toast(r.error?"تعذر إرسال الرسالة":"تم إرسال رسالتك");if(!r.error)e.target.reset()};
$("#accountBtn").onclick=()=>$("#account").classList.add("show");document.querySelectorAll("[data-close]").forEach(x=>x.onclick=()=>$("#"+x.dataset.close).classList.remove("show"));
$("#signIn").onclick=async()=>{if(!sb)return $("#authMsg").textContent="أكمل إعداد Supabase أولاً";let r=await sb.auth.signInWithPassword({email:$("#authEmail").value,password:$("#authPass").value});$("#authMsg").textContent=r.error?r.error.message:"تم تسجيل الدخول";};
$("#signUp").onclick=async()=>{if(!sb)return $("#authMsg").textContent="أكمل إعداد Supabase أولاً";let r=await sb.auth.signUp({email:$("#authEmail").value,password:$("#authPass").value});$("#authMsg").textContent=r.error?r.error.message:"تم إنشاء الحساب. تحقق من بريدك إذا كان التحقق مفعلاً."};
$("#signOut").onclick=async()=>{await sb.auth.signOut();$("#authMsg").textContent="تم تسجيل الخروج"};
async function authState(){if(!sb)return;sb.auth.onAuthStateChange((e,s)=>{$("#signOut").classList.toggle("hidden",!s);$("#signIn").classList.toggle("hidden",!!s);$("#signUp").classList.toggle("hidden",!!s)})}
function toast(t){$("#toast").textContent=t;$("#toast").classList.add("show");setTimeout(()=>$("#toast").classList.remove("show"),1800)}
loadProducts();updateCart();authState();