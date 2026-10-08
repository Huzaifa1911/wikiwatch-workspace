/* WikiWatch: offline app shell only. Wikimedia/API traffic is never cached. */
const PREFIX = 'wikiwatch:' + encodeURIComponent(new URL(self.registration.scope).pathname) + ':';
const CACHE = PREFIX + '__BUILD_VERSION__';
const SHELL = new URL('index.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(SHELL, {cache:'reload'}))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin) return;
  const path = new URL(self.registration.scope).pathname;
  if (url.pathname !== path && url.pathname !== path + 'index.html' && url.pathname !== path + 'Patrol-Desk.html') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(event.request, {signal:controller.signal});
      if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
        await cache.put(SHELL, response.clone());
        return response;
      }
      return (await cache.match(SHELL)) || response;
    } catch {
      return (await cache.match(SHELL)) || new Response('WikiWatch is not cached yet. Open it once online.', {status:503,headers:{'Content-Type':'text/plain'}});
    } finally { clearTimeout(timeout); }
  })());
});
