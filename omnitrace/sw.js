/* OmniTrace PWA service worker — HTML: önce ağ, varlıklar: önce önbellek */
var C = 'ot-v2';
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.filter(function(k){ return k !== C; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function(e){
  if (e.request.method !== 'GET') return;
  var u = new URL(e.request.url);
  if (u.origin !== location.origin) return; /* CDN'lere karışma */
  var isHTML = e.request.mode === 'navigate' || u.pathname.endsWith('.html');
  if (isHTML){
    /* ağ öncelikli: güncel içerik, çevrimdışıysa önbellek */
    e.respondWith(
      fetch(e.request).then(function(r){
        var cp = r.clone();
        caches.open(C).then(function(c){ c.put(e.request, cp); });
        return r;
      }).catch(function(){ return caches.match(e.request); })
    );
  } else {
    /* varlıklar önbellek öncelikli */
    e.respondWith(
      caches.match(e.request).then(function(m){
        return m || fetch(e.request).then(function(r){
          var cp = r.clone();
          caches.open(C).then(function(c){ c.put(e.request, cp); });
          return r;
        });
      })
    );
  }
});
