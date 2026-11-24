/*
 * Service Worker:讓網站在沒有網路時也能開啟。
 *
 * 第一次連線開啟任何一頁時,把下面清單裡的檔案全部存進瀏覽器;
 * 之後有網路就抓最新的(並更新快取),沒網路就用存好的那一份。
 *
 * 新增遊戲或檔案時:把路徑加進 FILES,並把 VERSION 加一。
 */
'use strict';

var VERSION = 'games-v2';

var FILES = [
  'index.html',
  'app/index.html',
  'app/slitherlink/index.html',
  'app/slitherlink/engine.js',
  'app/hashi/index.html',
  'app/hashi/engine.js',
  'app/1a2b/index.html',
  'app/holdem/index.html',
  'app/holdem/engine.js',
  'app/junqi/index.html',
  'app/junqi/engine.js',
  'app/junqi/themes/simple.png',
  'app/junqi/themes/classic-gold.png',
  'app/junqi/themes/outline.png',
  'app/junqi/themes/rounded.png',
  'app/junqi/themes/duotone.png',
  'app/walls/index.html',
  'app/walls/engine.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // 一個檔案抓不到也不要讓整個安裝失敗
      return Promise.all(FILES.map(function (path) {
        return fetch(new Request(path, { cache: 'reload' }))
          .then(function (res) { if (res.ok) return cache.put(path, res); })
          .catch(function () { /* 略過 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== VERSION) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 網址結尾是資料夾(例如 app/junqi/)時,對應到裡面的 index.html
function cacheKey(request) {
  var url = new URL(request.url);
  url.search = '';
  url.hash = '';
  if (url.pathname.slice(-1) === '/') url.pathname += 'index.html';
  return url.href;
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).then(function (res) {
      // 有網路:用最新的,順便更新快取
      if (res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (cache) { cache.put(cacheKey(request), copy); });
      }
      return res;
    }).catch(function () {
      // 沒網路:用存好的
      return caches.open(VERSION).then(function (cache) {
        return cache.match(cacheKey(request)).then(function (hit) {
          return hit || new Response('目前離線,而且這個頁面還沒有存到裝置上。', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      });
    })
  );
});
