// Service Worker (disabled)
// This project doesn't rely on offline caching.
// Keeping an empty SW avoids syntax errors if the browser tries to load it.

self.addEventListener('install', (event) => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
