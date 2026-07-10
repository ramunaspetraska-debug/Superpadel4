// === FIREBASE PUSH PRANEŠIMAI (foniniai) ===
// Messaging integruotas į PAGRINDINĮ service worker'į, kad nereikėtų atskiro
// firebase-messaging-sw.js (du SW konfliktuoja PWA aplinkoje — "no active Service Worker").
// ⚠️ messagingSenderId ir appId turi sutapti su registras_auth.js
try {
  importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyC_Z6srTcBfOWjG0aUKIoLD74ucozLUBHc",
    authDomain: "padelio-turnyrai.firebaseapp.com",
    databaseURL: "https://padelio-turnyrai-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "padelio-turnyrai",
    storageBucket: "padelio-turnyrai.firebasestorage.app",
    messagingSenderId: "496685297949",
    appId: "1:496685297949:web:f851696c783185f2de71f4"
  });
  const _fcm = firebase.messaging();
  _fcm.onBackgroundMessage(function (payload) {
    const n = (payload && payload.notification) || {};
    const d = (payload && payload.data) || {};
    self.registration.showNotification(n.title || 'SuperPadel.lt', {
      body: n.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: d.url || '/registras.html' }
    });
  });
} catch (e) { /* jei CDN nepasiekiamas offline režime — SW vis tiek veikia toliau */ }

// Bakstelėjus pranešimą — atidaryti portalą
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/registras.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if (w.url.includes('registras') && 'focus' in w) return w.focus(); }
      return clients.openWindow(url);
    })
  );
});

// Kešo versija suderinta su programos versija (v212 — 2026-06-19)
const CACHE_NAME = 'superpadel-cache-v277';

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
    '/js/vendor/qrcode.js',
    '/js/registras_webrtc.js',
    '/js/registras_courtview.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable.png',
    '/apple-touch-icon.png',
    '/favicon-64.png'
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
