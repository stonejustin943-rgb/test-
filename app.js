let data=null;
let cart={}; // elementId -> qty

const fmt=(n)=> new Intl.NumberFormat(undefined,{style:"currency",currency:"CAD"}).format(n);

function getQty(itemId){ return cart[itemId]||0; }
function setQty(itemId,qty){ if(qty<=0) delete cart[itemId]; else cart[itemId]=qty; }

function calc(){
  const items=data.items;
  let subtotal=0;
  for(const it of items){
    const q=getQty(it.elementId);
    subtotal += q * it.priceCadBase;
  }
  const shipping=subtotal*data.meta.shippingRate;
  const total=subtotal+shipping;

  const limitCad=data.meta.spendLimitEur*data.meta.exchangeRateEurToCad*(1+data.meta.shippingRate);
  const remaining=limitCad-total;

  document.getElementById("subtotal").textContent=fmt(subtotal);
  document.getElementById("shipping").textContent=fmt(shipping);
  document.getElementById("total").textContent=fmt(total);
  document.getElementById("remaining").textContent=fmt(Math.max(0,remaining));
  document.getElementById("limitCad").textContent=fmt(limitCad);

  const warn=document.getElementById("limitWarning");
  warn.classList.toggle("hidden", remaining>=0.00001);

  // disable add buttons if would exceed limit
  for(const it of items){
    const step=it.qtyStep;
    const btns=document.querySelectorAll(`[data-add='${it.elementId}']`);
    const projectedTotal = total + step*it.priceCadBase*(1+data.meta.shippingRate);
    const disabled = projectedTotal > limitCad + 1e-9;
    btns.forEach(b=> b.disabled=disabled);
    const qEl=document.getElementById(`q_${it.elementId}`);
    if(qEl) qEl.textContent = getQty(it.elementId);
  }
}

function render(){
  const wrap=document.getElementById("items");
  wrap.innerHTML="";
  for(const it of data.items){
    const card=document.createElement("div");
    card.className="item";
    card.innerHTML = `
      <div class="thumb"><img alt="" src="${it.imageUrl}" onerror="this.style.display='none'; this.parentElement.textContent='No image';"/></div>
      <div class="meta">
        <h3>${it.name}</h3>
        <div class="kv">
          <span class="tag">Element ${it.elementId}</span>
          <span class="tag">Part ${it.designId}</span>
          <span class="tag">${it.color}</span>
        </div>
        <div class="kv">
          <span class="tag">€${it.priceEur.toFixed(2)} each</span>
          <span class="tag">${fmt(it.priceCadBase)} base</span>
          <span class="tag">${fmt(it.priceCadWithShipping)} w/ shipping</span>
          <span class="tag">Step: ${it.qtyStep}</span>
        </div>
        <div class="controls">
          <button data-add="${it.elementId}">+${it.qtyStep}</button>
          <button data-sub="${it.elementId}" class="ghost">-${it.qtyStep}</button>
          <span class="tag">Qty: <span class="qty" id="q_${it.elementId}">0</span></span>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  }

  wrap.addEventListener("click",(e)=>{
    const add=e.target.getAttribute("data-add");
    const sub=e.target.getAttribute("data-sub");
    if(!add && !sub) return;
    const id=add||sub;
    const it=data.items.find(x=>x.elementId===id);
    const step=it.qtyStep;
    const current=getQty(id);
    if(add){
      setQty(id, current+step);
    } else {
      setQty(id, Math.max(0,current-step));
    }
    calc();
  });

  document.getElementById("exportCsv").onclick=()=>{
    const name=document.getElementById("name").value.trim();
    const email=document.getElementById("email").value.trim().toLowerCase();
    const rows=[["timestamp","name","email","elementId","designId","color","qty","priceEur","priceCadBase","lineTotalCadBase"]];
    const ts=new Date().toISOString();
    for(const it of data.items){
      const q=getQty(it.elementId);
      if(!q) continue;
      const line=q*it.priceCadBase;
      rows.push([ts,name,email,it.elementId,it.designId,it.color,q,it.priceEur,it.priceCadBase,line]);
    }
    const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="newfoundlug_bulk_test_order.csv";
    a.click();
  };

  document.getElementById("clearCart").onclick=()=>{ cart={}; calc(); };

  document.getElementById("submitOrder").onclick=()=>{
    const msg=document.getElementById("submitMsg");
    const name=document.getElementById("name").value.trim();
    const email=document.getElementById("email").value.trim().toLowerCase();
    if(!name){ msg.textContent="Please enter your name."; return; }
    if(!email){ msg.textContent="Please enter your email."; return; }
    if(email !== data.meta.testAllowedEmail.toLowerCase()){
      msg.textContent=`TEST MODE: Only ${data.meta.testAllowedEmail} is allowed right now.`;
      return;
    }
    // build receipt
    const ts=new Date().toISOString();
    const items=[];
    let subtotal=0;
    for(const it of data.items){
      const q=getQty(it.elementId);
      if(!q) continue;
      subtotal += q*it.priceCadBase;
      items.push({elementId:it.elementId, designId:it.designId, color:it.color, qty:q, priceEur:it.priceEur, priceCadBase:it.priceCadBase});
    }
    const shipping=subtotal*data.meta.shippingRate;
    const total=subtotal+shipping;

    const receipt={
      timestamp:ts,
      name,email,
      exchangeRateEurToCad:data.meta.exchangeRateEurToCad,
      shippingRate:data.meta.shippingRate,
      paymentEmails:data.meta.paymentEmails,
      spendLimitEur:data.meta.spendLimitEur,
      subtotalCadBase:subtotal,
      shippingCad:shipping,
      totalCad:total,
      items
    };

    (async () => {
  try {
    const resp = await fetch(data.meta.submitEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(receipt)
    });

    const out = await resp.json();

    msg.textContent = out.ok
      ? `Submitted! Rows added: ${out.rowsAdded}`
      : `Error: ${out.error}`;
  } catch (err) {
    msg.textContent = "Submit failed — check script permissions.";
  }
})();

  calc();
}

(async function init(){
  const res=await fetch("catalog.json",{cache:"no-store"});
  data=await res.json();
  render();
})();
