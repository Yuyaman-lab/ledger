// ======================
// Service Worker - キャッシュファースト戦略
// PWA起動時に白フラッシュを防ぐため、HTML/CSSをキャッシュから即座に返す
// ======================

const CACHE_NAME = 'slot-ledger-v20';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js'
];

// インストール：コアファイルを事前キャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// アクティベーション：古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ：ネットワークファースト → キャッシュフォールバック
// 起動のたびに最新版を取得し、取得できた場合はキャッシュも更新する。
// オフライン時のみキャッシュを返す（更新が即座に反映されるのが狙い）。
self.addEventListener('fetch', event => {
  const req = event.request;

  // GETリクエストのみ対象
  if (req.method !== 'GET') return;

  // Google Fonts等の外部リソースはネットワークファースト
  if (!req.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // コアファイル：ネットワークファースト + キャッシュ更新
  event.respondWith(
    fetch(req)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      })
      // オフライン等でネットワークが失敗したらキャッシュにフォールバック
      .catch(() => caches.match(req))
  );
});
