// Keeps the app working offline and shows the scheduled notifications.
// The page itself is fetched fresh when there is a connection (so updates arrive)
// and served from the cache when there is not.
const CACHE = 'nn-v7';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => put('./index.html', res)).catch(() => caches.match('./index.html')));
    return;
  }
  if (url.origin === location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => put(r, res))));
  }
});

/* ---------- notifications ---------- */
function readData() {
  return new Promise(res => {
    try {
      const r = indexedDB.open('nn', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => {
        try { const g = r.result.transaction('kv', 'readonly').objectStore('kv').get('data'); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); }
        catch (e) { res(null); }
      };
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function dailyMessage() {
  const d = await readData();
  const fallback = { title: '🔥 HORA DE RELLENAR 🔥', body: 'Abre la app y marca tus non negotiables de hoy ✅' };
  if (!d || !Array.isArray(d.habits) || !d.habits.length) return fallback;
  const now = new Date(), today = key(now), done = (d.days && d.days[today]) || {};
  const wd = (now.getDay() + 6) % 7, mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - wd);
  const missing = d.habits.filter(h => {
    if (done[h.id]) return false;
    if (h.type !== 'weekly') return true;
    let c = 0; for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); if (d.days && d.days[key(x)] && d.days[key(x)][h.id]) c++; }
    const need = (h.target || 1) - c, daysLeft = 7 - wd;
    return need > 0 && need >= daysLeft; // only nag about a weekly habit when the week is at risk
  });
  const n = d.habits.length, ok = d.habits.filter(h => done[h.id]).length;
  if (!missing.length) return { title: '✅ DÍA COMPLETO 🔥', body: `${ok}/${n} hechos. Así se hace 💪` };
  if (!ok) return { title: '🔥 HORA DE RELLENAR 🔥', body: `Aún no has marcado nada hoy. Te faltan: ${missing.map(h => h.name).join(', ')}` };
  return { title: `🔥 TE FALTAN ${missing.length} 🔥`, body: `${ok}/${n} hechos. Quedan: ${missing.map(h => h.name).join(', ')}` };
}

self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    let msg, tab;
    if (p.kind === 'weigh') { msg = { title: '⚖️ PÉSATEEE!!!! ⚖️', body: 'Lunes 6:30. En ayunas, a la báscula y apúntalo 💪🔥' }; tab = 'peso'; }
    else if (p.kind === 'daily') { msg = await dailyMessage(); tab = 'hoy'; }
    else if (p.kind === 'phrase') { msg = { title: p.title || '', body: p.body || '' }; tab = 'hoy'; } // heading set by notify/send.js
    else { msg = { title: p.title || 'Non Negotiables', body: p.body || '' }; tab = 'hoy'; }
    await self.registration.showNotification(msg.title, {
      body: msg.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
      tag: (p.kind || 'nn') + (p.n ? '-' + p.n : ''), renotify: true, data: { tab }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const tab = (e.notification.data && e.notification.data.tab) || 'hoy';
  const url = new URL('./#' + tab, self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { c.postMessage({ tab }); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
