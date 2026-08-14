// ==========================================================
//  スプラッシュ画面制御
//
//  暗転した画面の中央から光の柱が両側へ広がって立ち上がり、
//  走査線が一度通過したあと、柱がタイトルの字形へ収束して固まる。
//  ハイライトが一度走って文字が確定し、最後に光が抜けて消える。
//
//  Phase 1  点火   0.00s  中央から外側へ光の柱が点いていく
//  Phase 2  走査   0.65s  走査線が上から下へ通過し、光が少しずつ強まる
//  Phase 3  収束   1.40s  柱が縦に圧縮され、タイトルの字形に収まる
//  Phase 4  確定   2.20s  DOM のテキストへ引き渡し、ハイライトが走る
//  Phase 5  退場   3.15s  ワードマークが滲んで引き、暗転してアプリへ
// ==========================================================
(function(){
  var splash = document.getElementById("splashScreen");
  if (!splash) return;

  var el      = function(id){ return document.getElementById(id); };
  var stage   = el("splashStage");
  var flashEl = el("splashFlash");
  var titleEl = el("spTitle");
  var ruleEl  = el("spRule");
  var subEl   = el("spSub");

  var TITLE = "パチスロ";

  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var timers = [];
  var done   = false;

  function at(ms, fn){ timers.push(setTimeout(fn, ms)); }
  function clearAll(){ for (var i=0;i<timers.length;i++) clearTimeout(timers[i]); timers = []; }

  function dismissSplash(){
    if (done) return;
    done = true;
    clearAll();
    fx.stop();
    splash.classList.add("splash-fade");
    setTimeout(function(){ splash.style.display = "none"; }, 560);
  }

  function cls(node, name){ if (node) node.classList.add(name); }

  var fx = createStage(stage, TITLE, titleEl);

  // 0.5s 以降はタップでスキップ
  at(500, function(){
    splash.style.cursor = "pointer";
    splash.addEventListener("click", dismissSplash, { once: true });
  });

  // ── 動きを減らす設定：演出なしで静かに見せる ──
  if (reduced) {
    cls(titleEl, "lit");
    cls(ruleEl, "show");
    cls(subEl, "show");
    at(1500, dismissSplash);
    return;
  }

  // フォントが載ってから始める。載らなくても 700ms で見切る。
  waitForFont(700).then(runTimeline);

  function runTimeline(){
    if (done) return;
    fx.start();

    // 0.00s  点火：中央から外側へ光の柱が点いていく
    fx.to("ignite", 1, 720, 0, "outCubic");
    fx.to("storm",  1, 600, 0, "outCubic");

    // 0.65s  走査線が上から下へ抜け、光が強まりはじめる
    at(650, function(){
      fx.scan(760);
      fx.to("lift", .3, 900, 0, "inOutCubic");
    });

    // 1.40s  収束：柱が縦に圧縮され、字形に収まる
    at(1400, function(){
      fx.buildMask();
      fx.to("q",     1,  820, 0,   "inOutCubic");
      fx.to("storm", .3, 820, 0,   "inOutCubic");
      fx.to("lift",  .85, 700, 120, "inOutCubic");
    });

    // 2.20s  確定：DOM のテキストへ引き渡し、ハイライトが一度走る
    at(2200, function(){
      cls(flashEl, "f-lock");
      cls(titleEl, "lit");
      fx.to("maskAlpha", 0, 320, 90, "outCubic");
      fx.to("freeAlpha", 0, 320, 0,  "outCubic");
    });
    at(2360, function(){ cls(ruleEl, "show"); });
    at(2520, function(){ cls(subEl,  "show"); });

    // 3.15s  退場：ワードマークが一度滲んでから引き、暗転する
    at(3150, function(){
      flashEl.classList.remove("f-lock");
      void flashEl.offsetWidth;
      cls(flashEl, "f-out");
      titleEl.classList.add("out");
      ruleEl.classList.add("out");
      subEl.classList.add("out");

    });

    at(3700, dismissSplash);

    // 保険：何かで演出が止まっても必ず閉じる
    at(7000, dismissSplash);
  }

  // 必要な8文字だけのサブセットなので、通常は数十msで載る
  function waitForFont(capMs){
    var cap = new Promise(function(res){ setTimeout(res, capMs); });
    if (!document.fonts || !document.fonts.load) return cap;
    var cs = window.getComputedStyle(titleEl);
    var load = document.fonts
      .load('900 ' + parseFloat(cs.fontSize) + 'px "Noto Sans JP"', TITLE + "収支管理")
      .catch(function(){});
    return Promise.race([load, cap]);
  }

  // ==========================================================
  //  光の柱・走査線・字形マスクの描画
  // ==========================================================
  function createStage(canvas, title, titleNode){
    var noop = function(){};
    var stub = { start:noop, stop:noop, to:noop, scan:noop, buildMask:noop };
    if (!canvas) return stub;

    var ctx = canvas.getContext("2d");
    if (!ctx) return stub;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, cx = 0, cy = 0;

    // barsBuf: 柱そのもの / maskBuf: 字形 / cutBuf: 字形で抜いた柱
    var barsBuf = document.createElement("canvas"), bctx = barsBuf.getContext("2d");
    var maskBuf = document.createElement("canvas"), kctx = maskBuf.getContext("2d");
    var cutBuf  = document.createElement("canvas"), cutx = cutBuf.getContext("2d");

    var bars = [], maskReady = false;
    var band = { top: 0, h: 0 };

    var S = {
      ignite: 0,      // 柱の点灯 0..1
      storm: 0,       // 流れる速さの倍率
      lift: 0,        // 階調の明るい側への寄せ 0..1
      q: 0,           // 字形への収束 0..1
      freeAlpha: 1,   // 自由に流れる柱の不透明度
      maskAlpha: 1,   // 字形に収まった柱の不透明度
      scanAt: -1,     // 走査線の位置 0..1（負なら非表示）
      scanDur: 0
    };

    var tweens = [], running = false, rafId = 0, last = 0, scanT = -1;

    var EASE = {
      linear:    function(t){ return t; },
      outCubic:  function(t){ return 1 - Math.pow(1 - t, 3); },
      inCubic:   function(t){ return t * t * t; },
      inOutCubic:function(t){ return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
    };

    function resize(){
      W = window.innerWidth; H = window.innerHeight;
      cx = W / 2; cy = H / 2;
      var dw = Math.round(W * dpr), dh = Math.round(H * dpr);
      var all = [canvas, barsBuf, maskBuf, cutBuf];
      for (var i = 0; i < all.length; i++){ all[i].width = dw; all[i].height = dh; }
      buildBars();
      measureBand();
      maskReady = false;
    }

    // タイトルの行が占める帯。収束時はここへ柱を圧縮する。
    function measureBand(){
      var r = titleNode.getBoundingClientRect();
      band.top = r.top;
      band.h   = r.height;
      if (!band.h){ band.top = cy - H * 0.08; band.h = H * 0.16; }
    }

    function buildBars(){
      bars = [];
      var x = 0;
      while (x < W){
        // 細い柱を多めにするため、乱数を二乗して幅を偏らせる
        var w = 2 + Math.random() * Math.random() * 24;
        var lum = Math.random();
        bars.push({
          x: x, w: w, lum: lum,
          y: -H * Math.random() * 1.4,
          h: H * (0.22 + Math.random() * 0.95),
          v: 5 + Math.random() * 26,
          hot: Math.random() < 0.07,
          // 中央から外側へ順に点灯させる
          delay: Math.abs(x + w / 2 - cx) / (W / 2 || 1) * 0.55 + Math.random() * 0.22
        });
        x += w + (Math.random() < 0.28 ? 1 + Math.random() * 7 : 0);
      }
    }

    // 色はすべてアプリ本体のトークンから取る。
    //   暗端 #141c4d（トップバーの紺） → 中 #4f8cff（--primary） → 明端 #e7eefc（--text）
    // lift は色相を変えず、この階調の明るい側へ寄せるだけ。収束するほど輝く。
    function barColor(lum, a){
      var base, peak;
      if (lum < 0.5){
        var u = lum / 0.5;
        base = [20 + 59*u,  28 + 112*u,  77 + 178*u];
        peak = [46 + 84*u,  70 + 110*u, 150 + 105*u];
      } else {
        var v = (lum - 0.5) / 0.5;
        base = [ 79 +  91*v, 140 +  65*v, 255];
        peak = [130 + 101*v, 180 +  58*v, 255];
      }
      var m = S.lift;
      return "rgba(" +
        Math.round(base[0] + (peak[0] - base[0]) * m) + "," +
        Math.round(base[1] + (peak[1] - base[1]) * m) + "," +
        Math.round(base[2] + (peak[2] - base[2]) * m) + "," + a + ")";
    }

    function step(k, dtMs){
      // トゥイーン
      for (var i = tweens.length - 1; i >= 0; i--){
        var t = tweens[i];
        if (t.delay > 0){ t.delay -= dtMs; continue; }
        if (t.from === null) t.from = S[t.p];
        t.t += dtMs;
        var u = t.d > 0 ? Math.min(1, t.t / t.d) : 1;
        S[t.p] = t.from + (t.to - t.from) * t.e(u);
        if (u >= 1) tweens.splice(i, 1);
      }

      // 走査線
      if (scanT >= 0){
        scanT += dtMs;
        S.scanAt = scanT / S.scanDur;
        if (S.scanAt > 1.15){ scanT = -1; S.scanAt = -1; }
      }

      // 柱の流れ
      for (var j = 0; j < bars.length; j++){
        var b = bars[j];
        b.y += b.v * S.storm * k;
        if (b.y > H + 60) b.y = -b.h - Math.random() * H * 0.6;
      }
    }

    function drawBars(){
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, W, H);

      for (var i = 0; i < bars.length; i++){
        var b = bars[i];
        var on = (S.ignite - b.delay) / 0.26;
        if (on <= 0) continue;
        if (on > 1) on = 1;

        var a = (0.30 + b.lum * 0.66) * on;
        bctx.fillStyle = b.hot ? "rgba(231,238,252," + (a * 0.95) + ")" : barColor(b.lum, a);
        bctx.fillRect(b.x, b.y, b.w, b.h);

        // 太い柱には明るい芯を入れて奥行きを出す
        if (b.w > 9 && !b.hot){
          bctx.fillStyle = barColor(Math.min(1, b.lum + 0.35), a * 0.5);
          bctx.fillRect(b.x + b.w * 0.34, b.y, b.w * 0.32, b.h);
        }
      }

      // 上下の端をなじませる
      bctx.globalCompositeOperation = "destination-out";
      var g = bctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0,    "rgba(0,0,0,1)");
      g.addColorStop(0.17, "rgba(0,0,0,0)");
      g.addColorStop(0.83, "rgba(0,0,0,0)");
      g.addColorStop(1,    "rgba(0,0,0,1)");
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, W, H);
      bctx.globalCompositeOperation = "source-over";
    }

    // DOM のタイトルと1pxもずれないよう、実測幅に合わせて字形を描く
    function paintTitle(c, color){
      var cs = window.getComputedStyle(titleNode);
      var size = parseFloat(cs.fontSize) || 64;
      var r = titleNode.getBoundingClientRect();
      c.save();
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.font = '900 ' + size + 'px ' + cs.fontFamily;
      c.textAlign = "left";
      var m = c.measureText(title);
      var sx = (m.width > 0 && r.width > 0) ? r.width / m.width : 1;

      // CSS の行ボックス（line-height:1）と同じ位置にベースラインを置く。
      // 'middle' 任せだと数px ずれ、DOM のテキストへ渡す一瞬に縁がはみ出す。
      var asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
      var baseY;
      if (asc != null && desc != null){
        c.textBaseline = "alphabetic";
        baseY = (r.height - (asc + desc)) / 2 + asc;
      } else {
        c.textBaseline = "middle";
        baseY = r.height / 2;
      }
      c.translate(r.left, r.top + baseY);
      c.scale(sx, 1);
      c.fillStyle = color;
      c.fillText(title, 0, 0);
      c.restore();
    }

    function draw(){
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawBars();

      // 自由に流れる柱。収束が進むほど、タイトルの帯へ縦に切り詰めていく。
      if (S.freeAlpha > 0.005 && S.q < 0.999){
        var pad = (1 - S.q) * H;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        ctx.rect(0, band.top - pad, W, band.h + pad * 2);
        ctx.clip();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = S.freeAlpha * (1 - S.q * 0.72);
        ctx.drawImage(barsBuf, 0, 0);
        ctx.restore();
      }

      // 字形に収まった柱
      if (maskReady && S.q > 0.005 && S.maskAlpha > 0.005){
        cutx.setTransform(1, 0, 0, 1, 0, 0);
        cutx.globalCompositeOperation = "source-over";
        cutx.clearRect(0, 0, cutBuf.width, cutBuf.height);
        cutx.drawImage(barsBuf, 0, 0);
        cutx.globalCompositeOperation = "destination-in";
        cutx.drawImage(maskBuf, 0, 0);
        cutx.globalCompositeOperation = "source-over";

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = S.q * S.maskAlpha;
        ctx.drawImage(cutBuf, 0, 0);
      }

      // 走査線
      if (S.scanAt >= 0 && S.scanAt <= 1.1){
        var y = (-0.1 + S.scanAt * 1.2) * H;
        var hh = Math.max(2, H * 0.006);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;
        var sg = ctx.createLinearGradient(0, y - H * 0.09, 0, y + hh + H * 0.02);
        sg.addColorStop(0,   "rgba(79,140,255,0)");
        sg.addColorStop(0.8, "rgba(170,205,255,.30)");
        sg.addColorStop(1,   "rgba(231,238,252,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(0, y - H * 0.09, W, H * 0.11 + hh);
        ctx.fillStyle = "rgba(231,238,252,.9)";
        ctx.fillRect(0, y, W, hh);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }

    function loop(ts){
      if (!running) return;
      var dt = last ? Math.min(50, ts - last) : 16.67;
      last = ts;
      step(dt / 16.67, dt);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener("resize", resize);

    return {
      start: function(){
        if (running) return;
        running = true; last = 0;
        measureBand();
        rafId = requestAnimationFrame(loop);
      },
      stop: function(){
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
      to: function(prop, to, dur, delay, ease){
        tweens.push({ p: prop, from: null, to: to, d: dur, delay: delay || 0, t: 0, e: EASE[ease] || EASE.outCubic });
      },
      scan: function(dur){ S.scanDur = dur; scanT = 0; S.scanAt = 0; },
      buildMask: function(){
        measureBand();
        kctx.setTransform(1, 0, 0, 1, 0, 0);
        kctx.clearRect(0, 0, maskBuf.width, maskBuf.height);
        paintTitle(kctx, "#fff");
        maskReady = true;
      }
    };
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
  fy.innerHTML=`<option value="all">全ての年</option>`+years.map(y=>`<option value="${escapeHtml(y)}">${escapeHtml(y)}年</option>`).join("");
  fm.innerHTML=`<option value="all">全ての月</option>`+months.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
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
          <span class="badge">${escapeHtml(e.date).replaceAll("-","/")}</span>
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

// HTML特殊文字をエスケープ。文字列以外（復元JSON由来の数値・オブジェクト等）が
// 渡されても落ちないよう、必ず文字列化してから処理する。
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g,m=>({
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
          <span class="mc-month">${escapeHtml(monthKey).replace("-","/")}</span>
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
          <span class="mc-month">${escapeHtml(monthKey).replace("-","/")}</span>
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
// YYYY-MM-DD 形式かつ実在する日付のみ許可する。
// 形式チェックだけだと 2026-13-99 のような存在しない日付が通ってしまうため、
// 実際に Date で往復させて一致を確認する。
function isValidISODate(v){
  if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d=new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0,10)===v;
}

// 復元は外部ファイル由来＝信頼できない入力。各項目を必ず検証・正規化してから保存する。
// 特に date は画面へそのまま描画されるため、形式が合わないレコードは取り込まない。
async function restoreJSON(file){
  const data=JSON.parse(await file.text());
  if(!Array.isArray(data)) throw new Error("形式が違います");
  let skipped=0;
  for(const e of data){
    if(typeof e!=="object"||e===null){ skipped++; continue; }
    if(!isValidISODate(e.date)){ skipped++; continue; }
    const investment=Number(e.investment||0), payout=Number(e.payout||0);
    if(!Number.isFinite(investment)||!Number.isFinite(payout)){ skipped++; continue; }
    await putEntry({
      id: typeof e.id==="string"&&e.id ? e.id : uid(),
      date: e.date,
      investment, payout,
      memo: String(e.memo??"").slice(0,500),
    });
  }
  await loadAndRender();
  if(skipped>0) alert(`${skipped}件は形式が正しくないため取り込みませんでした。`);
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
