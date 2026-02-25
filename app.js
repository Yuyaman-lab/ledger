// ======================
//  便利関数
// ======================
const $ = (id) => document.getElementById(id);
const fmtYen = (n) => `${(n||0).toLocaleString("ja-JP")}円`;
const toISODate = (d) => {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const day = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const ym = (iso) => iso.slice(0,7);
const year = (iso) => iso.slice(0,4);
const uid = () => crypto.randomUUID();

// ======================
// IndexedDB（端末内保存）
// ======================
const DB_NAME = "slot_ledger_db";
const STORE = "entries";
let db;

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      const store = d.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("date", "date");
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(mode="readonly"){
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getAll(){
  return new Promise((resolve,reject)=>{
    const req = tx().getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function putEntry(entry){
  return new Promise((resolve,reject)=>{
    const req = tx("readwrite").put(entry);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function deleteEntry(id){
  return new Promise((resolve,reject)=>{
    const req = tx("readwrite").delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function wipeAll(){
  return new Promise((resolve,reject)=>{
    const req = tx("readwrite").clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// ======================
// ロック（PIN + Passkey）
// ======================
const LS = {
  lockEnabled: "lock_enabled",
  pinHash: "pin_hash",
  pinSalt: "pin_salt",
  passkeyEnabled: "passkey_enabled",
};

const enc = new TextEncoder();
async function sha256(str){
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function randSalt(){
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
}

async function setPIN(pin){
  const salt = randSalt();
  const hash = await sha256(`${salt}:${pin}`);
  localStorage.setItem(LS.pinSalt, salt);
  localStorage.setItem(LS.pinHash, hash);
}
function clearPIN(){
  localStorage.removeItem(LS.pinSalt);
  localStorage.removeItem(LS.pinHash);
}
async function verifyPIN(pin){
  const salt = localStorage.getItem(LS.pinSalt);
  const hash = localStorage.getItem(LS.pinHash);
  if(!salt || !hash) return false;
  const h = await sha256(`${salt}:${pin}`);
  return h === hash;
}
function hasPIN(){
  return !!localStorage.getItem(LS.pinHash);
}

// Passkey（WebAuthn）
async function setupPasskey(){
  if(!window.PublicKeyCredential) throw new Error("このブラウザはパスキー非対応です。");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const publicKey = {
    challenge,
    rp: { name: "Slot Ledger" },
    user: { id: userId, name: "user", displayName: "user" },
    pubKeyCredParams: [{ type:"public-key", alg:-7 }],
    authenticatorSelection: { userVerification: "required" },
    timeout: 60000,
    attestation: "none",
  };
  await navigator.credentials.create({ publicKey });
  localStorage.setItem(LS.passkeyEnabled, "1");
}

async function authPasskey(){
  if(!window.PublicKeyCredential) throw new Error("このブラウザはパスキー非対応です。");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = {
    challenge,
    userVerification: "required",
    timeout: 60000,
  };
  await navigator.credentials.get({ publicKey });
  return true;
}

function disablePasskey(){
  localStorage.removeItem(LS.passkeyEnabled);
}
function passkeyEnabled(){
  return localStorage.getItem(LS.passkeyEnabled) === "1";
}

// ======================
// UI状態
// ======================
let entries = [];
let editingId = null;
let filterY = "all";
let filterM = "all";

function profitOf(e){ return (Number(e.payout)||0) - (Number(e.investment)||0); }

function applyFilter(list){
  return list.filter(e=>{
    if(filterY !== "all" && year(e.date) !== filterY) return false;
    if(filterM !== "all" && ym(e.date) !== filterM) return false;
    return true;
  }).sort((a,b)=> (a.date < b.date ? 1 : -1));
}

function setTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      ["ledger","summary","settings"].forEach(t=>{
        $(`tab-${t}`).classList.toggle("hidden", t !== tab);
      });
      if(tab==="summary"){
        renderSummary();
        // タブが表示された後にCanvasを描画（サイズが確定してから）
        requestAnimationFrame(() => renderYearGraph());
      }
    };
  });
}

// ======================
// 描画：明細
// ======================
function renderFilters(){
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  const yearsSet = new Set(entries.map(e => year(e.date)));
  yearsSet.add(currentYear);

  const monthsSet = new Set(entries.map(e => ym(e.date)));
  monthsSet.add(currentMonth);

  const years = [...yearsSet].sort().reverse();
  const months = [...monthsSet].sort().reverse();

  const fy = $("filterYear");
  const fm = $("filterMonth");

  fy.innerHTML = `<option value="all">全ての年</option>` + years.map(y=>`<option value="${y}">${y}年</option>`).join("");
  fm.innerHTML = `<option value="all">全ての月</option>` + months.map(m=>`<option value="${m}">${m}</option>`).join("");

  if(filterY !== "all" && !yearsSet.has(filterY)) filterY = "all";
  if(filterM !== "all" && !monthsSet.has(filterM)) filterM = "all";

  fy.value = filterY;
  fm.value = filterM;

  fy.onchange = ()=>{ filterY = fy.value; renderLedger(); };
  fm.onchange = ()=>{ filterM = fm.value; renderLedger(); };

  $("btnClearFilter").onclick = ()=>{
    filterY = "all";
    filterM = "all";
    renderFilters();
    renderLedger();
  };
}

function renderLedger(){
  const list = $("entryList");
  const filtered = applyFilter(entries);
  list.innerHTML = "";

  $("emptyState").classList.toggle("hidden", entries.length !== 0);

  for(const e of filtered){
    const p = profitOf(e);
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="left">
        <div class="row gap">
          <span class="badge">${e.date.replaceAll("-","/")}</span>
          ${e.memo ? `<span class="badge">📝 ${escapeHtml(e.memo)}</span>` : ""}
        </div>
        <div class="muted small">投資 ${fmtYen(e.investment)} / 回収 ${fmtYen(e.payout)}</div>
      </div>
      <div class="right" style="text-align:right;">
        <div class="profit ${p>=0?"plus":"minus"}">${fmtYen(p)}</div>
        <div class="row gap" style="justify-content:flex-end;margin-top:6px;">
          <button class="btn" data-act="edit">編集</button>
          <button class="btn danger" data-act="del">削除</button>
        </div>
      </div>
    `;

    li.querySelector('[data-act="edit"]').onclick = ()=> openModal(e);
    li.querySelector('[data-act="del"]').onclick = async ()=>{
      if(!confirm("削除しますか？")) return;
      await deleteEntry(e.id);
      await loadAndRender();
    };

    list.appendChild(li);
  }
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

// ======================
// 追加/編集モーダル
// ======================
function openModal(entry = null) {
  editingId = entry?.id ?? null;
  $("modalTitle").textContent = editingId ? "編集" : "追加";
  $("inpDate").value = entry?.date ?? toISODate(new Date());
  $("inpInv").value = entry?.investment ?? "";
  $("inpPay").value = entry?.payout ?? "";
  $("inpMemo").value = entry?.memo ?? "";
  updateProfitPreview();

  document.body.classList.add("modal-open");
  $("modal").classList.remove("hidden");

  setTimeout(() => { $("inpInv").focus(); }, 300);
}

function closeModal() {
  document.body.classList.remove("modal-open");
  $("modal").classList.add("hidden");
}

function updateProfitPreview(){
  const inv = Number($("inpInv").value||0);
  const pay = Number($("inpPay").value||0);
  $("profitPreview").textContent = (pay - inv).toLocaleString("ja-JP");
}

async function saveModal(){
  const date = $("inpDate").value;
  const investment = Number($("inpInv").value||0);
  const payout = Number($("inpPay").value||0);
  const memo = $("inpMemo").value.trim();

  if(!date){ alert("日付を選択してください"); return; }
  if(investment < 0 || payout < 0){ alert("投資/回収は0以上で入力してください"); return; }

  const entry = { id: editingId ?? uid(), date, investment, payout, memo };
  await putEntry(entry);
  closeModal();
  await loadAndRender();
}

// ======================
// 集計
// ======================
function switchToTab(tab){
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));

  document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add("active");
  document.getElementById(`tab-${tab}`)?.classList.remove("hidden");

  if(tab==="summary"){
    renderSummary();
    requestAnimationFrame(() => renderYearGraph());
  }
}

function renderSummary(){
  const totalProfit = entries.reduce((a,e)=>a+profitOf(e),0);
  const wins = entries.filter(e=>profitOf(e)>0).length;
  const total = entries.length;
  const winRate = total ? (wins/total*100) : 0;
  const avgInv = total ? Math.round(entries.reduce((a,e)=>a+Number(e.investment||0),0)/total) : 0;
  const avgPay = total ? Math.round(entries.reduce((a,e)=>a+Number(e.payout||0),0)/total) : 0;

  $("statTotal").textContent = fmtYen(totalProfit);
  $("statWinRate").textContent = `${winRate.toFixed(1)}% (${wins}/${total})`;
  $("statAvgInv").textContent = fmtYen(avgInv);
  $("statAvgPay").textContent = fmtYen(avgPay);

  const monthMap = new Map();
  for(const e of entries){
    const key = ym(e.date);
    const cur = monthMap.get(key) || { investment:0, payout:0, profit:0, count:0, wins:0 };
    cur.investment += Number(e.investment||0);
    cur.payout += Number(e.payout||0);
    const p = profitOf(e);
    cur.profit += p;
    cur.count += 1;
    if(p > 0) cur.wins += 1;
    monthMap.set(key, cur);
  }

  const months = [...monthMap.keys()].sort((a,b)=> b.localeCompare(a));

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  const curBox = $("currentMonthBox");
  const pastBox = $("pastMonthsBox");
  if(!curBox || !pastBox) return;

  curBox.innerHTML = "";
  pastBox.innerHTML = "";

  if(months.length === 0){
    curBox.innerHTML = `<div class="muted">データがありません。</div>`;
    return;
  }

  const curData = monthMap.get(currentKey);
  if(curData){
    curBox.appendChild(buildMonthRow(currentKey, curData, true));
  }else{
    curBox.innerHTML = `<div class="muted">今月のデータはまだありません。</div>`;
  }

  const pastMonths = months.filter(m => m !== currentKey);
  if(pastMonths.length === 0){
    pastBox.innerHTML = `<div class="muted">過去月データはまだありません。</div>`;
  }else{
    for(const m of pastMonths){
      pastBox.appendChild(buildMonthRow(m, monthMap.get(m), false));
    }
  }

  // グラフ描画（集計タブが表示状態なら即描画）
  renderYearGraph();
}

function buildMonthRow(monthKey, data, highlight){
  const p = data.profit;
  const winRate = data.count ? (data.wins / data.count * 100) : 0;

  const row = document.createElement("div");
  row.className = "month-row";
  row.style.cursor = "pointer";

  row.innerHTML = `
    <div>
      <div class="title">${monthKey.replace("-", "/")}</div>
      <div class="sub">
        投資 ${fmtYen(data.investment)} / 回収 ${fmtYen(data.payout)}<br>
        回数 ${data.count} / 勝率 ${winRate.toFixed(1)}%
      </div>
    </div>
    <div class="profit ${p>=0?"plus":"minus"}">${fmtYen(p)}</div>
  `;

  row.onclick = () => {
    filterY = monthKey.slice(0,4);
    filterM = monthKey;
    const ledgerTabBtn = document.querySelector('.tab[data-tab="ledger"]');
    if(ledgerTabBtn) ledgerTabBtn.click();
    renderFilters();
    renderLedger();
  };

  if(highlight){
    row.style.borderColor = "rgba(79,140,255,.45)";
    row.style.background = "rgba(79,140,255,.08)";
  }
  return row;
}

// ======================
// ▼▼▼ 年間収支グラフ（Canvas版）▼▼▼
// ======================
function renderYearGraph(){
  const canvas = document.getElementById("yearCanvas");
  if(!canvas) return;

  // Canvas の実際の描画サイズを取得
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width;
  const cssH = rect.height;

  // 非表示タブ or まだレイアウト未確定の場合はスキップ
  if(cssW <= 0 || cssH <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  // ── データ収集 ──────────────────────────────
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  const monthly = new Array(12).fill(0);
  entries.forEach(e => {
    const d = new Date(e.date);
    if(d.getFullYear() === currentYear){
      const m = d.getMonth();
      monthly[m] += (Number(e.payout)||0) - (Number(e.investment)||0);
    }
  });

  // 累積折れ線（現在月まで）
  const cumulative = [];
  let cum = 0;
  for(let i = 0; i <= currentMonth; i++){
    cum += monthly[i];
    cumulative.push(cum);
  }

  // ── レイアウト定数 ──────────────────────────
  const padL = 38;  // Y軸ラベル用
  const padR = 6;
  const padT = 12;
  const padB = 18;  // X軸ラベル用
  const gW = cssW - padL - padR;
  const gH = cssH - padT - padB;

  // Y軸固定スケール
  const Y_MIN = -40000;
  const Y_MAX =  70000;

  function toY(val){
    return padT + gH * (1 - (val - Y_MIN) / (Y_MAX - Y_MIN));
  }

  const zeroY = toY(0);
  const colW  = gW / 12;
  const barW  = colW * 0.48;

  // ── グリッド線（破線） ───────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  [-30000, 30000, 60000].forEach(v => {
    const y = toY(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(cssW - padR, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // ── ゼロライン ──────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, zeroY);
  ctx.lineTo(cssW - padR, zeroY);
  ctx.stroke();

  // ── Y軸ラベル ───────────────────────────────
  ctx.fillStyle = "rgba(159,176,208,0.8)";
  ctx.font = `${Math.round(9 * (cssW / 340))}px system-ui`;
  ctx.textAlign = "right";
  [
    { v: 60000, l: "+60K" },
    { v: 30000, l: "+30K" },
    { v:     0, l:    "0" },
    { v:-30000, l: "-30K" },
  ].forEach(({ v, l }) => {
    ctx.fillText(l, padL - 4, toY(v) + 3.5);
  });

  // ── 棒グラフ ────────────────────────────────
  monthly.forEach((val, i) => {
    if(val === 0) return;

    const cx = padL + colW * i + colW / 2;
    const bx = cx - barW / 2;
    const isPlus = val > 0;
    const color = isPlus ? "#28d17c" : "#ff6161";

    ctx.shadowColor = color;
    ctx.shadowBlur  = 7;
    ctx.fillStyle   = isPlus
      ? "rgba(40,209,124,0.82)"
      : "rgba(255,97,97,0.82)";

    const r = 3; // 角丸半径

    if(isPlus){
      // 上向き：上側だけ角丸
      const barTop = toY(val);
      const barH   = zeroY - barTop;
      ctx.beginPath();
      ctx.moveTo(bx + r, barTop);
      ctx.lineTo(bx + barW - r, barTop);
      ctx.quadraticCurveTo(bx + barW, barTop, bx + barW, barTop + r);
      ctx.lineTo(bx + barW, zeroY);
      ctx.lineTo(bx, zeroY);
      ctx.lineTo(bx, barTop + r);
      ctx.quadraticCurveTo(bx, barTop, bx + r, barTop);
      ctx.closePath();
      ctx.fill();
    } else {
      // 下向き：下側だけ角丸
      const barBot = toY(val);
      ctx.beginPath();
      ctx.moveTo(bx, zeroY);
      ctx.lineTo(bx + barW, zeroY);
      ctx.lineTo(bx + barW, barBot - r);
      ctx.quadraticCurveTo(bx + barW, barBot, bx + barW - r, barBot);
      ctx.lineTo(bx + r, barBot);
      ctx.quadraticCurveTo(bx, barBot, bx, barBot - r);
      ctx.lineTo(bx, zeroY);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  });

  // ── 折れ線グラフ（累積収支） ─────────────────
  if(cumulative.length > 0){
    // 累積の絶対最大値でスケール調整
    const cumAbsMax = Math.max(...cumulative.map(Math.abs), 1);
    const CUM_MIN = -(cumAbsMax * 1.35);
    const CUM_MAX =   cumAbsMax * 1.35;

    function toCumY(v){
      return padT + gH * (1 - (v - CUM_MIN) / (CUM_MAX - CUM_MIN));
    }

    // 折れ線パス
    ctx.beginPath();
    ctx.strokeStyle = "#00bcd4";
    ctx.lineWidth   = 2;
    ctx.lineJoin    = "round";
    ctx.lineCap     = "round";
    ctx.shadowColor = "#00bcd4";
    ctx.shadowBlur  = 8;

    cumulative.forEach((v, i) => {
      const cx = padL + colW * i + colW / 2;
      const cy = toCumY(v);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 現在月グロードット
    const lastIdx = cumulative.length - 1;
    const dotX = padL + colW * lastIdx + colW / 2;
    const dotY = toCumY(cumulative[lastIdx]);

    // 外側グロー
    const grad = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 11);
    grad.addColorStop(0, "rgba(0,188,212,0.55)");
    grad.addColorStop(1, "rgba(0,188,212,0)");
    ctx.beginPath();
    ctx.arc(dotX, dotY, 11, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // ドット本体
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle   = "#00bcd4";
    ctx.shadowColor = "#00bcd4";
    ctx.shadowBlur  = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── X軸 月ラベル（1〜12） ───────────────────
  ctx.fillStyle = "rgba(159,176,208,0.65)";
  ctx.font      = `${Math.round(9 * (cssW / 340))}px system-ui`;
  ctx.textAlign = "center";
  for(let i = 0; i < 12; i++){
    const cx = padL + colW * i + colW / 2;
    ctx.fillText(String(i + 1), cx, cssH - 3);
  }
}
// ======================
// ▲▲▲ 年間収支グラフここまで ▲▲▲
// ======================

// ======================
// CSV / バックアップ
// ======================
function exportCSV(){
  const rows = [["日付","投資","回収","収支","メモ"]];
  for(const e of applyFilter(entries).slice().reverse()){
    rows.push([e.date, e.investment, e.payout, profitOf(e), e.memo||""]);
  }
  const csv = rows.map(r=>r.map(v=>{
    const s = String(v ?? "");
    return `"${s.replaceAll('"','""')}"`;
  }).join(",")).join("\n");

  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const file = new File([blob], "slot_ledger.csv", { type:"text/csv" });

  if(navigator.share){
    navigator.share({ files:[file], title:"パチスロ収支表CSV" }).catch(()=>{});
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "slot_ledger.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function backupJSON(){
  const blob = new Blob([JSON.stringify(entries,null,2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "slot_ledger_backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function restoreJSON(file){
  const text = await file.text();
  const data = JSON.parse(text);
  if(!Array.isArray(data)) throw new Error("形式が違います");
  for(const e of data){
    if(!e.id) e.id = uid();
    if(!e.date) continue;
    e.investment = Number(e.investment||0);
    e.payout = Number(e.payout||0);
    e.memo = String(e.memo||"");
    await putEntry(e);
  }
  await loadAndRender();
}

// ======================
// ロックUI
// ======================
function showLock(show){
  $("lockScreen").classList.toggle("hidden", !show);
}
function lockEnabled(){
  return localStorage.getItem(LS.lockEnabled) === "1";
}

async function tryUnlockPasskey(){
  try{
    if(!passkeyEnabled()) throw new Error("パスキーが未設定です。設定から登録してください。");
    await authPasskey();
    showLock(false);
    $("lockMsg").textContent = "";
  }catch(e){
    $("lockMsg").textContent = `解除できません：${e.message || e}`;
  }
}

function openPINUI(){
  $("pinArea").classList.remove("hidden");
  $("pinInput").value = "";
  $("pinInput").focus();
}
function closePINUI(){
  $("pinArea").classList.add("hidden");
}
async function tryUnlockPIN(){
  const pin = $("pinInput").value.trim();
  if(pin.length < 4) { $("lockMsg").textContent = "PINは4桁以上"; return; }
  const ok = await verifyPIN(pin);
  if(ok){
    showLock(false);
    $("lockMsg").textContent = "";
    closePINUI();
  }else{
    $("lockMsg").textContent = "PINが違います";
  }
}

// ======================
// 初期化
// ======================
async function loadAndRender(){
  entries = await getAll();
  renderFilters();
  renderLedger();
  renderSummary();
}

function bindUI(){
  setTabs();

  $("btnAdd").onclick = ()=> openModal(null);
  $("btnExport").onclick = exportCSV;

  $("btnCancel").onclick = closeModal;
  $("btnSave").onclick = saveModal;
  $("inpInv").oninput = updateProfitPreview;
  $("inpPay").oninput = updateProfitPreview;

  // ロック
  $("btnUnlockPasskey").onclick = tryUnlockPasskey;
  $("btnUnlockPIN").onclick = ()=>{ openPINUI(); $("lockMsg").textContent=""; };
  $("btnPinOk").onclick = tryUnlockPIN;
  $("btnPinCancel").onclick = ()=>{ closePINUI(); $("lockMsg").textContent=""; };

  $("toggleLock").checked = lockEnabled();
  $("toggleLock").onchange = (e)=>{
    localStorage.setItem(LS.lockEnabled, e.target.checked ? "1" : "0");
    if(e.target.checked) showLock(true);
    else showLock(false);
  };

  $("btnSetupPasskey").onclick = async ()=>{
    try{
      await setupPasskey();
      alert("Face ID（パスキー）を設定しました。");
    }catch(e){
      alert(`設定できません：${e.message || e}\n\n※ httpsで開いていないと動きません（GitHub Pagesで公開するとOK）`);
    }
  };
  $("btnDisablePasskey").onclick = ()=>{ disablePasskey(); alert("パスキーを解除しました。"); };

  $("btnSetPIN").onclick = async ()=>{
    const pin = prompt("PINを4〜8桁で設定してください（忘れないでください）");
    if(!pin) return;
    if(!/^\d{4,8}$/.test(pin)){ alert("4〜8桁の数字だけで入力してください"); return; }
    await setPIN(pin);
    alert("PINを設定しました。");
  };
  $("btnClearPIN").onclick = ()=>{ clearPIN(); alert("PINを解除しました。"); };

  $("btnBackup").onclick = backupJSON;
  $("fileRestore").onchange = async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      await restoreJSON(file);
      alert("復元しました。");
    }catch(err){
      alert(`復元失敗：${err.message || err}`);
    }finally{
      e.target.value = "";
    }
  };
  $("btnWipe").onclick = async ()=>{
    if(!confirm("全データを削除します。よろしいですか？")) return;
    await wipeAll();
    await loadAndRender();
  };

  // ウィンドウリサイズ時にCanvas再描画
  window.addEventListener("resize", () => {
    const summaryTab = $("tab-summary");
    if(summaryTab && !summaryTab.classList.contains("hidden")){
      renderYearGraph();
    }
  }, { passive: true });
}

// iOS Safari ピンチズーム抑止
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });

async function main(){
  await openDB();
  bindUI();
  await loadAndRender();

  // 起動時：今日の年・月をデフォルトに
  const now = new Date();
  filterY = String(now.getFullYear());
  filterM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  renderFilters();
  renderLedger();

  // 初期表示は集計タブ
  switchToTab("summary");

  // 起動時ロック
  if(lockEnabled()){
    showLock(true);
    if(!passkeyEnabled() && !hasPIN()){
      $("lockMsg").textContent = "解除手段が未設定です。設定タブでPINかパスキーを設定してください。";
    }
  }

  // PWA（オフライン）
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}
main();
