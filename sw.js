// Service worker: abre sem internet (guarda a última cópia) e mostra os avisos (Web Push).
const CACHE = 'theo';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Rede primeiro: cada publicação nova chega sozinha; sem rede, usa a cópia guardada.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || (u.origin !== location.origin && u.hostname !== 'cdn.jsdelivr.net')) return;
  // Imagens: usa a cópia guardada na hora (abertura sem espera) e atualiza por trás.
  if (/\.(jpe?g|png|svg|gif)$/.test(u.pathname)) {
    const rede = fetch(e.request).then(r => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); } return r; });
    e.respondWith(caches.match(e.request).then(c => c || rede));
    e.waitUntil(rede.catch(() => {}));
    return;
  }
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.titulo || 'Sudoku das Cores', {
    body: d.texto || '', icon: 'icone-192.png', badge: 'icone-192.png', tag: d.tag, data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data.url, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const aberta = ws.find(w => w.url.split('?')[0] === url);
    return aberta ? aberta.focus() : self.clients.openWindow(url);
  }));
});
