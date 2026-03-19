// ======================
//  スプラッシュ画面制御
// ======================
(function(){
  const splash = document.getElementById("splashScreen");
  if (!splash) return;

  // スプラッシュを閉じる共通処理
  function dismissSplash() {
    splash.classList.add("splash-fade");
    setTimeout(() => { splash.style.display = "none"; }, 650);
  }

  // アニメーション終了（4秒+暗転1秒）後に自動で閉じる
  const autoClose = setTimeout(dismissSplash, 5200);

  // タップ/クリックでスキップ（暗転完了後1.2秒から有効）
  setTimeout(() => {
    splash.style.cursor = "pointer";
    splash.addEventListener("click", function onTap() {
      clearTimeout(autoClose);
      dismissSplash();
      splash.removeEventListener("click", onTap);
    }, { once: true });
  }, 1200);
})();


// ======================
//  便利関数
// ======================
const $ = (id) => document.getElementById(id);
const fmtYen = (n) => `${(n||0).toLocaleString("ja-JP")}円`;
const toISODate = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
};
const ym   = (iso) => iso.slice(0,7);
const year = (iso) => iso.slice(0,4);
const uid  = () => crypto.randomUUID();

// ======================
// IndexedDB
// ======================
const DB_NAME = "slot_ledger_db";
const STORE   = "entries";
let db;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE,{keyPath:"id"});
      store.createIndex("date","date");
    };
    req.onsuccess = () => { db=req.result; resolve(db); };
    req.onerror   = () => reject(req.error);
  });
}
function tx(mode="readonly"){ return db.transaction(STORE,mode).objectStore(STORE); }
function getAll(){
  return new Promise((r,j)=>{ const q=tx().getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); });
}
function putEntry(e){
  return new Promise((r,j)=>{ const q=tx("readwrite").put(e); q.onsuccess=()=>r(true); q.onerror=()=>j(q.error); });
}
function deleteEntry(id){
  return new Promise((r,j)=>{ const q=tx("readwrite").delete(id); q.onsuccess=()=>r(true); q.onerror=()=>j(q.error); });
}
function wipeAll(){
  return new Promise((r,j)=>{ const q=tx("readwrite").clear(); q.onsuccess=()=>r(true); q.onerror=()=>j(q.error); });
}

// ======================
// ロック（PIN + Passkey）
// ======================
const LS = { lockEnabled:"lock_enabled", pinHash:"pin_hash", pinSalt:"pin_salt", passkeyEnabled:"passkey_enabled" };
const enc = new TextEncoder();

async function sha256(str){
  const buf = await crypto.subtle.digest("SHA-256",enc.encode(str));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function randSalt(){
  const b=new Uint8Array(16); crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function setPIN(pin){
  const salt=randSalt(), hash=await sha256(`${salt}:${pin}`);
  localStorage.setItem(LS.pinSalt,salt); localStorage.setItem(LS.pinHash,hash);
}
function clearPIN(){ localStorage.removeItem(LS.pinSalt); localStorage.removeItem(LS.pinHash); }
async function verifyPIN(pin){
  const salt=localStorage.getItem(LS.pinSalt), hash=localStorage.getItem(LS.pinHash);
  if(!salt||!hash) return false;
  return (await sha256(`${salt}:${pin}`))===hash;
}
function hasPIN(){ return !!localStorage.getItem(LS.pinHash); }

async function setupPasskey(){
  if(!window.PublicKeyCredential) throw new Error("このブラウザはパスキー非対応です。");
  const challenge=crypto.getRandomValues(new Uint8Array(32));
  const userId=crypto.getRandomValues(new Uint8Array(16));
  await navigator.credentials.create({publicKey:{
    challenge, rp:{name:"Slot Ledger"},
    user:{id:userId,name:"user",displayName:"user"},
    pubKeyCredParams:[{type:"public-key",alg:-7}],
    authenticatorSelection:{userVerification:"required"},
    timeout:60000, attestation:"none",
  }});
  localStorage.setItem(LS.passkeyEnabled,"1");
}
async function authPasskey(){
  if(!window.PublicKeyCredential) throw new Error("このブラウザはパスキー非対応です。");
  await navigator.credentials.get({publicKey:{
    challenge:crypto.getRandomValues(new Uint8Array(32)),
    userVerification:"required", timeout:60000,
  }});
  return true;
}
function disablePasskey(){ localStorage.removeItem(LS.passkeyEnabled); }
function passkeyEnabled(){ return localStorage.getItem(LS.passkeyEnabled)==="1"; }

// ======================
// 状態
// ======================
let entries = [];
let editingId = null;
let filterY = "all";
let filterM = "all";

function profitOf(e){ return (Number(e.payout)||0)-(Number(e.investment)||0); }
function applyFilter(list){
  return list.filter(e=>{
    if(filterY!=="all" && year(e.date)!==filterY) return false;
    if(filterM!=="all" && ym(e.date)!==filterM)   return false;
    return true;
  }).sort((a,b)=>(a.date<b.date?1:-1));
}

// ======================
// タブ
// ======================
function setTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const tab=btn.dataset.tab;
      ["ledger","summary","settings"].forEach(t=>{
        $(`tab-${t}`).classList.toggle("hidden",t!==tab);
      });
      if(tab==="summary"){
        renderSummary();
        requestAnimationFrame(()=>renderYearGraph());
      }
    };
  });
}

// ======================
// 明細
// ======================
function renderFilters(){
  const now=new Date();
  const cy=String(now.getFullYear());
  const cm=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const yearsSet=new Set(entries.map(e=>year(e.date))); yearsSet.add(cy);
  const monthsSet=new Set(entries.map(e=>ym(e.date)));  monthsSet.add(cm);
  const years=[...yearsSet].sort().reverse();
  const months=[...monthsSet].sort().reverse();
  const fy=$("filterYear"), fm=$("filterMonth");
  fy.innerHTML=`<option value="all">全ての年</option>`+years.map(y=>`<option value="${y}">${y}年</option>`).join("");
  fm.innerHTML=`<option value="all">全ての月</option>`+months.map(m=>`<option value="${m}">${m}</option>`).join("");
  if(filterY!=="all"&&!yearsSet.has(filterY)) filterY="all";
  if(filterM!=="all"&&!monthsSet.has(filterM)) filterM="all";
  fy.value=filterY; fm.value=filterM;
  fy.onchange=()=>{ filterY=fy.value; renderLedger(); };
  fm.onchange=()=>{ filterM=fm.value; renderLedger(); };
  $("btnClearFilter").onclick=()=>{ filterY="all"; filterM="all"; renderFilters(); renderLedger(); };
}

function renderLedger(){
  const list=$("entryList");
  const filtered=applyFilter(entries);
  list.innerHTML="";
  $("emptyState").classList.toggle("hidden",entries.length!==0);
  for(const e of filtered){
    const p=profitOf(e);
    const li=document.createElement("li");
    li.className="item";
    li.innerHTML=`
      <div class="left">
        <div class="row gap">
          <span class="badge">${e.date.replaceAll("-","/")}</span>
          ${e.memo?`<span class="badge">📝 ${escapeHtml(e.memo)}</span>`:""}
        </div>
        <div class="muted small">投資 ${fmtYen(e.investment)} / 回収 ${fmtYen(e.payout)}</div>
      </div>
      <div class="right" style="text-align:right;">
        <div class="profit ${p>=0?"plus":"minus"}">${fmtYen(p)}</div>
        <div class="row gap" style="justify-content:flex-end;margin-top:6px;">
          <button class="btn" data-act="edit">編集</button>
          <button class="btn danger" data-act="del">削除</button>
        </div>
      </div>`;
    li.querySelector('[data-act="edit"]').onclick=()=>openModal(e);
    li.querySelector('[data-act="del"]').onclick=async()=>{
      if(!confirm("削除しますか？")) return;
      await deleteEntry(e.id); await loadAndRender();
    };
    list.appendChild(li);
  }
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g,m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

// ======================
// モーダル
// ======================
function openModal(entry=null){
  editingId=entry?.id??null;
  $("modalTitle").textContent=editingId?"編集":"追加";
  $("inpDate").value=entry?.date??toISODate(new Date());
  $("inpInv").value=entry?.investment??"";
  $("inpPay").value=entry?.payout??"";
  $("inpMemo").value=entry?.memo??"";
  updateProfitPreview();
  document.body.classList.add("modal-open");
  $("modal").classList.remove("hidden");
  setTimeout(()=>$("inpInv").focus(),300);
}
function closeModal(){ document.body.classList.remove("modal-open"); $("modal").classList.add("hidden"); }
function updateProfitPreview(){
  $("profitPreview").textContent=((Number($("inpPay").value||0))-(Number($("inpInv").value||0))).toLocaleString("ja-JP");
}
async function saveModal(){
  const date=$("inpDate").value;
  const investment=Number($("inpInv").value||0);
  const payout=Number($("inpPay").value||0);
  const memo=$("inpMemo").value.trim();
  if(!date){ alert("日付を選択してください"); return; }
  if(investment<0||payout<0){ alert("投資/回収は0以上で入力してください"); return; }
  await putEntry({id:editingId??uid(),date,investment,payout,memo});
  closeModal(); await loadAndRender();
}

// ======================
// switchToTab
// ======================
function switchToTab(tab){
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));
  document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add("active");
  document.getElementById(`tab-${tab}`)?.classList.remove("hidden");
  if(tab==="summary"){ renderSummary(); requestAnimationFrame(()=>renderYearGraph()); }
}

// ======================
// 集計（ヒーローカード + カルーセル）
// ======================
function renderSummary(){
  // 全体集計
  const total=entries.length;
  const wins=entries.filter(e=>profitOf(e)>0).length;
  const totalProfit=entries.reduce((a,e)=>a+profitOf(e),0);
  const winRate=total?(wins/total*100):0;
  const totalInv=entries.reduce((a,e)=>a+Number(e.investment||0),0);
  const totalPay=entries.reduce((a,e)=>a+Number(e.payout||0),0);
  const avgInv=total?Math.round(totalInv/total):0;
  const avgPay=total?Math.round(totalPay/total):0;

  // ── ヒーローカード 総収支 ──
  const elTotal=$("statTotal");
  if(elTotal){
    elTotal.textContent=fmtYen(totalProfit);
    elTotal.className="hero-amount"+(totalProfit>0?" plus":totalProfit<0?" minus":" zero");
  }

  // ── 勝率 ──
  $("statWinRate").textContent=total?`${winRate.toFixed(1)}%`:"—";
  $("statWinCount").textContent=total?`(${wins}/${total})`:"";

  // ── 回収率 ──
  const elRecovery=$("statRecovery");
  if(elRecovery){
    if(total&&totalInv>0){
      const recovery=Math.round(totalPay/totalInv*100);
      elRecovery.textContent=`${recovery}%`;
      elRecovery.style.color=recovery>=100?"var(--ok)":"var(--ng)";
    } else {
      elRecovery.textContent="—";
      elRecovery.style.color="";
    }
  }

  // ── 平均投資・平均回収（K表示）──
  function fmtK(v){
    if(v===0) return "—";
    const k=Math.round(v/1000);
    return k+"K";
  }
  $("statAvgInv").textContent=total?fmtK(avgInv):"—";
  $("statAvgPay").textContent=total?fmtK(avgPay):"—";

  // ── 前月比バッジ（総収支 ÷ 前月末までの総収支 × 100）──
  const now=new Date();
  const curKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  // 前月末までの総収支 ＝ 今月以外の全エントリの収支合計
  const prevCumulative=entries.filter(e=>ym(e.date)<curKey).reduce((a,e)=>a+profitOf(e),0);

  const badge=$("statPrevMonth");
  if(badge){
    // 前月末までにデータがなければ非表示
    if(entries.filter(e=>ym(e.date)<curKey).length===0){
      badge.textContent="";
      badge.className="prev-badge";
      badge.style.display="none";
    } else if(prevCumulative===0){
      // 前月末までの総収支が±0の場合は計算不能
      badge.style.display="";
      badge.textContent="前月比 —";
      badge.className="prev-badge";
    } else if(prevCumulative<0){
      // 前月末までの総収支がマイナスの場合は比率が意味をなさないため
      // 改善/悪化の方向だけ表示
      badge.style.display="";
      if(totalProfit>=prevCumulative){
        badge.textContent="↑ 前月比 改善";
        badge.className="prev-badge up";
      } else {
        badge.textContent="↓ 前月比 悪化";
        badge.className="prev-badge down";
      }
    } else {
      badge.style.display="";
      // totalProfit（現在の総収支）÷ prevCumulative（前月末までの総収支）× 100
      const pct=Math.round(totalProfit/prevCumulative*100);
      if(pct>=100){
        badge.textContent=`↑ 前月比 ${pct}%`;
        badge.className="prev-badge up";
      } else {
        badge.textContent=`↓ 前月比 ${pct}%`;
        badge.className="prev-badge down";
      }
    }
  }

  // 月別集計マップ
  const monthMap=new Map();
  for(const e of entries){
    const key=ym(e.date);
    const cur=monthMap.get(key)||{investment:0,payout:0,profit:0,count:0,wins:0};
    cur.investment+=Number(e.investment||0);
    cur.payout+=Number(e.payout||0);
    const p=profitOf(e);
    cur.profit+=p; cur.count+=1; if(p>0) cur.wins+=1;
    monthMap.set(key,cur);
  }

  // 今月キー
  const currentKey=curKey;

  // 降順ソート（今月が先頭）
  const allMonths=[...monthMap.keys()].sort((a,b)=>b.localeCompare(a));
  // 今月を先頭に（データ未入力でも先頭に表示）
  const orderedMonths=[];
  if(!allMonths.includes(currentKey)) orderedMonths.push(currentKey); // 今月データなし
  orderedMonths.push(...allMonths);

  // カルーセル構築
  buildCarousel(orderedMonths, monthMap, currentKey);

  // グラフ
  renderYearGraph();
}

// ======================
// ▼▼▼ カルーセル構築 ▼▼▼
// ======================
function buildCarousel(months, monthMap, currentKey){
  const track=$("monthCarousel");
  const dotsEl=$("carouselDots");
  if(!track||!dotsEl) return;

  track.innerHTML="";
  dotsEl.innerHTML="";

  if(months.length===0){
    track.innerHTML=`<div style="color:var(--muted);padding:12px;font-size:13px;">データがありません。</div>`;
    return;
  }

  // カード生成
  months.forEach((monthKey,idx)=>{
    const data=monthMap.get(monthKey);
    const card=document.createElement("div");
    card.className="mc"+(idx===0?" is-active":"");

    if(!data){
      // 今月データなし
      card.innerHTML=`
        <div class="mc-top">
          <span class="mc-month">${monthKey.replace("-","/")}</span>
          <span class="mc-profit muted" style="font-size:14px;">データなし</span>
        </div>
        <div class="mc-detail">まだ今月のデータはありません。<br>「＋追加」から入力してください。</div>`;
    } else {
      const p=data.profit;
      const wr=data.count?(data.wins/data.count*100):0;
      const cls=p>=0?"plus":"minus";
      const sign=p>=0?"+":"";
      card.innerHTML=`
        <div class="mc-top">
          <span class="mc-month">${monthKey.replace("-","/")}</span>
          <span class="mc-profit ${cls}">${sign}${p.toLocaleString("ja-JP")}円</span>
        </div>
        <div class="mc-detail">
          投資 ${fmtYen(data.investment)} / 回収 ${fmtYen(data.payout)}<br>
          回数 ${data.count} / 勝率 ${wr.toFixed(1)}%
        </div>
`;

      // クリックで明細タブへ
      card.onclick=()=>{
        filterY=monthKey.slice(0,4);
        filterM=monthKey;
        document.querySelector('.tab[data-tab="ledger"]')?.click();
        renderFilters(); renderLedger();
      };
    }

    track.appendChild(card);

    // ドット
    const dot=document.createElement("span");
    dot.className="c-dot"+(idx===0?" active":"");
    dotsEl.appendChild(dot);
  });

  // ── スクロールでドット更新 ──────────────────────
  const dots=dotsEl.querySelectorAll(".c-dot");
  const cards=track.querySelectorAll(".mc");

  // IntersectionObserver でアクティブカードを検出
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting&&entry.intersectionRatio>=0.5){
        const idx=[...cards].indexOf(entry.target);
        if(idx<0) return;
        dots.forEach((d,i)=>d.classList.toggle("active",i===idx));
        cards.forEach((c,i)=>c.classList.toggle("is-active",i===idx));
      }
    });
  },{root:track, threshold:0.5});

  cards.forEach(c=>observer.observe(c));
}
// ======================
// ▲▲▲ カルーセルここまで ▲▲▲
// ======================

// ======================
// 年間収支グラフ（Canvas）
// ======================
function renderYearGraph(){
  const canvas=document.getElementById("yearCanvas");
  if(!canvas) return;
  const rect=canvas.getBoundingClientRect();
  const cssW=rect.width, cssH=rect.height;
  if(cssW<=0||cssH<=0) return;

  const dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(cssW*dpr);
  canvas.height=Math.round(cssH*dpr);
  const ctx=canvas.getContext("2d");
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,cssW,cssH);

  const now=new Date();
  const currentYear=now.getFullYear();
  const currentMonth=now.getMonth();

  const monthly=new Array(12).fill(0);
  entries.forEach(e=>{
    const d=new Date(e.date);
    if(d.getFullYear()===currentYear){
      monthly[d.getMonth()]+=(Number(e.payout)||0)-(Number(e.investment)||0);
    }
  });

  const cumulative=[];
  let cum=0;
  for(let i=0;i<=currentMonth;i++){ cum+=monthly[i]; cumulative.push(cum); }

  const fs=Math.max(8,Math.round(9*cssW/340));
  const padL=40,padR=8,padT=18,padB=20;
  const gW=cssW-padL-padR, gH=cssH-padT-padB;

  // 固定Y軸レンジ（単位：千円 -50〜+100）
  const Y_MIN=-70000, Y_MAX=130000;
  function toY(v){ return padT+gH*(1-(v-Y_MIN)/(Y_MAX-Y_MIN)); }
  const zeroY=toY(0);
  const colW=gW/12, barW=colW*.42;

  // グリッド線
  ctx.strokeStyle="rgba(255,255,255,.04)";
  ctx.lineWidth=0.5; ctx.setLineDash([3,4]);
  [50000,100000,-50000].forEach(v=>{
    ctx.beginPath(); ctx.moveTo(padL,toY(v)); ctx.lineTo(cssW-padR,toY(v)); ctx.stroke();
  });
  ctx.setLineDash([]);

  // ゼロライン
  ctx.strokeStyle="rgba(255,255,255,.18)"; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.moveTo(padL,zeroY); ctx.lineTo(cssW-padR,zeroY); ctx.stroke();

  // Y軸ラベル
  ctx.fillStyle="rgba(159,176,208,.7)";
  ctx.font=fs+"px system-ui"; ctx.textAlign="right";
  [{v:100000,l:"+100"},{v:50000,l:"+50"},{v:0,l:"0"},{v:-50000,l:"-50"}].forEach(({v,l})=>{
    ctx.fillText(l,padL-4,toY(v)+3.5);
  });

  // ── 棒グラフ（ネオングラデーション＋値ラベル）──
  monthly.forEach((val,i)=>{
    if(val===0) return;
    const cx=padL+colW*i+colW/2, bx=cx-barW/2;
    const isP=val>0;
    const top=isP?toY(val):zeroY;
    const bot=isP?zeroY:toY(val);
    const r=3;

    // グラデーション塗り
    const grad=ctx.createLinearGradient(0,top,0,bot);
    if(isP){
      grad.addColorStop(0,"rgba(0,230,160,0.95)");
      grad.addColorStop(1,"rgba(0,180,120,0.25)");
    } else {
      grad.addColorStop(0,"rgba(255,80,80,0.25)");
      grad.addColorStop(1,"rgba(255,60,60,0.95)");
    }
    ctx.fillStyle=grad;
    ctx.shadowColor=isP?"#00e6a0":"#ff5050";
    ctx.shadowBlur=10;

    ctx.beginPath();
    if(isP){
      ctx.moveTo(bx+r,top); ctx.lineTo(bx+barW-r,top);
      ctx.quadraticCurveTo(bx+barW,top,bx+barW,top+r);
      ctx.lineTo(bx+barW,bot); ctx.lineTo(bx,bot); ctx.lineTo(bx,top+r);
      ctx.quadraticCurveTo(bx,top,bx+r,top);
    } else {
      ctx.moveTo(bx,top); ctx.lineTo(bx+barW,top);
      ctx.lineTo(bx+barW,bot-r); ctx.quadraticCurveTo(bx+barW,bot,bx+barW-r,bot);
      ctx.lineTo(bx+r,bot); ctx.quadraticCurveTo(bx,bot,bx,bot-r);
      ctx.lineTo(bx,top);
    }
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur=0;

    // 値ラベル
    const absV=Math.abs(val);
    let label;
    if(absV>=10000) label=(val>0?"+":"")+Math.round(val/1000)+"K";
    else label=(val>0?"+":"")+val.toLocaleString();
    ctx.fillStyle=isP?"rgba(100,235,175,.85)":"rgba(255,130,130,.8)";
    ctx.font="bold "+Math.max(7,Math.round(8*cssW/340))+"px system-ui";
    ctx.textAlign="center";
    ctx.fillText(label,cx,isP?top-5:bot+Math.max(9,Math.round(10*cssW/340)));
  });

  // ── 累計エリアフィル ──
  if(cumulative.length>0){
    const cumMax=Math.max(...cumulative.map(Math.abs),1);
    const CUM_MIN=-cumMax*1.35, CUM_MAX=cumMax*1.35;
    function toCumY(v){ return padT+gH*(1-(v-CUM_MIN)/(CUM_MAX-CUM_MIN)); }

    // エリア
    ctx.beginPath();
    cumulative.forEach((v,i)=>{
      const cx=padL+colW*i+colW/2;
      i===0?ctx.moveTo(cx,toCumY(v)):ctx.lineTo(cx,toCumY(v));
    });
    const lastX=padL+colW*(cumulative.length-1)+colW/2;
    const firstX=padL+colW/2;
    ctx.lineTo(lastX,toCumY(0)); ctx.lineTo(firstX,toCumY(0)); ctx.closePath();
    const areaGrad=ctx.createLinearGradient(0,padT,0,cssH-padB);
    areaGrad.addColorStop(0,"rgba(0,188,255,0.16)");
    areaGrad.addColorStop(1,"rgba(0,188,255,0.01)");
    ctx.fillStyle=areaGrad; ctx.fill();

    // ライン（グロー）
    ctx.beginPath(); ctx.strokeStyle="#00bcff"; ctx.lineWidth=2.5;
    ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.shadowColor="#00bcff"; ctx.shadowBlur=12;
    cumulative.forEach((v,i)=>{
      const cx=padL+colW*i+colW/2;
      i===0?ctx.moveTo(cx,toCumY(v)):ctx.lineTo(cx,toCumY(v));
    });
    ctx.stroke(); ctx.shadowBlur=0;

    // ドット
    cumulative.forEach((v,i)=>{
      const cx=padL+colW*i+colW/2, cy=toCumY(v);
      ctx.beginPath(); ctx.arc(cx,cy,2.5,0,Math.PI*2);
      ctx.fillStyle="#00bcff"; ctx.fill();
    });

    // 最終ドット（グロー）
    const li=cumulative.length-1;
    const dx=padL+colW*li+colW/2, dy=toCumY(cumulative[li]);
    const rg=ctx.createRadialGradient(dx,dy,0,dx,dy,14);
    rg.addColorStop(0,"rgba(0,188,255,.5)"); rg.addColorStop(1,"rgba(0,188,255,0)");
    ctx.beginPath(); ctx.arc(dx,dy,14,0,Math.PI*2); ctx.fillStyle=rg; ctx.fill();
    ctx.beginPath(); ctx.arc(dx,dy,4.5,0,Math.PI*2);
    ctx.fillStyle="#00bcff"; ctx.shadowColor="#00bcff"; ctx.shadowBlur=14; ctx.fill();
    ctx.shadowBlur=0;
  }

  // X軸ラベル
  ctx.fillStyle="rgba(159,176,208,.6)";
  ctx.font=fs+"px system-ui"; ctx.textAlign="center";
  for(let i=0;i<12;i++){
    ctx.fillText(String(i+1),padL+colW*i+colW/2,cssH-4);
  }
}

// ======================
// CSV / バックアップ
// ======================
function exportCSV(){
  const rows=[["日付","投資","回収","収支","メモ"]];
  for(const e of applyFilter(entries).slice().reverse())
    rows.push([e.date,e.investment,e.payout,profitOf(e),e.memo||""]);
  const csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const file=new File([blob],"slot_ledger.csv",{type:"text/csv"});
  if(navigator.share){ navigator.share({files:[file],title:"パチスロ収支表CSV"}).catch(()=>{}); return; }
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="slot_ledger.csv"; a.click();
  URL.revokeObjectURL(url);
}
function backupJSON(){
  const blob=new Blob([JSON.stringify(entries,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="slot_ledger_backup.json"; a.click();
  URL.revokeObjectURL(url);
}
async function restoreJSON(file){
  const data=JSON.parse(await file.text());
  if(!Array.isArray(data)) throw new Error("形式が違います");
  for(const e of data){
    if(!e.id) e.id=uid(); if(!e.date) continue;
    e.investment=Number(e.investment||0); e.payout=Number(e.payout||0); e.memo=String(e.memo||"");
    await putEntry(e);
  }
  await loadAndRender();
}

// ======================
// ロックUI
// ======================
function showLock(show){ $("lockScreen").classList.toggle("hidden",!show); }
function lockEnabled(){ return localStorage.getItem(LS.lockEnabled)==="1"; }

async function tryUnlockPasskey(){
  try{
    if(!passkeyEnabled()) throw new Error("パスキーが未設定です。設定から登録してください。");
    await authPasskey(); showLock(false); $("lockMsg").textContent="";
  }catch(e){ $("lockMsg").textContent=`解除できません：${e.message||e}`; }
}
function openPINUI(){ $("pinArea").classList.remove("hidden"); $("pinInput").value=""; $("pinInput").focus(); }
function closePINUI(){ $("pinArea").classList.add("hidden"); }
async function tryUnlockPIN(){
  const pin=$("pinInput").value.trim();
  if(pin.length<4){ $("lockMsg").textContent="PINは4桁以上"; return; }
  if(await verifyPIN(pin)){ showLock(false); $("lockMsg").textContent=""; closePINUI(); }
  else $("lockMsg").textContent="PINが違います";
}

// ======================
// 初期化
// ======================
async function loadAndRender(){
  entries=await getAll();
  renderFilters(); renderLedger(); renderSummary();
}

function bindUI(){
  setTabs();
  $("btnAdd").onclick=()=>openModal(null);
  $("btnExport").onclick=exportCSV;
  $("btnCancel").onclick=closeModal;
  $("btnSave").onclick=saveModal;
  $("inpInv").oninput=updateProfitPreview;
  $("inpPay").oninput=updateProfitPreview;

  $("btnUnlockPasskey").onclick=tryUnlockPasskey;
  $("btnUnlockPIN").onclick=()=>{ openPINUI(); $("lockMsg").textContent=""; };
  $("btnPinOk").onclick=tryUnlockPIN;
  $("btnPinCancel").onclick=()=>{ closePINUI(); $("lockMsg").textContent=""; };

  $("toggleLock").checked=lockEnabled();
  $("toggleLock").onchange=(e)=>{
    localStorage.setItem(LS.lockEnabled,e.target.checked?"1":"0");
    showLock(e.target.checked);
  };
  $("btnSetupPasskey").onclick=async()=>{
    try{ await setupPasskey(); alert("Face ID（パスキー）を設定しました。"); }
    catch(e){ alert(`設定できません：${e.message||e}\n\n※ httpsで開いていないと動きません`); }
  };
  $("btnDisablePasskey").onclick=()=>{ disablePasskey(); alert("パスキーを解除しました。"); };
  $("btnSetPIN").onclick=async()=>{
    const pin=prompt("PINを4〜8桁で設定してください");
    if(!pin) return;
    if(!/^\d{4,8}$/.test(pin)){ alert("4〜8桁の数字だけで入力してください"); return; }
    await setPIN(pin); alert("PINを設定しました。");
  };
  $("btnClearPIN").onclick=()=>{ clearPIN(); alert("PINを解除しました。"); };
  $("btnBackup").onclick=backupJSON;
  $("fileRestore").onchange=async(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    try{ await restoreJSON(file); alert("復元しました。"); }
    catch(err){ alert(`復元失敗：${err.message||err}`); }
    finally{ e.target.value=""; }
  };
  $("btnWipe").onclick=async()=>{
    if(!confirm("全データを削除します。よろしいですか？")) return;
    await wipeAll(); await loadAndRender();
  };

  // リサイズでCanvas再描画
  window.addEventListener("resize",()=>{
    if(!$("tab-summary").classList.contains("hidden")) renderYearGraph();
  },{passive:true});
}

// iOS Safari ピンチズーム抑止
document.addEventListener("gesturestart",e=>e.preventDefault(),{passive:false});
document.addEventListener("gesturechange",e=>e.preventDefault(),{passive:false});
document.addEventListener("gestureend",e=>e.preventDefault(),{passive:false});

async function main(){
  await openDB();
  bindUI();
  await loadAndRender();

  const now=new Date();
  filterY=String(now.getFullYear());
  filterM=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  renderFilters(); renderLedger();

  switchToTab("summary");

  if(lockEnabled()){
    showLock(true);
    if(!passkeyEnabled()&&!hasPIN())
      $("lockMsg").textContent="解除手段が未設定です。設定タブでPINかパスキーを設定してください。";
  }

  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
main();
