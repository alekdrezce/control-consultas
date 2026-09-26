// Service worker mínimo: permite instalar la app en PC y teléfono.
// No guarda nada en caché: siempre se usa la versión publicada y los datos en vivo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
