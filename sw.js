// Kešo versija suderinta su programos versija (v203 — 2026-06-19)
const CACHE_NAME = 'superpadel-cache-v203';

// Visi ekosistemos resursai, kurie privalo veikti neprisijungus prie interneto
const ASSETS = [
    '/',
    '/index.html',
    '/registras',
    '/registras.html',
    '/css/styles.css',
    '/css/registras.css',
    '/js/config.js',
    '/js/storage.js',
    '/js/logic.js',
    '/js/ui.js',
    '/js/app.js',
    '/js/registras_auth.js',
    '/js/registras_live.js',
    '/js/registras_tournaments.js',
    '/js/registras_admin.js',
    '/js/registras_cam.js',
    '/js/registras_webrtc.js',
    '/manifest.json'
];

// 1. Diegimas (Install) - Atsisiunčiame ir išsaugome pagrindinius failus
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Naudojame Promise.allSettled saugiklį: jei kurio nors failo kuriamame serveryje laikinai nėra,
        // visas Service Worker diegimas vis tiek sėkmingai užbaigiamas.
        return Promise.allSettled(
          ASSETS.map(url => cache.add(url).catch(err => console.warn(`Nepavyko nukešuoti resurso: ${url}`, err)))
        );
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Aktyvavimas (Activate) - Automatinis senų kešų išvalymas (Cache-Busting)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// 3. Užklausų valdymas (Fetch) - „Network-First, Fallback to Cache“ strategija
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Filtruojame užklausas: tvarkome tik savo domeno (superpadel.lt) GET užklausas
  // Ignoruojame išorinius Firebase serverius, CDN skriptus bei naršyklės plėtinius
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Jei tinklo užklausa sėkminga (kodas 200), atnaujiname kešą fone šviežiausia versija
        if (res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => {
        // Jei dingo internetas (Network Error), ieškome tikslaus failo keše
        return caches.match(req).then((cached) => {
          if (cached) return cached;

          // Jei vartotojas bando atidaryti puslapį, kurio nėra keše (arba naudojamas specifinis Clean URL maršrutas),
          // kaip universalų saugiklį grąžiname pagrindinį turnyro langą
          if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});
