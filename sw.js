// Met en cache l'application pour un démarrage instantané (les cartes et le trafic restent en ligne).
const V='ponctuel-v1', SHELL=['./','index.html','app.js','manifest.json','icon.svg','icon-192.png','vendor/leaflet.js','vendor/leaflet.css'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin===location.origin){ // appli : réseau d'abord, cache si hors ligne
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r;}).catch(()=>caches.match(e.request)));
  } else if(/basemaps\.cartocdn|arcgisonline/.test(u.host)){ // tuiles de fond : cache pour les zones déjà vues
    e.respondWith(caches.open(V+'-tiles').then(c=>c.match(e.request).then(hit=>{const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>hit);return hit||net;})));
  }
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(l=>l[0]?l[0].focus():clients.openWindow('./')));});
