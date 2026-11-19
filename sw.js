// Met en cache l'application pour un démarrage instantané (cartes et trafic restent en ligne).
const V='ponctuel-v15', SHELL=['./','index.html','app.js?v=15','manifest.json','vendor/maplibre-gl.js','vendor/maplibre-gl.css'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>!k.startsWith(V)).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin===location.origin){ // appli : réseau d'abord (sans cache HTTP), copie locale si hors ligne
    e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r;}).catch(()=>caches.match(e.request)));
  } else if(/openfreemap|tile\.openstreetmap|arcgisonline|creativeclaw/.test(u.host)){ // fonds de carte : zones déjà vues disponibles hors ligne
    e.respondWith(caches.open(V+'-tiles').then(c=>c.match(e.request).then(hit=>{const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>hit);return hit||net;})));
  }
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(l=>l[0]?l[0].focus():clients.openWindow('./')));});
