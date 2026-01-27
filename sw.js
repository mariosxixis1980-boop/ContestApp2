const CACHE = "cmp-v2"; // ⬅️ άλλαξε το σε v3, v4 κτλ όταν αλλάζεις αρχεία
const ASSETS = [
  "./",
  "./login.html",
  "./dashboard.html",
  "./leaderboard.html",
  "./admin.html",
  "./pay.html",
  "./terms.html",
  "./rules.html",
  "./admin.js",
  "./manifest.webmanifest",

  "./assets/logo.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Μόνο GET requests
  if (e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      // 1) αν υπάρχει cache -> δώσε το
      if (cached) return cached;

      // 2) αλλιώς προσπάθησε network και σώσε το
      return fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => {
          // fallback: αν πέσει το net, πήγαινε στο login από cache
          return caches.match("./login.html");
        });
    })
  );
});