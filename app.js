/* Ponctuel v4 — navigation anti-retard, carte vectorielle 3D (MapLibre GL).
   Données :
   - Carte : OpenFreeMap (tuiles vectorielles OpenStreetMap, sans clé), bâtiments 3D.
   - Itinéraires + trafic temps réel : TomTom (clé gratuite), sinon OSRM + historique perso.
   - Satellite : Esri World Imagery ; NASA GIBS (MODIS, image d'hier).
   - Adresses : TomTom Search, Photon, Nominatim.
   Tout l'historique reste sur le téléphone. */
'use strict';

/* ================= Utilitaires ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('pc_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pc_' + k, JSON.stringify(v)); } catch (e) { console.warn('stockage', e); } }
};
const R = 6371000, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const ll = p => [p[1], p[0]]; // [lat,lng] -> [lng,lat]
function hav(a, b) {
  const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function bearingOf(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
function distToSeg(p, a, b) {
  const k = Math.cos(rad(p[0]));
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0], bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return { d: Math.sqrt(x * x + y * y) * 111320, t };
}
const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
const fmtTime = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function fmtDur(s) { s = Math.max(0, Math.round(s / 60)); if (s < 60) return s + ' min'; return Math.floor(s / 60) + ' h ' + String(s % 60).padStart(2, '0'); }
function fmtDurHtml(s) { s = Math.max(0, Math.round(s / 60)); if (s < 60) return `${s}<small> min</small>`; return `${Math.floor(s / 60)}<small> h </small>${String(s % 60).padStart(2, '0')}`; }
const fmtKm = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km';
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const cardinal = h => CARD[Math.round(((h % 360) + 360) % 360 / 45) % 8];
let toastT;
function toast(msg, ms = 3500, icon) { const t = $('#toast'); t.innerHTML = (icon && typeof ic === 'function' ? ic(icon) : '') + '<span></span>'; t.lastChild.textContent = msg; t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
async function getJSON(url, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const getCss = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
/* Jeu d'icônes unique (trait 2 px, coins arrondis) */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  swap: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  traffic: '<rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="7" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="17" r="1.4"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-1.5 2-2 4-2 6 0 5 3 9 7 9z"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>', chevL: '<path d="m15 6-6 6 6 6"/>', chevR: '<path d="m9 6 6 6-6 6"/>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 5 6M22 9l-5 6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  police: '<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
  crash: '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/><path d="M3 4l3 3M21 4l-3 3M12 2v3"/>',
  closed: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  flood: '<path d="M2 17c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 21c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M12 3v9M8 8l4 4 4-4"/>',
  jam: '<path d="M5 13l2-5h10l2 5v5H5z"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/><path d="M5 13h14"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  check: '<path d="m5 12 5 5L20 7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  go: '<path d="M12 2l7 19-7-4-7 4z"/>', flag: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
  recent: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7zM5 3l.6 1.6L7.2 5.2 5.6 5.8 5 7.4 4.4 5.8 2.8 5.2 4.4 4.6z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
function injectIcons(root = document) { root.querySelectorAll('[data-ic]').forEach(el => { const st = el.getAttribute('style'); el.outerHTML = ic(el.dataset.ic).replace('<svg ', `<svg ${st ? `style="${st}" ` : ''}`); }); }
injectIcons();

/* ================= État ================= */
const S = {
  set: Object.assign({ key: '', buffer: 10, voice: true, track: true, tolls: false, highways: false, autoSat: true, reroute: true,
    vehicle: 'kaiyi', vcolor: '#f7f7f7', three: true, mapStyle: 'auto' }, store.get('settings', {})),
  places: store.get('places', []), trips: store.get('trips', []), cells: store.get('cells', {}),
  A: null, B: null, routes: [], sel: 0, satIdx: 0, destJam: null,
  pos: null, heading: null, devHeading: null, speed: 0,
  nav: null, base: store.get('base', 'real'), traffic: false, heat: false, follow: false, compassMode: 'north', updatedAt: null, cam: { z: 16, pitch: 50 }
};
const saveSet = () => store.set('settings', S.set);
if (!S.set.v3d) { if (S.set.vehicle === 'car') { S.set.vehicle = 'kaiyi'; if (S.set.vcolor === '#2f7bff') S.set.vcolor = '#f7f7f7'; } S.set.v3d = 1; saveSet(); }
if (S.set.v3d < 2) { if (S.set.vehicle === 'car3d') S.set.vehicle = 'kaiyi'; S.set.v3d = 2; saveSet(); } // la Kaiyi X7 remplace la berline par défaut
const savePlaces = () => store.set('places', S.places);

/* ================= Icônes de véhicule ================= */
const VEHICLES = { kaiyi: 'Kaiyi X7', car3d: 'Berline 3D', arrow: 'Flèche', car: 'Berline', suv: '4x4', taxi: 'Taxi', moto: 'Moto', bus: 'Gbaka', truck: 'Camion', puck: 'Point' };
// Rendu 3D réaliste (généré pour Ponctuel), recoloré en direct sur canvas
const REAL_CARS = {
  kaiyi: 'media/kaiyi.png', // SUV Kaiyi X7, vue de dessus
  car3d: 'media/car3d.png'
};
const realCache = {};
function loadReal(type, cb) {
  const c = realCache[type] ||= { img: null, readable: false, waiters: [], started: false };
  if (c.img?.complete && c.img.naturalWidth) return cb(c);
  c.waiters.push(cb); if (c.started) return; c.started = true;
  const tryLoad = cors => { const im = new Image(); if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => { c.img = im; c.readable = cors; c.waiters.splice(0).forEach(f => f(c)); };
    im.onerror = () => { if (cors) tryLoad(false); else { c.img = null; c.started = false; c.waiters.splice(0).forEach(f => f(c)); } };
    im.src = REAL_CARS[type]; };
  tryLoad(true);
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function drawCar3d(cv, col, type = 'car3d') {
  const size = cv.width, ctx = cv.getContext('2d');
  loadReal(type, c => { const im = c.img;
    ctx.clearRect(0, 0, size, size);
    if (!im) { const f = new Image(); f.onload = () => ctx.drawImage(f, 0, 0, size, size); f.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(vehicleSVG(type === 'kaiyi' ? 'suv' : 'car', col)); return; }
    ctx.drawImage(im, 0, 0, size, size);
    const white = col.toLowerCase() === '#f7f7f7';
    if (c.readable) { // détourage net + peinture recolorée (vitres et feux conservés)
      try {
        const d = ctx.getImageData(0, 0, size, size), p = d.data, [tr, tg, tb] = hexRgb(col);
        for (let i = 0; i < p.length; i += 4) {
          if (p[i + 3] < 170) { p[i + 3] = 0; continue; }
          p[i + 3] = 255;
          if (white) continue;
          const r = p[i], g = p[i + 1], b = p[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx > 150 && mx - mn < 40) { const l = mx / 255, k = Math.pow(l, 2.2); // carrosserie claire : teinte + reflets
            p[i] = Math.min(255, tr * k * 1.05 + 255 * Math.pow(l, 40) * .6); p[i + 1] = Math.min(255, tg * k * 1.05 + 255 * Math.pow(l, 40) * .6); p[i + 2] = Math.min(255, tb * k * 1.05 + 255 * Math.pow(l, 40) * .6); }
        }
        ctx.putImageData(d, 0, 0); return;
      } catch { c.readable = false; }
    }
    if (!white) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = col.toLowerCase() === '#1a1d24' ? '#4a505a' : col; ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(im, 0, 0, size, size); ctx.globalCompositeOperation = 'source-over'; }
  });
}
function car3dCanvas(col, css, type = 'car3d') { const c = document.createElement('canvas'); c.width = c.height = 256; c.className = 'car3d'; c.style.cssText = css || ''; drawCar3d(c, col, type); return c; }
const COLORS = ['#2f7bff', '#ff3b3b', '#f7f7f7', '#1a1d24', '#f7941d', '#22c55e', '#8b5cf6', '#ffd400'];
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }
function vehicleSVG(type, col) {
  const d = shade(col, .62), l = shade(col, 1.25), id = 'g' + Math.random().toString(36).slice(2, 7);
  const grad = `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${d}"/><stop offset=".5" stop-color="${l}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>`;
  const glass = '#0d1a2b';
  switch (type) {
    case 'arrow': return `<svg viewBox="0 0 64 64">${grad}<path d="M32 5 54 57 32 46 10 57Z" fill="url(#${id})" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><path d="M32 5v41" stroke="rgba(255,255,255,.35)" stroke-width="2"/></svg>`;
    case 'puck': return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="${col}" fill-opacity=".25"/><circle cx="32" cy="32" r="12" fill="${col}" stroke="#fff" stroke-width="4"/><path d="M32 4l7 12H25z" fill="${col}" stroke="#fff" stroke-width="2"/></svg>`;
    case 'moto': return `<svg viewBox="0 0 64 64">${grad}<rect x="28" y="4" width="8" height="12" rx="4" fill="#222"/><rect x="28" y="48" width="8" height="12" rx="4" fill="#222"/><path d="M24 18h16v6l-3 22H27l-3-22z" fill="url(#${id})" stroke="#fff" stroke-width="2"/><path d="M18 20h28" stroke="#ccc" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="7" fill="${d}" stroke="#fff" stroke-width="2"/><rect x="29" y="5" width="6" height="3" rx="1.5" fill="#fff6b0"/></svg>`;
    case 'bus': return `<svg viewBox="0 0 64 64">${grad}<rect x="17" y="3" width="30" height="58" rx="6" fill="url(#${id})" stroke="#fff" stroke-width="2.5"/><rect x="20" y="7" width="24" height="8" rx="3" fill="${glass}"/><rect x="21" y="19" width="22" height="34" rx="2" fill="${l}" opacity=".55"/><path d="M21 27h22M21 36h22M21 45h22" stroke="${d}" stroke-width="1.5"/><rect x="20" y="55" width="24" height="3" rx="1.5" fill="${glass}"/><rect x="19" y="3.5" width="5" height="2.5" rx="1" fill="#fff6b0"/><rect x="40" y="3.5" width="5" height="2.5" rx="1" fill="#fff6b0"/></svg>`;
    case 'truck': return `<svg viewBox="0 0 64 64">${grad}<rect x="18" y="4" width="28" height="15" rx="5" fill="url(#${id})" stroke="#fff" stroke-width="2.5"/><rect x="21" y="7" width="22" height="6" rx="2" fill="${glass}"/><rect x="16" y="21" width="32" height="40" rx="3" fill="#dfe6ee" stroke="#fff" stroke-width="2.5"/><path d="M20 30h24M20 40h24M20 50h24" stroke="#b8c2cf" stroke-width="1.5"/></svg>`;
    case 'suv': return `<svg viewBox="0 0 64 64">${grad}<rect x="17" y="6" width="30" height="52" rx="9" fill="url(#${id})" stroke="#fff" stroke-width="2.5"/><path d="M21 19q11-5 22 0l-2 7H23z" fill="${glass}"/><rect x="22" y="27" width="20" height="20" rx="3" fill="${d}"/><path d="M22 29v16M42 29v16" stroke="#dfe6ee" stroke-width="2"/><path d="M23 49h18l1 5H22z" fill="${glass}"/><rect x="13" y="20" width="5" height="4" rx="2" fill="${d}"/><rect x="46" y="20" width="5" height="4" rx="2" fill="${d}"/><rect x="20" y="7" width="6" height="3" rx="1.5" fill="#fff6b0"/><rect x="38" y="7" width="6" height="3" rx="1.5" fill="#fff6b0"/></svg>`;
    case 'taxi': col = col === '#2f7bff' ? '#f7941d' : col; /* orange compteur d'Abidjan par défaut */
      return vehicleSVG('car', col).replace('</svg>', `<rect x="25" y="31" width="14" height="6" rx="2" fill="#ffe14d" stroke="#222" stroke-width="1"/><text x="32" y="35.8" text-anchor="middle" font-size="4.6" font-weight="900" font-family="Arial" fill="#222">TAXI</text></svg>`);
    default: return `<svg viewBox="0 0 64 64">${grad}<path d="M22 10q10-7 20 0l4 10v30q0 8-8 9H26q-8-1-8-9V20z" fill="url(#${id})" stroke="#fff" stroke-width="2.5"/><path d="M22 22q10-5 20 0l-2 8H24z" fill="${glass}"/><rect x="24" y="31" width="16" height="13" rx="3" fill="${l}" opacity=".8"/><path d="M24 47h16l1 6H23z" fill="${glass}"/><rect x="14" y="22" width="5" height="4" rx="2" fill="${d}"/><rect x="45" y="22" width="5" height="4" rx="2" fill="${d}"/><rect x="23" y="8" width="5" height="3" rx="1.5" fill="#fff6b0"/><rect x="36" y="8" width="5" height="3" rx="1.5" fill="#fff6b0"/><rect x="22" y="56" width="5" height="2.5" rx="1" fill="#ff3030"/><rect x="37" y="56" width="5" height="2.5" rx="1" fill="#ff3030"/></svg>`;
  }
}

/* ================= Icônes de manœuvre ================= */
const MAN = {
  straight: '<path d="M24 42V8M13 19 24 8l11 11"/>',
  left: '<path d="M30 42V24a7 7 0 0 0-7-7H10M18 9l-8 8 8 8"/>',
  right: '<path d="M18 42V24a7 7 0 0 1 7-7h13M30 9l8 8-8 8"/>',
  'slight-left': '<path d="M30 42V27L15 12M14 24V11h13"/>',
  'slight-right': '<path d="M18 42V27l15-15M34 24V11H21"/>',
  'sharp-left': '<path d="M32 42V12L12 32M12 20v12h12"/>',
  'sharp-right': '<path d="M16 42V12l20 20M36 20v12H24"/>',
  uturn: '<path d="M30 42V18a8 8 0 0 0-16 0v16M7 27l7 8 7-8"/>',
  roundabout: '<path d="M22 44V31a9 9 0 1 1 9-9h9M35 16l6 6-6 6"/>',
  arrive: '<path d="M24 43s13-12 13-23a13 13 0 0 0-26 0c0 11 13 23 13 23z"/><circle cx="24" cy="20" r="4.5"/>'
};
const manSvg = d => `<svg viewBox="0 0 48 48">${MAN[d] || MAN.straight}</svg>`;
function dirFromTomTom(m = '', msg = '') {
  m = m.toUpperCase();
  if (m.includes('ARRIVE')) return 'arrive';
  if (m.includes('ROUNDABOUT')) return 'roundabout';
  if (m.includes('UTURN')) return 'uturn';
  const side = m.includes('LEFT') ? 'left' : m.includes('RIGHT') ? 'right' : null;
  if (!side) return /gauche/i.test(msg) ? 'left' : /droite/i.test(msg) ? 'right' : 'straight';
  if (m.includes('SHARP')) return 'sharp-' + side;
  if (m.includes('BEAR') || m.includes('KEEP') || m.includes('EXIT') || m.includes('MOTORWAY') || m.includes('SWITCH')) return 'slight-' + side;
  return side;
}
function dirFromOsrm(s) {
  const t = s.maneuver.type, m = s.maneuver.modifier || '';
  if (t === 'arrive') return 'arrive';
  if (t === 'roundabout' || t === 'rotary') return 'roundabout';
  if (m === 'uturn') return 'uturn';
  return ({ left: 'left', right: 'right', 'slight left': 'slight-left', 'slight right': 'slight-right', 'sharp left': 'sharp-left', 'sharp right': 'sharp-right' })[m] || 'straight';
}

/* ================= Carte vectorielle ================= */
const ABIDJAN = [5.3364, -4.0267];
const OFM = 'https://tiles.openfreemap.org/styles/';
const nightNow = () => S.set.mapStyle === 'night' || (S.set.mapStyle === 'auto' && (matchMedia('(prefers-color-scheme: dark)').matches || new Date().getHours() >= 19 || new Date().getHours() < 6));
const nasaDay = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10); // J-2 : image toujours disponible
const rasterStyle = (tiles, opts = {}) => ({
  version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: Object.fromEntries(tiles.map((t, i) => ['r' + i, { type: 'raster', tiles: [t.url], tileSize: 256, maxzoom: t.maxzoom || 19, attribution: t.attr || '' }])),
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': opts.bg || '#0b1220' } }, ...tiles.map((t, i) => ({ id: 'r' + i, type: 'raster', source: 'r' + i, paint: { 'raster-opacity': t.opacity ?? 1, 'raster-fade-duration': 200 } }))]
});
const SAT_TILES = [
  { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imagerie © Esri, Maxar, Earthstar' },
  { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', opacity: .75 },
  { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', opacity: .9 }
];
// Carte 3D TomTom Orbis (avec la clé) : bâtiments 3D éclairés, icônes de lieux, style nuit soigné
let orbisOk = null, orbisUrl = null;
let orbisRetryAt = 0;
async function orbisStyle(map) {
  if (!S.set.key || S.set.engine === 'ofm') return null;
  if (orbisOk === false && Date.now() < orbisRetryAt) return null;
  if (map.endsWith('-driving')) { const st = await orbisStyle0(map); return st || orbisStyle0(map.replace('-driving', '')); }
  return orbisStyle0(map);
}
async function orbisStyle0(map) {
  const k0 = encodeURIComponent(S.set.key);
  const q = `?key=${k0}&apiVersion=1&map=${map}`;
  const urls = orbisUrl ? [orbisUrl] : ['0.*/style.json', '0.*/style', '0.0.0-0/style.json', '0.0.0-0/style'].map(v => `https://api.tomtom.com/maps/orbis/assets/styles/${v}`);
  for (const u of urls) {
    try { const st = await getJSON(u + q, 8000); if (st?.layers?.length) { orbisUrl = u; orbisOk = true; st.__orbis = true; return st; } } catch (e) { console.warn('Orbis', u, e.message); }
  }
  orbisUrl = null; orbisOk = false; orbisRetryAt = Date.now() + 60000; return null; // nouvel essai dans 1 min
}
async function styleFor(kind) {
  const night = nightNow();
  if (kind === 'real') { // photo satellite au sol, routes et noms par-dessus, bâtiments en relief (ajoutés dans addOverlays)
    let st; try { st = await getJSON(OFM + 'liberty', 8000); } catch { return rasterStyle(SAT_TILES); }
    const drop = l => l.type === 'background' || l.type === 'fill' || l.type === 'fill-extrusion' || /landuse|landcover|park|aeroway|hillshade/.test(l.id);
    st.layers = st.layers.filter(l => !drop(l)).map(l => { if (l.type === 'line' && /road|highway|bridge|tunnel|street|path|rail/.test(l.id)) { l.paint = { ...(l.paint || {}), 'line-opacity': .55 }; } return l; });
    st.sources.sat = { type: 'raster', tiles: [SAT_TILES[0].url], tileSize: 256, maxzoom: 19, attribution: SAT_TILES[0].attr };
    st.layers.unshift({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 200, 'raster-brightness-max': night ? .55 : 1, 'raster-saturation': .1, 'raster-contrast': .08 } });
    st.sources.dem = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Relief : Mapzen / AWS Terrain Tiles' };
    st.__real = true; return st;
  }
  if (kind === 'sat') return (await orbisStyle('basic_street-satellite')) || rasterStyle(SAT_TILES);
  if (kind === 'nasa') { // carte normale + nuages/météo NASA en transparence
    const st = await styleFor('plan');
    st.sources.nasa = { type: 'raster', tileSize: 256, maxzoom: 9, attribution: 'NASA EOSDIS GIBS (MODIS)',
      tiles: [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${nasaDay}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`] };
    const i = st.layers.findIndex(l => l.type === 'symbol');
    st.layers.splice(i < 0 ? st.layers.length : i, 0, { id: 'nasa', type: 'raster', source: 'nasa', paint: { 'raster-opacity': .55 } });
    return st;
  }
  const orb = await orbisStyle(`basic_street-${night ? 'dark' : 'light'}${S.nav ? '-driving' : ''}`); if (orb) return orb;
  try { return await getJSON(OFM + (night ? 'dark' : 'liberty'), 8000); }
  catch (e) {
    console.warn('OpenFreeMap indisponible, carte de secours', e);
    return night ? rasterStyle([{ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', maxzoom: 16, attr: '© Esri' }, { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', maxzoom: 16 }])
      : rasterStyle([{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap' }], { bg: '#f2efe9' });
  }
}
const startView = store.get('view', ABIDJAN);
const map = new maplibregl.Map({
  container: 'map', style: rasterStyle([], {}), center: ll(startView), zoom: store.get('zoom', 13),
  pitch: S.set.three ? 45 : 0, maxPitch: 75, attributionControl: { compact: true }, dragRotate: true, pitchWithRotate: true, fadeDuration: 150,
  transformRequest: url => (/^https:\/\/api\.tomtom\.com\//.test(url) && !/[?&]key=/.test(url) && S.set.key) ? { url: url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(S.set.key) } : { url }
});
map.touchZoomRotate.enableRotation();
map.on('moveend', () => { const c = map.getCenter(); store.set('view', [c.lat, c.lng]); store.set('zoom', map.getZoom()); });
function syncTheme() {
  const dark = S.base !== 'plan' || nightNow();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b1220' : '#e9eef5');
}
async function applyBase() {
  syncTheme();
  const st = await styleFor(S.base);
  map.setStyle(st, { diff: false });
}
const splashT0 = Date.now();
// Ouverture : la voiture traverse le pont (vidéo), puis fondu vers le logo complet ; « Passer » ou un toucher ferment
let splashMin = 1800, splashForce = false;
(() => { const v = document.getElementById('splashVid'); if (!v || matchMedia('(prefers-reduced-motion: reduce)').matches) { v?.remove(); return; }
  let faded = false;
  const start = () => { if (v.classList.contains('on') || faded) return; v.classList.add('on'); $('#splash').classList.add('vid'); splashMin = 6500; };
  v.addEventListener('playing', start, { once: true }); if (!v.paused && v.readyState > 2) start();
  v.addEventListener('ended', () => { faded = true; v.classList.remove('on'); setTimeout(() => { splashForce = true; hideSplash(); }, 650); });
  setTimeout(() => { if (!v.classList.contains('on')) { v.remove(); splashMin = 1800; } }, 1500); // vidéo pas prête : logo fixe
  v.addEventListener('error', () => v.remove());
  v.play?.().catch(() => { }); })();
document.getElementById('splash')?.addEventListener('click', () => { splashForce = true; hideSplash(); });
const hideSplash = () => { if (!splashForce && Date.now() - splashT0 < splashMin) { setTimeout(hideSplash, splashMin - (Date.now() - splashT0)); return; } const sp = $('#splash'); if (sp && !sp.classList.contains('out')) { sp.classList.add('out'); setTimeout(() => sp.remove(), 600); } };
map.once('idle', hideSplash); setTimeout(hideSplash, 2200); setTimeout(() => { splashForce = true; hideSplash(); }, 7000);
applyBase();
map.on('style.load', () => { addOverlays(); atmosphere(); });
function atmosphere() {
  const night = nightNow();
  try { map.setLight({ anchor: 'map', position: [1.4, 210, 35], color: night ? '#c8d4ff' : '#ffffff', intensity: night ? .35 : .45 }); } catch { }
  try { map.setSky?.({ 'sky-color': night ? '#0a1426' : '#8ec5ff', 'horizon-color': night ? '#1d3358' : '#dcecff', 'fog-color': night ? '#0b1220' : '#eef4fb', 'sky-horizon-blend': .6, 'horizon-fog-blend': .7, 'fog-ground-blend': .4 }); } catch { }
}

const BASES = ['real', 'plan', 'sat', 'nasa'], BASE_LBL = { real: 'Réel', plan: 'Plan', sat: 'Sat', nasa: 'Météo' };
$('#bLayerLbl').textContent = BASE_LBL[S.base] || 'Plan';
$('#bLayer').onclick = () => {
  S.base = BASES[(BASES.indexOf(S.base) + 1) % BASES.length]; store.set('base', S.base);
  $('#bLayerLbl').textContent = BASE_LBL[S.base];
  applyBase();
  if (S.base === 'nasa') { toast('Météo NASA : nuages et pluie vus par satellite (MODIS), en transparence sur la carte. Dézoomez pour voir la région.', 6000); if (!S.nav) { S.follow = false; map.easeTo({ zoom: Math.min(map.getZoom(), 8), pitch: 0, duration: 1200 }); } }
  if (S.base === 'sat') toast('Satellite haute résolution. Activez le trafic pour superposer les bouchons en direct.');
  if (S.base === 'real') { toast('Mode Réel : vraie photo satellite, bâtiments en relief et terrain 3D.', 4000, 'cube'); if (!S.set.three) $('#b3d').click(); }
};

/* ---- Couches dessinées par l'appli (ré-ajoutées à chaque changement de fond) ---- */
const EMPTY = { type: 'FeatureCollection', features: [] };
const lineFC = (coords, props = {}) => ({ type: 'FeatureCollection', features: coords.length > 1 ? [{ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords.map(ll) } }] : [] });
const data = { alts: EMPTY, main: EMPTY, done: EMPTY, jams: EMPTY, heat: EMPTY };
function setData(id, fc) { data[id] = fc; map.getSource(id)?.setData(fc); }
const trafficTiles = () => [`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(S.set.key)}&thickness=10&tileSize=256&t=${Math.floor(Date.now() / 120000)}`];
function firstSymbol() { return map.getStyle().layers.find(l => l.type === 'symbol')?.id; }
function addOverlays() {
  const st = map.getStyle();
  // Bâtiments 3D si la carte vectorielle en a et ne les dessine pas déjà
  const omt = st.sources.openmaptiles;
  if (omt && st.__real !== false && map.getSource('sat') && !st.layers.some(l => l.type === 'fill-extrusion')) {
    const night = nightNow();
    map.addLayer({ id: 'b3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13.5,
      paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, night ? '#3a3f4a' : '#e6dfd2', 15, night ? '#4b5466' : '#efe9de', 60, night ? '#5d6f8f' : '#f6f3ee', 150, night ? '#7d93b8' : '#dfe7f0'],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 15, ['coalesce', ['get', 'render_height'], 7]], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': .93, 'fill-extrusion-vertical-gradient': true } }, firstSymbol());
    try { map.setTerrain({ source: 'dem', exaggeration: 1.4 }); } catch { }
  } else if (omt && !st.layers.some(l => l.type === 'fill-extrusion')) {
    try { map.setTerrain(null); } catch { }
    map.addLayer({ id: 'b3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, nightNow() ? '#1f2a3b' : '#d9d2c6', 40, nightNow() ? '#34465f' : '#ece6dc', 120, nightNow() ? '#4a6185' : '#f7f3ec'], 'fill-extrusion-vertical-gradient': true, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': .82 } }, firstSymbol());
  }
  set3DBuildings(S.set.three);
  if (S.traffic && S.set.key) {
    map.addSource('traffic', { type: 'raster', tiles: trafficTiles(), tileSize: 256, maxzoom: 22 });
    map.addLayer({ id: 'traffic', type: 'raster', source: 'traffic', paint: { 'raster-opacity': .9, 'raster-fade-duration': 300 } }, firstSymbol());
  }
  for (const id of ['heat', 'alts', 'done', 'jams']) map.addSource(id, { type: 'geojson', data: data[id] });
  map.addSource('main', { type: 'geojson', data: data.main, lineMetrics: true });
  map.addLayer({ id: 'heat', type: 'circle', source: 'heat', paint: { 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, 3, 15, 30, 18, 110], 'circle-color': ['case', ['<', ['get', 'sp'], 10], '#ff4b4b', '#ff9a2e'], 'circle-opacity': .35, 'circle-blur': .6 } });
  map.addLayer({ id: 'alts', type: 'line', source: 'alts', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': getCss('--alt'), 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 17, 11], 'line-opacity': .7 } });
  map.addLayer({ id: 'main-glow', type: 'line', source: 'main', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': getCss('--route-2'), 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 12, 17, 30], 'line-opacity': .35, 'line-blur': 10 } });
  map.addLayer({ id: 'main-case', type: 'line', source: 'main', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#06223f', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 17, 17] } });
  map.addLayer({ id: 'main', type: 'line', source: 'main', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 17, 12],
    'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, getCss('--route'), 1, getCss('--route-2')] } });
  map.addLayer({ id: 'main-flow', type: 'line', source: 'main', paint: { 'line-color': '#ffffff', 'line-opacity': .55, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 17, 4], 'line-dasharray': [0, 4, 3] } });
  map.addLayer({ id: 'done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7d8796', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 17, 14], 'line-opacity': .9 } });
  map.addLayer({ id: 'jams-glow', type: 'line', source: 'jams', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['case', ['>=', ['get', 'mag'], 3], '#ff4b4b', '#ff9a2e'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 12, 17, 28], 'line-blur': 8, 'line-opacity': .55 } });
  map.addLayer({ id: 'jams', type: 'line', source: 'jams', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['case', ['>=', ['get', 'mag'], 3], '#ff3b3b', '#ff9a2e'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 17, 12] } });
}
map.on('click', 'alts', e => { const i = e.features?.[0]?.properties?.idx; if (i != null) { S.sel = +i; drawRoutes(); render(); } });
map.on('mouseenter', 'alts', () => map.getCanvas().style.cursor = 'pointer');
map.on('mouseleave', 'alts', () => map.getCanvas().style.cursor = '');
function set3DBuildings(on) {
  for (const l of map.getStyle()?.layers || []) if (l.type === 'fill-extrusion') map.setLayoutProperty(l.id, 'visibility', on ? 'visible' : 'none');
}
// Animation du flux sur l'itinéraire (tirets qui avancent)
const DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
let dashStep = 0, lastDash = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(ts) {
  if (!reduceMotion && data.main.features.length && ts - lastDash > 60 && map.getLayer('main-flow')) {
    lastDash = ts; dashStep = (dashStep + 1) % DASH.length; map.setPaintProperty('main-flow', 'line-dasharray', DASH[dashStep]);
  }
  animateMe(ts);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---- Trafic ---- */
function setTraffic(on) {
  if (on && !S.set.key) { toast('Ajoutez votre clé TomTom gratuite dans Réglages pour voir le trafic en direct.'); showTab('settings'); return; }
  S.traffic = on; $('#bTraffic').classList.toggle('on', on);
  if (map.getLayer('traffic')) { map.removeLayer('traffic'); map.removeSource('traffic'); }
  if (on && map.getSource('main')) {
    map.addSource('traffic', { type: 'raster', tiles: trafficTiles(), tileSize: 256, maxzoom: 22 });
    map.addLayer({ id: 'traffic', type: 'raster', source: 'traffic', paint: { 'raster-opacity': .9 } }, map.getLayer('heat') ? 'heat' : undefined);
  }
}
$('#bTraffic').onclick = () => setTraffic(!S.traffic);
setInterval(() => { // trafic rafraîchi toutes les 2 min
  if (S.traffic && map.getSource('traffic')?.setTiles) map.getSource('traffic').setTiles(trafficTiles());
  if (satMap?.getSource('traffic')?.setTiles) satMap.getSource('traffic').setTiles(trafficTiles());
}, 120000);

/* ---- 3D / 2D ---- */
function refresh3D() { $('#b3dLbl').textContent = S.set.three ? '3D' : '2D'; $('#b3d').classList.toggle('on', S.set.three); }
$('#b3d').onclick = () => { S.set.three = !S.set.three; saveSet(); refresh3D(); set3DBuildings(S.set.three); const pt = S.set.three ? (S.nav ? 62 : 50) : 0; if (S.follow) S.cam.pitch = pt; else map.easeTo({ pitch: pt, duration: 800 }); };
refresh3D();

/* ================= Position, boussole et suivi ================= */
const meEl = document.createElement('div');
const meMarker = new maplibregl.Marker({ element: meEl, rotationAlignment: 'map', pitchAlignment: 'map' });
let meShown = false, meMode = '';
function meLook() {
  const nav = !!S.nav, v = nav ? S.set.vehicle : 'puck-idle';
  if (meMode === v + S.set.vcolor) return; meMode = v + S.set.vcolor;
  if (!nav) { meEl.className = 'puck'; meEl.innerHTML = '<div class="beam" id="beam"></div><i></i>'; }
  else if (REAL_CARS[S.set.vehicle]) { meEl.className = 'veh v3d'; meEl.innerHTML = ''; meEl.appendChild(car3dCanvas(S.set.vcolor, '', S.set.vehicle)); }
  else { meEl.className = 'veh'; meEl.innerHTML = vehicleSVG(S.set.vehicle, S.set.vcolor); }
}
// Interpolation fluide entre deux points GPS
const anim = { from: null, to: null, h0: 0, h1: 0, t0: 0, dur: 1000, cur: null, curH: 0 };
function animateMe(ts) {
  if (!anim.to) return;
  const k = Math.min(1, (performance.now() - anim.t0) / anim.dur), e = k < 1 ? k * (2 - k) : 1;
  const p = anim.from ? [anim.from[0] + (anim.to[0] - anim.from[0]) * e, anim.from[1] + (anim.to[1] - anim.from[1]) * e] : anim.to;
  const h = anim.h0 + angDiff(anim.h0, anim.h1) * e;
  anim.cur = p; anim.curH = h;
  meMarker.setLngLat(ll(p)).setRotation(S.nav ? h : 0);
  const beam = meEl.querySelector('.beam'); if (beam) { const hh = S.devHeading ?? S.heading; beam.style.display = hh == null ? 'none' : ''; beam.style.transform = `rotate(${hh ?? 0}deg)`; }
  if (S.follow && !touching && Date.now() - wheelT > 400) {
    const tb = S.compassMode === 'heading' ? (S.nav ? h : (S.devHeading ?? map.getBearing())) : 0;
    const cz = map.getZoom(), cp = map.getPitch(), cb = map.getBearing();
    map.jumpTo({ center: ll(p), zoom: cz + (S.cam.z - cz) * .08, pitch: cp + (S.cam.pitch - cp) * .08, bearing: cb + angDiff(cb, tb) * .12 });
  }
  if (k >= 1 && !S.follow && !S.nav) anim.to = null;
}
let watchId = null, lastFix = null, stay = null;
function startGeo() {
  if (!('geolocation' in navigator)) { toast('GPS indisponible sur cet appareil.'); return; }
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition(onFix, e => { if (e.code === 1) toast('Autorisez la localisation pour Ponctuel (réglages du navigateur).', 6000); },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
function onFix(p) {
  const c = p.coords, now = p.timestamp || Date.now(), here = [c.latitude, c.longitude];
  let spd = c.speed != null && c.speed >= 0 ? c.speed * 3.6 : null;
  if (spd == null && lastFix && now - lastFix.t > 900) spd = hav(lastFix.p, here) / ((now - lastFix.t) / 1000) * 3.6;
  if (spd != null && spd > 220) spd = null;
  if (c.heading != null && !isNaN(c.heading) && (spd ?? 0) > 3) S.heading = c.heading;
  else if (lastFix && hav(lastFix.p, here) > 8 && (spd ?? 0) > 4) S.heading = bearingOf(lastFix.p, here);
  S.speed = spd ?? S.speed ?? 0; S.posT = Date.now();
  const prev = anim.cur || S.pos;
  S.pos = here;
  if (c.accuracy < 60 && lastFix && now - lastFix.t >= 4000) { learn(here, S.speed, now); lastFix = { p: here, t: now }; }
  if (!lastFix) lastFix = { p: here, t: now };
  detectStay(here, now, c.accuracy);
  meLook();
  anim.from = prev; anim.to = here; anim.h0 = anim.curH; anim.h1 = S.heading ?? anim.curH; anim.t0 = performance.now(); anim.dur = 950;
  if (!meShown) { meMarker.setLngLat(ll(here)).addTo(map); meShown = true; }
  if (S.nav) navUpdate();
}
function goFollow() {
  if (!S.pos) { startGeo(); toast('Recherche du GPS…'); waitPosThen(() => goFollow()); return; }
  S.follow = true; $('#recenter').hidden = true;
  map.setPadding(S.nav ? { top: Math.round(innerHeight * .42), bottom: 90, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 });
  S.cam = { z: S.nav ? 17.4 : Math.max(map.getZoom(), 16), pitch: S.set.three ? (S.nav ? 62 : 50) : 0 };
  anim.from = anim.cur || null; anim.to = S.pos; anim.t0 = performance.now(); anim.dur = 700;
}
// Gestes : un glissé d'un doigt quitte le suivi (bouton Recentrer) ; pincer/molette ajuste le zoom suivi
let touching = false, wheelT = 0, downXY = null, multiTouch = false;
const cv = map.getCanvasContainer();
cv.addEventListener('pointerdown', e => { touching = true; downXY = [e.clientX, e.clientY]; });
cv.addEventListener('pointermove', e => {
  if (!touching || !downXY || !S.follow) return;
  if (!multiTouch && Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 12) { S.follow = false; showRecenter(); }
});
cv.addEventListener('touchstart', e => { multiTouch = e.touches.length > 1; }, { passive: true });
const endTouch = () => { touching = false; downXY = null; multiTouch = false; if (S.follow) S.cam = { z: map.getZoom(), pitch: map.getPitch() }; };
cv.addEventListener('pointerup', endTouch); cv.addEventListener('pointercancel', endTouch);
cv.addEventListener('wheel', () => { wheelT = Date.now(); setTimeout(() => { if (S.follow) S.cam.z = map.getZoom(); }, 450); }, { passive: true });
$('#bLocate').onclick = () => goFollow();
$('#recenter').onclick = () => goFollow();
function showRecenter() { $('#recenter').hidden = false; document.documentElement.style.setProperty('--recenter-b', S.nav ? 'calc(env(safe-area-inset-bottom,0px) + 110px)' : `calc(${Math.round(sheetH())}px + 16px)`); }

// Boussole : cadran = orientation de la carte ; touche = nord en haut / cap en haut
function refreshCompass() {
  $('#dial').style.transform = `rotate(${-map.getBearing()}deg)`;
  const h = S.nav ? S.heading : (S.devHeading ?? S.heading);
  $('#compassLbl').textContent = S.compassMode === 'heading' ? (h != null ? `${cardinal(h)} ${Math.round(h)}°` : 'CAP') : 'NORD';
  $('#compass').classList.toggle('on', S.compassMode === 'heading');
}
map.on('rotate', refreshCompass);
let orientAsked = false, orientOn = false;
function startOrientation() {
  if (orientOn) return; orientOn = true;
  const handler = e => {
    let h = null;
    if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) h = (360 - e.alpha) % 360;
    if (h == null) return;
    const so = screen.orientation?.angle || 0; h = (h + so) % 360;
    S.devHeading = S.devHeading == null ? h : (S.devHeading + angDiff(S.devHeading, h) * .25 + 360) % 360;
    if (!S.nav) refreshCompass();
  };
  if ('ondeviceorientationabsolute' in window) addEventListener('deviceorientationabsolute', handler);
  else addEventListener('deviceorientation', handler);
}
$('#compass').onclick = async () => {
  if (!orientAsked) { orientAsked = true; try { if (typeof DeviceOrientationEvent?.requestPermission === 'function') { orientOn = false; await DeviceOrientationEvent.requestPermission(); } } catch { } startOrientation(); }
  S.compassMode = S.compassMode === 'north' ? 'heading' : 'north';
  if (S.compassMode === 'north' && !S.follow) map.easeTo({ bearing: 0, duration: 600 });
  else { if (!S.follow) goFollow(); toast(S.nav ? 'Cap en haut : la carte tourne avec la route.' : 'Boussole : la carte tourne avec votre téléphone.'); }
  refreshCompass();
};
startOrientation(); refreshCompass();

/* ================= Horloge ================= */
function tick() { $('#clock').textContent = fmtTime(new Date()); }
setInterval(tick, 10000); tick();

/* ================= Apprentissage ================= */
const cellKey = (p, how) => `${Math.round(p[0] * 300)}_${Math.round(p[1] * 300)}_${how}`;
const howOf = d => (d.getDay() * 24 + d.getHours());
let cellsDirty = 0;
function learn(p, kmh, t) {
  if (!S.set.track || kmh == null || kmh > 160) return;
  if (kmh < 3 && !S.nav) return;
  const k = cellKey(p, howOf(new Date(t)));
  const v = S.cells[k] || [0, 0]; v[0]++; v[1] += kmh; S.cells[k] = v;
  if (++cellsDirty > 10) { cellsDirty = 0; pruneCells(); store.set('cells', S.cells); }
}
function pruneCells() { const ks = Object.keys(S.cells); if (ks.length > 40000) ks.sort((a, b) => S.cells[a][0] - S.cells[b][0]).slice(0, ks.length - 30000).forEach(k => delete S.cells[k]); }
function learnedSpeed(p, d) {
  const h = howOf(d); let n = 0, s = 0;
  for (const dh of [-1, 0, 1]) { const v = S.cells[cellKey(p, (h + dh + 168) % 168)]; if (v) { n += v[0]; s += v[1]; } }
  return n >= 3 ? s / n : null;
}
function detectStay(p, t, acc) {
  if (!S.set.track || acc > 80) return;
  if (!stay || hav(stay.p, p) > 120) { if (stay && stay.saved) closeStay(stay, t); stay = { p, t0: t, saved: false }; return; }
  if (!stay.saved && t - stay.t0 > 5 * 60000) { stay.saved = true; stay.placeId = registerVisit(stay.p, stay.t0); }
}
function closeStay(st, t) { const pl = S.places.find(x => x.id === st.placeId); if (pl) { pl.mins = (pl.mins || 0) + Math.round((t - st.t0) / 60000); savePlaces(); } }
function registerVisit(p, t0) {
  const d = new Date(t0);
  let pl = S.places.find(x => hav([x.lat, x.lng], p) < 150);
  if (!pl) {
    pl = { id: 'p' + Date.now().toString(36), lat: p[0], lng: p[1], name: 'Lieu ' + (S.places.length + 1), tag: '', visits: 0, hours: Array(24).fill(0), dows: Array(7).fill(0), mins: 0, last: 0 };
    S.places.push(pl);
    reverse(p).then(n => { if (n && /^Lieu \d+$/.test(pl.name)) { pl.name = n; savePlaces(); renderPlaces(); if (curTab === 'places') render(); } });
  } else { pl.lat = (pl.lat * pl.visits + p[0]) / (pl.visits + 1); pl.lng = (pl.lng * pl.visits + p[1]) / (pl.visits + 1); }
  pl.visits++; pl.hours[d.getHours()]++; pl.dows[d.getDay()]++; pl.last = t0;
  savePlaces(); renderPlaces(); if (curTab === 'places') render();
  return pl.id;
}
let placeMarkers = [];
function renderPlaces() {
  placeMarkers.forEach(m => m.remove()); placeMarkers = [];
  S.places.forEach(pl => {
    const el = document.createElement('div'); el.className = 'placepin'; el.title = `${pl.name} · ${pl.visits} visite${pl.visits > 1 ? 's' : ''}`;
    el.onclick = ev => { ev.stopPropagation(); setB({ lat: pl.lat, lng: pl.lng, name: pl.name }); calc(); };
    placeMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([pl.lng, pl.lat]).addTo(map));
  });
  $('#chipHome').hidden = !S.places.some(p => p.tag === 'home'); $('#chipWork').hidden = !S.places.some(p => p.tag === 'work');
}
$('#chipHome').onclick = () => { const p = S.places.find(x => x.tag === 'home'); if (p) { setB({ lat: p.lat, lng: p.lng, name: p.name }); calc(); } };
$('#chipWork').onclick = () => { const p = S.places.find(x => x.tag === 'work'); if (p) { setB({ lat: p.lat, lng: p.lng, name: p.name }); calc(); } };
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
  const c = map.getCenter(), near = S.pos || [c.lat, c.lng], out = [], ql = q.toLowerCase();
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
let sugTimer;
function bindSearch(inp, which) {
  inp.addEventListener('input', () => {
    clearTimeout(sugTimer); const q = inp.value.trim();
    if (which === 'A') S.A = null; else S.B = null;
    if (q.length < 3) { $('#suggest').hidden = true; return; }
    sugTimer = setTimeout(async () => {
      try {
        const res = await geocode(q), box = $('#suggest');
        box.innerHTML = (which === 'A' ? '<button data-i="-1"><b>Ma position</b><small>GPS</small></button>' : '') +
          (res.length ? res.map((r, i) => `<button data-i="${i}"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></button>`).join('') : '<button disabled><small>Aucun résultat. Essayez avec le quartier ou la commune.</small></button>');
        box.hidden = false;
        box.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => {
          const i = +b.dataset.i; box.hidden = true;
          if (i < 0) { S.A = null; inp.value = ''; } else (which === 'A' ? setA : setB)(res[i]);
          if (S.B) calc();
        });
      } catch (e) { toast('Recherche impossible (réseau). Réessayez.'); }
    }, 320);
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('#suggest button[data-i="0"]') || $('#suggest button[data-i]'); f?.click(); } });
}
bindSearch($('#inA'), 'A'); bindSearch($('#inB'), 'B');
document.addEventListener('click', e => { if (!e.target.closest('#suggest,.field')) $('#suggest').hidden = true; });
function setA(p) { S.A = p; $('#inA').value = p.name; drawPins(); }
function setB(p) { S.B = p; $('#inB').value = p.name; $('#hint').hidden = true; drawPins(); addRecent(p); }
let recents = store.get('recents', []);
function addRecent(p) {
  if (!p?.name || /^Point sur la carte$/.test(p.name)) return;
  recents = [{ lat: p.lat, lng: p.lng, name: p.name }, ...recents.filter(r => hav([r.lat, r.lng], [p.lat, p.lng]) > 80)].slice(0, 8);
  store.set('recents', recents); renderRecents();
}
function renderRecents() {
  const box = $('#recents'); if (!box) return;
  const list = recents.filter(r => !S.B || hav([r.lat, r.lng], [S.B.lat, S.B.lng]) > 80).slice(0, 6);
  box.hidden = !list.length || !!S.routes.length;
  box.innerHTML = list.map((r, i) => `<button class="chip" data-rc="${i}">${ic('recent')}<span>${esc(r.name)}</span></button>`).join('');
  box.querySelectorAll('[data-rc]').forEach(b => b.onclick = () => { const r = list[+b.dataset.rc]; setB(r); calc(); });
}
$('#swap').onclick = () => {
  const a = S.A || (S.pos ? { lat: S.pos[0], lng: S.pos[1], name: 'Ma position' } : null), b = S.B;
  S.A = b; S.B = a; $('#inA').value = b?.name || ''; $('#inB').value = a?.name || ''; drawPins(); if (S.B) calc();
};
function pickPoint(lngLat) {
  const p = { lat: lngLat.lat, lng: lngLat.lng, name: 'Point sur la carte' };
  navigator.vibrate?.(30);
  setB(p); reverse([p.lat, p.lng]).then(n => { if (n && S.B === p) { p.name = n; $('#inB').value = n; } }); calc();
}
map.on('contextmenu', e => pickPoint(e.lngLat));
let lpT = null; // appui long tactile
map.on('touchstart', e => { if (e.originalEvent.touches.length !== 1) return; clearTimeout(lpT); lpT = setTimeout(() => pickPoint(e.lngLat), 650); });
for (const ev of ['touchend', 'touchmove', 'touchcancel', 'movestart']) map.on(ev, () => clearTimeout(lpT));
const pins = {};
function pinEl(l) { const d = document.createElement('div'); d.innerHTML = `<div class="pin ${l.toLowerCase()}"><span>${l}</span></div>`; return d; }
function drawPins() {
  for (const k of ['A', 'B']) { pins[k]?.remove(); pins[k] = null; const p = S[k]; if (p) pins[k] = new maplibregl.Marker({ element: pinEl(k), anchor: 'bottom-left', offset: [-4, 0] }).setLngLat([p.lng, p.lat]).addTo(map); }
}

/* ================= Itinéraires ================= */
function origin() { if (S.A) return S.A; if (S.pos) return { lat: S.pos[0], lng: S.pos[1], name: 'Ma position' }; return null; }
async function calc(opts = {}) {
  const a = opts.from || origin(), b = S.B;
  if (!b) { toast('Choisissez une destination.'); $('#inB').focus(); return; }
  if (!a) { startGeo(); toast('En attente du GPS… ou saisissez un point de départ.'); waitPosThen(calc); return; }
  if (!opts.silent) { showTab('trip'); $('#pane').innerHTML = '<p class="empty">Calcul des itinéraires et analyse du trafic…</p><div class="skel"></div><div class="skel" style="opacity:.6"></div><div class="skel" style="opacity:.35"></div>'; }
  let routes;
  try { routes = S.set.key ? await tomtomRoutes(a, b) : await osrmRoutes(a, b); }
  catch (e) {
    console.warn(e);
    if (S.set.key) { try { routes = await osrmRoutes(a, b); if (!opts.silent) toast('Trafic TomTom indisponible : itinéraire sans trafic en direct.'); } catch (e2) { console.warn(e2); } }
  }
  if (!routes?.length) { if (!opts.silent) $('#pane').innerHTML = '<p class="empty">Impossible de calculer l’itinéraire. Vérifiez la connexion internet, puis réessayez.</p>'; return; }
  routes.forEach(r => { applyPersonal(r); smartEta(r); r.score = r.dur + r.jams.reduce((s, j) => s + (j.mag >= 3 ? 60 : 0), 0); });
  routes.sort((x, y) => x.score - y.score); routes[0].best = true;
  if (opts.silent) return routes;
  S.routes = routes; S.sel = 0; S.from = a; S.updatedAt = new Date();
  drawRoutes(true); fitRoutes(); render();
  await checkDestination();
  if (S.set.autoSat) autoSatellite();
  return routes;
}
function waitPosThen(fn) { const t0 = Date.now(); const iv = setInterval(() => { if (S.pos) { clearInterval(iv); fn(); } else if (Date.now() - t0 > 20000) clearInterval(iv); }, 500); }
$('#go').onclick = () => calc();

async function tomtomRoutes(a, b) {
  const avoid = [S.set.tolls && 'tollRoads', S.set.highways && 'motorways'].filter(Boolean).map(x => '&avoid=' + x).join('');
  const q = `/${a.lat},${a.lng}:${b.lat},${b.lng}/json?key=${encodeURIComponent(S.set.key)}` +
    `&traffic=true&routeType=fastest&travelMode=car&maxAlternatives=2&departAt=now&computeTravelTimeFor=all&sectionType=traffic&instructionsType=text&language=fr-FR${avoid}`;
  const urls = S.set.orbis ? [`https://api.tomtom.com/maps/orbis/routing/calculateRoute${q}&apiVersion=2`, `https://api.tomtom.com/routing/1/calculateRoute${q}`]
    : [`https://api.tomtom.com/routing/1/calculateRoute${q}`, `https://api.tomtom.com/maps/orbis/routing/calculateRoute${q}&apiVersion=2`];
  let j;
  for (const [i, u] of urls.entries()) {
    try { j = await getJSON(u, 15000); if (j.routes?.length) { S.set.orbis = u.includes('/orbis/'); saveSet(); break; } }
    catch (e) { if (i === urls.length - 1) throw e; }
  }
  if (!j?.routes) throw new Error('aucun itinéraire');
  return j.routes.map(r => {
    const coords = r.legs.flatMap(l => l.points.map(p => [p.latitude, p.longitude]));
    const cum = cumDist(coords);
    const jams = (r.sections || []).filter(s => s.sectionType === 'TRAFFIC').map(s => {
      const seg = coords.slice(s.startPointIndex, s.endPointIndex + 1);
      return { coords: seg, at: seg[Math.floor(seg.length / 2)] || coords[s.startPointIndex], delay: s.delayInSeconds || 0, speed: s.effectiveSpeedInKmh, mag: s.magnitudeOfDelay ?? 1,
        len: cum[s.endPointIndex] - cum[s.startPointIndex], startOff: cum[s.startPointIndex], src: 'live' };
    });
    const steps = (r.guidance?.instructions || []).filter(i => i.message).map(i => ({ text: i.message.replace(/<[^>]+>/g, ''), at: [i.point.latitude, i.point.longitude], off: i.routeOffsetInMeters, dir: dirFromTomTom(i.maneuver, i.message) }));
    const sm = r.summary;
    return { coords, cum, dist: sm.lengthInMeters, dur: sm.travelTimeInSeconds, free: sm.noTrafficTravelTimeInSeconds ?? sm.travelTimeInSeconds - (sm.trafficDelayInSeconds || 0),
      hist: sm.historicTrafficTravelTimeInSeconds || 0, delay: sm.trafficDelayInSeconds || 0, jams, steps, live: true };
  });
}
async function osrmRoutes(a, b) {
  const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?alternatives=3&overview=full&geometries=geojson&steps=true`, 15000);
  if (j.code !== 'Ok') throw new Error(j.code);
  return j.routes.map(r => {
    const coords = r.geometry.coordinates.map(c => [c[1], c[0]]), cum = cumDist(coords);
    let idx = 0;
    const steps = r.legs.flatMap(l => l.steps).map(s => {
      const at = [s.maneuver.location[1], s.maneuver.location[0]];
      let best = idx, bd = Infinity; for (let i = idx; i < Math.min(coords.length, idx + 400); i++) { const d = hav(coords[i], at); if (d < bd) { bd = d; best = i; } }
      idx = best; return { text: osrmText(s), at, off: cum[best], dir: dirFromOsrm(s) };
    });
    return { coords, cum, dist: r.distance, dur: r.duration, free: r.duration, delay: 0, jams: [], steps, live: false };
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
function applyPersonal(r) {
  const now = new Date(); let extra = 0, run = null;
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

let jamMarkers = [], drawAnim = 0;
function drawRoutes(animateIn) {
  const r = S.routes[S.sel];
  setData('alts', { type: 'FeatureCollection', features: S.routes.map((x, i) => i === S.sel ? null : { type: 'Feature', properties: { idx: i }, geometry: { type: 'LineString', coordinates: x.coords.map(ll) } }).filter(Boolean) });
  setData('done', EMPTY);
  jamMarkers.forEach(m => m.remove()); jamMarkers = [];
  if (!r) { setData('main', EMPTY); setData('jams', EMPTY); return; }
  setData('jams', { type: 'FeatureCollection', features: r.jams.filter(j => j.coords.length > 1).map(j => ({ type: 'Feature', properties: { mag: j.mag }, geometry: { type: 'LineString', coordinates: j.coords.map(ll) } })) });
  r.jams.forEach(j => {
    if (!(j.mag >= 2 || j.delay >= 60)) return;
    const el = document.createElement('div'); el.className = 'jampin'; el.textContent = '!';
    el.onclick = ev => { ev.stopPropagation(); openSat(satList().indexOf(j)); };
    jamMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(ll(j.at)).addTo(map));
  });
  // tracé qui se dessine progressivement
  const id = ++drawAnim;
  if (!animateIn || reduceMotion) { setData('main', lineFC(r.coords)); return; }
  const t0 = performance.now(), n = r.coords.length;
  const step = () => { if (id !== drawAnim) return; const k = Math.min(1, (performance.now() - t0) / 900), e = 1 - Math.pow(1 - k, 3);
    setData('main', lineFC(r.coords.slice(0, Math.max(2, Math.ceil(n * e))))); if (k < 1) requestAnimationFrame(step); };
  step();
}
const sheetH = () => $('#sheet').hidden ? 0 : $('#sheet').getBoundingClientRect().height;
function fitRoutes() {
  const all = S.routes.flatMap(r => r.coords); if (!all.length) return;
  S.follow = false;
  const b = new maplibregl.LngLatBounds(ll(all[0]), ll(all[0])); all.forEach(p => b.extend(ll(p)));
  const wide = innerWidth >= 900;
  map.fitBounds(b, { padding: { top: wide ? 60 : 230, bottom: wide ? 60 : Math.min(sheetH(), innerHeight * .6) + 20, left: wide ? 500 : 30, right: 80 }, pitch: S.set.three ? 35 : 0, bearing: 0, duration: 1300 });
}
async function checkDestination() {
  S.destJam = null;
  const b = S.B, r = S.routes[S.sel];
  if (S.set.key) {
    try {
      const j = await getJSON(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/16/json?point=${b.lat},${b.lng}&unit=KMPH&key=${encodeURIComponent(S.set.key)}`);
      const f = j.flowSegmentData;
      if (f && f.freeFlowSpeed) {
        const ratio = f.currentSpeed / f.freeFlowSpeed, coords = (f.coordinates?.coordinate || []).map(c => [c.latitude, c.longitude]);
        if (ratio < 0.65 || f.roadClosure) S.destJam = { coords: coords.length ? coords : [[b.lat, b.lng]], at: [b.lat, b.lng], speed: f.currentSpeed, free: f.freeFlowSpeed,
          delay: Math.max(0, (f.currentTravelTime || 0) - (f.freeFlowTravelTime || 0)), mag: ratio < .35 || f.roadClosure ? 4 : ratio < .5 ? 3 : 2, closed: f.roadClosure, dest: true, src: 'live' };
      }
    } catch (e) { console.warn(e); }
  }
  if (!S.destJam && r) { const near = r.jams.filter(j => hav(j.at, [b.lat, b.lng]) < 1200).sort((x, y) => y.mag - x.mag)[0]; if (near) S.destJam = Object.assign({ dest: true }, near); }
  if (!S.destJam) { const sp = learnedSpeed([b.lat, b.lng], new Date()); if (sp != null && sp < 12) S.destJam = { coords: [[b.lat, b.lng]], at: [b.lat, b.lng], speed: Math.round(sp), mag: 2, delay: 0, dest: true, src: 'perso' }; }
}
function satList() { const r = S.routes[S.sel]; const l = (r?.jams || []).filter(j => j.mag >= 2 || j.delay >= 60); if (S.destJam) l.unshift(S.destJam); return l; }
function autoSatellite() { if (satList().length && $('#aiPanel').hidden) openSat(0); }

/* ================= Vue satellite (survol façon drone) ================= */
let satMap = null, orbit = false;
function openSat(i) {
  const list = satList(); if (!list.length) return;
  S.satIdx = Math.max(0, Math.min(i, list.length - 1));
  $('#sat').hidden = false;
  if (!satMap) {
    const st = rasterStyle(SAT_TILES.slice(0, 2));
    if (S.set.key) { st.sources.traffic = { type: 'raster', tiles: trafficTiles(), tileSize: 256, maxzoom: 22 }; st.layers.push({ id: 'traffic', type: 'raster', source: 'traffic', paint: { 'raster-opacity': .85 } }); }
    st.sources.jam = { type: 'geojson', data: EMPTY };
    st.layers.push({ id: 'jam-glow', type: 'line', source: 'jam', paint: { 'line-color': '#ff3b3b', 'line-width': 22, 'line-blur': 10, 'line-opacity': .6 } },
      { id: 'jam', type: 'line', source: 'jam', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ff3b3b', 'line-width': 6, 'line-dasharray': [2, 1.2] } });
    satMap = new maplibregl.Map({ container: 'satmap', style: st, center: ll(list[S.satIdx].at), zoom: 16, pitch: 55, attributionControl: false, interactive: true });
    satMap.once('load', () => showSat()); setTimeout(showSat, 300);
    satMap.on('mousedown', () => orbit = false); satMap.on('touchstart', () => orbit = false);
    satMap.on('moveend', () => { if (orbit && !$('#sat').hidden) satMap.easeTo({ bearing: satMap.getBearing() + 60, duration: 9000, easing: t => t }); });
  } else { satMap.resize(); showSat(); }
}
function showSat() {
  const list = satList(), j = list[S.satIdx]; if (!j) return;
  if (!satMap?.getSource('jam')) { setTimeout(showSat, 200); return; }
  satMap.getSource('jam').setData(lineFC(j.coords.length > 1 ? j.coords : [j.at, j.at]));
  orbit = !reduceMotion;
  if (j.coords.length > 1) { const b = new maplibregl.LngLatBounds(ll(j.coords[0]), ll(j.coords[0])); j.coords.forEach(p => b.extend(ll(p))); satMap.fitBounds(b, { padding: 40, maxZoom: 17.5, pitch: 55, duration: 1200 }); }
  else satMap.flyTo({ center: ll(j.at), zoom: 17, pitch: 55, duration: 1200 });
  const lvl = j.closed ? 'Route fermée' : j.mag >= 4 ? 'Bouchon total' : j.mag >= 3 ? 'Gros bouchon' : 'Circulation lente';
  $('#satTitle').textContent = (j.dest ? 'À destination · ' : '') + lvl;
  const bits = [];
  if (j.speed != null) bits.push(`${Math.round(j.speed)} km/h${j.free ? ` (normal ${Math.round(j.free)})` : ''}`);
  if (j.delay) bits.push(`+${fmtDur(j.delay)}`);
  if (j.len) bits.push(fmtKm(j.len));
  if (j.startOff != null && !j.dest) bits.push(j.startOff < 50 ? 'dès le départ' : `dans ${fmtKm(j.startOff)}`);
  $('#satSub').textContent = bits.join(' · ');
  $('#satCap').textContent = j.src === 'perso' ? 'Bouchon prévu d’après vos trajets passés à cette heure. Image satellite haute résolution (date de prise variable).'
    : 'Trafic mesuré en direct (TomTom) superposé à l’image satellite haute résolution. L’image elle-même n’est pas filmée en direct.';
  $('#satIdx').textContent = `${S.satIdx + 1}/${list.length}`;
  $('#satEarth').href = `https://earth.google.com/web/@${j.at[0]},${j.at[1]},20a,600d,35y,0h,60t,0r`;
}
$('#satClose').onclick = () => { $('#sat').hidden = true; orbit = false; };
$('#satPrev').onclick = () => { const n = satList().length; S.satIdx = (S.satIdx - 1 + n) % n; showSat(); };
$('#satNext').onclick = () => { const n = satList().length; S.satIdx = (S.satIdx + 1) % n; showSat(); };
$('#satZoom').onclick = () => { const j = satList()[S.satIdx]; if (j) { S.follow = false; map.flyTo({ center: ll(j.at), zoom: 17, pitch: S.set.three ? 55 : 0, duration: 1400 }); showRecenter(); } };

/* ================= Planificateur « arriver à l'heure » ================= */
const arriveIn = $('#arriveAt');
arriveIn.value = store.get('arrive', '');
arriveIn.onchange = () => { store.set('arrive', arriveIn.value); store.set('arriveSetAt', Date.now()); if (arriveIn.value && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); if (S.routes.length) render(); };
function targetDate() {
  if (!arriveIn.value) return null;
  const [h, m] = arriveIn.value.split(':').map(Number), d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() - 6 * 3600e3) d.setDate(d.getDate() + 1);
  return d;
}
function planInfo(r) {
  const t = targetDate(); if (!t || !r) return null;
  const leave = new Date(t.getTime() - (r.dur + S.set.buffer * 60) * 1000);
  return { t, leave, slack: (leave.getTime() - Date.now()) / 1000, eta: new Date(Date.now() + r.dur * 1000) };
}
const notified = {};
setInterval(async () => { // trafic temps réel : itinéraires recalculés toutes les 2 min
  if (S.nav || !S.B || !S.routes.length) return;
  const fresh = await calc({ silent: true });
  if (fresh?.length) { S.routes = fresh; S.sel = 0; S.updatedAt = new Date(); drawRoutes(false); if (curTab === 'trip') render(); }
  const p2 = planInfo(S.routes[S.sel]); if (!p2) return;
  const key = p2.leave.toISOString().slice(0, 16);
  if (p2.slack < 600 && p2.slack > 0 && !notified[key + 'a']) { notified[key + 'a'] = 1; notify(`Partez dans ${fmtDur(p2.slack)}`, `Pour arriver à ${fmtTime(p2.t)} à ${S.B?.name}. Trajet actuel : ${fmtDur(S.routes[S.sel].dur)}.`); }
  if (p2.slack <= 0 && p2.slack > -300 && !notified[key + 'b']) { notified[key + 'b'] = 1; notify('C’est l’heure de partir !', `${S.B?.name} — ${fmtDur(S.routes[S.sel].dur)} de route.`); }
}, 120000);
function notify(title, body) {
  toast(title + ' — ' + body, 8000); speak(title);
  try { if ('Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification(title, { body, icon: 'media/icon-192.png', tag: 'ponctuel' })).catch(() => new Notification(title, { body })); } catch { }
  navigator.vibrate?.([200, 100, 200]);
}

/* ================= Navigation guidée ================= */
let wakeLock = null;
async function startNav() {
  const r = S.routes[S.sel]; if (!r) return;
  startGeo();
  S.nav = { pred: r.dur, predAt: new Date(), r, start: Date.now(), planned: targetDate()?.getTime() || null, spoken: {}, off: 0, lastCheck: Date.now(), done: 0, idx: 0 };
  S.compassMode = 'heading'; meMode = ''; meLook(); refreshCompass();
  for (const id of ['#top', '#sheet', '#sat', '#aiPanel']) $(id).hidden = true; $('#bReport').hidden = true; $('#nTray').hidden = true; muteIcon();
  document.body.classList.add('navmode'); enterFullscreen();
  $('#nav').hidden = false; $('#navbar').hidden = false; $('#speed').hidden = false;
  setData('alts', EMPTY); setTimeout(syncSheet, 50);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { }
  if (orbisOk && S.base === 'plan') applyBase();
  speak(`C'est parti. Arrivée prévue à ${fmtTime(new Date(Date.now() + r.dur * 1000))}.`);
  goFollow();
  if (S.pos) navUpdate(); else toast('En attente du GPS…');
}
function stopNav(arrived) {
  const n = S.nav; if (!n) return;
  if (arrived && n.pred && n.done > n.r.dist * .7) learnEta(n);
  if (arrived) { arriveIn.value = ''; store.set('arrive', ''); }
  if (arrived || n.done > 500) {
    const end = Date.now(), lateMin = n.planned ? Math.round((end - n.planned) / 60000) : null;
    S.trips.unshift({ start: n.start, end, toName: S.B?.name || '', planned: n.planned, lateMin, dist: Math.round(n.done) });
    S.trips = S.trips.slice(0, 300); store.set('trips', S.trips);
    if (arrived) { speak(lateMin == null ? 'Vous êtes arrivé.' : lateMin <= 0 ? `Vous êtes arrivé, avec ${-lateMin} minutes d'avance.` : `Vous êtes arrivé, avec ${lateMin} minutes de retard.`); setTimeout(() => showArrival(S.trips[0]), 400); }
  }
  S.nav = null; store.set('cells', S.cells); S.compassMode = 'north'; S.follow = false;
  try { wakeLock?.release(); } catch { } wakeLock = null;
  for (const id of ['#top', '#sheet']) $(id).hidden = false;
  for (const id of ['#nav', '#navbar', '#speed', '#recenter', '#bReport', '#reportSheet']) $(id).hidden = true;
  document.body.classList.remove('navmode', 'peek'); exitFullscreen();
  $('#fab').style.bottom = '';
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.easeTo({ bearing: 0, pitch: S.set.three ? 45 : 0, duration: 800 });
  meMode = ''; meLook(); refreshCompass(); setData('done', EMPTY); drawRoutes(false); render(); if (orbisOk && S.base === 'plan') applyBase();
}
$('#nStop').onclick = () => stopNav(false);
const muteIcon = () => $('#nMute').innerHTML = ic(S.set.voice ? 'vol' : 'mute') + (S.set.voice ? 'Voix' : 'Muet');
$('#nMute').onclick = () => { S.set.voice = !S.set.voice; saveSet(); muteIcon(); toast(S.set.voice ? 'Guidage vocal activé' : 'Guidage vocal coupé', 2000, S.set.voice ? 'vol' : 'mute'); };
function navUpdate() {
  const n = S.nav, r = n.r, p = S.pos;
  let best = n.idx, bd = Infinity, bt = 0;
  const from = Math.max(0, n.idx - 30), to = Math.min(r.coords.length - 1, n.idx + 400);
  for (let i = from; i < to; i++) { const q = distToSeg(p, r.coords[i], r.coords[i + 1]); if (q.d < bd) { bd = q.d; best = i; bt = q.t; } }
  if (bd > 1000) for (let i = 0; i < r.coords.length - 1; i++) { const q = distToSeg(p, r.coords[i], r.coords[i + 1]); if (q.d < bd) { bd = q.d; best = i; bt = q.t; } }
  n.idx = best;
  const done = r.cum[best] + (r.cum[best + 1] - r.cum[best]) * bt; n.done = done;
  const a0 = r.coords[best], a1 = r.coords[Math.min(best + 1, r.coords.length - 1)];
  const snapped = bd < 40 ? [a0[0] + (a1[0] - a0[0]) * bt, a0[1] + (a1[1] - a0[1]) * bt] : p;
  if (bd < 40) { anim.to = snapped; if (a0 !== a1 && S.speed < 25) { S.heading = bearingOf(a0, a1); anim.h1 = S.heading; } }
  const left = r.dist - done;
  n.trace = (n.trace || []).filter(x => Date.now() - x.t < 6 * 60000); n.trace.push({ t: Date.now(), d: done });
  if (!n.movedAt && S.speed > 8) n.movedAt = Date.now();
  let leftT = n.live ? Math.max(0, n.live.left * (left / Math.max(1, r.dist - n.live.done))) : r.dur * (left / r.dist);
  const tr = n.trace, span = tr.length > 1 ? (tr[tr.length - 1].t - tr[0].t) / 1000 : 0, pace = span > 120 ? (tr[tr.length - 1].d - tr[0].d) / span : null; // m/s observés sur ~5 min
  if (pace != null && n.movedAt) { const obs = left / Math.max(pace, 1.2); leftT = leftT * .6 + Math.min(obs, leftT * 2.5) * .4; }
  const eta = new Date(Date.now() + leftT * 1000);
  $('#nEta').textContent = fmtTime(eta); $('#nLeft').textContent = fmtDur(leftT); $('#nKm').textContent = (left / 1000).toFixed(1).replace('.', ',');
  $('#nEtaBox').classList.toggle('late', !!(n.planned && eta.getTime() > n.planned));
  $('#nProg').style.width = Math.min(100, done / r.dist * 100).toFixed(1) + '%';
  const sp = Math.round(S.speed); $('#spd').textContent = sp;
  $('#spdArc').setAttribute('stroke-dasharray', `${Math.min(155, sp / 130 * 155).toFixed(0)} 300`);
  $('#spdArc').setAttribute('stroke', sp > 90 ? 'var(--jam)' : sp > 60 ? 'var(--slow)' : 'var(--go)');
  const doneCoords = r.coords.slice(0, best + 1); doneCoords.push(snapped); setData('done', lineFC(doneCoords));
  const idxNext = r.steps.findIndex(s => s.off > done + 5), st = r.steps[idxNext], nx = r.steps[idxNext + 1];
  if (st) {
    const d = st.off - done;
    $('#nDist').textContent = fmtKm(d); $('#nMsg').textContent = st.text; if ($('#nIcon').dataset.d !== st.dir) { $('#nIcon').innerHTML = manSvg(st.dir); $('#nIcon').dataset.d = st.dir; } $('#nav .instr').classList.toggle('near', d < 120);
    const th = $('#nThen'); if (nx && nx.off - st.off < 400) { th.hidden = false; th.innerHTML = `Puis ${manSvg(nx.dir)} ${esc(nx.text)}`; } else th.hidden = true;
    if (d < 450 && d > 150 && !n.spoken[st.off + 'f']) { n.spoken[st.off + 'f'] = 1; speak(`Dans ${Math.round(d / 50) * 50} mètres, ${lc(st.text)}`); }
    if (d <= 70 && !n.spoken[st.off + 'n']) { n.spoken[st.off + 'n'] = 1; speak(st.text); navigator.vibrate?.(60); }
  }
  // Alerte lenteur : toujours visible au-dessus de la barre (fluide / ralentissement devant / dans le bouchon / roulez au pas / retard prévu)
  const inJam = r.jams.find(j => done >= j.startOff - 20 && done <= j.startOff + (j.len || 0) && (j.mag >= 2 || j.delay > 60));
  const ahead = r.jams.find(j => j.startOff > done && j.startOff - done < 3000 && (j.mag >= 2 || j.delay > 60));
  const fresh = S.posT !== n.seenFix; n.seenFix = S.posT;
  if (Date.now() - (S.posT || 0) > 6000) S.speed = 0; // plus de point GPS : arrêté
  // allure réelle sur 90 s (plus fiable que la vitesse instantanée en bouchon : avance-arrêt)
  const t90 = (n.trace || []).filter(x => Date.now() - x.t < 90000), pace90 = t90.length > 1 && t90[t90.length - 1].t - t90[0].t > 45000 ? (t90[t90.length - 1].d - t90[0].d) / ((t90[t90.length - 1].t - t90[0].t) / 1000) * 3.6 : null;
  const slowNow = S.speed < 10 || (pace90 != null && pace90 < 12);
  if (slowNow && (n.movedAt || Date.now() - n.start > 40000)) n.slowSince = n.slowSince || Date.now(); else if (!slowNow) { n.slowSince = 0; n.crawlAsked = 0; }
  const slowFor = n.slowSince ? (Date.now() - n.slowSince) / 1000 : 0, crawling = slowFor > 30;
  const jamLeft = r.jams.filter(j => j.startOff + (j.len || 0) > done).reduce((t, j) => t + (j.delay || 0), 0);
  const lateMin = n.planned ? Math.round((eta.getTime() - n.planned) / 60000) : null;
  const densePct = r.free ? (r.dur - r.free) / r.free : 0;
  let lvl = 'ok', msg = jamLeft > 60 ? `Trafic : +${fmtDur(jamLeft)} sur le reste du trajet` : densePct > .35 ? `Trafic dense prévu · +${fmtDur((r.dur - r.free) * (left / r.dist))} (${esc(r.etaWhy || 'heure de pointe')})` : 'Aucun bouchon signalé devant';
  if (densePct > .35 && !jamLeft) lvl = 'slow';
  // sondes de trafic en direct sur la route devant (vitesse réelle mesurée par TomTom sur chaque tronçon)
  const probe = (n.probes || []).filter(q => q.off > done + 30 && q.ratio < .6).sort((a, b) => a.off - b.off)[0];
  if (probe && (!ahead || probe.off < ahead.startOff)) {
    lvl = probe.ratio < .35 ? 'jam' : 'slow';
    msg = `${probe.ratio < .35 ? 'Bouchon' : 'Ralentissement'} dans ${fmtKm(probe.off - done)} · ${Math.round(probe.speed)} km/h (normal ${Math.round(probe.free)})`;
    const k = 'p' + Math.round(probe.off / 300);
    if (!n.spoken[k] && probe.off - done < 1800) { n.spoken[k] = 1; speak(`Attention, ${probe.ratio < .35 ? 'bouchon' : 'ralentissement'} dans ${fmtKm(probe.off - done)}.`); navigator.vibrate?.([120, 80, 120]); }
  }
  if (ahead && !(probe && probe.off < ahead.startOff)) { lvl = ahead.mag >= 3 ? 'jam' : 'slow'; msg = `${ahead.mag >= 3 ? 'Bouchon' : 'Ralentissement'} dans ${fmtKm(ahead.startOff - done)}${ahead.delay ? ' · +' + fmtDur(ahead.delay) : ''}${ahead.speed ? ' · ' + Math.round(ahead.speed) + ' km/h' : ''}`; }
  if (inJam) { lvl = 'jam'; msg = `Dans le bouchon · encore ${fmtKm(Math.max(0, inJam.startOff + (inJam.len || 0) - done))}${inJam.delay ? ' · +' + fmtDur(inJam.delay) : ''}`; }
  else if (crawling) { lvl = slowFor > 120 ? 'jam' : 'slow'; msg = slowFor > 120 ? `Bouchon détecté · arrêt depuis ${Math.round(slowFor / 60)} min${pace90 != null ? ' · ' + Math.round(pace90) + ' km/h' : ''}` : `Ralentissement · vous roulez au pas`; }
  if (lateMin > 0) msg += ` · retard prévu +${lateMin} min`;
  const stat = $('#nStatus'); stat.className = 'nstatus ' + lvl; stat.innerHTML = ic(lvl === 'ok' ? 'check' : lvl === 'jam' ? 'alert' : 'jam') + '<span></span>'; stat.lastChild.textContent = msg;
  if (ahead && !n.spoken['j' + ahead.startOff] && ahead.startOff - done < 1500) { n.spoken['j' + ahead.startOff] = 1; speak(`Attention, ${ahead.mag >= 3 ? 'bouchon' : 'ralentissement'} dans ${fmtKm(ahead.startOff - done)}.`); }
  // bouchon constaté sur place : on le note, on prévient et on cherche aussitôt un meilleur itinéraire
  if (crawling && slowFor > 75 && !n.crawlAsked) { n.crawlAsked = 1; n.lastCheck = 0; speak('Bouchon détecté. Je cherche un itinéraire plus rapide.');
    if (p) { const cells = r.coords.slice(n.idx, n.idx + 20); for (let i = 0; i < cells.length; i += 2) for (let k = 0; k < 3; k++) learn(cells[i], 4, Date.now()); } } // la route bouchée est pénalisée au recalcul
  $('#nWarn').hidden = true;
  refreshCompass(); syncSheet();
  if (left < 40 || hav(p, [S.B.lat, S.B.lng]) < 35) { stopNav(true); return; }
  if (fresh) { if (bd > 120) n.off += 2; else if (bd > 40) n.off++; else n.off = 0; }
  if (n.off >= 2 && S.set.reroute && Date.now() - (n.rerouteAt || 0) > 8000) { n.off = 0; n.rerouteAt = Date.now(); speak('Nouvel itinéraire.'); const stat2 = $('#nStatus'); stat2.className = 'nstatus slow'; stat2.lastChild.textContent = 'Recalcul de l’itinéraire…'; reroute(); }
  if (Date.now() - n.lastCheck > (crawling ? 45000 : 120000)) { n.lastCheck = Date.now(); betterRoute(leftT); }
}
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
async function reroute() {
  const rs = await calc({ silent: true, from: { lat: S.pos[0], lng: S.pos[1] } });
  if (rs?.length && S.nav) { S.routes = rs; S.sel = 0; S.nav.r = rs[0]; S.nav.idx = 0; S.nav.spoken = {}; S.nav.live = null; S.nav.done = 0; S.nav.trace = []; drawRoutes(false); toast(`Nouvel itinéraire : ${fmtDur(rs[0].dur)}`, 3000, 'route'); }
}
async function betterRoute(curLeft) {
  const rs = await calc({ silent: true, from: { lat: S.pos[0], lng: S.pos[1] } });
  if (!rs?.length || !S.nav) return;
  const gain = curLeft - rs[0].dur;
  const same = rs.find(x => Math.abs(x.dist - (S.nav.r.dist - S.nav.done)) < Math.max(400, x.dist * .08)) || rs[0];
  S.nav.live = { left: same.dur, done: S.nav.done, at: Date.now() }; // temps restant rafraîchi avec le trafic actuel
  if (gain >= 180) { S.routes = rs; S.sel = 0; S.nav.r = rs[0]; S.nav.idx = 0; S.nav.spoken = {}; drawRoutes(true); speak(`Itinéraire plus rapide trouvé. Vous gagnez ${Math.round(gain / 60)} minutes.`); toast(`Nouvel itinéraire : −${fmtDur(gain)}`); }
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
function showTab(t) { curTab = t; $('#sheet').classList.remove('min'); document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); render(); }
$('#grab').onclick = () => { $('#sheet').classList.toggle('min'); setTimeout(syncSheet, 320); };
function syncSheet() {
  const root = document.documentElement.style, wide = innerWidth >= 900;
  const topEl = S.nav ? $('#nav') : $('#top'), tb = topEl.hidden ? 10 : topEl.getBoundingClientRect().bottom;
  root.setProperty('--top-b', Math.round(tb + 10) + 'px');
  // le panneau ne doit jamais recouvrir les boutons de droite
  const fabH = $('#fab').getBoundingClientRect().height || 170;
  if (!wide) root.setProperty('--sheet-max', Math.max(220, innerHeight - tb - 24 - fabH - 14) + 'px');
  const h = $('#sheet').hidden ? 0 : $('#sheet').classList.contains('min') ? 64 : sheetH();
  root.setProperty('--sheet-h', (wide ? 0 : h) + 'px');
}
function render() {
  const pane = $('#pane');
  pane.innerHTML = curTab === 'trip' ? tripHtml() : curTab === 'places' ? placesHtml() : curTab === 'stats' ? statsHtml() : curTab === 'alarm' ? alarmHtml() : settingsHtml();
  bindPane(); requestAnimationFrame(syncSheet); if (typeof renderRecents === 'function') renderRecents();
}
function tripHtml() {
  if (!S.routes.length) return `<p class="empty"><strong>Saisissez une destination</strong> (ou appui long sur la carte). Indiquez l’heure à laquelle vous devez arriver : Ponctuel vous dira quand partir et par où passer pour éviter les bouchons.</p>` +
    (!S.set.key ? `<div class="note"><b>Trafic en direct désactivé.</b> Ajoutez une clé TomTom gratuite dans <a href="#" data-go="settings">Réglages</a> pour éviter les embouteillages en temps réel. Sans clé, Ponctuel utilise vos trajets passés.</div>` : '');
  const r = S.routes[S.sel], pi = planInfo(r);
  let plan = '';
  if (pi) {
    const m = Math.round(pi.slack / 60);
    if (m > 0) plan = `<div class="plan ${m > 15 ? 'ok' : ''}"><div class="big">${m > 99 ? fmtTime(pi.leave) : m + '<small>min</small>'}</div><div class="l1">${m > 99 ? 'Heure de départ' : 'avant de partir'} · à ${fmtTime(pi.leave)}</div><div class="l2">Pour être à ${fmtTime(pi.t)} avec ${S.set.buffer} min de marge. Trafic recalculé toutes les 2 min.</div></div>`;
    else { const late = Math.round((pi.eta.getTime() - pi.t.getTime()) / 60000); plan = late > 0
      ? `<div class="plan late"><div class="big">+${late}<small>min</small></div><div class="l1">Retard prévu si vous partez maintenant</div><div class="l2">Arrivée ${fmtTime(pi.eta)} au lieu de ${fmtTime(pi.t)}. Prenez le plus rapide ci-dessous et prévenez dès maintenant.</div></div>`
      : `<div class="plan"><div class="big">Go</div><div class="l1">Partez maintenant</div><div class="l2">Arrivée ${fmtTime(pi.eta)}, ${-late} min avant ${fmtTime(pi.t)} (marge entamée).</div></div>`; }
  }
  const cards = S.routes.map((x, i) => {
    const big = x.jams.filter(j => j.mag >= 3).length, med = x.jams.filter(j => j.mag === 2).length;
    const segs = x.jams.map(j => `<span style="left:${(j.startOff / x.dist * 100).toFixed(1)}%;width:${Math.max(1.5, j.len / x.dist * 100).toFixed(1)}%;background:var(${j.mag >= 3 ? '--jam' : '--slow'})"></span>`).join('');
    return `<button class="route ${i === S.sel ? 'sel' : ''}" data-r="${i}"><span class="stripe"></span>
      <div><div class="t">${fmtDurHtml(x.dur)}</div></div><div class="eta">${fmtTime(new Date(Date.now() + x.dur * 1000))}</div>
      <div class="meta">${x.best ? '<span class="badge best">Le plus rapide</span>' : ''}${big ? `<span class="badge jam">${big} bouchon${big > 1 ? 's' : ''}</span>` : ''}${med ? `<span class="badge slow">${med} lent${med > 1 ? 's' : ''}</span>` : ''}
        ${fmtKm(x.dist)} · ${x.delay > 60 ? '+' + fmtDur(x.delay) + ' de trafic' : 'trafic fluide'}${x.live ? '' : ' · estimation sans trafic en direct'}</div>
      <div class="bar">${segs}</div></button>`;
  }).join('');
  const jl = satList();
  const jams = jl.length ? `<h3>Points noirs · vue satellite</h3>` + jl.map((j, i) => `<button class="jam-item" data-j="${i}"><i class="${j.mag >= 3 ? '' : 'mod'}"></i><div><b>${j.dest ? 'Autour de la destination' : j.mag >= 3 ? 'Bouchon' : 'Ralentissement'}${j.src === 'perso' ? ' (habituel)' : ''}</b><small>${[j.speed != null ? Math.round(j.speed) + ' km/h' : '', j.delay ? '+' + fmtDur(j.delay) : '', j.startOff != null && !j.dest ? 'à ' + fmtKm(j.startOff) : ''].filter(Boolean).join(' · ')}</small></div><span>Voir ${ic('chevR')}</span></button>`).join('') : '';
  return plan + cards + `<div class="btns"><button class="btn primary wide" id="startNav">${ic('go')}Démarrer le guidage</button></div><div class="btns"><button class="btn wide" id="alFromTrip">${ic('bell')}Programmer un réveil pour ce trajet</button></div>` +
    `<p class="empty" style="font-size:12px;text-align:center">Estimation Ponctuel : ${esc(r.etaWhy || 'trafic')}${r.rawDur && Math.abs(r.rawDur - r.dur) > 90 ? ` (trafic TomTom seul : ${fmtDur(r.rawDur)})` : ''} · actualisé à ${fmtTime(S.updatedAt || new Date())}</p>` + jams +
    (S.B ? `<div class="btns"><button class="btn" id="saveB">${ic('star')}Mémoriser « ${esc(S.B.name).slice(0, 28)} »</button></div>` : '');
}
function placesHtml() {
  if (!S.places.length) return `<p class="empty"><strong>Aucun lieu mémorisé pour l’instant.</strong> Avec le suivi activé, chaque endroit où vous restez plus de 5 minutes est enregistré avec vos horaires. Vous pouvez aussi mémoriser une destination depuis l’onglet Trajet.</p>`;
  const tagL = { home: 'Maison', work: 'Travail' };
  return S.places.slice().sort((a, b) => b.visits - a.visits).map(p => {
    const top = p.hours.indexOf(Math.max(...p.hours));
    return `<div class="place"><span class="pic">${p.tag === 'home' ? ic('home') : p.tag === 'work' ? ic('work') : p.visits}</span><div><b>${esc(p.name)}</b><small>${tagL[p.tag] ? tagL[p.tag] + ' · ' : ''}${p.visits} visite${p.visits > 1 ? 's' : ''}${p.visits ? ' · surtout vers ' + top + ' h' : ''}${p.mins ? ' · ' + fmtDur(p.mins * 60) + ' au total' : ''}</small></div>
      <div class="act"><button data-pgo="${p.id}">${ic('go')}Y aller</button><button data-pedit="${p.id}" aria-label="Modifier">${ic('edit')}</button></div></div>
      <div id="e_${p.id}" hidden><label class="set"><span>Nom</span><input type="text" value="${esc(p.name)}" data-pname="${p.id}"></label>
      <div class="btns"><button class="btn" data-ptag="${p.id}|home">Maison</button><button class="btn" data-ptag="${p.id}|work">Travail</button><button class="btn" data-ptag="${p.id}|">Aucun</button><button class="btn danger" data-pdel="${p.id}">Supprimer</button></div></div>`;
  }).join('');
}
function statsHtml() {
  const withPlan = S.trips.filter(t => t.lateMin != null), onTime = withPlan.filter(t => t.lateMin <= 0).length;
  const pct = withPlan.length ? Math.round(onTime / withPlan.length * 100) : null, lates = withPlan.filter(t => t.lateMin > 0);
  const avgLate = lates.length ? Math.round(lates.reduce((s, t) => s + t.lateMin, 0) / lates.length) : 0;
  const hours = Array(24).fill(0); Object.entries(S.cells).forEach(([k, v]) => { const h = +k.split('_')[2] % 24; if (v[1] / v[0] < 15) hours[h] += v[0]; });
  const mx = Math.max(1, ...hours);
  let tip = 'Fixez une heure d’arrivée avant chaque trajet : c’est ce qui permet de mesurer et réduire vos retards.';
  if (lates.length >= 3) tip = `Vos retards durent ${avgLate} min en moyenne. Passez la marge de sécurité à ${Math.min(45, S.set.buffer + avgLate)} min dans Réglages : vous arriverez à l’heure la plupart du temps.`;
  return `<div class="stats"><div class="stat"><b>${pct == null ? '—' : pct + '%'}</b><small>trajets à l’heure</small></div><div class="stat"><b>${avgLate ? '+' + avgLate : '0'}<small style="font-size:13px"> min</small></b><small>retard moyen</small></div><div class="stat"><b>${S.trips.length}</b><small>trajets suivis</small></div></div>
  <div class="note"><b>Conseil.</b> ${tip}</div>
  <h3>Quand vous roulez au pas (vos données)</h3>
  <div class="hours">${hours.map(h => `<i style="height:${Math.round(h / mx * 100)}%"></i>`).join('')}</div><div class="hours-l"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
  <h3>Derniers trajets</h3>` + (S.trips.length ? S.trips.slice(0, 12).map(t => `<div class="place"><span class="pic" style="color:var(${t.lateMin > 0 ? '--jam' : '--go'})">${t.lateMin == null ? '·' : t.lateMin > 0 ? '+' + t.lateMin : '✓'}</span><div><b>${esc(t.toName || 'Trajet')}</b><small>${new Date(t.start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(new Date(t.start))} → ${fmtTime(new Date(t.end))} · ${fmtKm(t.dist)}</small></div></div>`).join('') : '<p class="empty">Aucun trajet guidé pour l’instant.</p>');
}
function settingsHtml() {
  const s = S.set;
  return `<h3 style="margin-top:4px">Mon véhicule sur la carte</h3>
  <div class="vgrid">${Object.entries(VEHICLES).map(([k, n]) => `<button class="vopt ${s.vehicle === k ? 'on' : ''}" data-veh="${k}">${REAL_CARS[k] ? `<span class="c3slot" data-t="${k}"></span>` : vehicleSVG(k, s.vcolor)}${n}</button>`).join('')}</div>
  <div class="swatches">${COLORS.map(c => `<button class="sw ${s.vcolor === c ? 'on' : ''}" data-col="${c}" style="background:${c}" aria-label="Couleur ${c}"></button>`).join('')}</div>
  <h3>Moteur de carte</h3>
  <div class="seg">${[['tomtom', 'TomTom 3D'], ['ofm', 'OpenStreetMap']].map(([k, n]) => `<button data-eng="${k}" class="${(s.engine || 'tomtom') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
  <p class="empty" style="font-size:12px">${s.key ? (orbisOk === false ? 'Carte TomTom indisponible pour cette clé : OpenStreetMap utilisé.' : 'TomTom 3D : bâtiments en relief, icônes de lieux, style conduite pendant le guidage.') : 'TomTom 3D nécessite la clé TomTom (plus bas).'}</p>
  <h3>Style de carte</h3>
  <div class="seg">${[['auto', 'Auto jour/nuit'], ['day', 'Jour'], ['night', 'Nuit']].map(([k, n]) => `<button data-ms="${k}" class="${s.mapStyle === k ? 'on' : ''}">${n}</button>`).join('')}</div>
  <label class="set"><span>Clé TomTom (trafic en direct)</span><input type="password" id="sKey" value="${esc(s.key)}" placeholder="Collez votre clé ici" autocomplete="off">
    <small>Gratuite, sans carte bancaire : <a href="https://developer.tomtom.com/user/register" target="_blank" rel="noopener" style="color:var(--signal)">developer.tomtom.com</a> → Keys → copier la clé. Elle reste sur votre téléphone.</small></label>
  <div class="btns"><button class="btn primary" id="sSaveKey">Enregistrer et tester</button></div>
  <label class="set"><span>Clé API Claude (optionnelle, IA avancée)</span><input type="password" id="sAIKey" value="${esc(s.aiKey || '')}" placeholder="sk-ant-…" autocomplete="off">
    <small>Sans clé, Ponctuel IA comprend déjà les demandes courantes. Avec une clé Claude (console.anthropic.com → API Keys), elle comprend tout et agit dans l’appli. Facturé sur votre compte Anthropic ; la clé reste sur ce téléphone.</small></label>
  <div class="btns"><button class="btn" id="sSaveAI">${ic('sparkle')}Enregistrer la clé Claude</button></div>
  <label class="set"><span>Marge de sécurité : <b class="num" id="sBufV">${s.buffer}</b> min</span><input type="range" id="sBuf" min="0" max="45" step="5" value="${s.buffer}" style="width:100%;accent-color:var(--signal)"></label>
  ${[['track', 'Suivi et mémorisation des lieux', 'Apprend vos lieux fréquents et les rues où vous roulez au pas.'], ['autoSat', 'Vue satellite automatique', 'S’ouvre dès qu’un bouchon est trouvé sur le trajet ou à destination.'], ['voice', 'Guidage vocal', ''], ['reroute', 'Recalcul automatique', 'Hors itinéraire ou si une route plus rapide apparaît (≥ 3 min gagnées).'], ['tolls', 'Éviter les péages', 'Ex. autoroute du Nord, pont HKB (avec clé TomTom).'], ['highways', 'Éviter les autoroutes', '']]
      .map(([k, t, d]) => `<label class="toggle"><span><b>${t}</b>${d ? `<br><small style="color:var(--muted)">${d}</small>` : ''}</span><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}></label>`).join('')}
  <h3>Vos données</h3>
  <div class="btns"><button class="btn" id="sExport">Exporter (sauvegarde)</button><label class="btn" style="cursor:pointer">Importer<input type="file" id="sImport" accept="application/json" hidden></label><button class="btn danger" id="sWipe">Tout effacer</button></div>
  <div id="wipeConfirm" hidden class="note"><b>Effacer lieux, trajets et vitesses apprises ?</b> <button class="btn danger" id="sWipeYes">Oui, effacer</button></div>
  <p class="empty" style="font-size:12px">Version 22 · bouchons annoncés à l’avance</p>
  <h3>Ce que fait vraiment chaque source</h3>
  <div class="note"><b>Trafic</b> : TomTom mesure la vitesse réelle des véhicules, mise à jour chaque minute. <b>Satellite</b> : image haute résolution Esri/Maxar, prise il y a quelques mois ; aucun satellite public ne filme la route en direct, le trafic est donc dessiné par-dessus. <b>NASA</b> : GIBS fournit l’image MODIS de la veille (250 m/pixel), utile pour la météo. <b>Carte</b> : OpenFreeMap / OpenStreetMap. <b>Vos données</b> restent dans ce navigateur.</div>`;
}
function bindPane() {
  const pane = $('#pane');
  pane.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); showTab(a.dataset.go); });
  pane.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { S.sel = +b.dataset.r; drawRoutes(true); render(); });
  pane.querySelectorAll('[data-j]').forEach(b => b.onclick = () => openSat(+b.dataset.j));
  $('#startNav') && ($('#startNav').onclick = startNav);
  bindAlarmPane();
  $('#saveB') && ($('#saveB').onclick = () => {
    const b = S.B; if (S.places.some(p => hav([p.lat, p.lng], [b.lat, b.lng]) < 150)) { toast('Ce lieu est déjà mémorisé.'); return; }
    S.places.push({ id: 'p' + Date.now().toString(36), lat: b.lat, lng: b.lng, name: b.name, tag: '', visits: 0, hours: Array(24).fill(0), dows: Array(7).fill(0), mins: 0, last: 0 });
    savePlaces(); renderPlaces(); toast('Lieu mémorisé.');
  });
  pane.querySelectorAll('.c3slot').forEach(sl => sl.replaceWith(car3dCanvas(S.set.vcolor, 'width:48px;height:48px', sl.dataset.t)));
  pane.querySelectorAll('[data-veh]').forEach(b => b.onclick = () => { S.set.vehicle = b.dataset.veh; saveSet(); meMode = ''; meLook(); render(); toast(`Véhicule : ${VEHICLES[S.set.vehicle]}. Il apparaît pendant le guidage.`); });
  pane.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { S.set.vcolor = b.dataset.col; saveSet(); meMode = ''; meLook(); render(); });
  pane.querySelectorAll('[data-eng]').forEach(b => b.onclick = () => { S.set.engine = b.dataset.eng; saveSet(); orbisOk = null; render(); applyBase(); });
  pane.querySelectorAll('[data-ms]').forEach(b => b.onclick = () => { S.set.mapStyle = b.dataset.ms; saveSet(); render(); if (S.base === 'plan') applyBase(); });
  pane.querySelectorAll('[data-pgo]').forEach(b => b.onclick = () => { const p = S.places.find(x => x.id === b.dataset.pgo); setB({ lat: p.lat, lng: p.lng, name: p.name }); calc(); });
  pane.querySelectorAll('[data-pedit]').forEach(b => b.onclick = () => { const e = $('#e_' + b.dataset.pedit); e.hidden = !e.hidden; syncSheet(); });
  pane.querySelectorAll('[data-pname]').forEach(i => i.onchange = () => { const p = S.places.find(x => x.id === i.dataset.pname); p.name = i.value.trim() || p.name; savePlaces(); renderPlaces(); });
  pane.querySelectorAll('[data-ptag]').forEach(b => b.onclick = () => { const [id, tag] = b.dataset.ptag.split('|'); if (tag) S.places.forEach(p => { if (p.tag === tag) p.tag = ''; }); S.places.find(x => x.id === id).tag = tag; savePlaces(); renderPlaces(); render(); });
  pane.querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => { S.places = S.places.filter(x => x.id !== b.dataset.pdel); savePlaces(); renderPlaces(); render(); });
  pane.querySelectorAll('[data-set]').forEach(c => c.onchange = () => { S.set[c.dataset.set] = c.checked; saveSet(); });
  $('#sSaveAI') && ($('#sSaveAI').onclick = () => { S.set.aiKey = $('#sAIKey').value.trim(); saveSet(); aiClient = null; toast(S.set.aiKey ? 'Clé Claude enregistrée : Ponctuel IA passe en mode avancé.' : 'Clé Claude retirée : mode local.', 3500, 'sparkle'); });
  const buf = $('#sBuf'); if (buf) buf.oninput = () => { S.set.buffer = +buf.value; $('#sBufV').textContent = buf.value; saveSet(); };
  $('#sSaveKey') && ($('#sSaveKey').onclick = async () => {
    S.set.key = $('#sKey').value.trim(); saveSet();
    if (!S.set.key) { setTraffic(false); toast('Clé retirée.'); return; }
    const k = encodeURIComponent(S.set.key), q = `/5.3200,-4.0170:5.3480,-3.9900/json?key=${k}&traffic=true`;
    const tries = [['classique', `https://api.tomtom.com/routing/1/calculateRoute${q}`], ['orbis', `https://api.tomtom.com/maps/orbis/routing/calculateRoute${q}&apiVersion=2`]];
    let ok = null, lastErr = '';
    for (const [name, u] of tries) { try { const j = await getJSON(u); if (j.routes?.length) { ok = name; break; } } catch (e) { lastErr = String(e.message); } }
    if (ok) { S.set.orbis = ok === 'orbis'; saveSet(); toast(`Clé valide : trafic en direct et carte TomTom 3D activés.`, 5000); setTraffic(true); orbisOk = null; applyBase(); }
    else toast(/40[13]/.test(lastErr) ? 'Clé refusée par TomTom. Recopiez-la depuis MyTomTom → Keys, sans espace.' : 'Test impossible pour l’instant (réseau). La clé est enregistrée ; réessayez plus tard.', 7000);
  });
  $('#sExport') && ($('#sExport').onclick = () => {
    const blob = new Blob([JSON.stringify({ v: 1, places: S.places, trips: S.trips, cells: S.cells, settings: { ...S.set, key: '' } })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ponctuel-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('#sImport') && ($('#sImport').onchange = async e => {
    try { const d = JSON.parse(await e.target.files[0].text()); if (d.places) S.places = d.places; if (d.trips) S.trips = d.trips; if (d.cells) S.cells = d.cells;
      savePlaces(); store.set('trips', S.trips); store.set('cells', S.cells); renderPlaces(); toast('Données importées.'); }
    catch { toast('Fichier illisible : choisissez une sauvegarde Ponctuel (.json).'); }
  });
  $('#sWipe') && ($('#sWipe').onclick = () => { $('#wipeConfirm').hidden = false; syncSheet(); });
  $('#sWipeYes') && ($('#sWipeYes').onclick = () => { S.places = []; S.trips = []; S.cells = {}; savePlaces(); store.set('trips', []); store.set('cells', {}); renderPlaces(); toast('Données effacées.'); render(); });
}

/* ================= Zones lentes apprises ================= */
$('#bHeat').onclick = () => {
  S.heat = !S.heat; $('#bHeat').classList.toggle('on', S.heat);
  if (!S.heat) { setData('heat', EMPTY); return; }
  const now = new Date(), seen = new Set(), feats = [];
  Object.keys(S.cells).forEach(k => {
    const [a, b] = k.split('_'), id = a + '_' + b; if (seen.has(id)) return; seen.add(id);
    const p = [a / 300, b / 300], sp = learnedSpeed(p, now); if (sp == null || sp > 25) return;
    feats.push({ type: 'Feature', properties: { sp }, geometry: { type: 'Point', coordinates: ll(p) } });
  });
  setData('heat', { type: 'FeatureCollection', features: feats });
  toast(feats.length ? `${feats.length} zones où vous roulez souvent au pas à cette heure-ci.` : 'Pas encore assez de trajets à cette heure-ci. Roulez avec Ponctuel ouvert quelques jours.');
};

/* ================= Démarrage ================= */
renderPlaces(); render(); predict(); startGeo();
if (S.set.key) { S.traffic = true; $('#bTraffic').classList.add('on'); }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
document.addEventListener('visibilitychange', () => { if (document.hidden) store.set('cells', S.cells); else if (S.nav) navigator.wakeLock?.request('screen').then(w => wakeLock = w).catch(() => { }); });
addEventListener('pagehide', () => store.set('cells', S.cells));
addEventListener('resize', syncSheet);
setInterval(predict, 300000);
S.wasNight = nightNow();
setInterval(() => { if (S.base === 'plan' && S.set.mapStyle === 'auto' && !S.nav) { const n = nightNow(); if (n !== S.wasNight) { S.wasNight = n; applyBase(); } } }, 600000);
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { voiceFr = null; };


/* ================= Passe premium : effets, signalements, partage, arrivée ================= */
// Onde au toucher + petite vibration (Android)
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('button,.btn,.chip,.ctl'); if (!b || reduceMotion) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, sp = document.createElement('span');
  sp.className = 'rip'; sp.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(sp); setTimeout(() => sp.remove(), 600); navigator.vibrate?.(6);
}, { passive: true });

// Panneau du bas : glisser vers le bas pour réduire, vers le haut pour agrandir
(() => {
  const g = $('#grab'); let y0 = null;
  g.addEventListener('pointerdown', e => { y0 = e.clientY; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointerup', e => {
    if (y0 == null) return; const dy = e.clientY - y0; y0 = null;
    if (Math.abs(dy) < 8) return; // simple tap : géré par onclick
    $('#sheet').classList.toggle('min', dy > 0); setTimeout(syncSheet, 320); g.dataset.skip = '1';
  });
  const oc = g.onclick; g.onclick = e => { if (g.dataset.skip) { delete g.dataset.skip; return; } oc?.(e); };
})();

// Partager mon heure d'arrivée
$('#nShare').onclick = async () => {
  const n = S.nav; if (!n) return;
  const leftT = n.r.dur * ((n.r.dist - n.done) / n.r.dist), eta = fmtTime(new Date(Date.now() + leftT * 1000));
  const text = `Je suis en route vers ${S.B?.name || 'ma destination'}. Arrivée prévue à ${eta} (encore ${fmtDur(leftT)}). — Ponctuel`;
  try { if (navigator.share) { await navigator.share({ title: 'Mon heure d’arrivée', text }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Message copié : collez-le dans WhatsApp ou SMS.', 3500, 'share'); } catch { toast(text, 7000); }
};

// Signalements (gardés sur le téléphone, rappelés quand on repasse à proximité)
const REPORTS = {
  jam: { n: 'Bouchon', c: '#ff4b4b', ttl: 2 }, crash: { n: 'Accident', c: '#ff6a2e', ttl: 3 }, police: { n: 'Police', c: '#3d7bff', ttl: 2 },
  alert: { n: 'Danger', c: '#f0a000', ttl: 24 * 7 }, closed: { n: 'Route fermée', c: '#8b5cf6', ttl: 24 }, flood: { n: 'Inondation', c: '#0ea5e9', ttl: 12 }
};
let reports = store.get('reports', []).filter(r => Date.now() - r.t < REPORTS[r.k]?.ttl * 3600e3);
let reportMarkers = [];
function renderReports() {
  reportMarkers.forEach(m => m.remove()); reportMarkers = [];
  reports.forEach(r => {
    const T = REPORTS[r.k]; if (!T) return;
    const el = document.createElement('div'); el.className = 'rpin'; el.style.background = T.c; el.innerHTML = ic(r.k);
    el.title = `${T.n} · signalé à ${fmtTime(new Date(r.t))}`;
    el.onclick = ev => { ev.stopPropagation(); toast(`${T.n} signalé à ${fmtTime(new Date(r.t))}`, 3000, r.k); };
    reportMarkers.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.lng, r.lat]).addTo(map));
  });
}
$('#rGrid').innerHTML = Object.entries(REPORTS).map(([k, T]) => `<button class="ropt" data-rk="${k}" style="background:linear-gradient(150deg,${T.c},${shade(T.c, .7)})">${ic(k)}${T.n}</button>`).join('');
$('#bReport').onclick = () => { $('#reportSheet').hidden = false; };
$('#rClose').onclick = () => { $('#reportSheet').hidden = true; };
$('#rGrid').querySelectorAll('[data-rk]').forEach(b => b.onclick = () => {
  const p = anim.cur || S.pos; if (!p) { toast('Position GPS indisponible.'); return; }
  const k = b.dataset.rk; reports.push({ k, lat: p[0], lng: p[1], t: Date.now() }); store.set('reports', reports);
  renderReports(); $('#reportSheet').hidden = true; toast(`${REPORTS[k].n} signalé. Merci !`, 2500, 'check'); navigator.vibrate?.([20, 40, 20]);
});
const warnedReports = new Set();
setInterval(() => { // alerte vocale à l'approche d'un signalement (≤ 400 m, devant soi)
  if (!S.nav || !S.pos) return;
  for (const r of reports) {
    const d = hav(S.pos, [r.lat, r.lng]), id = r.t + r.k;
    if (d < 400 && d > 30 && !warnedReports.has(id)) {
      const ahead = S.heading == null || Math.abs(angDiff(S.heading, bearingOf(S.pos, [r.lat, r.lng]))) < 60;
      if (ahead) { warnedReports.add(id); speak(`Attention, ${REPORTS[r.k].n.toLowerCase()} signalé à ${Math.round(d / 50) * 50} mètres.`); toast(`${REPORTS[r.k].n} à ${fmtKm(d)}`, 4000, r.k); }
    }
  }
}, 3000);
renderReports();

// Écran d'arrivée + confettis si à l'heure
function showArrival(t) {
  if (!t) return;
  const ok = t.lateMin == null || t.lateMin <= 0, mins = Math.max(1, Math.round((t.end - t.start) / 60000));
  const box = $('#arrival');
  box.innerHTML = `<div class="badge-big ${ok ? '' : 'late'}">${ic(ok ? 'check' : 'clock')}</div>
    <h2>${ok ? 'Bien arrivé !' : 'Arrivé'}</h2>
    <p>${esc(t.toName || 'Destination')} · ${fmtTime(new Date(t.end))}</p>
    <div class="stats"><div class="stat"><b>${t.lateMin == null ? '—' : t.lateMin <= 0 ? '−' + (-t.lateMin) : '+' + t.lateMin}</b><small>${t.lateMin == null ? 'pas d’heure fixée' : t.lateMin <= 0 ? 'min d’avance' : 'min de retard'}</small></div>
      <div class="stat"><b>${mins}</b><small>min de trajet</small></div><div class="stat"><b>${(t.dist / 1000).toFixed(1).replace('.', ',')}</b><small>km</small></div></div>
    <button class="btn primary wide" id="arrOk">${ic('check')}Terminer</button>`;
  box.hidden = false; $('#arrOk').onclick = () => { box.hidden = true; };
  if (ok && !reduceMotion) confetti();
}
function confetti() {
  const cv = $('#confetti'), ctx = cv.getContext('2d'); cv.hidden = false;
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio);
  const cols = ['#ffb21e', '#3d9bff', '#40e0ff', '#2fd27a', '#ff4b4b', '#ffffff'];
  const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2, y: innerHeight * .45, vx: (Math.random() - .5) * 12, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 3, c: cols[Math.random() * cols.length | 0], a: Math.random() * 6, va: (Math.random() - .5) * .3 }));
  const t0 = performance.now();
  const step = now => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ps.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
    if (now - t0 < 2600) requestAnimationFrame(step); else { ctx.clearRect(0, 0, innerWidth, innerHeight); cv.hidden = true; ctx.setTransform(1, 0, 0, 1, 0, 0); }
  };
  requestAnimationFrame(step);
}
renderRecents(); syncTheme();
$('#sheet').addEventListener('transitionend', syncSheet); // recale les boutons une fois le panneau stabilisé


/* ================= Réveil de départ intelligent =================
   Pour chaque réveil : heure d'arrivée voulue → heure de départ recalculée
   (trafic prévu TomTom à l'avance, trafic en direct dans la dernière heure, sinon historique perso),
   alarme sonore + vocale au moment de partir, pré-alerte optionnelle, rappel calendrier de secours. */
const DAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'], DAYS_FULL = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
let alarms = store.get('alarms', []);
const saveAlarms = () => store.set('alarms', alarms);
let draft = null; // formulaire en cours
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function nextTarget(a) {
  const [h, m] = a.time.split(':').map(Number), now = Date.now();
  if (!a.days?.length) { const [Y, M, D] = a.date.split('-').map(Number); const d = new Date(Y, M - 1, D, h, m); return d.getTime() > now - 20 * 60000 ? d : null; }
  for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(h, m, 0, 0); if (a.days.includes(d.getDay()) && d.getTime() > now - 20 * 60000) return d; }
  return null;
}
function dayLabel(d) {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t0) / 864e5);
  return diff === 0 ? 'aujourd’hui' : diff === 1 ? 'demain' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
}
function alarmOrigin(a) {
  const home = S.places.find(p => p.tag === 'home');
  if (a.from === 'home' && home) return { lat: home.lat, lng: home.lng };
  if (S.pos) return { lat: S.pos[0], lng: S.pos[1] };
  return home ? { lat: home.lat, lng: home.lng } : null;
}
// Durée de trajet : TomTom (prévu à l'heure d'arrivée ou en direct), sinon OSRM + historique perso
async function routeTime(o, d, arriveAt) {
  if (S.set.key) {
    const k = encodeURIComponent(S.set.key), avoid = [S.set.tolls && 'tollRoads', S.set.highways && 'motorways'].filter(Boolean).map(x => '&avoid=' + x).join('');
    const q = `/${o.lat},${o.lng}:${d.lat},${d.lng}/json?key=${k}&traffic=true&routeType=fastest&travelMode=car${avoid}` + (arriveAt ? `&arriveAt=${encodeURIComponent(arriveAt.toISOString().slice(0, 19) + 'Z')}` : '&departAt=now');
    for (const base of S.set.orbis ? ['maps/orbis/routing/calculateRoute', 'routing/1/calculateRoute'] : ['routing/1/calculateRoute', 'maps/orbis/routing/calculateRoute']) {
      try { const j = await getJSON(`https://api.tomtom.com/${base}${q}${base.includes('orbis') ? '&apiVersion=2' : ''}`, 15000); const sm = j.routes?.[0]?.summary;
        if (sm) { const rr = { dur: sm.travelTimeInSeconds, free: sm.noTrafficTravelTimeInSeconds || sm.travelTimeInSeconds, hist: sm.historicTrafficTravelTimeInSeconds || 0, live: true, delay: sm.trafficDelayInSeconds || 0 }; smartEta(rr, arriveAt ? new Date(arriveAt - rr.dur * 1000 * 1.6) : new Date()); return { dur: rr.dur, delay: rr.delay, dist: sm.lengthInMeters, src: arriveAt ? 'prévu' : 'direct', model: rr.etaWhy }; } } catch (e) { console.warn('réveil', e.message); }
    }
  }
  const r = (await osrmRoutes(o, d))[0]; applyPersonal(r); smartEta(r, arriveAt ? new Date(arriveAt - r.free * 1000 * 1.8) : new Date());
  return { dur: r.dur, delay: r.delay, dist: r.dist, src: 'estimé' };
}
async function recalcAlarm(a, t) {
  const o = a.occ, org = alarmOrigin(a);
  if (!org) { o.err = 'Position de départ inconnue : activez la localisation ou définissez « Maison » dans Lieux.'; return; }
  const live = t - Date.now() < 75 * 60000;
  try {
    const r = await routeTime(org, a.dest, live ? null : t);
    Object.assign(o, r, { err: null, calcAt: Date.now(), leave: t.getTime() - (r.dur + S.set.buffer * 60) * 1000 });
  } catch (e) { o.err = 'Calcul impossible pour l’instant (réseau). Nouvel essai bientôt.'; o.calcAt = Date.now() - 4 * 60000; }
}
let alarmBusy = false;
async function alarmTick() {
  if (alarmBusy) return; alarmBusy = true;
  try {
    for (const a of alarms) {
      if (!a.on) continue;
      const t = nextTarget(a); if (!t) { if (!a.days?.length && a.occ?.main) a.on = false; continue; }
      const key = t.toISOString(); if (a.occ?.key !== key) a.occ = { key };
      const o = a.occ, until = (t - Date.now()) / 60000;
      const every = until < 90 ? 3 : until < 240 ? 10 : 60;
      if (!o.calcAt || Date.now() - o.calcAt > every * 60000) await recalcAlarm(a, t);
      if (!o.leave) continue;
      const now = Date.now();
      if (a.prep > 0 && !o.pre && now >= o.leave - a.prep * 60000 && now < o.leave) { o.pre = true; fireAlarm(a, 'pre'); }
      if (!o.main && (now >= o.leave || (o.snooze && now >= o.snooze))) { if (o.snooze && now >= o.snooze) o.snooze = null; o.main = true; fireAlarm(a, 'main'); }
      if (o.snooze && now >= o.snooze) { o.snooze = null; fireAlarm(a, 'main'); }
    }
    saveAlarms(); refreshAlarmPill(); if (curTab === 'alarm' && !$('#sheet').hidden && !document.activeElement?.closest?.('.form')) render();
  } finally { alarmBusy = false; }
}
setInterval(alarmTick, 20000); setTimeout(alarmTick, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) alarmTick(); });

// Son d'alarme : WAV généré (joue même téléphone en silencieux sur iPhone, contrairement au Web Audio)
function alarmWav() {
  const sr = 22050, secs = 2.4, n = sr * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  const notes = [[0, 880], [.18, 1175], [.36, 1480], [.9, 880], [1.08, 1175], [1.26, 1480]];
  for (let i = 0; i < n; i++) {
    const t = i / sr; let x = 0;
    for (const [st, f] of notes) { const dt = t - st; if (dt >= 0 && dt < .16) x += Math.sin(2 * Math.PI * f * t) * Math.min(1, dt * 60) * Math.min(1, (.16 - dt) * 40) * .45 + Math.sin(4 * Math.PI * f * t) * .12 * Math.min(1, (.16 - dt) * 40); }
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
let alarmAudio = null, audioArmed = false;
function armAudio() { // doit être appelé depuis un toucher : l'audio tourne en sourdine jusqu'à l'alarme
  if (audioArmed) return;
  try { alarmAudio = alarmAudio || new Audio(alarmWav()); alarmAudio.loop = true; alarmAudio.muted = true;
    alarmAudio.play().then(() => { audioArmed = true; refreshAlarmPill(); }).catch(() => { }); } catch { }
}
document.addEventListener('pointerdown', () => { if (alarms.some(a => a.on)) armAudio(); }, { passive: true });
let vibT = null;
function fireAlarm(a, kind) {
  const o = a.occ, t = new Date(a.occ.key), late = Math.round((Date.now() - o.leave) / 60000);
  const box = $('#alarm'); box.classList.toggle('pre', kind === 'pre'); box.hidden = false; box.dataset.id = a.id;
  $('#alKind').textContent = kind === 'pre' ? `PRÉPAREZ-VOUS · DÉPART DANS ${Math.max(1, Math.round((o.leave - Date.now()) / 60000))} MIN` : late > 2 ? `PARTEZ MAINTENANT · DÉJÀ ${late} MIN DE RETARD` : 'C’EST L’HEURE DE PARTIR';
  $('#alClock').textContent = fmtTime(new Date());
  $('#alMsg').textContent = `Pour arriver à ${a.time.replace(':', ' h ')} à ${a.dest.name}.`;
  $('#alStats').innerHTML = `<div><b>${fmtDur(o.dur)}</b><small>de trajet</small></div><div><b>${o.delay > 60 ? '+' + fmtDur(o.delay) : 'fluide'}</b><small>trafic ${o.src}</small></div><div><b>${fmtTime(new Date(Date.now() + o.dur * 1000))}</b><small>arrivée</small></div>`;
  if (alarmAudio) { alarmAudio.muted = false; alarmAudio.currentTime = 0; alarmAudio.play().catch(() => { }); }
  clearInterval(vibT); navigator.vibrate?.([600, 300, 600]); vibT = setInterval(() => navigator.vibrate?.([600, 300, 600]), 2000);
  const say = kind === 'pre' ? `Préparez-vous. Départ dans ${Math.max(1, Math.round((o.leave - Date.now()) / 60000))} minutes pour ${a.dest.name}.`
    : `Il est temps de partir pour ${a.dest.name}. Trajet de ${Math.round(o.dur / 60)} minutes${o.delay > 120 ? `, dont ${Math.round(o.delay / 60)} minutes de bouchons` : ''}.`;
  setTimeout(() => { const v = S.set.voice; S.set.voice = true; speak(say); S.set.voice = v; }, 2500);
  try { if ('Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification(kind === 'pre' ? 'Préparez-vous' : 'Partez maintenant', { body: say, icon: 'media/icon-192.png', tag: 'ponctuel-alarm', requireInteraction: true })); } catch { }
  try { navigator.wakeLock?.request('screen')?.catch(() => { }); } catch { }
  injectIcons(box);
}
function stopAlarmSound() { if (alarmAudio) { alarmAudio.muted = true; } clearInterval(vibT); navigator.vibrate?.(0); speechSynthesis?.cancel?.(); $('#alarm').hidden = true; }
$('#alStop').onclick = () => stopAlarmSound();
$('#alSnooze').onclick = () => { const a = alarms.find(x => x.id === $('#alarm').dataset.id); if (a?.occ) { a.occ.snooze = Date.now() + 5 * 60000; saveAlarms(); } stopAlarmSound(); toast('Je vous rappelle dans 5 minutes.', 2500, 'clock'); };
$('#alGo').onclick = async () => {
  const a = alarms.find(x => x.id === $('#alarm').dataset.id); stopAlarmSound(); if (!a) return;
  arriveIn.value = a.time; store.set('arrive', a.time); setB({ ...a.dest }); S.A = null; $('#inA').value = '';
  const rs = await calc(); if (rs?.length) startNav();
};

// Pastille dans la barre du haut : prochain départ
function refreshAlarmPill() {
  const pill = $('#alarmPill'); const next = alarms.filter(a => a.on && a.occ?.leave && nextTarget(a)).sort((x, y) => x.occ.leave - y.occ.leave)[0]
    || alarms.find(a => a.on && nextTarget(a));
  if (!next) { pill.hidden = true; return; }
  pill.hidden = false; pill.classList.toggle('unarmed', !audioArmed);
  pill.innerHTML = ic('bell') + `<span>${audioArmed ? (next.occ?.leave ? 'Départ ' + fmtTime(new Date(next.occ.leave)) : 'Réveil ' + next.time) : 'Touchez pour armer le réveil'}</span>`;
}
$('#alarmPill').onclick = () => { armAudio(); showTab('alarm'); };

// Calendrier de secours (.ics) : sonne même appli fermée
function icsFor(a) {
  const t = nextTarget(a) || new Date(); const leave = new Date(a.occ?.leave || t.getTime() - 45 * 60000);
  const f = d => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const by = a.days?.length ? `RRULE:FREQ=WEEKLY;BYDAY=${a.days.map(d => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]).join(',')}\r\n` : '';
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ponctuel//FR', 'BEGIN:VEVENT', `UID:${a.id}@ponctuel`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(leave)}`, `DTEND:${f(t)}`,
    `SUMMARY:Partir pour ${a.dest.name} (arrivée ${a.time})`, `LOCATION:${a.dest.name}`, `DESCRIPTION:Heure estimée par Ponctuel le ${new Date().toLocaleString('fr-FR')}. Ouvrez Ponctuel pour l’heure recalculée avec le trafic en direct.`,
    by.trim(), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Partez maintenant', 'TRIGGER:PT0M', 'END:VALARM',
    ...(a.prep > 0 ? ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Préparez-vous', `TRIGGER:-PT${a.prep}M`, 'END:VALARM'] : []), 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}
function openIcs(a) {
  const url = URL.createObjectURL(new Blob([icsFor(a)], { type: 'text/calendar' }));
  const l = document.createElement('a'); l.href = url; l.download = `ponctuel-${a.time.replace(':', 'h')}.ics`; document.body.appendChild(l); l.click(); l.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('Ouvrez le fichier pour l’ajouter à votre calendrier.', 4000, 'cal');
}

// Mode chevet : écran noir, grande horloge, écran maintenu allumé
let bsT = null, bsLock = null;
async function bedside(on) {
  $('#bedside').hidden = !on; clearInterval(bsT);
  if (on) {
    armAudio();
    const upd = () => { $('#bsClock').textContent = fmtTime(new Date()); const a = alarms.filter(x => x.on && x.occ?.leave).sort((x, y) => x.occ.leave - y.occ.leave)[0];
      $('#bsNext').textContent = a ? `Départ prévu ${fmtTime(new Date(a.occ.leave))} → ${a.dest.name} à ${a.time}` : 'Aucun réveil programmé'; };
    upd(); bsT = setInterval(upd, 15000);
    try { bsLock = await navigator.wakeLock?.request('screen'); } catch { }
  } else { try { bsLock?.release(); } catch { } bsLock = null; }
}
$('#bsExit').onclick = () => bedside(false);

// Onglet Réveil
function destChoices() {
  const out = [], seen = new Set(), add = (p, tag) => { if (!p) return; const k = Math.round(p.lat * 2000) + '_' + Math.round(p.lng * 2000); if (seen.has(k)) return; seen.add(k); out.push({ lat: p.lat, lng: p.lng, name: p.name, tag }); };
  add(S.B, 'Destination actuelle');
  S.places.filter(p => p.tag === 'work').forEach(p => add(p, 'Travail')); S.places.filter(p => p.tag === 'home').forEach(p => add(p, 'Maison'));
  S.places.forEach(p => add(p, 'Lieu')); recents.forEach(p => add(p, 'Récent'));
  return out;
}
function newDraft(dest) {
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  return { dest: dest || destChoices()[0] || null, time: arriveIn.value || '07:30', date: ymd(tm), days: [], prep: 15, from: S.places.some(p => p.tag === 'home') ? 'home' : 'gps' };
}
function alarmHtml() {
  const list = alarms.map(a => {
    const t = nextTarget(a), o = a.occ || {};
    const when = a.days?.length ? a.days.slice().sort().map(d => DAYS_FULL[d]).join(' ') : t ? dayLabel(t) : 'passé';
    const st = !a.on ? 'Désactivé' : !t ? 'Terminé' : o.err ? o.err : o.leave ? `Départ <b>${fmtTime(new Date(o.leave))}</b> · ${fmtDur(o.dur)} de route (${o.src}${o.delay > 60 ? `, +${fmtDur(o.delay)} de trafic` : ''}) · ${dayLabel(new Date(o.leave))}` : 'Calcul de l’heure de départ…';
    return `<div class="acard ${a.on && t ? '' : 'off'}"><div><div class="t num">${a.time}</div><div class="d">${esc(a.dest.name)}</div></div>
      <input type="checkbox" class="switch" data-aon="${a.id}" ${a.on ? 'checked' : ''} aria-label="Activer le réveil">
      <div class="s">${ic('cal', '')} ${when} · ${st}</div>
      <div class="row"><button class="btn" data-acal="${a.id}">${ic('cal')}Calendrier</button><button class="btn" data-arun="${a.id}">${ic('bell')}Tester</button><button class="btn danger" data-adel="${a.id}">${ic('trash')}</button></div></div>`;
  }).join('');
  const d = draft || newDraft(), dc = destChoices();
  const form = `<h3>${alarms.length ? 'Nouveau réveil' : 'Programmer un réveil de départ'}</h3><div class="form">
    <label>Où devez-vous être ?<select id="fDest">${dc.length ? dc.map((p, i) => `<option value="${i}" ${d.dest && hav([p.lat, p.lng], [d.dest.lat, d.dest.lng]) < 50 ? 'selected' : ''}>${esc(p.name)} · ${p.tag}</option>`).join('') : '<option value="">Cherchez d’abord une destination (champ B)</option>'}</select></label>
    <div class="two"><label>Arrivée à<input type="time" id="fTime" value="${d.time}"></label><label>Le<input type="date" id="fDate" value="${d.date}" ${d.days.length ? 'disabled' : ''}></label></div>
    <label>Répéter<div class="days">${[1, 2, 3, 4, 5, 6, 0].map(i => `<button type="button" data-fday="${i}" class="${d.days.includes(i) ? 'on' : ''}">${DAYS[i]}</button>`).join('')}</div></label>
    <div class="two"><label>Pré-alerte<select id="fPrep">${[0, 10, 15, 20, 30, 45].map(m => `<option value="${m}" ${d.prep === m ? 'selected' : ''}>${m ? m + ' min avant' : 'Aucune'}</option>`).join('')}</select></label>
      <label>Départ depuis<select id="fFrom"><option value="home" ${d.from === 'home' ? 'selected' : ''}>Maison</option><option value="gps" ${d.from === 'gps' ? 'selected' : ''}>Ma position</option></select></label></div>
    <button class="btn primary wide" id="fSave">${ic('bell')}Créer le réveil</button></div>`;
  const tips = `<div class="btns"><button class="btn wide" id="bsOn">${ic('moon')}Mode chevet (laisser ouvert la nuit)</button></div>
    <div class="note"><b>Comment ça marche.</b> Ponctuel calcule l’heure de départ avec le trafic prévu, puis la recalcule en direct dans la dernière heure, avec votre marge de ${S.set.buffer} min. Sur téléphone, une page web ne sonne que si elle est ouverte : utilisez le <b>mode chevet</b> sur le chargeur, et ajoutez la <b>sécurité calendrier</b> qui sonne même appli fermée.</div>`;
  return list + form + tips;
}
function bindAlarmPane() {
  const pane = $('#pane'); if (curTab === 'alarm' && !draft) draft = newDraft();
  pane.querySelectorAll('[data-aon]').forEach(c => c.onchange = () => { const a = alarms.find(x => x.id === c.dataset.aon); a.on = c.checked; a.occ = null; saveAlarms(); if (a.on) armAudio(); alarmTick(); render(); });
  pane.querySelectorAll('[data-adel]').forEach(b => b.onclick = () => { alarms = alarms.filter(x => x.id !== b.dataset.adel); saveAlarms(); refreshAlarmPill(); render(); });
  pane.querySelectorAll('[data-acal]').forEach(b => b.onclick = () => openIcs(alarms.find(x => x.id === b.dataset.acal)));
  pane.querySelectorAll('[data-arun]').forEach(b => b.onclick = () => { armAudio(); const a = alarms.find(x => x.id === b.dataset.arun), o = a.occ || {};
    setTimeout(() => fireAlarm({ ...a, occ: { key: new Date().toISOString(), dur: o.dur || 1800, delay: o.delay || 0, src: o.src || 'test', leave: Date.now() } }, 'main'), 300); });
  pane.querySelectorAll('[data-fday]').forEach(b => b.onclick = () => { const i = +b.dataset.fday; draft.days = draft.days.includes(i) ? draft.days.filter(x => x !== i) : [...draft.days, i]; keepDraft(); render(); });
  const keep = id => $(id) && ($(id).onchange = keepDraft); ['#fDest', '#fTime', '#fDate', '#fPrep', '#fFrom'].forEach(keep);
  $('#bsOn') && ($('#bsOn').onclick = () => bedside(true));
  $('#alFromTrip') && ($('#alFromTrip').onclick = () => { draft = newDraft(S.B); showTab('alarm'); });
  $('#fSave') && ($('#fSave').onclick = () => {
    keepDraft(); if (!draft.dest) { toast('Choisissez une destination : cherchez-la d’abord dans le champ B.', 4000, 'alert'); return; }
    const a = { id: 'a' + Date.now().toString(36), on: true, ...draft, dest: { ...draft.dest } };
    alarms.push(a); saveAlarms(); draft = null; armAudio();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    toast('Réveil créé : je calcule l’heure de départ…', 3000, 'bell'); alarmTick().then(() => render()); render();
  });
}
function keepDraft() {
  if (!draft) return; const dc = destChoices(), i = $('#fDest')?.value;
  if (i !== undefined && i !== '' && dc[+i]) draft.dest = dc[+i];
  draft.time = $('#fTime')?.value || draft.time; draft.date = $('#fDate')?.value || draft.date;
  draft.prep = +($('#fPrep')?.value ?? draft.prep); draft.from = $('#fFrom')?.value || draft.from;
}
injectIcons(); refreshAlarmPill();


/* ================= Ponctuel IA =================
   1) Copilote local (gratuit, hors ligne pour l'analyse) : comprend le français courant et agit.
   2) Mode avancé avec la clé Claude de l'utilisateur : Claude comprend tout et pilote l'appli via des outils. */
const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const aiLog = () => $('#aiLog');
function aiSay(html, cls = 'ai', speakText) {
  const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html; aiLog().appendChild(d); aiLog().scrollTop = 1e9;
  if (speakText && cls !== 'me') { const v = S.set.voice; S.set.voice = true; speak(speakText); S.set.voice = v; }
  return d;
}
function aiThinking(on) { $('.aiorb').classList.toggle('think', on); let t = $('#aiTyping'); if (on && !t) { t = aiSay('<span class="typing"><i></i><i></i><i></i></span>'); t.id = 'aiTyping'; } if (!on) t?.remove(); }
// ---- Compréhension du français (heures, jours, lieux) ----
function parseTime(t) { const m = t.match(/(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?/) || t.match(/\b(\d{1,2})\s*(?:du matin|du soir)\b/); if (!m) return null;
  let h = +m[1], mi = +(m[2] || 0); if (/\bdu soir|\bdans l'apres-midi/.test(t) && h < 12) h += 12; if (h > 23 || mi > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0'); }
const DOW = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };
function parseDay(t) {
  const d = new Date();
  if (/apres-demain/.test(t)) { d.setDate(d.getDate() + 2); return { date: ymd(d) }; }
  if (/demain/.test(t)) { d.setDate(d.getDate() + 1); return { date: ymd(d) }; }
  if (/tous les jours|chaque jour/.test(t)) return { days: [0, 1, 2, 3, 4, 5, 6] };
  if (/en semaine|du lundi au vendredi|jours ouvr/.test(t)) return { days: [1, 2, 3, 4, 5] };
  const every = t.match(/(?:tous les|chaque) (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?/); if (every) return { days: [DOW[every[1]]] };
  const one = t.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
  if (one) { const tgt = DOW[one[1]]; let k = (tgt - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + k); return { date: ymd(d) }; }
  return null;
}
function extractPlace(raw) {
  const t = raw.replace(/[?.!]+$/, '');
  const m = t.match(/(?:\b(?:a|à|au|aux|vers|chez|jusqu'(?:a|à)|direction|destination|pour aller (?:a|à|au))\s+(?:la |le |l'|les )?)([^,]+?)(?=\s+(?:pour|a|à|avant|d'ici|demain|apres-demain|après-demain|ce soir|ce matin|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|tous|chaque|en semaine|vers \d|\d{1,2}\s*h)\b|$)/i);
  let p = m ? m[1].trim() : null;
  if (p && /^\d{1,2}\s*h/.test(p)) p = null;
  return p;
}
async function resolvePlace(name) {
  const n = norm(name || '');
  if (!n) return null;
  if (/^(la )?maison|chez moi|domicile/.test(n)) { const p = S.places.find(x => x.tag === 'home'); if (p) return { lat: p.lat, lng: p.lng, name: p.name }; }
  if (/travail|bureau|boulot|taf/.test(n)) { const p = S.places.find(x => x.tag === 'work'); if (p) return { lat: p.lat, lng: p.lng, name: p.name }; }
  const all = [...S.places, ...recents].map(p => ({ lat: p.lat, lng: p.lng, name: p.name }));
  const hit = all.find(p => norm(p.name).includes(n) || n.includes(norm(p.name)));
  if (hit) return hit;
  try { const r = await geocode(name); if (r?.[0]) return { lat: r[0].lat, lng: r[0].lng, name: r[0].name }; } catch { }
  return null;
}
// ---- Actions de l'appli exposées à l'IA ----
const AI = {
  async navigate({ destination, arrive_by, start_guidance }) {
    const p = await resolvePlace(destination); if (!p) return { ok: false, error: `Lieu introuvable : ${destination}` };
    if (arrive_by) { arriveIn.value = arrive_by; store.set('arrive', arrive_by); }
    S.A = null; $('#inA').value = ''; setB(p);
    const rs = await calc(); if (!rs?.length) return { ok: false, error: 'Itinéraire impossible à calculer (réseau ou GPS).' };
    const r = rs[0], pi = planInfo(r);
    if (start_guidance) { $('#aiPanel').hidden = true; startNav(); }
    return { ok: true, destination: p.name, minutes: Math.round(r.dur / 60), km: +(r.dist / 1000).toFixed(1), traffic_delay_min: Math.round(r.delay / 60), jams: r.jams.filter(j => j.mag >= 3).length,
      leave_at: pi ? fmtTime(pi.leave) : null, late_minutes_if_leave_now: pi && pi.slack < 0 ? Math.round((pi.eta - pi.t) / 60000) : null, live_traffic: r.live, guidance_started: !!start_guidance };
  },
  async set_alarm({ destination, arrive_time, date, days, prep_minutes }) {
    const p = await resolvePlace(destination); if (!p) return { ok: false, error: `Lieu introuvable : ${destination}` };
    if (!/^\d{2}:\d{2}$/.test(arrive_time || '')) return { ok: false, error: 'Heure invalide (format HH:MM attendu).' };
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    const a = { id: 'a' + Date.now().toString(36), on: true, dest: p, time: arrive_time, date: date || ymd(tm), days: days || [], prep: prep_minutes ?? 15, from: S.places.some(x => x.tag === 'home') ? 'home' : 'gps' };
    alarms.push(a); saveAlarms(); armAudio(); await alarmTick();
    const o = a.occ || {};
    return { ok: true, destination: p.name, arrive: arrive_time, when: a.days.length ? a.days.map(d => DAYS_FULL[d]).join(' ') : dayLabel(nextTarget(a) || tm),
      leave_at: o.leave ? fmtTime(new Date(o.leave)) : null, trip_minutes: o.dur ? Math.round(o.dur / 60) : null, traffic: o.src || null, note: o.err || null };
  },
  async travel_time({ destination }) {
    const p = await resolvePlace(destination); const org = origin();
    if (!p) return { ok: false, error: `Lieu introuvable : ${destination}` }; if (!org) return { ok: false, error: 'Position inconnue.' };
    const r = await routeTime(org, p, null); return { ok: true, destination: p.name, minutes: Math.round(r.dur / 60), traffic_delay_min: Math.round(r.delay / 60), km: +(r.dist / 1000).toFixed(1), source: r.src, arrive_if_leave_now: fmtTime(new Date(Date.now() + r.dur * 1000)) };
  },
  traffic_on_route() {
    const r = S.routes[S.sel]; if (!r) return { ok: false, error: 'Aucun itinéraire en cours.' };
    return { ok: true, destination: S.B?.name, minutes: Math.round(r.dur / 60), traffic_delay_min: Math.round(r.delay / 60), jams: r.jams.map(j => ({ at_km: +(j.startOff / 1000).toFixed(1), speed_kmh: j.speed ? Math.round(j.speed) : null, delay_min: Math.round((j.delay || 0) / 60), severity: j.mag >= 3 ? 'bouchon' : 'ralentissement', habitual: j.src === 'perso' })), destination_congested: !!S.destJam };
  },
  report({ type }) {
    const k = { bouchon: 'jam', accident: 'crash', police: 'police', danger: 'alert', 'route fermee': 'closed', inondation: 'flood' }[norm(type || '')] || type;
    const p = anim.cur || S.pos; if (!REPORTS[k]) return { ok: false, error: 'Type inconnu.' }; if (!p) return { ok: false, error: 'Position GPS indisponible.' };
    reports.push({ k, lat: p[0], lng: p[1], t: Date.now() }); store.set('reports', reports); renderReports(); return { ok: true, reported: REPORTS[k].n };
  },
  punctuality() {
    const w = S.trips.filter(t => t.lateMin != null), late = w.filter(t => t.lateMin > 0);
    const hours = Array(24).fill(0); Object.entries(S.cells).forEach(([k, v]) => { if (v[1] / v[0] < 15) hours[+k.split('_')[2] % 24] += v[0]; });
    const peak = hours.indexOf(Math.max(...hours));
    return { trips: S.trips.length, with_target: w.length, on_time_pct: w.length ? Math.round((w.length - late.length) / w.length * 100) : null,
      avg_late_min: late.length ? Math.round(late.reduce((s, t) => s + t.lateMin, 0) / late.length) : 0, slowest_hour: Math.max(...hours) ? peak : null, buffer_min: S.set.buffer };
  },
  places() { return { places: S.places.map(p => ({ name: p.name, tag: p.tag || null, visits: p.visits })), recents: recents.slice(0, 6).map(r => r.name), alarms: alarms.map(a => ({ dest: a.dest.name, time: a.time, on: a.on })) }; },
  stop_guidance() { if (!S.nav) return { ok: false, error: 'Aucun guidage en cours.' }; stopNav(false); return { ok: true }; },
  share_eta() { if (!S.nav) return { ok: false, error: 'Lancez d’abord un guidage.' }; $('#nShare').click(); return { ok: true }; }
};
// ---- Briefing intelligent ----
function briefing() {
  const st = AI.punctuality(), items = [];
  const next = alarms.filter(a => a.on && a.occ?.leave && nextTarget(a)).sort((x, y) => x.occ.leave - y.occ.leave)[0];
  if (next) items.push(`Prochain départ : <b>${fmtTime(new Date(next.occ.leave))}</b> ${dayLabel(new Date(next.occ.leave))} pour ${esc(next.dest.name)} (arrivée ${next.time}, ${Math.round(next.occ.dur / 60)} min de route).`);
  else items.push('Aucun réveil programmé. Dites par exemple : « Réveille-moi demain pour être à la BHCI à 7 h 30 ».');
  if (st.on_time_pct != null) items.push(`Ponctualité : <b>${st.on_time_pct} %</b> de trajets à l’heure${st.avg_late_min ? `, retard moyen ${st.avg_late_min} min` : ''}.`);
  if (st.avg_late_min > S.set.buffer / 2) items.push(`Conseil : passez votre marge de ${S.set.buffer} à <b>${Math.min(45, S.set.buffer + st.avg_late_min)} min</b>.`);
  if (st.slowest_hour != null) items.push(`Vos bouchons habituels culminent vers <b>${st.slowest_hour} h</b> : partez avant ou après si possible.`);
  const d = new Date(), h = d.getHours();
  const pr = S.places.filter(p => p.hours[h] > 0 && (!S.pos || hav(S.pos, [p.lat, p.lng]) > 400)).sort((a, b) => b.hours[h] - a.hours[h])[0];
  if (pr) items.push(`À cette heure, vous allez souvent à <b>${esc(pr.name)}</b>.`);
  if (!S.set.key) items.push('Ajoutez la clé TomTom (Réglages) pour des prévisions avec le trafic en direct.');
  return `<h4>${ic('sparkle')}Briefing ${fmtTime(d)}</h4><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
}
// ---- Copilote local ----
async function localBrain(text) {
  const t = norm(text), time = parseTime(t), day = parseDay(t), place = extractPlace(t) || (/\b(maison|chez moi)\b/.test(t) ? 'maison' : /\b(travail|bureau|boulot)\b/.test(t) ? 'travail' : null);
  const fmt = r => r.ok ? r : null;
  if (/briefing|resume|ma journee|programme|bonjour|salut/.test(t) && !place) { aiSay(briefing(), 'ai card'); speak('Voici votre briefing.'); return; }
  if (/(reveil|reveille|rappel|rappelle|alarme|previens)/.test(t)) {
    if (!place || !time) { aiSay('Pour programmer un réveil, dites-moi <b>où</b> et <b>à quelle heure</b> vous devez arriver. Par exemple : « Réveille-moi demain pour être à la BHCI à 7 h 30 ».', 'ai', 'Où et à quelle heure devez-vous arriver ?'); return; }
    const r = await AI.set_alarm({ destination: place, arrive_time: time, date: day?.date, days: day?.days });
    if (!r.ok) { aiSay(r.error, 'ai', r.error); return; }
    aiSay(`Réveil créé pour <b>${esc(r.destination)}</b>, arrivée ${r.arrive} (${r.when}).${r.leave_at ? ` Départ estimé à <b>${r.leave_at}</b>, ${r.trip_minutes} min de route (trafic ${r.traffic}). Je recalculerai avec le trafic en direct avant de sonner.` : ''}`,
      'ai', `C'est noté. ${r.leave_at ? `Vous devrez partir vers ${r.leave_at.replace(':', ' heures ')}.` : 'Je calcule l’heure de départ.'}`);
    return;
  }
  if (/(signale|signaler)/.test(t)) {
    const type = ['bouchon', 'accident', 'police', 'danger', 'inondation'].find(k => t.includes(k)) || (/ferme/.test(t) ? 'route fermee' : null);
    if (!type) { aiSay('Que voulez-vous signaler : bouchon, accident, police, danger, route fermée ou inondation ?', 'ai', 'Que voulez-vous signaler ?'); return; }
    const r = AI.report({ type }); aiSay(r.ok ? `${r.reported} signalé à votre position. Merci !` : r.error, 'ai', r.ok ? `${r.reported} signalé.` : r.error); return;
  }
  if (/(arrete|stop|termine).*(guidage|navigation)/.test(t)) { const r = AI.stop_guidance(); aiSay(r.ok ? 'Guidage arrêté.' : r.error, 'ai', r.ok ? 'Guidage arrêté.' : r.error); return; }
  if (/(partage|envoie).*(heure|arrivee|position)/.test(t)) { const r = AI.share_eta(); aiSay(r.ok ? 'Je prépare le message avec votre heure d’arrivée.' : r.error, 'ai'); return; }
  if (/(retard|ponctu|statist|a l'heure)/.test(t) && !place) { const p = AI.punctuality();
    aiSay(p.with_target ? `Sur ${p.with_target} trajets avec une heure fixée, vous êtes arrivé à l’heure <b>${p.on_time_pct} %</b> du temps${p.avg_late_min ? `, avec ${p.avg_late_min} min de retard en moyenne quand vous êtes en retard` : ''}.` : 'Je n’ai pas encore assez de trajets avec une heure d’arrivée pour juger. Fixez « Arriver à » avant vos trajets.', 'ai', 'Voici vos statistiques.'); return; }
  if (/(combien de temps|temps de trajet|quand (dois|faut)|a quelle heure (partir|dois))/.test(t) && place) {
    const r = await AI.travel_time({ destination: place }); if (!r.ok) { aiSay(r.error, 'ai', r.error); return; }
    let extra = ''; if (time) { const tg = new Date(); const [hh, mm] = time.split(':'); tg.setHours(+hh, +mm, 0, 0); if (day?.date) { const [Y, M, D] = day.date.split('-'); tg.setFullYear(+Y, +M - 1, +D); }
      const leave = new Date(tg - (r.minutes + S.set.buffer) * 60000); extra = ` Pour y être à ${time}, partez à <b>${fmtTime(leave)}</b> (marge de ${S.set.buffer} min incluse).`; }
    aiSay(`Jusqu’à <b>${esc(r.destination)}</b> : <b>${r.minutes} min</b> (${r.km} km${r.traffic_delay_min ? `, dont ${r.traffic_delay_min} min de trafic` : ''}). Arrivée vers ${r.arrive_if_leave_now} si vous partez maintenant.${extra}`, 'ai', `${r.minutes} minutes de trajet.`); return;
  }
  if (/(trafic|bouchon|embouteill|circulation)/.test(t) && !place) { const r = AI.traffic_on_route();
    if (!r.ok) { aiSay('Dites-moi votre destination et je vérifie le trafic sur le trajet. Exemple : « Comment est le trafic pour aller au Plateau ? »', 'ai'); return; }
    const big = r.jams.filter(j => j.severity === 'bouchon');
    aiSay(`Vers ${esc(r.destination)} : ${r.minutes} min${r.traffic_delay_min ? `, dont <b>${r.traffic_delay_min} min de bouchons</b>` : ', trafic fluide'}.${big.length ? ` ${big.length} gros bouchon${big.length > 1 ? 's' : ''}, le premier ${big[0].at_km < 0.3 ? 'dès le départ' : 'à ' + String(big[0].at_km).replace('.', ',') + ' km'}.` : ''}${r.destination_congested ? ' La destination elle-même est embouteillée.' : ''}`, 'ai', r.traffic_delay_min ? `Attention, ${r.traffic_delay_min} minutes de bouchons.` : 'Le trafic est fluide.'); return; }
  if (place && /(emmene|amene|aller|va |vas |allons|itineraire|guide|direction|route|je dois etre|je vais|trafic|y aller|conduis|go)/.test(t)) {
    const start = /(lance|demarre|go\b|guide|emmene|amene|conduis)/.test(t);
    const r = await AI.navigate({ destination: place, arrive_by: time, start_guidance: start });
    if (!r.ok) { aiSay(r.error, 'ai', r.error); return; }
    const late = r.late_minutes_if_leave_now;
    aiSay(`Itinéraire vers <b>${esc(r.destination)}</b> : <b>${r.minutes} min</b>, ${r.km} km${r.traffic_delay_min ? `, ${r.traffic_delay_min} min de trafic` : ''}${r.jams ? `, ${r.jams} bouchon${r.jams > 1 ? 's' : ''} sur le trajet le plus rapide` : ''}.${r.leave_at && !late ? ` Pour arriver à ${time}, partez à <b>${r.leave_at}</b>.` : ''}${late > 0 ? ` <b>Vous serez en retard d’environ ${late} min</b> : partez maintenant et prévenez.` : ''}${r.guidance_started ? ' Guidage lancé.' : ' Dites « lance le guidage » ou touchez Démarrer.'}`,
      'ai', `${r.minutes} minutes vers ${r.destination}.${late > 0 ? ` Vous serez en retard de ${late} minutes.` : ''}`);
    return;
  }
  if (/(lance|demarre).*(guidage|navigation)/.test(t)) { if (S.routes.length) { $('#aiPanel').hidden = true; startNav(); aiSay('Guidage lancé.'); } else aiSay('Dites-moi d’abord où aller.'); return; }
  aiSay(S.set.aiKey ? 'Je n’ai pas compris.' : 'Je comprends les demandes de trajet, de réveil, de trafic, de signalement et de ponctualité. Essayez : « Emmène-moi au Plateau », « Réveille-moi demain pour être au travail à 8 h », « Comment est le trafic ? ». Pour tout comprendre, ajoutez une clé Claude dans Réglages.', 'ai');
}
// ---- Mode avancé : Claude pilote l'appli avec des outils ----
let aiClient = null, aiHistory = [];
function loadClaudeSDK() { return window.Anthropic ? Promise.resolve() : new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'vendor/anthropic-sdk.js'; sc.onload = ok; sc.onerror = () => ko(new Error('SDK indisponible')); document.head.appendChild(sc); }); }
const strictObj = (props, req) => ({ type: 'object', properties: props, required: req, additionalProperties: false });
const CLAUDE_TOOLS = [
  { name: 'navigate', description: 'Calcule l’itinéraire le plus rapide (trafic en direct) vers une destination et l’affiche ; peut fixer l’heure d’arrivée voulue et lancer le guidage vocal.', input_schema: { type: 'object', properties: { destination: { type: 'string', description: 'Nom du lieu, adresse, ou « maison » / « travail »' }, arrive_by: { type: 'string', description: 'Heure d’arrivée voulue HH:MM (24 h)' }, start_guidance: { type: 'boolean' } }, required: ['destination'] } },
  { name: 'set_alarm', description: 'Programme un réveil de départ : Ponctuel calcule l’heure de départ avec le trafic prévu puis en direct, et sonne quand il faut partir.', input_schema: { type: 'object', properties: { destination: { type: 'string' }, arrive_time: { type: 'string', description: 'HH:MM (24 h)' }, date: { type: 'string', description: 'AAAA-MM-JJ, pour un réveil ponctuel' }, days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, description: 'Jours de répétition, 0 = dimanche' }, prep_minutes: { type: 'integer', description: 'Pré-alerte en minutes (défaut 15)' } }, required: ['destination', 'arrive_time'] } },
  { name: 'travel_time', description: 'Temps de trajet actuel depuis la position de l’utilisateur vers une destination, avec le trafic.', input_schema: { type: 'object', properties: { destination: { type: 'string' } }, required: ['destination'] } },
  { name: 'traffic_on_route', description: 'Bouchons et retard sur l’itinéraire affiché.', input_schema: { type: 'object', properties: {} } },
  { name: 'report', description: 'Signale un incident à la position actuelle.', input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['bouchon', 'accident', 'police', 'danger', 'route fermee', 'inondation'] } }, required: ['type'] } },
  { name: 'punctuality', description: 'Statistiques de ponctualité et habitudes de l’utilisateur.', input_schema: { type: 'object', properties: {} } },
  { name: 'places', description: 'Lieux mémorisés, destinations récentes et réveils.', input_schema: { type: 'object', properties: {} } },
  { name: 'stop_guidance', description: 'Arrête le guidage en cours.', input_schema: { type: 'object', properties: {} } },
  { name: 'share_eta', description: 'Partage l’heure d’arrivée prévue (pendant le guidage).', input_schema: { type: 'object', properties: {} } }
];
async function claudeBrain(text) {
  await loadClaudeSDK();
  aiClient = aiClient || new window.Anthropic({ apiKey: S.set.aiKey, dangerouslyAllowBrowser: true });
  const now = new Date();
  const system = `Tu es Ponctuel IA, le copilote d’une appli de navigation anti-retard utilisée à Abidjan (Côte d’Ivoire). Tu réponds en français, en une à trois phrases courtes, chaleureuses et concrètes, faciles à écouter en conduisant. Tu utilises les outils pour agir dans l’appli au lieu de décrire ce qu’il faudrait faire. Si l’utilisateur doit être quelque part à une heure donnée, calcule et annonce l’heure de départ. N’invente jamais un temps de trajet : appelle un outil. Contexte : nous sommes le ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, il est ${fmtTime(now)}. Marge de sécurité de l’utilisateur : ${S.set.buffer} min. ${S.nav ? `Guidage en cours vers ${S.B?.name}.` : S.B ? `Destination affichée : ${S.B.name}.` : ''}`;
  aiHistory.push({ role: 'user', content: text });
  for (let i = 0; i < 6; i++) {
    const res = await aiClient.beta.messages.create({ model: 'claude-opus-5-5', max_tokens: 8000, system, tools: CLAUDE_TOOLS, messages: aiHistory,
      output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    aiHistory.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'refusal') { aiSay('Je ne peux pas répondre à cette demande.', 'ai'); return; }
    const uses = res.content.filter(b => b.type === 'tool_use');
    const said = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!uses.length || res.stop_reason === 'end_turn') { if (said) aiSay(esc(said).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'), 'ai', said.replace(/\*\*/g, '')); return; }
    if (said) aiSay(esc(said), 'ai');
    const results = [];
    for (const u of uses) {
      let out; try { out = await (AI[u.name] ? AI[u.name](u.input || {}) : { ok: false, error: 'Outil inconnu' }); } catch (e) { out = { ok: false, error: String(e.message || e) }; }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out), is_error: out?.ok === false });
    }
    aiHistory.push({ role: 'user', content: results });
  }
}
async function aiAsk(text) {
  text = (text || '').trim(); if (!text) return;
  aiSay(esc(text), 'me'); $('#aiIn').value = ''; aiThinking(true);
  try {
    if (S.set.aiKey) {
      try { await claudeBrain(text); }
      catch (e) {
        const A = window.Anthropic, msg = A && e instanceof A.AuthenticationError ? 'Clé Claude refusée : vérifiez-la dans Réglages.' : A && e instanceof A.RateLimitError ? 'Claude est très sollicité : réessayez dans un instant.' : A && e instanceof A.APIConnectionError ? 'Pas de connexion à Claude : je réponds en mode local.' : 'Claude indisponible : je réponds en mode local.';
        aiHistory = []; // repart sur une conversation propre
        aiSay(msg, 'ai'); await localBrain(text);
      }
    } else await localBrain(text);
  } finally { aiThinking(false); }
}
// ---- Voix ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function micToggle() {
  if (!SR) { toast('La dictée vocale n’est pas disponible dans ce navigateur. Utilisez le micro du clavier.', 4000, 'mic'); $('#aiIn').focus(); return; }
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false;
  let finalTxt = ''; $('#aiMic').classList.add('on'); speechSynthesis?.cancel?.();
  rec.onresult = e => { let it = ''; for (const r of e.results) { if (r.isFinal) finalTxt = r[0].transcript; else it += r[0].transcript; } $('#aiIn').value = finalTxt || it; };
  rec.onerror = e => { if (e.error === 'not-allowed') toast('Autorisez le micro pour parler à Ponctuel IA.', 4000, 'mic'); };
  rec.onend = () => { $('#aiMic').classList.remove('on'); rec = null; if (finalTxt) aiAsk(finalTxt); };
  try { rec.start(); } catch { rec = null; $('#aiMic').classList.remove('on'); }
}
// ---- Panneau ----
const AI_CHIPS = ['Briefing du jour', 'Je dois être à la BHCI à 7h30', 'Réveille-moi demain pour être au travail à 8h', 'Comment est le trafic ?', 'Combien de temps pour aller à la maison ?', 'Suis-je souvent en retard ?', 'Signale un bouchon'];
function openAI() {
  const p = $('#aiPanel'); p.hidden = false;
  $('#aiMode').textContent = S.set.aiKey ? 'Propulsé par Claude · comprend tout' : 'Copilote local · ajoutez une clé Claude pour le mode avancé';
  if (!aiLog().children.length) { aiSay(briefing(), 'ai card'); aiSay('Bonjour ! Dites-moi où vous devez être et à quelle heure : je calcule quand partir, par où passer, et je peux vous réveiller au bon moment.', 'ai'); }
  $('#aiChips').innerHTML = AI_CHIPS.map(c => `<button type="button">${esc(c)}</button>`).join('');
  $('#aiChips').querySelectorAll('button').forEach(b => b.onclick = () => aiAsk(b.textContent));
  injectIcons(p);
}
$('#bAI').onclick = openAI;
$('#aiClose').onclick = () => { $('#aiPanel').hidden = true; rec?.stop(); };
$('#aiMic').onclick = micToggle;
$('#aiForm').onsubmit = e => { e.preventDefault(); aiAsk($('#aiIn').value); };
injectIcons();


/* ================= Guidage plein écran ================= */
// Plein écran natif quand le navigateur le permet (Android) ; sur iPhone, l'appli installée sur l'écran d'accueil est déjà en plein écran.
function enterFullscreen() { const d = document.documentElement; try { if (!document.fullscreenElement && d.requestFullscreen && !matchMedia('(display-mode: standalone)').matches) d.requestFullscreen({ navigationUI: 'hide' }).catch(() => { }); } catch { } }
function exitFullscreen() { try { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); } catch { } }
// Un toucher sur la carte fait apparaître les commandes 6 secondes
let peekT = null;
function peek() { if (!S.nav) return; document.body.classList.add('peek'); clearTimeout(peekT); peekT = setTimeout(() => document.body.classList.remove('peek'), 6000); }
map.on('click', () => { if (S.nav) document.body.classList.contains('peek') ? (clearTimeout(peekT), document.body.classList.remove('peek')) : peek(); });
$('#nMore').onclick = () => { $('#nTray').hidden = !$('#nTray').hidden; };
$('#nRep').onclick = () => { $('#nTray').hidden = true; $('#reportSheet').hidden = false; };
$('#nAI').onclick = () => { $('#nTray').hidden = true; openAI(); };
// la barre d'options se referme toute seule
document.addEventListener('pointerdown', e => { if (!$('#nTray').hidden && !e.target.closest('#navbar')) $('#nTray').hidden = true; }, { passive: true });
injectIcons();


/* ================= Moteur d'estimation Ponctuel =================
   Le trafic « en direct » des fournisseurs est faible à Abidjan : seul, il annonce presque le temps « route vide ».
   Estimation = le plus pessimiste de : trafic en direct, trafic historique, route vide × profil d'heure de pointe abidjanais,
   puis corrigée par l'écart mesuré sur VOS trajets (apprentissage par tranche horaire). */
let etaCalib = store.get('etaCalib', {});
function rushFactor(d) {
  const day = d.getDay(), h = d.getHours() + d.getMinutes() / 60;
  if (day === 0) return h >= 10 && h < 20 ? 1.2 : 1.05;
  if (day === 6) return h >= 9 && h < 20 ? 1.4 : 1.1;
  if (h >= 6.5 && h < 9.5) return 1.95;       // pointe du matin
  if (h >= 16.5 && h < 20) return 2.0;        // pointe du soir
  if (h >= 11.5 && h < 14.5) return 1.45;     // mi-journée
  if ((h >= 5.5 && h < 6.5) || (h >= 9.5 && h < 11.5) || (h >= 14.5 && h < 16.5) || (h >= 20 && h < 22)) return 1.35;
  return 1.08;
}
const calibKey = d => ((d.getDay() === 0 || d.getDay() === 6) ? 'we' : 'wk') + '_' + d.getHours();
function calibFor(d) { const c = etaCalib[calibKey(d)] || etaCalib[(d.getDay() === 0 || d.getDay() === 6 ? 'we' : 'wk') + '_all']; return c && c.n >= 2 ? Math.max(.7, Math.min(2.5, c.r)) : null; }
function smartEta(r, when = new Date()) {
  const free = r.free || r.dur, raw = r.dur, rush = free * rushFactor(when);
  let est = Math.max(raw, r.hist || 0, rush), why = raw >= rush && raw >= (r.hist || 0) ? 'trafic en direct' : (r.hist || 0) > rush ? 'trafic habituel' : 'heure de pointe Abidjan';
  const c = calibFor(when); if (c) { est *= c; why += ' + vos trajets'; }
  r.rawDur = raw; r.dur = Math.round(est); r.delay = Math.max(0, r.dur - free); r.etaWhy = why;
  return r;
}
function learnEta(n) {
  const actual = (Date.now() - (n.movedAt || n.start)) / 1000; if (actual < 120) return;
  const ratio = Math.max(.5, Math.min(3, actual / n.pred));
  for (const k of [calibKey(n.predAt), (calibKey(n.predAt).split('_')[0]) + '_all']) {
    const c = etaCalib[k] || { n: 0, r: 1 }; c.r = c.n ? c.r * .65 + ratio * .35 : ratio; c.n++; etaCalib[k] = c;
  }
  store.set('etaCalib', etaCalib);
}
// Une heure d'arrivée oubliée (déjà passée depuis plus de 30 min) ne doit pas fausser le « retard prévu »
(() => { const t = targetDate(), setAt = store.get('arriveSetAt', 0); if (t && (t.getTime() < Date.now() - 20 * 60000 || Date.now() - setAt > 14 * 3600e3)) { arriveIn.value = ''; store.set('arrive', ''); } })();

// L'iPhone n'envoie plus de position quand la voiture est arrêtée : on rafraîchit le guidage toutes les 3 s quand même
setInterval(() => { if (S.nav && S.pos) navUpdate(); }, 3000);

/* Sondes de trafic devant : toutes les 60 s (30 s au pas), on mesure la vitesse réelle TomTom à 4 points de la route devant */
let probing = false;
async function probeAhead() {
  const n = S.nav; if (!n || !S.set.key || probing) return;
  if (Date.now() - (n.probeAt || 0) < (n.slowSince ? 30000 : 60000)) return;
  probing = true; n.probeAt = Date.now();
  try {
    const r = n.r, k = encodeURIComponent(S.set.key), offs = [250, 700, 1400, 2500, 4000].map(o => n.done + o).filter(o => o < r.dist - 50);
    const pts = offs.map(o => { let i = r.cum.findIndex(c => c >= o); if (i < 0) i = r.coords.length - 1; return { off: o, p: r.coords[i] }; });
    const out = await Promise.all(pts.map(async q => {
      try { const j = await getJSON(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/16/json?point=${q.p[0]},${q.p[1]}&unit=KMPH&key=${k}`, 8000);
        const f = j.flowSegmentData; if (!f?.freeFlowSpeed) return null;
        return { off: q.off, speed: f.currentSpeed, free: f.freeFlowSpeed, ratio: f.roadClosure ? 0 : f.currentSpeed / f.freeFlowSpeed, conf: f.confidence };
      } catch { return null; }
    }));
    if (S.nav === n) n.probes = out.filter(Boolean);
  } finally { probing = false; }
}
setInterval(probeAhead, 5000);
