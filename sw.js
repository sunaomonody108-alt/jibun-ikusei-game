// オフラインでも開けるように、ファイルをキャッシュする
const CACHE = "jibun-game-v4";
const FILES = ["./", "index.html", "app.js", "game.js", "fx.js", "style.css", "manifest.webmanifest", "icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// 新しい版を優先し、つながらないときだけキャッシュを使う
self.addEventListener("fetch", (e) => {
  e.respondWith(
    // ブラウザのHTTPキャッシュ（GitHub Pagesは最大10分）を通さず、毎回サーバーに確認する
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
