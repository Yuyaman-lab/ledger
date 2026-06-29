// ======================
//  スプラッシュ画面制御
//  Phase 1: ネオン点灯フリッカー
//  Phase 2: 文字が粒子化して全方向にスプラッシュアウト
// ======================
(function(){
  const splash = document.getElementById("splashScreen");
  if (!splash) return;

  var autoClose;

  function dismissSplash() {
    splash.classList.add("splash-fade");
    setTimeout(function(){ splash.style.display = "none"; }, 650);
  }

  var el = function(id){ return document.getElementById(id); };

  // ── Phase 1: ネオン点灯シーケンス ──

  // 0.8s: パチスロ・収支管理 同時にネオンフリッカー開始
  setTimeout(function(){
    ['spNeonHalo','spNeonGlow','spNeonEdge','spNeonText',
     'spSubGlow','spSubEdge','spSubText'].forEach(function(id){
      el(id).classList.add('on');
    });
    el('spDivLine').classList.add('show');
  }, 800);

  // 3.2s: パワーアップ（全体が一瞬強く光る）
  setTimeout(function(){
    ['spNeonHalo','spNeonGlow','spNeonEdge','spNeonText'].forEach(function(id){
      var e = el(id); e.classList.remove('on'); e.classList.add('powerup');
    });
    ['spSubGlow','spSubEdge','spSubText'].forEach(function(id){
      var e = el(id); e.classList.remove('on'); e.classList.add('powerup');
    });
  }, 3200);

  // 4.0s: パーティクル爆発 → スプラッシュアウト
  setTimeout(function(){ startParticleExplosion(dismissSplash); }, 4000);

  // 8s: フォールバック（パーティクルが終わらない場合）
  autoClose = setTimeout(dismissSplash, 8000);

  // 1.5s後からタップスキップ有効
  setTimeout(function(){
    splash.style.cursor = "pointer";
    splash.addEventListener("click", function onTap(){
      clearTimeout(autoClose);
      dismissSplash();
      splash.removeEventListener("click", onTap);
    }, { once: true });
  }, 1500);

  // ── Phase 2: パーティクル爆発 ──
  function startParticleExplosion(onDone) {
    var canvas = document.getElementById('splashCanvas');
    if (!canvas) { onDone(); return; }

    var ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    var W = canvas.width;
    var H = canvas.height;
    var cx = W / 2;
    var cy = H / 2;

    var particles = [];

    // テキストをオフスクリーンキャンバスに描画し、ピクセル位置をサンプリング
    function sampleText(text, fontSize, color, centerY) {
      var off = document.createElement('canvas');
      off.width  = W;
      off.height = H;
      var oc = off.getContext('2d');
      oc.font = '900 ' + fontSize + 'px "Outfit","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif';
      oc.fillStyle = '#fff';
      oc.textAlign    = 'center';
      oc.textBaseline = 'middle';
      oc.fillText(text, cx, centerY);

      var data = oc.getImageData(0, 0, W, H).data;
      var step = 3; // sample every 3px

      for (var y = 0; y < H; y += step) {
        for (var x = 0; x < W; x += step) {
          if (data[(y * W + x) * 4 + 3] > 100) {
            var dx   = x - cx;
            var dy   = y - cy;
            var dist = Math.sqrt(dx * dx + dy * dy) || 1;
            var spd  = 3 + Math.random() * 14;
            particles.push({
              x:     x,   y:     y,
              vx:    (dx / dist) * spd + (Math.random() - 0.5) * 4,
              vy:    (dy / dist) * spd + (Math.random() - 0.5) * 4,
              alpha: 0.9 + Math.random() * 0.1,
              decay: 0.009 + Math.random() * 0.014,
              size:  1.5  + Math.random() * 2.5,
              color: color
            });
          }
        }
      }
    }

    // 画面上の実際の文字位置を取得してサンプリング
    var mainEl = el('spNeonText');
    var subEl  = el('spSubText');
    var mainCY = mainEl ? (mainEl.getBoundingClientRect().top + mainEl.getBoundingClientRect().height / 2) : cy - 50;
    var subCY  = subEl  ? (subEl.getBoundingClientRect().top  + subEl.getBoundingClientRect().height  / 2) : cy + 50;

    sampleText('パチスロ', 78, 'rgba(79,140,255,1)', mainCY);
    sampleText('収支管理', 28, 'rgba(40,209,124,1)', subCY);

    // HTMLテキストを即座に非表示
    var logoWrap = el('spLogoWrap');
    if (logoWrap) logoWrap.style.opacity = '0';

    var startTime = null;
    var maxDuration = 2000; // ms

    function animate(ts) {
      if (!startTime) startTime = ts;
      ctx.clearRect(0, 0, W, H);

      var alive = false;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x  += p.vx;
        p.y  += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.alpha -= p.decay;
        if (p.alpha > 0) {
          alive = true;
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle   = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
        }
      }
      ctx.globalAlpha = 1;

      var elapsed = ts - startTime;
      if (alive && elapsed < maxDuration) {
        requestAnimationFrame(animate);
      } else {
        onDone();
      }
    }

    requestAnimationFrame(animate);
  }
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
  document.querySelectorAll(".bnav-item[data-tab]").forEach(btn=>{
    btn.onclick=()=>{
      const tab=btn.dataset.tab;
      switchToTab(tab);
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
  document.querySelectorAll(".bnav-item[data-tab]").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));
  document.querySelector(`.bnav-item[data-tab="${tab}"]`)?.classList.add("active");
  document.getElementById(`tab-${tab}`)?.classList.remove("hidden");
  if(tab==="summary"){ renderSummary(); requestAnimationFrame(()=>renderYearGraph()); }
}

// ======================
// 集計（ヒーローカード + カルーセル）
// ======================
function renderSummary(){
  const total=entries.length;
  const wins=entries.filter(e=>profitOf(e)>0).length;
  const totalProfit=entries.reduce((a,e)=>a+profitOf(e),0);
  const winRate=total?(wins/total*100):0;
  const totalInv=entries.reduce((a,e)=>a+Number(e.investment||0),0);
  const totalPay=entries.reduce((a,e)=>a+Number(e.payout||0),0);
  const avgInv=total?Math.round(totalInv/total):0;
  const avgPay=total?Math.round(totalPay/total):0;

  const elTotal=$("statTotal");
  if(elTotal){
    elTotal.textContent=fmtYen(totalProfit);
    elTotal.className="hero-amount"+(totalProfit>0?" plus":totalProfit<0?" minus":" zero");
  }

  $("statWinRate").textContent=total?`${winRate.toFixed(1)}%`:"—";
  $("statWinCount").textContent=total?`(${wins}/${total})`:"";

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

  function fmtK(v){
    if(v===0) return "—";
    const k=Math.round(v/1000);
    return k+"K";
  }
  $("statAvgInv").textContent=total?fmtK(avgInv):"—";
  $("statAvgPay").textContent=total?fmtK(avgPay):"—";

  const now=new Date();
  const curKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const prevCumulative=entries.filter(e=>ym(e.date)<curKey).reduce((a,e)=>a+profitOf(e),0);

  const badge=$("statPrevMonth");
  if(badge){
    if(entries.filter(e=>ym(e.date)<curKey).length===0){
      badge.textContent="";
      badge.className="prev-badge";
      badge.style.display="none";
    } else if(prevCumulative===0){
      badge.style.display="";
      badge.textContent="前月比 —";
      badge.className="prev-badge";
    } else if(prevCumulative<0){
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

  // 月平均収支バッジ
  const avgBadge=$("statMonthAvg");
  if(avgBadge){
    const uniqueMonths=new Set(entries.map(e=>ym(e.date)));
    const monthCount=uniqueMonths.size;
    if(monthCount===0){
      avgBadge.textContent="";
      avgBadge.className="month-avg-badge";
      avgBadge.style.display="none";
    } else {
      avgBadge.style.display="";
      const monthlyAvg=Math.round(totalProfit/monthCount);
      const absV=Math.abs(monthlyAvg);
      let valStr;
      if(absV>=10000) valStr=(monthlyAvg>=0?"+":"-")+Math.round(absV/1000)+"K";
      else if(absV>0) valStr=(monthlyAvg>=0?"+":"-")+absV.toLocaleString("ja-JP");
      else valStr="0";
      avgBadge.textContent=`月平均 ${valStr}`;
      if(monthlyAvg>0)      avgBadge.className="month-avg-badge up";
      else if(monthlyAvg<0) avgBadge.className="month-avg-badge down";
      else                  avgBadge.className="month-avg-badge";
    }
  }

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

  const currentKey=curKey;
  const allMonths=[...monthMap.keys()].sort((a,b)=>b.localeCompare(a));
  const orderedMonths=[];
  if(!allMonths.includes(currentKey)) orderedMonths.push(currentKey);
  orderedMonths.push(...allMonths);

  buildCarousel(orderedMonths, monthMap, currentKey);
  renderYearGraph();
  requestAnimationFrame(fitHeroAmount);
}

// 総収支額をカード幅に合わせて自動縮小（桁数が増えてもバッジと収まるように）
// CSS の基準サイズ（メディアクエリ含む）を上限に、はみ出す分だけ縮める。
function fitHeroAmount(){
  const el=$("statTotal");
  if(!el) return;
  const row=el.parentElement;            // .hero-amount-row
  if(!row||!row.clientWidth) return;
  el.style.fontSize="";                  // いったん CSS 基準サイズに戻す
  const base=parseFloat(getComputedStyle(el).fontSize)||58;
  const badges=row.querySelector(".badge-stack");
  let badgeW=0;
  if(badges){
    const anyVisible=[...badges.children].some(c=>getComputedStyle(c).display!=="none");
    if(anyVisible) badgeW=badges.getBoundingClientRect().width;
  }
  const rowStyle=getComputedStyle(row);
  const gap=parseFloat(rowStyle.columnGap||rowStyle.gap)||0;
  const avail=row.clientWidth - badgeW - (badgeW?gap:0);
  if(avail<=0) return;
  const natural=el.scrollWidth;          // 基準サイズでの実テキスト幅
  if(natural>avail){
    const size=Math.max(30, Math.floor(base*avail/natural*100)/100);
    el.style.fontSize=size+"px";
  }
}

// ======================
// カルーセル
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

  months.forEach((monthKey,idx)=>{
    const data=monthMap.get(monthKey);
    const card=document.createElement("div");
    card.className="mc"+(idx===0?" is-active":"");

    if(!data){
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
        </div>`;

      card.onclick=()=>{
        filterY=monthKey.slice(0,4);
        filterM=monthKey;
        switchToTab("ledger");
        renderFilters(); renderLedger();
      };
    }

    track.appendChild(card);
    const dot=document.createElement("span");
    dot.className="c-dot"+(idx===0?" active":"");
    dotsEl.appendChild(dot);
  });

  const dots=dotsEl.querySelectorAll(".c-dot");
  const cards=track.querySelectorAll(".mc");

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

  const fs=Math.min(13,Math.max(8,Math.round(9*cssW/340)));
  const yLabels=[{v:1000000,l:"+1000"},{v:750000,l:"+750"},{v:500000,l:"+500"},{v:250000,l:"+250"},{v:0,l:"0"},{v:-100000,l:"-100"}];

  ctx.font=fs+"px system-ui";
  const maxLabelW=Math.max(...yLabels.map(({l})=>ctx.measureText(l).width));
  const padL=Math.ceil(maxLabelW)+12,padR=8,padT=18,padB=20;
  const gW=cssW-padL-padR, gH=cssH-padT-padB;

  const Y_MIN=-200000, Y_MAX=1050000;
  function toY(v){ return padT+gH*(1-(v-Y_MIN)/(Y_MAX-Y_MIN)); }
  const zeroY=toY(0);
  const colW=gW/12, barW=colW*.42;

  ctx.strokeStyle="rgba(255,255,255,.04)";
  ctx.lineWidth=0.5; ctx.setLineDash([3,4]);
  [250000,500000,750000,1000000,-100000].forEach(v=>{
    ctx.beginPath(); ctx.moveTo(padL,toY(v)); ctx.lineTo(cssW-padR,toY(v)); ctx.stroke();
  });
  ctx.setLineDash([]);

  ctx.strokeStyle="rgba(255,255,255,.18)"; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.moveTo(padL,zeroY); ctx.lineTo(cssW-padR,zeroY); ctx.stroke();

  ctx.fillStyle="rgba(159,176,208,.7)";
  ctx.font=fs+"px system-ui"; ctx.textAlign="right";
  yLabels.forEach(({v,l})=>{
    ctx.fillText(l,padL-4,toY(v)+3.5);
  });

  monthly.forEach((val,i)=>{
    if(val===0) return;
    const cx=padL+colW*i+colW/2, bx=cx-barW/2;
    const isP=val>0;
    const top=isP?toY(val):zeroY;
    const bot=isP?zeroY:toY(val);
    const r=3;

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

    const absV=Math.abs(val);
    let label;
    if(absV>=10000) label=(val>0?"+":"")+Math.round(val/1000)+"K";
    else label=(val>0?"+":"")+val.toLocaleString();
    ctx.fillStyle=isP?"rgba(100,235,175,.85)":"rgba(255,130,130,.8)";
    ctx.font="bold "+Math.max(7,Math.round(8*cssW/340))+"px system-ui";
    ctx.textAlign="center";
    ctx.fillText(label,cx,isP?top-5:bot+Math.max(9,Math.round(10*cssW/340)));
  });

  if(cumulative.length>0){
    ctx.beginPath();
    cumulative.forEach((v,i)=>{
      const cx=padL+colW*i+colW/2;
      i===0?ctx.moveTo(cx,toY(v)):ctx.lineTo(cx,toY(v));
    });
    const lastX=padL+colW*(cumulative.length-1)+colW/2;
    const firstX=padL+colW/2;
    ctx.lineTo(lastX,zeroY); ctx.lineTo(firstX,zeroY); ctx.closePath();
    const areaGrad=ctx.createLinearGradient(0,padT,0,zeroY);
    areaGrad.addColorStop(0,"rgba(0,188,255,0.18)");
    areaGrad.addColorStop(1,"rgba(0,188,255,0.02)");
    ctx.fillStyle=areaGrad; ctx.fill();

    ctx.beginPath(); ctx.strokeStyle="#00bcff"; ctx.lineWidth=2.5;
    ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.shadowColor="#00bcff"; ctx.shadowBlur=12;
    cumulative.forEach((v,i)=>{
      const cx=padL+colW*i+colW/2;
      i===0?ctx.moveTo(cx,toY(v)):ctx.lineTo(cx,toY(v));
    });
    ctx.stroke(); ctx.shadowBlur=0;

    cumulative.forEach((v,i)=>{
      const cx=padL+colW*i+colW/2, cy=toY(v);
      ctx.beginPath(); ctx.arc(cx,cy,2.5,0,Math.PI*2);
      ctx.fillStyle="#00bcff"; ctx.fill();
    });

    const li=cumulative.length-1;
    const dx=padL+colW*li+colW/2, dy=toY(cumulative[li]);
    const rg=ctx.createRadialGradient(dx,dy,0,dx,dy,14);
    rg.addColorStop(0,"rgba(0,188,255,.5)"); rg.addColorStop(1,"rgba(0,188,255,0)");
    ctx.beginPath(); ctx.arc(dx,dy,14,0,Math.PI*2); ctx.fillStyle=rg; ctx.fill();
    ctx.beginPath(); ctx.arc(dx,dy,4.5,0,Math.PI*2);
    ctx.fillStyle="#00bcff"; ctx.shadowColor="#00bcff"; ctx.shadowBlur=14; ctx.fill();
    ctx.shadowBlur=0;
  }

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

  window.addEventListener("resize",()=>{
    if(!$("tab-summary").classList.contains("hidden")){ renderYearGraph(); fitHeroAmount(); }
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
