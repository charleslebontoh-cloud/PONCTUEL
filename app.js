/* Ponctuel — navigation anti-retard.
   Sources de données :
   - Itinéraires + trafic temps réel : TomTom Routing API (clé gratuite) ; sinon OSRM (sans trafic) + historique perso.
   - Trafic en direct sur la carte : tuiles TomTom Traffic Flow.
   - Satellite : Esri World Imagery (haute résolution) ; NASA GIBS (MODIS, image du jour, 250 m).
   - Recherche d'adresses : TomTom Search (si clé) puis Photon (OpenStreetMap) puis Nominatim.
   Tout l'historique (lieux, trajets, vitesses apprises) reste sur le téléphone (localStorage). */
'use strict';

/* ================= Utilitaires ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('pc_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pc_' + k, JSON.stringify(v)); } catch (e) { console.warn('stockage plein', e); } }
};
const R = 6371000, rad = d => d * Math.PI / 180;
function hav(a, b) { // a,b = [lat,lng]
  const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function distToSeg(p, a, b) { // mètres, projection équirectangulaire locale
  const k = Math.cos(rad(p[0]));
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0], bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return { d: Math.sqrt(x * x + y * y) * 111320, t };
}
const fmtTime = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function fmtDur(s) { s = Math.max(0, Math.round(s / 60)); if (s < 60) return s + ' min'; return Math.floor(s / 60) + ' h ' + String(s % 60).padStart(2, '0'); }
function fmtDurHtml(s) { s = Math.max(0, Math.round(s / 60)); if (s < 60) return `${s}<small> min</small>`; return `${Math.floor(s / 60)}<small> h </small>${String(s % 60).padStart(2, '0')}`; }
const fmtKm = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km';
let toastT;
function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
async function getJSON(url, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

/* ================= État ================= */
const S = {
  set: Object.assign({ key: '', buffer: 10, voice: true, track: true, tolls: false, highways: false, autoSat: true, reroute: true }, store.get('settings', {})),
  places: store.get('places', []),     // {id,lat,lng,name,tag,visits,hours[24],dows[7],mins,last}
  trips: store.get('trips', []),       // {start,end,toName,planned,lateMin,dist}
  cells: store.get('cells', {}),       // "la_lo_how" -> [n, sommeVitesse]
  A: null, B: null,                    // {lat,lng,name}
  routes: [], sel: 0, jams: [], satIdx: 0,
  pos: null, heading: null, speed: 0,
  nav: null, base: 'plan', traffic: false, heat: false
};
const saveSet = () => store.set('settings', S.set);
const savePlaces = () => store.set('places', S.places);

/* ================= Carte ================= */
const ABIDJAN = [5.3364, -4.0267];
const map = L.map('map', { zoomControl: false, attributionControl: true }).setView(store.get('view', ABIDJAN), store.get('zoom', 13));
map.on('moveend', () => { store.set('view', [map.getCenter().lat, map.getCenter().lng]); store.set('zoom', map.getZoom()); });
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
function mkBase(kind) {
  if (kind === 'sat') return L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagerie © Esri, Maxar, Earthstar' }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, opacity: .8 })
  ]);
  if (kind === 'nasa') return L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    { time: yesterday, maxNativeZoom: 9, maxZoom: 20, attribution: 'NASA EOSDIS GIBS / Worldview' });
  const style = matchMedia('(prefers-color-scheme: light)').matches ? 'voyager' : 'dark_all';
  return L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style === 'voyager' ? 'rastertiles/voyager' : 'dark_all'}/{z}/{x}/{y}{r}.png`,
    { subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap © CARTO' });
}
let baseLayer = mkBase('plan').addTo(map);
const BASES = ['plan', 'sat', 'nasa'], BASE_LBL = { plan: 'PLAN', sat: 'SAT', nasa: 'NASA' };
$('#bLayer').onclick = () => {
  S.base = BASES[(BASES.indexOf(S.base) + 1) % 3];
  map.removeLayer(baseLayer); baseLayer = mkBase(S.base).addTo(map); baseLayer.bringToBack?.();
  $('#bLayer').textContent = BASE_LBL[S.base];
  if (S.base === 'nasa') toast('NASA GIBS : image satellite d’hier (MODIS, 250 m/pixel). Utile pour la météo et les nuages, pas pour voir les voitures.', 6000);
  if (S.base === 'sat') toast('Satellite haute résolution Esri. Activez le trafic pour superposer les bouchons en direct.');
};
const trafficUrl = () => `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(S.set.key)}&thickness=8&tileSize=256`;
const incUrl = () => `https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=${encodeURIComponent(S.set.key)}&tileSize=256`;
let trafficLayer = null;
function setTraffic(on) {
  if (on && !S.set.key) { toast('Ajoutez votre clé TomTom gratuite dans Réglages pour voir le trafic en direct.'); showTab('settings'); return; }
  S.traffic = on; $('#bTraffic').classList.toggle('on', on);
  if (trafficLayer) { map.removeLayer(trafficLayer); trafficLayer = null; }
  if (on) trafficLayer = L.layerGroup([L.tileLayer(trafficUrl(), { maxZoom: 22, opacity: .9, zIndex: 400 }), L.tileLayer(incUrl(), { maxZoom: 22, zIndex: 401 })]).addTo(map);
}
$('#bTraffic').onclick = () => setTraffic(!S.traffic);

const routeLayer = L.layerGroup().addTo(map);
const markLayer = L.layerGroup().addTo(map);
const heatLayer = L.layerGroup();
const placeLayer = L.layerGroup().addTo(map);
const pinIcon = l => L.divIcon({ className: '', html: `<div class="pin ${l.toLowerCase()}"><span>${l}</span></div>`, iconSize: [26, 26], iconAnchor: [4, 26] });
let meMarker = null, accCircle = null;

/* ================= Horloge ================= */
function tick() { $('#clock').textContent = fmtTime(new Date()); }
setInterval(tick, 10000); tick();

/* ================= Géolocalisation + apprentissage ================= */
let watchId = null, follow = false, lastFix = null, stay = null;
function startGeo() {
  if (!('geolocation' in navigator)) { toast('GPS indisponible sur cet appareil.'); return; }
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition(onFix, e => {
    if (e.code === 1) toast('Autorisez la localisation pour Ponctuel (réglages du navigateur).', 6000);
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
function onFix(p) {
  const c = p.coords, now = p.timestamp || Date.now();
  const here = [c.latitude, c.longitude];
  let spd = c.speed != null && c.speed >= 0 ? c.speed * 3.6 : null;
  if (spd == null && lastFix && now - lastFix.t > 1500) spd = hav(lastFix.p, here) / ((now - lastFix.t) / 1000) * 3.6;
  if (lastFix && spd != null && spd > 4 && c.heading == null) {
    const y = Math.sin(rad(here[1] - lastFix.p[1])) * Math.cos(rad(here[0]));
    const x = Math.cos(rad(lastFix.p[0])) * Math.sin(rad(here[0])) - Math.sin(rad(lastFix.p[0])) * Math.cos(rad(here[0])) * Math.cos(rad(here[1] - lastFix.p[1]));
    S.heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  } else if (c.heading != null && !isNaN(c.heading)) S.heading = c.heading;
  if (spd != null && spd > 220) spd = null; // saut GPS aberrant
  S.speed = spd ?? S.speed ?? 0; S.pos = here;
  if (c.accuracy < 60 && lastFix && now - lastFix.t >= 4000) { learn(here, S.speed, now); lastFix = { p: here, t: now }; }
  if (!lastFix) lastFix = { p: here, t: now };
  detectStay(here, now, c.accuracy);
  drawMe(c.accuracy);
  if (follow) map.setView(here, Math.max(map.getZoom(), 16), { animate: true });
  if (S.nav) navUpdate();
}
function drawMe(acc) {
  const nav = !!S.nav;
  const icon = L.divIcon({ className: '', html: `<div class="me ${nav ? 'nav' : ''}" style="${nav && S.heading != null ? `transform:rotate(${S.heading}deg)` : ''}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
  if (!meMarker) { meMarker = L.marker(S.pos, { icon, zIndexOffset: 1000, interactive: false }).addTo(map); accCircle = L.circle(S.pos, { radius: acc, weight: 0, fillOpacity: .12, interactive: false }).addTo(map); }
  else { meMarker.setLatLng(S.pos).setIcon(icon); accCircle.setLatLng(S.pos).setRadius(acc); }
}
$('#bLocate').onclick = () => {
  startGeo();
  if (S.pos) { map.setView(S.pos, 16); follow = true; } else { follow = true; toast('Recherche du GPS…'); }
};
map.on('dragstart', () => { if (!S.nav) follow = false; });

// Vitesses apprises par cellule (~370 m) et par heure de la semaine
const cellKey = (p, how) => `${Math.round(p[0] * 300)}_${Math.round(p[1] * 300)}_${how}`;
const howOf = d => (d.getDay() * 24 + d.getHours());
let cellsDirty = 0;
function learn(p, kmh, t) {
  if (!S.set.track || kmh == null || kmh > 160) return;
  if (kmh < 3 && !S.nav) return; // à l'arrêt hors trajet : ce n'est pas du trafic
  const k = cellKey(p, howOf(new Date(t)));
  const v = S.cells[k] || [0, 0]; v[0]++; v[1] += kmh; S.cells[k] = v;
  if (++cellsDirty > 10) { cellsDirty = 0; pruneCells(); store.set('cells', S.cells); }
}
function pruneCells() { const ks = Object.keys(S.cells); if (ks.length > 40000) ks.sort((a, b) => S.cells[a][0] - S.cells[b][0]).slice(0, ks.length - 30000).forEach(k => delete S.cells[k]); }
function learnedSpeed(p, d) { // moyenne sur l'heure demandée ±1 h
  const h = howOf(d); let n = 0, s = 0;
  for (const dh of [-1, 0, 1]) { const v = S.cells[cellKey(p, (h + dh + 168) % 168)]; if (v) { n += v[0]; s += v[1]; } }
  return n >= 3 ? s / n : null;
}

// Détection des lieux fréquentés : arrêt de 5 min dans un rayon de 120 m
function detectStay(p, t, acc) {
  if (!S.set.track || acc > 80) return;
  if (!stay || hav(stay.p, p) > 120) {
    if (stay && stay.saved) closeStay(stay, t);
    stay = { p, t0: t, saved: false };
    return;
  }
  if (!stay.saved && t - stay.t0 > 5 * 60000) { stay.saved = true; stay.placeId = registerVisit(stay.p, stay.t0); }
}
function closeStay(st, t) { const pl = S.places.find(x => x.id === st.placeId); if (pl) { pl.mins = (pl.mins || 0) + Math.round((t - st.t0) / 60000); savePlaces(); } }
function registerVisit(p, t0) {
  const d = new Date(t0);
  let pl = S.places.find(x => hav([x.lat, x.lng], p) < 150);
  if (!pl) {
    pl = { id: 'p' + Date.now().toString(36), lat: p[0], lng: p[1], name: 'Lieu ' + (S.places.length + 1), tag: '', visits: 0, hours: Array(24).fill(0), dows: Array(7).fill(0), mins: 0, last: 0 };
    S.places.push(pl);
    reverse(p).then(n => { if (n && /^Lieu \d+$/.test(pl.name)) { pl.name = n; savePlaces(); renderPlacesLayer(); if (curTab === 'places') render(); } });
  } else { // recentrage progressif
    pl.lat = (pl.lat * pl.visits + p[0]) / (pl.visits + 1); pl.lng = (pl.lng * pl.visits + p[1]) / (pl.visits + 1);
  }
  pl.visits++; pl.hours[d.getHours()]++; pl.dows[d.getDay()]++; pl.last = t0;
  savePlaces(); renderPlacesLayer();
  if (curTab === 'places') render();
  return pl.id;
}
function renderPlacesLayer() {
  placeLayer.clearLayers();
  S.places.forEach(pl => L.marker([pl.lat, pl.lng], { icon: L.divIcon({ className: '', html: '<div class="placepin"></div>', iconSize: [14, 14] }) })
    .bindTooltip(esc(pl.name) + ` · ${pl.visits} visite${pl.visits > 1 ? 's' : ''}`).on('click', () => setB({ lat: pl.lat, lng: pl.lng, name: pl.name })).addTo(placeLayer));
  const home = S.places.find(p => p.tag === 'home'), work = S.places.find(p => p.tag === 'work');
  $('#chipHome').hidden = !home; $('#chipWork').hidden = !work;
}
$('#chipHome').onclick = () => { const p = S.places.find(x => x.tag === 'home'); if (p) { setB({ lat: p.lat, lng: p.lng, name: p.name }); calc(); } };
$('#chipWork').onclick = () => { const p = S.places.find(x => x.tag === 'work'); if (p) { setB({ lat: p.lat, lng: p.lng, name: p.name }); calc(); } };

// Suggestion de destination selon l'heure et le jour
function predict() {
  const d = new Date(), h = d.getHours(), dw = d.getDay();
  const cands = S.places.filter(p => !S.pos || hav(S.pos, [p.lat, p.lng]) > 400)
    .map(p => ({ p, s: (p.hours[h] * 2 + (p.hours[(h + 1) % 24] || 0)) * (1 + p.dows[dw] / Math.max(1, p.visits)) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const hint = $('#hint');
  if (!cands.length || S.B) { hint.hidden = true; return; }
  hint.hidden = false;
  hint.innerHTML = 'À cette heure, vous allez souvent à ' + cands.slice(0, 3).map((c, i) => `<button class="chip" data-i="${i}">${esc(c.p.name)}</button>`).join('');
  hint.querySelectorAll('button').forEach(b => b.onclick = () => { const p = cands[+b.dataset.i].p; setB({ lat: p.lat, lng: p.lng, name: p.name }); calc(); });
}

/* ================= Recherche d'adresses ================= */
async function geocode(q) {
  const near = S.pos || [map.getCenter().lat, map.getCenter().lng];
  const out = [];
  // Lieux mémorisés d'abord
  const ql = q.toLowerCase();
  S.places.filter(p => p.name.toLowerCase().includes(ql)).slice(0, 3).forEach(p => out.push({ lat: p.lat, lng: p.lng, name: p.name, sub: 'Lieu mémorisé · ' + p.visits + ' visites' }));
  if (S.set.key) {
    try {
      const j = await getJSON(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(S.set.key)}&limit=6&language=fr-FR&typeahead=true&lat=${near[0]}&lon=${near[1]}`);
      (j.results || []).forEach(r => out.push({ lat: r.position.lat, lng: r.position.lon, name: r.poi?.name || r.address?.freeformAddress, sub: r.address?.freeformAddress || '' }));
      if (out.length) return out;
    } catch (e) { console.warn(e); }
  }
  try {
    const j = await getJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=fr&lat=${near[0]}&lon=${near[1]}`);
    (j.features || []).forEach(f => { const p = f.properties; out.push({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], name: p.name || [p.housenumber, p.street].filter(Boolean).join(' '), sub: [p.street, p.district, p.city, p.country].filter(Boolean).join(', ') }); });
    if (out.length) return out;
  } catch (e) { console.warn(e); }
  const j = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=fr&q=${encodeURIComponent(q)}`);
  j.forEach(r => out.push({ lat: +r.lat, lng: +r.lon, name: r.name || r.display_name.split(',')[0], sub: r.display_name }));
  return out;
}
async function reverse(p) {
  try {
    if (S.set.key) { const j = await getJSON(`https://api.tomtom.com/search/2/reverseGeocode/${p[0]},${p[1]}.json?key=${encodeURIComponent(S.set.key)}&language=fr-FR`); const a = j.addresses?.[0]?.address; if (a) return a.streetName ? `${a.streetName}${a.municipalitySubdivision ? ', ' + a.municipalitySubdivision : ''}` : a.freeformAddress; }
    const j = await getJSON(`https://photon.komoot.io/reverse?lat=${p[0]}&lon=${p[1]}&lang=fr`);
    const q = j.features?.[0]?.properties; if (q) return q.name || [q.street, q.district || q.city].filter(Boolean).join(', ');
  } catch (e) { console.warn(e); }
  return null;
}
let sugTarget = null, sugTimer;
function bindSearch(inp, which) {
  inp.addEventListener('input', () => {
    clearTimeout(sugTimer); const q = inp.value.trim();
    if (which === 'A') S.A = null; else S.B = null;
    if (q.length < 3) { $('#suggest').hidden = true; return; }
    sugTimer = setTimeout(async () => {
      sugTarget = which;
      try {
        const res = await geocode(q);
        const box = $('#suggest');
        box.innerHTML = (which === 'A' ? '<button data-i="-1"><b>Ma position</b><small>GPS</small></button>' : '') +
          (res.length ? res.map((r, i) => `<button data-i="${i}"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></button>`).join('') : '<button disabled><small>Aucun résultat. Essayez avec le quartier ou la commune.</small></button>');
        box.hidden = false;
        box.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => {
          const i = +b.dataset.i; box.hidden = true;
          if (i < 0) { S.A = null; inp.value = ''; } else (which === 'A' ? setA : setB)(res[i]);
          if (S.B) calc();
        });
      } catch (e) { toast('Recherche impossible (réseau). Réessayez.'); }
    }, 350);
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('#suggest button[data-i="0"]') || $('#suggest button[data-i]'); f?.click(); } });
}
bindSearch($('#inA'), 'A'); bindSearch($('#inB'), 'B');
document.addEventListener('click', e => { if (!e.target.closest('#suggest,.field')) $('#suggest').hidden = true; });
function setA(p) { S.A = p; $('#inA').value = p.name; drawPins(); }
function setB(p) { S.B = p; $('#inB').value = p.name; $('#hint').hidden = true; drawPins(); }
$('#swap').onclick = () => {
  const a = S.A || (S.pos ? { lat: S.pos[0], lng: S.pos[1], name: 'Ma position' } : null);
  const b = S.B; S.A = b; S.B = a;
  $('#inA').value = b?.name || ''; $('#inB').value = a?.name || '';
  drawPins(); if (S.B) calc();
};
map.on('contextmenu', e => { // appui long : définir destination
  const p = { lat: e.latlng.lat, lng: e.latlng.lng, name: 'Point sur la carte' };
  setB(p); reverse([p.lat, p.lng]).then(n => { if (n && S.B === p) { p.name = n; $('#inB').value = n; } }); calc();
});
function drawPins() {
  markLayer.clearLayers();
  if (S.A) L.marker([S.A.lat, S.A.lng], { icon: pinIcon('A') }).addTo(markLayer);
  if (S.B) L.marker([S.B.lat, S.B.lng], { icon: pinIcon('B') }).addTo(markLayer);
}

/* ================= Itinéraires ================= */
function origin() {
  if (S.A) return S.A;
  if (S.pos) return { lat: S.pos[0], lng: S.pos[1], name: 'Ma position' };
  return null;
}
async function calc(opts = {}) {
  const a = opts.from || origin(), b = S.B;
  if (!b) { toast('Choisissez une destination.'); $('#inB').focus(); return; }
  if (!a) { startGeo(); toast('En attente du GPS… ou saisissez un point de départ.'); waitPosThen(calc); return; }
  if (!opts.silent) { showTab('trip'); $('#pane').innerHTML = '<p class="empty">Calcul des itinéraires et analyse du trafic…</p>'; }
  let routes;
  try { routes = S.set.key ? await tomtomRoutes(a, b) : await osrmRoutes(a, b); }
  catch (e) {
    console.warn(e);
    if (S.set.key) { try { routes = await osrmRoutes(a, b); toast('Trafic TomTom indisponible : itinéraire sans trafic en direct.'); } catch (e2) { console.warn(e2); } }
  }
  if (!routes?.length) { if (!opts.silent) $('#pane').innerHTML = '<p class="empty">Impossible de calculer l’itinéraire. Vérifiez la connexion internet, puis réessayez.</p>'; return; }
  routes.forEach(r => { applyPersonal(r); r.score = r.dur + r.jams.reduce((s, j) => s + (j.mag >= 3 ? 60 : 0), 0); });
  routes.sort((x, y) => x.score - y.score);
  routes[0].best = true;
  if (opts.silent) return routes;
  S.routes = routes; S.sel = 0; S.from = a;
  drawRoutes(); fitRoutes();
  render();
  await checkDestination();
  if (S.set.autoSat) autoSatellite();
  return routes;
}
function waitPosThen(fn) { const t0 = Date.now(); const iv = setInterval(() => { if (S.pos) { clearInterval(iv); fn(); } else if (Date.now() - t0 > 20000) clearInterval(iv); }, 500); }
$('#go').onclick = () => calc();

async function tomtomRoutes(a, b) {
  const avoid = [S.set.tolls && 'tollRoads', S.set.highways && 'motorways'].filter(Boolean).map(x => '&avoid=' + x).join('');
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lng}:${b.lat},${b.lng}/json?key=${encodeURIComponent(S.set.key)}` +
    `&traffic=true&routeType=fastest&travelMode=car&maxAlternatives=2&departAt=now&computeTravelTimeFor=all&sectionType=traffic&instructionsType=text&language=fr-FR${avoid}`;
  const j = await getJSON(url, 15000);
  return (j.routes || []).map(r => {
    const coords = r.legs.flatMap(l => l.points.map(p => [p.latitude, p.longitude]));
    const cum = cumDist(coords);
    const jams = (r.sections || []).filter(s => s.sectionType === 'TRAFFIC').map(s => {
      const seg = coords.slice(s.startPointIndex, s.endPointIndex + 1);
      return { coords: seg, at: seg[Math.floor(seg.length / 2)] || coords[s.startPointIndex], delay: s.delayInSeconds || 0, speed: s.effectiveSpeedInKmh, mag: s.magnitudeOfDelay ?? 1,
        cat: s.simpleCategory, len: cum[s.endPointIndex] - cum[s.startPointIndex], startOff: cum[s.startPointIndex], src: 'live' };
    });
    const steps = (r.guidance?.instructions || []).filter(i => i.message).map(i => ({ text: i.message.replace(/<[^>]+>/g, ''), at: [i.point.latitude, i.point.longitude], off: i.routeOffsetInMeters }));
    const sm = r.summary;
    return { coords, cum, dist: sm.lengthInMeters, dur: sm.travelTimeInSeconds, free: sm.noTrafficTravelTimeInSeconds ?? sm.travelTimeInSeconds - (sm.trafficDelayInSeconds || 0),
      hist: sm.historicTrafficTravelTimeInSeconds, delay: sm.trafficDelayInSeconds || 0, jams, steps, live: true };
  });
}
async function osrmRoutes(a, b) {
  const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?alternatives=3&overview=full&geometries=geojson&steps=true`, 15000);
  if (j.code !== 'Ok') throw new Error(j.code);
  return j.routes.map(r => {
    const coords = r.geometry.coordinates.map(c => [c[1], c[0]]);
    const cum = cumDist(coords);
    let idx = 0;
    const steps = r.legs.flatMap(l => l.steps).map(s => {
      const at = [s.maneuver.location[1], s.maneuver.location[0]];
      let best = idx, bd = Infinity; for (let i = idx; i < Math.min(coords.length, idx + 400); i++) { const d = hav(coords[i], at); if (d < bd) { bd = d; best = i; } }
      idx = best; return { text: osrmText(s), at, off: cum[best] };
    });
    // Durée OSRM « sans trafic » : on corrige avec un facteur urbain prudent (Abidjan) si aucune donnée apprise
    return { coords, cum, dist: r.distance, dur: r.duration * 1.35, free: r.duration, delay: r.duration * 0.35, jams: [], steps, live: false };
  });
}
const DIR = { left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite', 'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour' };
function osrmText(s) {
  const m = s.maneuver, d = DIR[m.modifier] || '', on = s.name ? ` sur ${s.name}` : '';
  switch (m.type) {
    case 'depart': return `Partez${on}`;
    case 'arrive': return 'Vous êtes arrivé à destination';
    case 'roundabout': case 'rotary': return `Au rond-point, prenez la ${m.exit || 1}${m.exit === 1 ? 're' : 'e'} sortie${on}`;
    case 'merge': return `Insérez-vous ${d}${on}`;
    case 'on ramp': return `Prenez la bretelle ${d}${on}`;
    case 'off ramp': return `Prenez la sortie ${d}${on}`;
    case 'fork': return `À l’embranchement, restez ${d}${on}`;
    case 'end of road': return `Au bout de la route, tournez ${d}${on}`;
    case 'continue': case 'new name': return `Continuez ${d === 'tout droit' ? 'tout droit' : d}${on}`;
    default: return m.modifier === 'uturn' ? 'Faites demi-tour' + on : `Tournez ${d}${on}`;
  }
}
function cumDist(c) { const out = [0]; for (let i = 1; i < c.length; i++) out.push(out[i - 1] + hav(c[i - 1], c[i])); return out; }

// Ajoute vos bouchons appris (heure + jour actuels) sur le tracé
function applyPersonal(r) {
  const now = new Date(); let extra = 0; let run = null;
  const flush = () => { if (run && run.len > 250) { r.jams.push({ coords: run.coords, at: run.coords[Math.floor(run.coords.length / 2)], delay: run.delay, speed: Math.round(run.sp / run.n), mag: run.sp / run.n < 10 ? 3 : 2, len: run.len, startOff: run.start, src: 'perso' }); extra += run.delay; } run = null; };
  for (let i = 0; i < r.coords.length; i += 3) {
    const p = r.coords[i], sp = learnedSpeed(p, now);
    const nearLive = r.jams.some(j => j.src === 'live' && j.coords.some(c => hav(c, p) < 150));
    if (sp != null && sp < 15 && !nearLive) {
      const j = Math.min(i + 3, r.coords.length - 1), seg = r.cum[j] - r.cum[i];
      if (!run) run = { coords: [], len: 0, delay: 0, sp: 0, n: 0, start: r.cum[i] };
      run.coords.push(p, r.coords[j]); run.len += seg; run.sp += sp; run.n++;
      run.delay += Math.max(0, seg / (Math.max(sp, 3) / 3.6) - seg / (30 / 3.6));
    } else flush();
  }
  flush();
  if (extra) { r.dur += extra; r.delay += extra; }
  r.jams.sort((x, y) => x.startOff - y.startOff);
}

function drawRoutes() {
  routeLayer.clearLayers();
  S.routes.forEach((r, i) => {
    if (i === S.sel) return;
    L.polyline(r.coords, { color: getCss('--alt'), weight: 6, opacity: .75 }).on('click', () => { S.sel = i; drawRoutes(); render(); }).addTo(routeLayer);
  });
  const r = S.routes[S.sel]; if (!r) return;
  L.polyline(r.coords, { color: '#08111c', weight: 11, opacity: .55 }).addTo(routeLayer);
  L.polyline(r.coords, { color: getCss('--route'), weight: 7 }).addTo(routeLayer);
  r.jams.forEach((j, k) => {
    L.polyline(j.coords, { color: j.mag >= 3 ? getCss('--jam') : getCss('--slow'), weight: 8, opacity: .95 }).addTo(routeLayer);
    if (j.mag >= 2 || j.delay >= 60) L.marker(j.at, { icon: L.divIcon({ className: '', html: '<div class="jampin">!</div>', iconSize: [26, 26] }) })
      .on('click', () => openSat(satList().indexOf(j))).addTo(routeLayer);
  });
}
const getCss = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function fitRoutes() { const all = S.routes.flatMap(r => r.coords); if (all.length) map.fitBounds(L.latLngBounds(all), { paddingTopLeft: [20, 200], paddingBottomRight: [70, (sheetH() || 200) + 20] }); }

// Destination embouteillée ? (vitesse réelle vs vitesse fluide au point B)
async function checkDestination() {
  S.destJam = null;
  const b = S.B, r = S.routes[S.sel];
  if (S.set.key) {
    try {
      const j = await getJSON(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/16/json?point=${b.lat},${b.lng}&unit=KMPH&key=${encodeURIComponent(S.set.key)}`);
      const f = j.flowSegmentData;
      if (f && f.freeFlowSpeed) {
        const ratio = f.currentSpeed / f.freeFlowSpeed;
        const coords = (f.coordinates?.coordinate || []).map(c => [c.latitude, c.longitude]);
        if (ratio < 0.65 || f.roadClosure) S.destJam = { coords: coords.length ? coords : [[b.lat, b.lng]], at: [b.lat, b.lng], speed: f.currentSpeed, free: f.freeFlowSpeed,
          delay: Math.max(0, (f.currentTravelTime || 0) - (f.freeFlowTravelTime || 0)), mag: ratio < .35 || f.roadClosure ? 4 : ratio < .5 ? 3 : 2, closed: f.roadClosure, dest: true, src: 'live' };
      }
    } catch (e) { console.warn(e); }
  }
  if (!S.destJam && r) { const near = r.jams.filter(j => hav(j.at, [b.lat, b.lng]) < 1200).sort((x, y) => y.mag - x.mag)[0]; if (near) S.destJam = Object.assign({ dest: true }, near); }
  if (!S.destJam) { const sp = learnedSpeed([b.lat, b.lng], new Date()); if (sp != null && sp < 12) S.destJam = { coords: [[b.lat, b.lng]], at: [b.lat, b.lng], speed: Math.round(sp), mag: 2, delay: 0, dest: true, src: 'perso' }; }
}
function satList() { const r = S.routes[S.sel]; const l = (r?.jams || []).filter(j => j.mag >= 2 || j.delay >= 60); if (S.destJam) l.unshift(S.destJam); return l; }
function autoSatellite() { const l = satList(); if (!l.length) return; openSat(0); }

/* ================= Vue satellite des bouchons ================= */
let satMap = null, satLayer = null, satTraffic = null;
function openSat(i) {
  const list = satList(); if (!list.length) return;
  S.satIdx = Math.max(0, Math.min(i, list.length - 1));
  $('#sat').hidden = false;
  if (!satMap) {
    satMap = L.map('satmap', { zoomControl: false, attributionControl: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19 }).addTo(satMap);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, opacity: .6 }).addTo(satMap);
    satLayer = L.layerGroup().addTo(satMap);
  }
  if (S.set.key && !satTraffic) satTraffic = L.tileLayer(trafficUrl(), { maxZoom: 22, opacity: .85 }).addTo(satMap);
  setTimeout(() => { satMap.invalidateSize(); showSat(); }, 30);
}
function showSat() {
  const list = satList(), j = list[S.satIdx]; if (!j) return;
  satLayer.clearLayers();
  if (j.coords.length > 1) L.polyline(j.coords, { color: '#ff4b4b', weight: 6, opacity: .9, dashArray: '10 6' }).addTo(satLayer);
  L.circleMarker(j.at, { radius: 9, color: '#fff', weight: 2, fillColor: '#ff4b4b', fillOpacity: 1 }).addTo(satLayer);
  if (j.coords.length > 1) satMap.fitBounds(L.latLngBounds(j.coords), { padding: [30, 30], maxZoom: 18 }); else satMap.setView(j.at, 17);
  const lvl = j.closed ? 'Route fermée' : j.mag >= 4 ? 'Bouchon total' : j.mag >= 3 ? 'Gros bouchon' : 'Circulation lente';
  $('#satTitle').textContent = (j.dest ? 'À destination · ' : '') + lvl;
  const bits = [];
  if (j.speed != null) bits.push(`${Math.round(j.speed)} km/h${j.free ? ` (normal ${Math.round(j.free)})` : ''}`);
  if (j.delay) bits.push(`+${fmtDur(j.delay)}`);
  if (j.len) bits.push(fmtKm(j.len));
  if (j.startOff != null && S.routes[S.sel]) bits.push(`dans ${fmtKm(j.startOff)}`);
  $('#satSub').textContent = bits.join(' · ');
  $('#satCap').textContent = j.src === 'perso'
    ? 'Bouchon prévu d’après vos trajets passés à cette heure. Image satellite haute résolution (date de prise variable).'
    : 'Trafic mesuré en direct (TomTom) superposé à l’image satellite haute résolution. L’image elle-même n’est pas filmée en direct.';
  $('#satIdx').textContent = `${S.satIdx + 1}/${list.length}`;
  $('#satEarth').href = `https://earth.google.com/web/@${j.at[0]},${j.at[1]},20a,600d,35y,0h,60t,0r`;
}
$('#satClose').onclick = () => $('#sat').hidden = true;
$('#satPrev').onclick = () => { const n = satList().length; S.satIdx = (S.satIdx - 1 + n) % n; showSat(); };
$('#satNext').onclick = () => { const n = satList().length; S.satIdx = (S.satIdx + 1) % n; showSat(); };
$('#satZoom').onclick = () => { const j = satList()[S.satIdx]; if (j) { map.setView(j.at, 17); } };

/* ================= Planificateur « arriver à l'heure » ================= */
const arriveIn = $('#arriveAt');
arriveIn.value = store.get('arrive', '');
arriveIn.onchange = () => {
  store.set('arrive', arriveIn.value);
  if (arriveIn.value && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  if (S.routes.length) render();
};
function targetDate() {
  if (!arriveIn.value) return null;
  const [h, m] = arriveIn.value.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() - 6 * 3600e3) d.setDate(d.getDate() + 1);
  return d;
}
function planInfo(r) {
  const t = targetDate(); if (!t || !r) return null;
  const need = r.dur + S.set.buffer * 60;
  const leave = new Date(t.getTime() - need * 1000);
  const slack = (leave.getTime() - Date.now()) / 1000;
  return { t, leave, slack, eta: new Date(Date.now() + r.dur * 1000) };
}
let notified = {};
setInterval(async () => { // re-vérifie le trafic et prévient quand partir
  const r = S.routes[S.sel]; const pi = planInfo(r); if (!pi || S.nav) return;
  if (S.set.key && S.B && Math.abs(pi.slack) < 3600) { const fresh = await calc({ silent: true }); if (fresh?.length) { S.routes = fresh; S.sel = 0; drawRoutes(); if (curTab === 'trip') render(); } }
  const p2 = planInfo(S.routes[S.sel]); if (!p2) return;
  const key = p2.leave.toISOString().slice(0, 16);
  if (p2.slack < 600 && p2.slack > 0 && !notified[key + 'a']) { notified[key + 'a'] = 1; notify(`Partez dans ${fmtDur(p2.slack)}`, `Pour arriver à ${fmtTime(p2.t)} à ${S.B?.name}. Trajet actuel : ${fmtDur(S.routes[S.sel].dur)}.`); }
  if (p2.slack <= 0 && p2.slack > -300 && !notified[key + 'b']) { notified[key + 'b'] = 1; notify('C’est l’heure de partir !', `${S.B?.name} — ${fmtDur(S.routes[S.sel].dur)} de route.`); }
}, 120000);
function notify(title, body) {
  toast(title + ' — ' + body, 8000); speak(title);
  try { if ('Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification(title, { body, icon: 'icon-192.png', tag: 'ponctuel' })).catch(() => new Notification(title, { body })); } catch { }
  navigator.vibrate?.([200, 100, 200]);
}

/* ================= Navigation guidée ================= */
let wakeLock = null;
async function startNav() {
  const r = S.routes[S.sel]; if (!r) return;
  startGeo(); follow = true;
  S.nav = { r, start: Date.now(), from: S.from, planned: targetDate()?.getTime() || null, spoken: {}, off: 0, lastCheck: Date.now(), done: 0, idx: 0 };
  $('#top').hidden = true; $('#sheet').hidden = true; $('#fab').hidden = true; $('#sat').hidden = true;
  $('#nav').hidden = false; $('#navbar').hidden = false; $('#speed').hidden = false;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { }
  speak(`C'est parti. Arrivée prévue à ${fmtTime(new Date(Date.now() + r.dur * 1000))}.`);
  if (S.pos) { map.setView(S.pos, 17); navUpdate(); } else toast('En attente du GPS…');
}
function stopNav(arrived) {
  const n = S.nav; if (!n) return;
  if (arrived || n.done > 500) {
    const end = Date.now(), lateMin = n.planned ? Math.round((end - n.planned) / 60000) : null;
    S.trips.unshift({ start: n.start, end, toName: S.B?.name || '', planned: n.planned, lateMin, dist: Math.round(n.done) });
    S.trips = S.trips.slice(0, 300); store.set('trips', S.trips);
    if (arrived) { speak(lateMin == null ? 'Vous êtes arrivé.' : lateMin <= 0 ? `Vous êtes arrivé, avec ${-lateMin} minutes d'avance.` : `Vous êtes arrivé, avec ${lateMin} minutes de retard.`); }
  }
  S.nav = null; store.set('cells', S.cells);
  try { wakeLock?.release(); } catch { } wakeLock = null;
  $('#top').hidden = false; $('#sheet').hidden = false; $('#fab').hidden = false;
  $('#nav').hidden = true; $('#navbar').hidden = true; $('#speed').hidden = true;
  if (S.pos) drawMe(30);
  render();
}
$('#nStop').onclick = () => stopNav(false);
$('#nMute').onclick = () => { S.set.voice = !S.set.voice; saveSet(); $('#nMute').textContent = S.set.voice ? '🔊' : '🔇'; };

function navUpdate() {
  const n = S.nav, r = n.r, p = S.pos;
  // position projetée sur le tracé (fenêtre glissante)
  let best = n.idx, bd = Infinity, bt = 0;
  const from = Math.max(0, n.idx - 30), to = Math.min(r.coords.length - 1, n.idx + 400);
  for (let i = from; i < to; i++) { const q = distToSeg(p, r.coords[i], r.coords[i + 1]); if (q.d < bd) { bd = q.d; best = i; bt = q.t; } }
  if (bd > 1000) for (let i = 0; i < r.coords.length - 1; i++) { const q = distToSeg(p, r.coords[i], r.coords[i + 1]); if (q.d < bd) { bd = q.d; best = i; bt = q.t; } }
  n.idx = best;
  const done = r.cum[best] + (r.cum[best + 1] - r.cum[best]) * bt; n.done = done;
  const left = r.dist - done;
  const leftT = r.dur * (left / r.dist);
  const eta = new Date(Date.now() + leftT * 1000);
  $('#nEta').textContent = fmtTime(eta); $('#nLeft').textContent = fmtDur(leftT); $('#nKm').textContent = (left / 1000).toFixed(1).replace('.', ',');
  $('#nEtaBox').classList.toggle('late', !!(n.planned && eta.getTime() > n.planned));
  $('#spd').textContent = Math.round(S.speed);
  drawMe(20);
  // prochaine instruction
  const st = r.steps.find(s => s.off > done + 5);
  if (st) {
    const d = st.off - done;
    $('#nDist').textContent = fmtKm(d); $('#nMsg').textContent = st.text;
    const k = st.off;
    if (d < 450 && d > 150 && !n.spoken[k + 'f']) { n.spoken[k + 'f'] = 1; speak(`Dans ${Math.round(d / 50) * 50} mètres, ${lc(st.text)}`); }
    if (d <= 70 && !n.spoken[k + 'n']) { n.spoken[k + 'n'] = 1; speak(st.text); }
  }
  // bouchon devant
  const ahead = r.jams.find(j => j.startOff > done && j.startOff - done < 1500 && (j.mag >= 2 || j.delay > 60));
  const w = $('#nWarn');
  if (ahead) { w.hidden = false; w.textContent = `Bouchon dans ${fmtKm(ahead.startOff - done)}${ahead.delay ? ' · +' + fmtDur(ahead.delay) : ''}${ahead.speed ? ' · ' + Math.round(ahead.speed) + ' km/h' : ''}`; if (!n.spoken['j' + ahead.startOff]) { n.spoken['j' + ahead.startOff] = 1; speak(`Attention, ralentissement dans ${fmtKm(ahead.startOff - done)}.`); } }
  else w.hidden = true;
  // arrivée
  if (left < 40 || hav(p, [S.B.lat, S.B.lng]) < 35) { stopNav(true); return; }
  // hors itinéraire -> recalcul
  if (bd > 70) { if (++n.off >= 3 && S.set.reroute) { n.off = -10; speak('Recalcul de l’itinéraire.'); reroute(); } } else n.off = 0;
  // toutes les 2 minutes : y a-t-il mieux avec le trafic actuel ?
  if (S.set.key && Date.now() - n.lastCheck > 120000) { n.lastCheck = Date.now(); betterRoute(leftT); }
  if (follow) map.panTo(p, { animate: true });
}
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
async function reroute() {
  const rs = await calc({ silent: true, from: { lat: S.pos[0], lng: S.pos[1] } });
  if (rs?.length && S.nav) { S.routes = rs; S.sel = 0; S.nav.r = rs[0]; S.nav.idx = 0; S.nav.spoken = {}; drawRoutes(); }
}
async function betterRoute(curLeft) {
  const rs = await calc({ silent: true, from: { lat: S.pos[0], lng: S.pos[1] } });
  if (!rs?.length || !S.nav) return;
  // le 1er résultat suit souvent l'itinéraire actuel ; on bascule si gain ≥ 3 min
  const gain = curLeft - rs[0].dur;
  if (gain >= 180) { S.routes = rs; S.sel = 0; S.nav.r = rs[0]; S.nav.idx = 0; S.nav.spoken = {}; drawRoutes(); speak(`Itinéraire plus rapide trouvé. Vous gagnez ${Math.round(gain / 60)} minutes.`); toast(`Nouvel itinéraire : −${fmtDur(gain)}`); }
}
let voiceFr = null;
function speak(t) {
  if (!S.set.voice || !('speechSynthesis' in window)) return;
  try {
    voiceFr = voiceFr || speechSynthesis.getVoices().find(v => /^fr/i.test(v.lang));
    const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; if (voiceFr) u.voice = voiceFr; u.rate = 1.02;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { }
}

/* ================= Panneau du bas ================= */
let curTab = 'trip';
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function showTab(t) { curTab = t; document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); render(); }
const sheetH = () => $('#sheet').hidden ? 0 : $('#sheet').getBoundingClientRect().height;
function render() {
  const pane = $('#pane');
  if (curTab === 'trip') pane.innerHTML = tripHtml();
  else if (curTab === 'places') pane.innerHTML = placesHtml();
  else if (curTab === 'stats') pane.innerHTML = statsHtml();
  else pane.innerHTML = settingsHtml();
  bindPane();
  requestAnimationFrame(() => document.documentElement.style.setProperty('--sheet-h', Math.min(sheetH(), innerHeight * .62) + 'px'));
}
function tripHtml() {
  if (!S.routes.length) {
    return `<p class="empty"><strong>Saisissez une destination</strong> (ou appui long sur la carte). Indiquez l’heure à laquelle vous devez arriver : Ponctuel vous dira quand partir et par où passer pour éviter les bouchons.</p>` +
      (!S.set.key ? `<div class="note"><b>Trafic en direct désactivé.</b> Ajoutez une clé TomTom gratuite dans <a href="#" data-go="settings">Réglages</a> pour éviter les embouteillages en temps réel. Sans clé, Ponctuel utilise vos trajets passés.</div>` : '');
  }
  const r = S.routes[S.sel], pi = planInfo(r);
  let plan = '';
  if (pi) {
    const m = Math.round(pi.slack / 60);
    if (m > 0) plan = `<div class="plan ${m > 15 ? 'ok' : ''}"><div class="big">${m > 99 ? fmtTime(pi.leave) : m + '<small>min</small>'}</div><div class="l1">${m > 99 ? 'Heure de départ' : 'avant de partir'} · à ${fmtTime(pi.leave)}</div><div class="l2">Pour être à ${fmtTime(pi.t)} avec ${S.set.buffer} min de marge. Je recalcule le trafic toutes les 2 min.</div></div>`;
    else { const late = Math.round((pi.eta.getTime() - pi.t.getTime()) / 60000); plan = late > 0
      ? `<div class="plan late"><div class="big">+${late}<small>min</small></div><div class="l1">Retard prévu si vous partez maintenant</div><div class="l2">Arrivée ${fmtTime(pi.eta)} au lieu de ${fmtTime(pi.t)}. Prenez le plus rapide ci-dessous et prévenez dès maintenant.</div></div>`
      : `<div class="plan"><div class="big">Go</div><div class="l1">Partez maintenant</div><div class="l2">Arrivée ${fmtTime(pi.eta)}, ${-late} min avant ${fmtTime(pi.t)} (marge entamée).</div></div>`; }
  }
  const cards = S.routes.map((x, i) => {
    const big = x.jams.filter(j => j.mag >= 3).length, med = x.jams.filter(j => j.mag === 2).length;
    const segs = x.jams.map(j => `<span style="position:absolute;left:${(j.startOff / x.dist * 100).toFixed(1)}%;width:${Math.max(1.5, j.len / x.dist * 100).toFixed(1)}%;top:0;bottom:0;background:var(${j.mag >= 3 ? '--jam' : '--slow'})"></span>`).join('');
    return `<button class="route ${i === S.sel ? 'sel' : ''}" data-r="${i}"><span class="stripe"></span>
      <div><div class="t">${fmtDurHtml(x.dur)}</div></div>
      <div class="eta">${fmtTime(new Date(Date.now() + x.dur * 1000))}</div>
      <div class="meta">${x.best ? '<span class="badge best">Le plus rapide</span>' : ''}${big ? `<span class="badge jam">${big} bouchon${big > 1 ? 's' : ''}</span>` : ''}${med ? `<span class="badge slow">${med} lent${med > 1 ? 's' : ''}</span>` : ''}
        ${fmtKm(x.dist)} · ${x.delay > 60 ? '+' + fmtDur(x.delay) + ' de trafic' : 'trafic fluide'}${x.live ? '' : ' · estimation sans trafic en direct'}</div>
      <div class="bar" style="position:relative">${segs}</div></button>`;
  }).join('');
  const jl = satList();
  const jams = jl.length ? `<h3>Points noirs · vue satellite</h3>` + jl.map((j, i) => `<button class="jam-item" data-j="${i}"><i class="${j.mag >= 3 ? '' : 'mod'}"></i><div><b>${j.dest ? 'Autour de la destination' : j.mag >= 3 ? 'Bouchon' : 'Ralentissement'}${j.src === 'perso' ? ' (habituel)' : ''}</b><small>${[j.speed != null ? Math.round(j.speed) + ' km/h' : '', j.delay ? '+' + fmtDur(j.delay) : '', j.startOff != null && !j.dest ? 'à ' + fmtKm(j.startOff) : ''].filter(Boolean).join(' · ')}</small></div><span>Voir ›</span></button>`).join('') : '';
  return plan + cards + `<div class="btns"><button class="btn primary wide" id="startNav">Démarrer le guidage</button></div>` + jams +
    (S.B ? `<div class="btns"><button class="btn" id="saveB">★ Mémoriser « ${esc(S.B.name).slice(0, 28)} »</button></div>` : '');
}
function placesHtml() {
  if (!S.places.length) return `<p class="empty"><strong>Aucun lieu mémorisé pour l’instant.</strong> Avec le suivi activé, chaque endroit où vous restez plus de 5 minutes est enregistré avec vos horaires. Vous pouvez aussi mémoriser une destination depuis l’onglet Trajet.</p>`;
  const tagL = { home: 'Maison', work: 'Travail' };
  return S.places.slice().sort((a, b) => b.visits - a.visits).map(p => {
    const top = p.hours.indexOf(Math.max(...p.hours));
    return `<div class="place"><span class="ic">${p.tag === 'home' ? 'M' : p.tag === 'work' ? 'T' : p.visits}</span><div><b>${esc(p.name)}</b><small>${tagL[p.tag] ? tagL[p.tag] + ' · ' : ''}${p.visits} visite${p.visits > 1 ? 's' : ''}${p.visits ? ' · surtout vers ' + top + ' h' : ''}${p.mins ? ' · ' + fmtDur(p.mins * 60) + ' au total' : ''}</small></div>
      <div class="act"><button data-pgo="${p.id}">Y aller</button><button data-pedit="${p.id}" aria-label="Modifier">✎</button></div></div>
      <div class="place-edit" id="e_${p.id}" hidden><label class="set"><span>Nom</span><input type="text" value="${esc(p.name)}" data-pname="${p.id}"></label>
      <div class="btns"><button class="btn" data-ptag="${p.id}|home">Maison</button><button class="btn" data-ptag="${p.id}|work">Travail</button><button class="btn" data-ptag="${p.id}|">Aucun</button><button class="btn danger" data-pdel="${p.id}">Supprimer</button></div></div>`;
  }).join('');
}
function statsHtml() {
  const withPlan = S.trips.filter(t => t.lateMin != null);
  const onTime = withPlan.filter(t => t.lateMin <= 0).length;
  const pct = withPlan.length ? Math.round(onTime / withPlan.length * 100) : null;
  const lates = withPlan.filter(t => t.lateMin > 0);
  const avgLate = lates.length ? Math.round(lates.reduce((s, t) => s + t.lateMin, 0) / lates.length) : 0;
  const hours = Array(24).fill(0); Object.entries(S.cells).forEach(([k, v]) => { const h = +k.split('_')[2] % 24; if (v[1] / v[0] < 15) hours[h] += v[0]; });
  const mx = Math.max(1, ...hours);
  // conseil personnalisé
  let tip = 'Fixez une heure d’arrivée avant chaque trajet : c’est ce qui permet de mesurer et réduire vos retards.';
  if (lates.length >= 3) tip = `Vos retards durent ${avgLate} min en moyenne. Passez la marge de sécurité à ${Math.min(45, S.set.buffer + avgLate)} min dans Réglages : vous arriverez à l’heure la plupart du temps.`;
  return `<div class="stats"><div class="stat"><b>${pct == null ? '—' : pct + '%'}</b><small>trajets à l’heure</small></div><div class="stat"><b>${avgLate ? '+' + avgLate : '0'}<small style="font-size:13px"> min</small></b><small>retard moyen</small></div><div class="stat"><b>${S.trips.length}</b><small>trajets suivis</small></div></div>
  <div class="note"><b>Conseil.</b> ${tip}</div>
  <h3>Quand vous roulez au pas (vos données)</h3>
  <div class="hours">${hours.map(h => `<i style="height:${Math.round(h / mx * 100)}%" title=""></i>`).join('')}</div><div class="hours-l"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
  <h3>Derniers trajets</h3>` + (S.trips.length ? S.trips.slice(0, 12).map(t => `<div class="place"><span class="ic" style="color:var(${t.lateMin > 0 ? '--jam' : '--go'})">${t.lateMin == null ? '·' : t.lateMin > 0 ? '+' + t.lateMin : '✓'}</span><div><b>${esc(t.toName || 'Trajet')}</b><small>${new Date(t.start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(new Date(t.start))} → ${fmtTime(new Date(t.end))} · ${fmtKm(t.dist)}</small></div></div>`).join('') : '<p class="empty">Aucun trajet guidé pour l’instant.</p>');
}
function settingsHtml() {
  const s = S.set;
  return `<label class="set"><span>Clé TomTom (trafic en direct)</span><input type="password" id="sKey" value="${esc(s.key)}" placeholder="Collez votre clé ici" autocomplete="off">
    <small>Gratuite, sans carte bancaire : <a href="https://developer.tomtom.com/user/register" target="_blank" rel="noopener" style="color:var(--signal)">developer.tomtom.com</a> → « My Dashboard » → copier la clé. Elle reste sur votre téléphone.</small></label>
  <div class="btns"><button class="btn primary" id="sSaveKey">Enregistrer et tester</button></div>
  <label class="set"><span>Marge de sécurité : <b class="num" id="sBufV">${s.buffer}</b> min</span><input type="range" id="sBuf" min="0" max="45" step="5" value="${s.buffer}" style="width:100%;accent-color:var(--signal)"></label>
  ${[['track', 'Suivi et mémorisation des lieux', 'Apprend vos lieux fréquents et les rues où vous roulez au pas.'], ['autoSat', 'Vue satellite automatique', 'S’ouvre dès qu’un bouchon est trouvé sur le trajet ou à destination.'], ['voice', 'Guidage vocal', ''], ['reroute', 'Recalcul automatique', 'Hors itinéraire ou si une route plus rapide apparaît (≥ 3 min gagnées).'], ['tolls', 'Éviter les péages', 'Ex. autoroute du Nord, pont HKB (avec clé TomTom).'], ['highways', 'Éviter les autoroutes', '']]
      .map(([k, t, d]) => `<label class="toggle"><span><b>${t}</b>${d ? `<br><small style="color:var(--muted)">${d}</small>` : ''}</span><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}></label>`).join('')}
  <h3>Vos données</h3>
  <div class="btns"><button class="btn" id="sExport">Exporter (sauvegarde)</button><label class="btn" style="cursor:pointer">Importer<input type="file" id="sImport" accept="application/json" hidden></label><button class="btn danger" id="sWipe">Tout effacer</button></div>
  <div id="wipeConfirm" hidden class="note"><b>Effacer lieux, trajets et vitesses apprises ?</b> <button class="btn danger" id="sWipeYes">Oui, effacer</button></div>
  <h3>Ce que fait vraiment chaque source</h3>
  <div class="note"><b>Trafic</b> : TomTom mesure la vitesse réelle des véhicules (GPS de millions de conducteurs), mise à jour chaque minute. <b>Satellite</b> : image haute résolution Esri/Maxar, prise il y a quelques mois ; aucun satellite public ne filme la route en direct. Le trafic en direct est donc dessiné par-dessus. <b>NASA</b> : GIBS fournit l’image MODIS de la veille (250 m/pixel) ; elle montre la météo et les nuages, pas les voitures. <b>Vos données</b> restent dans ce navigateur.</div>`;
}
function bindPane() {
  const pane = $('#pane');
  pane.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); showTab(a.dataset.go); });
  pane.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { S.sel = +b.dataset.r; drawRoutes(); render(); });
  pane.querySelectorAll('[data-j]').forEach(b => b.onclick = () => openSat(+b.dataset.j));
  $('#startNav') && ($('#startNav').onclick = startNav);
  $('#saveB') && ($('#saveB').onclick = () => {
    const b = S.B; if (S.places.some(p => hav([p.lat, p.lng], [b.lat, b.lng]) < 150)) { toast('Ce lieu est déjà mémorisé.'); return; }
    S.places.push({ id: 'p' + Date.now().toString(36), lat: b.lat, lng: b.lng, name: b.name, tag: '', visits: 0, hours: Array(24).fill(0), dows: Array(7).fill(0), mins: 0, last: 0 });
    savePlaces(); renderPlacesLayer(); toast('Lieu mémorisé.');
  });
  pane.querySelectorAll('[data-pgo]').forEach(b => b.onclick = () => { const p = S.places.find(x => x.id === b.dataset.pgo); setB({ lat: p.lat, lng: p.lng, name: p.name }); calc(); });
  pane.querySelectorAll('[data-pedit]').forEach(b => b.onclick = () => { const e = $('#e_' + b.dataset.pedit); e.hidden = !e.hidden; });
  pane.querySelectorAll('[data-pname]').forEach(i => i.onchange = () => { const p = S.places.find(x => x.id === i.dataset.pname); p.name = i.value.trim() || p.name; savePlaces(); renderPlacesLayer(); });
  pane.querySelectorAll('[data-ptag]').forEach(b => b.onclick = () => { const [id, tag] = b.dataset.ptag.split('|'); if (tag) S.places.forEach(p => { if (p.tag === tag) p.tag = ''; }); S.places.find(x => x.id === id).tag = tag; savePlaces(); renderPlacesLayer(); render(); });
  pane.querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => { S.places = S.places.filter(x => x.id !== b.dataset.pdel); savePlaces(); renderPlacesLayer(); render(); });
  pane.querySelectorAll('[data-set]').forEach(c => c.onchange = () => { S.set[c.dataset.set] = c.checked; saveSet(); });
  const buf = $('#sBuf'); if (buf) buf.oninput = () => { S.set.buffer = +buf.value; $('#sBufV').textContent = buf.value; saveSet(); };
  $('#sSaveKey') && ($('#sSaveKey').onclick = async () => {
    S.set.key = $('#sKey').value.trim(); saveSet();
    if (!S.set.key) { setTraffic(false); toast('Clé retirée.'); return; }
    try { const c = map.getCenter(); await getJSON(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${c.lat},${c.lng}&key=${encodeURIComponent(S.set.key)}`); toast('Clé valide : trafic en direct activé.'); setTraffic(true); }
    catch (e) { toast(String(e.message).includes('403') || String(e.message).includes('401') ? 'Clé refusée par TomTom. Vérifiez-la.' : 'Clé enregistrée (test impossible ici : pas de route proche du centre de la carte).', 6000); }
  });
  $('#sExport') && ($('#sExport').onclick = () => {
    const blob = new Blob([JSON.stringify({ v: 1, places: S.places, trips: S.trips, cells: S.cells, settings: { ...S.set, key: '' } })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ponctuel-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('#sImport') && ($('#sImport').onchange = async e => {
    try { const d = JSON.parse(await e.target.files[0].text()); if (d.places) S.places = d.places; if (d.trips) S.trips = d.trips; if (d.cells) S.cells = d.cells;
      savePlaces(); store.set('trips', S.trips); store.set('cells', S.cells); renderPlacesLayer(); toast('Données importées.'); }
    catch { toast('Fichier illisible : choisissez une sauvegarde Ponctuel (.json).'); }
  });
  $('#sWipe') && ($('#sWipe').onclick = () => $('#wipeConfirm').hidden = false);
  $('#sWipeYes') && ($('#sWipeYes').onclick = () => { S.places = []; S.trips = []; S.cells = {}; savePlaces(); store.set('trips', []); store.set('cells', {}); renderPlacesLayer(); toast('Données effacées.'); render(); });
}

/* ================= Zones lentes apprises ================= */
$('#bHeat').onclick = () => {
  S.heat = !S.heat; $('#bHeat').classList.toggle('on', S.heat);
  heatLayer.clearLayers();
  if (!S.heat) { map.removeLayer(heatLayer); return; }
  const now = new Date(); const seen = new Set(); let n = 0;
  Object.keys(S.cells).forEach(k => {
    const [a, b] = k.split('_'); const id = a + '_' + b; if (seen.has(id)) return; seen.add(id);
    const p = [a / 300, b / 300], sp = learnedSpeed(p, now); if (sp == null || sp > 25) return; n++;
    L.circle(p, { radius: 190, weight: 0, fillColor: sp < 10 ? '#ff4b4b' : '#ff9a2e', fillOpacity: .35 }).bindTooltip(`Habituellement ${Math.round(sp)} km/h à cette heure`).addTo(heatLayer);
  });
  heatLayer.addTo(map);
  toast(n ? `${n} zones où vous roulez souvent au pas à cette heure-ci.` : 'Pas encore assez de trajets à cette heure-ci. Roulez avec Ponctuel ouvert quelques jours.');
};

/* ================= Démarrage ================= */
renderPlacesLayer(); render(); predict();
startGeo();
if (S.set.key) setTraffic(true);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
document.addEventListener('visibilitychange', () => { if (document.hidden) { store.set('cells', S.cells); } else if (S.nav) { navigator.wakeLock?.request('screen').then(w => wakeLock = w).catch(() => { }); } });
addEventListener('pagehide', () => store.set('cells', S.cells));
setInterval(predict, 300000);
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { voiceFr = null; };
