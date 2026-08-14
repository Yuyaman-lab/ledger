// ==========================================================
//  スプラッシュ画面制御
//  Phase 1  スラムイン ... 巨大な「パチスロ」が奥から叩きつけられる
//  Phase 2  ネオン点灯 ... 衝撃 → フラッシュ → 振動 → フリッカー点灯
//  Phase 3  チャージ   ... 集中線が加速し、青から金へ発色（激アツ）
//  Phase 4  静寂       ... 一瞬の暗転で溜めを作る
//  Phase 5  爆発       ... 大フラッシュ・三重の衝撃波・文字の粒子化
// ==========================================================
(function(){
  var splash = document.getElementById("splashScreen");
  if (!splash) return;

  var el      = function(id){ return document.getElementById(id); };
  var shakeEl = el("splashShake");
  var flashEl = el("splashFlash");
  var logoEl  = el("spLogoWrap");

  var MAIN_LAYERS = ["spNeonHalo","spNeonGlow","spNeonEdge","spNeonText"];
  var SUB_LAYERS  = ["spSubGlow","spSubEdge","spSubText"];

  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var timers  = [];
  var done    = false;
  var bg      = createBackdrop(el("splashBg"), reduced);

  function at(ms, fn){ timers.push(setTimeout(fn, ms)); }
  function clearAll(){ for (var i=0;i<timers.length;i++) clearTimeout(timers[i]); timers = []; }

  function dismissSplash(){
    if (done) return;
    done = true;
    clearAll();
    bg.stop();
    splash.classList.add("splash-fade");
    setTimeout(function(){ splash.style.display = "none"; }, 650);
  }

  // クラスを付け直してアニメーションを再生させる
  function replay(node, cls){
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth; // reflow
    node.classList.add(cls);
  }
  function shake(kind){
    if (reduced || !shakeEl) return;
    shakeEl.classList.remove("shake-sm","shake-lg","shake-mega");
    void shakeEl.offsetWidth;
    shakeEl.classList.add(kind);
  }
  function flash(kind){
    if (reduced || !flashEl) return;
    flashEl.classList.remove("flash-main","flash-sub","flash-mega");
    void flashEl.offsetWidth;
    flashEl.classList.add(kind);
  }
  function addClassTo(ids, cls){
    for (var i=0;i<ids.length;i++){ var n = el(ids[i]); if (n) n.classList.add(cls); }
  }
  function swapClass(ids, from, to){
    for (var i=0;i<ids.length;i++){
      var n = el(ids[i]); if (!n) continue;
      n.classList.remove(from); n.classList.add(to);
    }
  }

  // ── 動きを減らす設定：演出なしで静かに見せる ──
  if (reduced) {
    addClassTo(MAIN_LAYERS.concat(SUB_LAYERS), "on");
    var dl = el("spDivLine"); if (dl) dl.classList.add("show");
    at(1400, dismissSplash);
    enableSkip(200);
    return;
  }

  // ── タイムライン ──
  bg.start();

  // 0.28s  スラムイン開始（着弾は 0.9s × 62% ≒ 0.56s 後）
  at(280, function(){
    replay(el("spMainSlam"), "slam");
    addClassTo(MAIN_LAYERS, "on");
  });

  // 0.84s  第一撃：フラッシュ・振動・衝撃波・火花
  at(840, function(){
    flash("flash-main");
    shake("shake-lg");
    bg.ring({ speed: 15, width: 16, alpha: .95 });
    bg.ring({ speed: 9,  width: 7,  alpha: .55, delay: 90 });
    bg.sparks(90, { speed: 16, spread: 1 });
    bg.level({ intensity: .55, spin: .55 });
  });

  // 1.08s  区切り線
  at(1080, function(){ var d = el("spDivLine"); if (d) d.classList.add("show"); });

  // 1.20s  サブタイトルのスラムイン
  at(1200, function(){
    replay(el("spSubSlam"), "slam");
    addClassTo(SUB_LAYERS, "on");
  });

  // 1.64s  第二撃
  at(1640, function(){
    flash("flash-sub");
    shake("shake-sm");
    bg.ring({ speed: 10, width: 9, alpha: .6, mix: -1 });
    bg.sparks(45, { speed: 11, spread: 1 });
    bg.level({ intensity: .62, spin: .7 });
  });

  // 2.00s  チャージ：集中線が加速し、青 → 金へ
  at(2000, function(){
    if (logoEl) logoEl.classList.add("charge");
    swapClass(MAIN_LAYERS, "on", "charge-lit");
    swapClass(SUB_LAYERS,  "on", "charge-lit");
    var d = el("spDivLine"); if (d) d.classList.add("charge-lit");
    bg.charge(1000);
  });

  // 3.00s  静寂（溜め）
  at(3000, function(){
    if (shakeEl){
      shakeEl.style.transition = "opacity .16s ease-out, filter .16s ease-out";
      shakeEl.style.opacity    = ".12";
      shakeEl.style.filter     = "brightness(.35)";
    }
    bg.hush();
  });

  // 3.17s  爆発
  at(3170, function(){
    if (shakeEl){
      shakeEl.style.transition = "none";
      shakeEl.style.opacity    = "1";
      shakeEl.style.filter     = "none";
    }
    explode();
  });

  // 保険：何かで演出が止まっても必ず閉じる
  at(7500, dismissSplash);

  enableSkip(700);

  // 0.7s 以降はタップでスキップ
  function enableSkip(delay){
    at(delay, function(){
      splash.style.cursor = "pointer";
      splash.addEventListener("click", dismissSplash, { once: true });
    });
  }

  // ── Phase 5: 爆発 ──
  function explode(){
    // 粒子の元になる文字位置は、揺れが始まる前に採取する
    var particles = buildParticles();

    flash("flash-mega");
    shake("shake-mega");
    bg.bang();

    if (logoEl) logoEl.classList.add("blown");

    if (!particles) { at(700, dismissSplash); return; }
    runParticles(particles, function(){ dismissSplash(); });
  }

  // 画面上の文字をオフスクリーンに描いてピクセル位置をサンプリングする
  function buildParticles(){
    var canvas = el("splashCanvas");
    if (!canvas) return null;

    var W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    canvas.style.display = "block";

    var cx = W / 2, cy = H * 0.46;
    var list = [];

    var off = document.createElement("canvas");
    off.width = W; off.height = H;
    var oc = off.getContext("2d", { willReadFrequently: true });

    function sample(node, text, color, weight, step){
      if (!node) return;
      var cs   = window.getComputedStyle(node);
      var size = parseFloat(cs.fontSize) || 64;
      var rect = node.getBoundingClientRect();
      var midY = rect.top + rect.height / 2;

      oc.clearRect(0, 0, W, H);
      if ("letterSpacing" in oc) oc.letterSpacing = cs.letterSpacing;
      oc.font = weight + " " + size + 'px "Outfit","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif';
      oc.fillStyle    = "#fff";
      oc.textAlign    = "center";
      oc.textBaseline = "middle";
      oc.fillText(text, cx, midY);

      var data = oc.getImageData(0, 0, W, H).data;
      for (var y = 0; y < H; y += step){
        for (var x = 0; x < W; x += step){
          if (data[(y * W + x) * 4 + 3] < 110) continue;
          var dx = x - cx, dy = y - cy;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var ux = dx / dist, uy = dy / dist;
          // 距離が遠い粒子ほど速く飛ぶ（外側が先に散る）
          var spd   = (5 + dist / 26) * (0.65 + Math.random() * 0.85);
          var swirl = (Math.random() - 0.5) * 5;
          list.push({
            x: x, y: y,
            vx: ux * spd - uy * swirl + (Math.random() - 0.5) * 3,
            vy: uy * spd + ux * swirl + (Math.random() - 0.5) * 3,
            a: 0.85 + Math.random() * 0.15,
            decay: 0.008 + Math.random() * 0.013,
            size: 1.4 + Math.random() * 2.6,
            hot: Math.random() < 0.16,        // 一部を白熱した火花にする
            color: color
          });
        }
      }
    }

    // 画面が広いほど間引いて、粒子数が膨らみすぎないようにする
    var step = W * H > 900000 ? 4 : 3;
    sample(el("spNeonText"), "パチスロ", "rgba(255,205,110,1)", "900", step);
    sample(el("spSubText"),  "収支管理", "rgba(90,235,165,1)",  "700", step);

    return list.length ? { canvas: canvas, list: list, W: W, H: H } : null;
  }

  function runParticles(pack, onDone){
    var ctx = pack.canvas.getContext("2d");
    var list = pack.list, W = pack.W, H = pack.H;
    var start = null, MAX = 1100;

    function frame(ts){
      if (done) return;
      if (start === null) start = ts;
      var elapsed = ts - start;

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      var alive = false;
      for (var i = 0; i < list.length; i++){
        var p = list[i];
        if (p.a <= 0) continue;

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.975;
        p.vy = p.vy * 0.975 + 0.16;   // わずかな重力で火の粉らしく落とす
        p.a  -= p.decay;
        if (p.a <= 0) continue;
        alive = true;

        ctx.globalAlpha = p.a;
        // 速度方向に尾を引かせて疾走感を出す
        ctx.strokeStyle = p.hot ? "rgba(255,255,255,1)" : p.color;
        ctx.lineWidth   = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (alive && elapsed < MAX) requestAnimationFrame(frame);
      else onDone();
    }
    requestAnimationFrame(frame);
  }

  // ==========================================================
  //  背景エフェクト（集中線・衝撃波・火花・火の粉）
  // ==========================================================
  function createBackdrop(canvas, disabled){
    var noop = function(){};
    var stub = { start:noop, stop:noop, ring:noop, sparks:noop, level:noop, charge:noop, hush:noop, bang:noop };
    if (!canvas || disabled) return stub;

    var ctx = canvas.getContext("2d");
    if (!ctx) return stub;

    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var W = 0, H = 0, cx = 0, cy = 0, R = 0;

    function resize(){
      W = window.innerWidth; H = window.innerHeight;
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      cx = W / 2; cy = H * 0.46;
      var fy = Math.max(cy, H - cy);
      R = Math.sqrt(cx * cx + fy * fy) * 1.12;
    }
    resize();
    window.addEventListener("resize", resize);

    // 集中線
    var RAYS = 56, rays = [];
    for (var i = 0; i < RAYS; i++){
      rays.push({
        a:  (i / RAYS) * Math.PI * 2 + (Math.random() - 0.5) * 0.06,
        w:  0.008 + Math.random() * 0.026,
        r0: 0.05  + Math.random() * 0.12,
        r1: 0.72  + Math.random() * 0.5,
        ph: Math.random() * Math.PI * 2
      });
    }

    var rings = [], sparks = [], streaks = [], embers = [];

    var st = {
      t: 0, rot: 0, dim: 1,
      intensity: 0.06, tIntensity: 0.34,
      mix: 0,          tMix: 0,          // 0=青 / 1=金
      spin: 0.1,       tSpin: 0.28
    };

    var running = false, rafId = 0, last = 0;

    function col(m, a){
      var r = Math.round(79  + (255 - 79)  * m);
      var g = Math.round(140 + (185 - 140) * m);
      var b = Math.round(255 + (70  - 255) * m);
      return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }

    function step(k){
      st.t += 16.67 * k;
      st.intensity += (st.tIntensity - st.intensity) * Math.min(1, 0.055 * k);
      st.mix       += (st.tMix       - st.mix)       * Math.min(1, 0.040 * k);
      st.spin      += (st.tSpin      - st.spin)      * Math.min(1, 0.045 * k);
      st.rot       += st.spin * 0.012 * k;

      var I = st.intensity * st.dim;

      // 中心から吹き出す流線
      var want = Math.min(6, I * 6);
      while (want-- > 0 && streaks.length < 240 && Math.random() < 0.9){
        var a  = Math.random() * Math.PI * 2;
        var sp = (4 + Math.random() * 13) * (0.6 + I * 1.5);
        var r0 = R * (0.04 + Math.random() * 0.1);
        streaks.push({
          x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          a: 0.5 + Math.random() * 0.5, life: 1
        });
      }

      // チャージ中は火の粉が舞い上がる
      if (st.mix > 0.15 && embers.length < 120 && Math.random() < st.mix * 0.9){
        embers.push({
          x: cx + (Math.random() - 0.5) * W * 0.9,
          y: H + 10,
          vy: -(0.7 + Math.random() * 2.2),
          vx: (Math.random() - 0.5) * 0.7,
          ph: Math.random() * Math.PI * 2,
          size: 1 + Math.random() * 2.2,
          a: 0.35 + Math.random() * 0.5
        });
      }

      var i, o;
      for (i = streaks.length - 1; i >= 0; i--){
        o = streaks[i];
        o.x += o.vx * k; o.y += o.vy * k;
        o.vx *= 1.012; o.vy *= 1.012;
        o.life -= 0.022 * k;
        if (o.life <= 0 || o.x < -60 || o.x > W + 60 || o.y < -60 || o.y > H + 60) streaks.splice(i, 1);
      }
      for (i = embers.length - 1; i >= 0; i--){
        o = embers[i];
        o.ph += 0.06 * k;
        o.x  += (o.vx + Math.sin(o.ph) * 0.5) * k;
        o.y  += o.vy * k;
        o.a  -= 0.004 * k;
        if (o.a <= 0 || o.y < -20) embers.splice(i, 1);
      }
      for (i = rings.length - 1; i >= 0; i--){
        o = rings[i];
        if (o.delay > 0){ o.delay -= 16.67 * k; continue; }
        o.r += o.speed * k;
        o.a -= o.decay * k;
        o.width *= 0.965;
        if (o.a <= 0 || o.r > R * 1.5) rings.splice(i, 1);
      }
      for (i = sparks.length - 1; i >= 0; i--){
        o = sparks[i];
        o.x += o.vx * k; o.y += o.vy * k;
        o.vx *= 0.972; o.vy = o.vy * 0.972 + 0.12 * k;
        o.a -= o.decay * k;
        if (o.a <= 0) sparks.splice(i, 1);
      }
    }

    function draw(){
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      var I = st.intensity * st.dim;
      ctx.globalCompositeOperation = "lighter";

      // 中心のブルーム
      var pulse = 0.62 + 0.38 * Math.sin(st.t * 0.005);
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
      g.addColorStop(0,   col(st.mix, 0.40 * I * pulse));
      g.addColorStop(0.4, col(st.mix, 0.12 * I));
      g.addColorStop(1,   col(st.mix, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // 集中線（全ての楔を一度のパスでまとめて塗る）
      var rg = ctx.createRadialGradient(cx, cy, R * 0.04, cx, cy, R);
      rg.addColorStop(0,    col(st.mix, 0));
      rg.addColorStop(0.26, col(st.mix, 0.30 * I));
      rg.addColorStop(0.7,  col(st.mix, 0.14 * I));
      rg.addColorStop(1,    col(st.mix, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      for (var i = 0; i < rays.length; i++){
        var ray = rays[i];
        var a = ray.a + st.rot;
        var w = ray.w * (0.65 + 0.55 * Math.sin(st.t * 0.006 + ray.ph)) * (0.8 + I * 0.8);
        var r0 = ray.r0 * R, r1 = ray.r1 * R * (0.85 + I * 0.35);
        ctx.moveTo(cx + Math.cos(a - w) * r0, cy + Math.sin(a - w) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1,     cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0);
      }
      ctx.fill();

      // 流線
      ctx.lineCap = "round";
      for (i = 0; i < streaks.length; i++){
        var s = streaks[i];
        ctx.globalAlpha = Math.max(0, s.a * s.life) * I;
        ctx.strokeStyle = col(st.mix, 0.9);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 3, s.y - s.vy * 3);
        ctx.stroke();
      }

      // 火の粉
      for (i = 0; i < embers.length; i++){
        var e = embers[i];
        ctx.globalAlpha = Math.max(0, e.a);
        ctx.fillStyle = "rgba(255,190,90,1)";
        ctx.fillRect(e.x, e.y, e.size, e.size);
      }

      // 衝撃波
      for (i = 0; i < rings.length; i++){
        var o = rings[i];
        if (o.delay > 0) continue;
        ctx.globalAlpha = Math.max(0, o.a);
        ctx.strokeStyle = o.mix < 0 ? "rgba(90,240,165,1)" : col(o.mix, 1);
        ctx.lineWidth = Math.max(0.5, o.width);
        ctx.beginPath();
        ctx.arc(cx, cy, o.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 火花
      for (i = 0; i < sparks.length; i++){
        var p = sparks[i];
        ctx.globalAlpha = Math.max(0, p.a);
        ctx.strokeStyle = p.hot ? "rgba(255,255,255,1)" : col(st.mix, 1);
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        ctx.stroke();
      }

      // ビネット
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      var vg = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 0.95);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,.6)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    function loop(ts){
      if (!running) return;
      var dt = last ? Math.min(50, ts - last) : 16.67;
      last = ts;
      step(dt / 16.67);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    return {
      start: function(){
        if (running) return;
        running = true; last = 0;
        rafId = requestAnimationFrame(loop);
      },
      stop: function(){
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
      level: function(o){
        if (o.intensity != null) st.tIntensity = o.intensity;
        if (o.mix       != null) st.tMix       = o.mix;
        if (o.spin      != null) st.tSpin      = o.spin;
        st.dim = 1;
      },
      ring: function(o){
        rings.push({
          r: o.r || R * 0.05,
          speed: o.speed || 12,
          width: o.width || 10,
          a: o.alpha != null ? o.alpha : 0.8,
          decay: o.decay || 0.032,
          delay: o.delay || 0,
          mix: o.mix != null ? o.mix : st.mix
        });
      },
      sparks: function(n, o){
        o = o || {};
        for (var i = 0; i < n; i++){
          var a  = Math.random() * Math.PI * 2;
          var sp = (o.speed || 12) * (0.35 + Math.random());
          sparks.push({
            x: cx, y: cy,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            a: 0.8 + Math.random() * 0.2,
            decay: 0.016 + Math.random() * 0.02,
            size: 1 + Math.random() * 2.2,
            hot: Math.random() < 0.4
          });
        }
      },
      // チャージ：集中線を加速させながら青 → 金へ寄せていく
      charge: function(ms){
        st.tIntensity = 1;
        st.tMix       = 1;
        st.tSpin      = 2.6;
        var pulses = [220, 450, 640, 790, 900];
        for (var i = 0; i < pulses.length; i++){
          (function(d, idx){
            setTimeout(function(){
              if (!running) return;
              rings.push({ r: R * 0.04, speed: 9 + idx * 2.5, width: 5 + idx * 1.5,
                           a: 0.35 + idx * 0.1, decay: 0.03, delay: 0, mix: st.mix });
            }, d);
          })(pulses[i], i);
        }
      },
      // 静寂：一瞬すべてを落とす
      hush: function(){ st.dim = 0.06; },
      // 爆発
      bang: function(){
        st.dim = 1;
        st.intensity = 1.6; st.tIntensity = 0;
        st.mix = 1;         st.tMix = 1;
        st.spin = 4;        st.tSpin = 0.4;
        rings.push({ r: 0, speed: 32, width: 26, a: 1,   decay: 0.030, delay: 0,   mix: 1 });
        rings.push({ r: 0, speed: 22, width: 14, a: .8,  decay: 0.026, delay: 70,  mix: 1 });
        rings.push({ r: 0, speed: 15, width: 8,  a: .55, decay: 0.024, delay: 150, mix: 1 });
        this.sparks(220, { speed: 26 });
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
