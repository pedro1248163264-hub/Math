const CACHE = 'calculo-rapido-v7';
const ASSETS = [
  './',
  './index.html',
  './assets/styles.css',
  './assets/app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições que não sejam GET
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // A navegação sempre tem uma página-reserva. Isso evita a tela em branco no
    // GitHub Pages quando o aparelho abre o app já sem conexão.
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put('./index.html', response.clone());
        return response;
      } catch {
        return (await cache.match('./index.html')) || Response.error();
      }
    }

    const cached = await cache.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      // Não grava respostas de erro; fontes com resposta opaca continuam podendo
      // ser guardadas após o primeiro carregamento online.
      if (response.ok || response.type === 'opaque') cache.put(event.request, response.clone());
      return response;
    } catch {
      return (await caches.match(event.request)) || Response.error();
    }
  })());
});
