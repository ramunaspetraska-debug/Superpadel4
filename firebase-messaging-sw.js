/* SuperPadel.lt — Push pranešimų service worker (FCM, fonas) */
/* ⚠️ messagingSenderId ir appId turi sutapti su registras_auth.js */
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyC_Z6srTcBfOWjG0aUKIoLD74ucozLUBHc",
    authDomain: "padelio-turnyrai.firebaseapp.com",
    projectId: "padelio-turnyrai",
    storageBucket: "padelio-turnyrai.firebasestorage.app",
    messagingSenderId: "PASTE_SENDER_ID",
    appId: "PASTE_APP_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
    const n = (payload && payload.notification) || {};
    const data = (payload && payload.data) || {};
    self.registration.showNotification(n.title || 'SuperPadel.lt', {
        body: n.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag || undefined,
        renotify: !!data.tag,
        data: data
    });
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
            for (const c of list) { if ('focus' in c) return c.focus(); }
            if (clients.openWindow) return clients.openWindow('/registras.html');
        })
    );
});
