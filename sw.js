/* Charme — service worker.
   Tiene il CODICE dell'app dentro il tablet, così funziona senza rete.
   Non tocca in alcun modo i DATI (clienti, appuntamenti, impostazioni):
   quelli vivono in IndexedDB e sopravvivono a ogni aggiornamento. */

const VERSIONE = 'charme-v1.2.0';

const RISORSE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './version.json',
  './icona-192.png',
  './icona-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSIONE)
      .then(c => c.addAll(RISORSE))
      .catch(err => console.warn('[Charme sw] precaricamento parziale', err))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const chiave of await caches.keys()) {
      if (chiave !== VERSIONE) await caches.delete(chiave);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'attiva-subito') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const richiesta = e.request;
  if (richiesta.method !== 'GET') return;

  const url = new URL(richiesta.url);
  if (url.origin !== location.origin) return;   // WhatsApp e simili passano diretti

  // Rete prima per index.html e version.json: così un aggiornamento si nota subito.
  const primaLaRete = url.pathname.endsWith('/') ||
                      url.pathname.endsWith('index.html') ||
                      url.pathname.endsWith('version.json');

  if (primaLaRete) {
    e.respondWith((async () => {
      try {
        const risposta = await fetch(richiesta);
        const cache = await caches.open(VERSIONE);
        cache.put(richiesta, risposta.clone());
        return risposta;
      } catch {
        return (await caches.match(richiesta)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // Tutto il resto: cache prima, con aggiornamento silenzioso in sottofondo.
  e.respondWith((async () => {
    const inCache = await caches.match(richiesta);
    const dallaRete = fetch(richiesta).then(async (risposta) => {
      if (risposta && risposta.status === 200) {
        const cache = await caches.open(VERSIONE);
        cache.put(richiesta, risposta.clone());
      }
      return risposta;
    }).catch(() => null);
    return inCache || (await dallaRete) || new Response('Non disponibile offline', { status: 503 });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of finestre) { if ('focus' in f) return f.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./index.html?vista=promemoria');
  })());
});
