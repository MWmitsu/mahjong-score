/* Service Worker（ホスティング時のオフライン対応・PWA化用）。
   file:// やローカルでは登録されない（index.html 側でガード）。
   アプリのファイルを更新したら CACHE のバージョンを上げること。 */
const CACHE = "mahjong-v7";
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./icon.svg",
  "./css/styles.css",
  "./js/domain.js", "./js/store.js", "./js/sampleData.js", "./js/selftest.js",
  "./js/ui.js", "./js/components.js", "./js/sheets.js", "./js/stats.js", "./js/cloud.js", "./js/app.js",
  "./js/screens/players.js", "./js/screens/rules.js", "./js/screens/rooms.js",
  "./js/screens/sheet.js", "./js/screens/playerStats.js", "./js/screens/ranking.js",
  "./js/screens/data.js",
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
