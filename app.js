// ======================
//  スプラッシュ画面制御
// ======================
(function(){
  const splash = document.getElementById("splashScreen");
  if (!splash) return;

  function dismissSplash() {
    splash.classList.add("splash-fade");
    setTimeout(() => { splash.style.display = "none"; }, 650);
  }

  const autoClose = setTimeout(dismissSplash, 4200);

  setTimeout(() => {
    splash.style.cursor = "pointer";
    splash.addEventListener("click", function onTap() {
      clearTimeout(autoClose);
      dismissSplash();
      splash.removeEventListener("click", onTap);
    }, { once: true });
  }, 1000);
})();

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

    req.onsuccess = () => {
      db=req.result;
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });
}

function tx(mode="readonly"){
  return db.transaction(STORE,mode).objectStore(STORE);
}

function getAll(){
  return new Promise((r,j)=>{
    const q=tx().getAll();
    q.onsuccess=()=>r(q.result||[]);
    q.onerror=()=>j(q.error);
  });
}

function putEntry(e){
  return new Promise((r,j)=>{
    const q=tx("readwrite").put(e);
    q.onsuccess=()=>r(true);
    q.onerror=()=>j(q.error);
  });
}

function deleteEntry(id){
  return new Promise((r,j)=>{
    const q=tx("readwrite").delete(id);
    q.onsuccess=()=>r(true);
    q.onerror=()=>j(q.error);
  });
}


// ======================
// 状態
// ======================

let entries = [];
let editingId = null;

function profitOf(e){
  return (Number(e.payout)||0)-(Number(e.investment)||0);
}


// ======================
// 集計（ヒーローカード）
// ======================

function renderSummary(){

  const total = entries.length;

  const wins = entries.filter(e=>profitOf(e)>0).length;

  const totalProfit = entries.reduce((a,e)=>a+profitOf(e),0);

  const winRate = total ? (wins/total*100) : 0;


  const elTotal=$("statTotal");

  if(elTotal){
    elTotal.textContent=fmtYen(totalProfit);
    elTotal.className="hero-amount"+(totalProfit>0?" plus":totalProfit<0?" minus":" zero");
  }


  $("statWinRate").textContent = total ? `${winRate.toFixed(1)}%` : "—";
  $("statWinCount").textContent = total ? `(${wins}/${total})` : "";


  // ======================
  // 前月比（今回の改修部分）
  // ======================

  const badge=$("statPrevMonth");

  if(badge){

    const now=new Date();

    const prevEnd=new Date(now.getFullYear(),now.getMonth(),0);

    const prevEndStr=prevEnd.toISOString().slice(0,10);


    const currentTotal=entries
      .reduce((a,e)=>a+profitOf(e),0);


    const prevTotal=entries
      .filter(e=>e.date<=prevEndStr)
      .reduce((a,e)=>a+profitOf(e),0);


    let ratio;


    if(prevTotal===0){
      ratio=100;
    }else{
      ratio=Math.round((currentTotal/Math.abs(prevTotal))*100);
    }


    badge.textContent=`前月比 ${ratio}%`;


    if(ratio>=100){
      badge.className="prev-badge up";
    }else{
      badge.className="prev-badge down";
    }

  }

}


// ======================
// 初期化
// ======================

async function loadAndRender(){

  entries = await getAll();

  renderSummary();

}


async function init(){

  await openDB();

  await loadAndRender();

}


init();
