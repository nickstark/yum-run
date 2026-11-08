/* Yum Run — pretend food-delivery tracker. No real orders, no accounts. */
(() => {
'use strict';
const $ = s => document.querySelector(s);

// ?speed=10 makes everything run 10x faster (handy for testing)
const SPEED = Math.max(1, Number(new URLSearchParams(location.search).get('speed')) || 1);

/* ---------------- data ---------------- */
const FOODS = [
  { id:'pizza',    e:'🍕', name:'Pizza',     thing:'pizza',           place:"Luigi's Pizza" },
  { id:'burger',   e:'🍔', name:'Burger',    thing:'burger',          place:'Big Bite Burgers' },
  { id:'tacos',    e:'🌮', name:'Tacos',     thing:'tacos',           place:'Taco Town', plural:true },
  { id:'nuggets',  e:'🍗', name:'Nuggets',   thing:'chicken nuggets', place:'Cluck Hut', plural:true },
  { id:'noodles',  e:'🍜', name:'Noodles',   thing:'noodles',         place:'Noodle Palace', plural:true },
  { id:'icecream', e:'🍦', name:'Ice Cream', thing:'ice cream',       place:'Super Scoops' },
];
const DASHERS = [['Sam','🧑'],['Maya','👩'],['Leo','👨'],['Priya','👩🏽'],['Jordan','🧑🏾'],['Ava','👱‍♀️'],['Theo','👨🏼'],['Rosa','👩🏻']];
const CARS = [['red','#e53935'],['blue','#1e88e5'],['green','#2e9e48'],['yellow','#f6b900'],['purple','#8e24aa'],['orange','#fb8c00'],['silver','#98a3ad']];
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------------- storage ---------------- */
const KEY_SET = 'yumrun.settings', KEY_ORDER = 'yumrun.order';
const DEFAULTS = { home:[45.08, -93.08], homeSet:false, radiusMi:1.5, minutes:5, follow:true, sound:true };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let settings = { ...DEFAULTS, ...load(KEY_SET, {}) };

/* ---------------- geo helpers ---------------- */
const R = 6371000, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function dist(a, b) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const s = Math.sin(dLat/2)**2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function bearing(a, b) {
  const y = Math.sin(rad(b[1]-a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0]))*Math.sin(rad(b[0])) - Math.sin(rad(a[0]))*Math.cos(rad(b[0]))*Math.cos(rad(b[1]-a[1]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
function destination(p, brg, meters) {
  const d = meters / R, b = rad(brg), l1 = rad(p[0]), g1 = rad(p[1]);
  const l2 = Math.asin(Math.sin(l1)*Math.cos(d) + Math.cos(l1)*Math.sin(d)*Math.cos(b));
  const g2 = g1 + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(l1), Math.cos(d) - Math.sin(l1)*Math.sin(l2));
  return [deg(l2), deg(g2)];
}
function makePath(pts) {
  const clean = pts.filter((p, i) => i === 0 || dist(pts[i-1], p) > 0.5);
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i-1] + dist(clean[i-1], clean[i]));
  return { pts: clean, cum, total: cum[cum.length - 1] };
}
function pointAt(path, d) {
  d = Math.max(0, Math.min(path.total, d));
  let lo = 0, hi = path.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path.cum[m] <= d) lo = m; else hi = m; }
  const a = path.pts[lo], b = path.pts[hi], seg = path.cum[hi] - path.cum[lo];
  const t = seg ? (d - path.cum[lo]) / seg : 0;
  return { p: [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t], i: lo };
}

/* ---------------- routing ---------------- */
async function osrm(from, to) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    if (j.code !== 'Ok' || !j.routes?.length) { const e = new Error(j.code); e.noRoute = true; throw e; }
    return { pts: j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), meters: j.routes[0].distance };
  } finally { clearTimeout(timer); }
}
// Offline fallback: a blocky "city streets" route
function fakeRoute(from, to) {
  const midLng = from[1] + (to[1] - from[1]) * (0.35 + Math.random() * 0.3);
  const midLat = from[0] + (to[0] - from[0]) * (0.35 + Math.random() * 0.3);
  return [from, [from[0], midLng], [midLat, midLng], [midLat, to[1]], to];
}
async function buildRoute(home, radiusM) {
  let best = null;
  for (let i = 0; i < 3; i++) {
    const start = destination(home, Math.random() * 360, radiusM * (0.85 + Math.random() * 0.3));
    try {
      const r = await osrm(start, home);
      if (!best || r.meters < best.meters) best = r;
      if (r.meters <= radiusM * 2.6) break;          // reasonable — not looping around a lake
    } catch (e) { if (!e.noRoute) break; }           // offline / server down → stop trying
  }
  if (!best) return { pts: fakeRoute(destination(home, Math.random() * 360, radiusM), home), real: false };
  return { pts: [...best.pts, home], real: true };
}

/* ---------------- sound ---------------- */
let ac = null;
function audio() {
  if (!settings.sound) return null;
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); }
  catch { ac = null; }
  return ac;
}
function tone(notes, type = 'sine', gap = 0.14, len = 0.35, vol = 0.22) {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + 0.02;
  notes.forEach((f, i) => {
    const o = a.createOscillator(), g = a.createGain(), t = t0 + i * gap;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + len + 0.05);
  });
}
const sfx = {
  tap:  () => tone([660], 'sine', 0, 0.12, 0.15),
  ding: () => tone([880, 1320]),
  honk: () => tone([392, 392], 'square', 0.28, 0.2, 0.08),
  yay:  () => tone([523, 659, 784, 1047], 'triangle', 0.12, 0.4, 0.2),
};

/* ---------------- screen wake lock ---------------- */
let wake = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    } else if (!on && wake) { await wake.release(); wake = null; }
  } catch {}
}

/* ---------------- screens ---------------- */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}
function tiles() {
  return L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19, crossOrigin: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
  });
}
const pinIcon = (html, cls = '') => L.divIcon({ className: '', html: `<div class="pin ${cls}">${html}</div>`, iconSize: [48, 48], iconAnchor: [24, 24] });
function carIcon(color) {
  const svg = `<svg viewBox="0 0 40 64" width="28" height="45" aria-hidden="true">
    <rect x="4" y="2" width="32" height="60" rx="12" fill="${color}" stroke="#fff" stroke-width="3"/>
    <rect x="9" y="15" width="22" height="11" rx="4" fill="#d6ecff"/>
    <rect x="10" y="28" width="20" height="12" rx="3" fill="rgba(0,0,0,.14)"/>
    <rect x="9" y="43" width="22" height="8" rx="3" fill="#d6ecff" opacity=".85"/>
    <circle cx="11" cy="6" r="2.6" fill="#fff59d"/><circle cx="29" cy="6" r="2.6" fill="#fff59d"/></svg>`;
  return L.divIcon({ className: '', html: `<div class="car"><div class="car-rot">${svg}</div></div>`, iconSize: [52, 52], iconAnchor: [26, 26] });
}

/* ---------------- order screen ---------------- */
let chosen = null;
function renderMenu() {
  const menu = $('#menu');
  menu.innerHTML = '';
  FOODS.forEach(f => {
    const b = document.createElement('button');
    b.className = 'food'; b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="e">${f.e}</span>${f.name}`;
    b.onclick = () => {
      chosen = f; sfx.tap();
      menu.querySelectorAll('.food').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      $('#orderBtn').disabled = false;
    };
    menu.appendChild(b);
  });
}

// Hold the gear for 2s to open settings (keeps little fingers out)
(function gearHold() {
  const g = $('#gear'); let t0 = 0, raf = 0;
  const step = () => {
    const p = Math.min(1, (performance.now() - t0) / 2000);
    g.style.setProperty('--p', p);
    if (p >= 1) { stop(); openSettings(); } else raf = requestAnimationFrame(step);
  };
  const start = e => { e.preventDefault(); t0 = performance.now(); raf = requestAnimationFrame(step); };
  const stop = () => { cancelAnimationFrame(raf); g.style.setProperty('--p', 0); };
  g.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => g.addEventListener(ev, stop));
  g.addEventListener('contextmenu', e => e.preventDefault());
})();

/* ---------------- tracking ---------------- */
let map = null, layer = null, order = null, path = null, T = null;
let homeM, restM, carM, routeLine, doneLine;
let orderToken = 0, heading = null, lastPhase = -1, lastFit = 0, lastLine = 0, userMovedAt = 0, deliveredShown = false, rafId = 0;

function ensureMap() {
  if (map) return;
  map = L.map('map', { zoomControl: false, attributionControl: true }).setView(settings.home, 14);
  tiles().addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on('dragstart', () => { userMovedAt = Date.now(); });
}
function timeline(o) {
  const total = o.minutes * 60000;
  const confirm = 5000, prep = Math.max(8000, total * 0.28), pickup = 6000;
  const drive = Math.max(20000, total - confirm - prep - pickup);
  return { confirm, prepEnd: confirm + prep, pickupEnd: confirm + prep + pickup, end: confirm + prep + pickup + drive, drive };
}
const ease = t => 0.82 * t + 0.18 * (0.5 - 0.5 * Math.cos(Math.PI * t)); // gentle speed-up / slow-down

function fitPad() {
  const r = $('#sheet').getBoundingClientRect();
  const bottomSheet = r.width > innerWidth * 0.6 || r.top > innerHeight * 0.45;
  return bottomSheet
    ? { paddingTopLeft: [50, 90], paddingBottomRight: [50, innerHeight - r.top + 40] }
    : { paddingTopLeft: [r.right + 50, 80], paddingBottomRight: [60, 60] };
}
function fit(points, animate = true) {
  map.fitBounds(L.latLngBounds(points), { ...fitPad(), maxZoom: 17, animate, duration: 0.8 });
}

function setText(sel, txt) { const el = $(sel); if (el.textContent !== txt) el.textContent = txt; }

async function startOrder() {
  const food = chosen; if (!food) return;
  audio(); sfx.ding();
  deliveredShown = false; lastPhase = -1; heading = null;
  show('track'); ensureMap(); map.invalidateSize();
  layer.clearLayers(); $('#delivered').classList.add('hidden');
  map.setView(settings.home, 14, { animate: false });
  homeM = L.marker(settings.home, { icon: pinIcon('🏠', 'home'), zIndexOffset: 100 }).addTo(layer);
  setText('#statusTitle', 'Sending your order…');
  $('#statusSub').innerHTML = '<span class="spinner"></span> Finding the closest ' + food.place;
  setText('#etaTime', '…'); setText('#etaLabel', 'Estimated arrival');
  setText('#dasherName', 'Finding a driver…'); setText('#dasherCar', ' '); setText('#dasherAvatar', '🔎');
  setBar(-1, 0);
  keepAwake(true);

  const token = ++orderToken;
  const route = await buildRoute(settings.home, settings.radiusMi * 1609.34);
  if (token !== orderToken) return;   // cancelled while finding a route
  order = {
    food: food.id, home: settings.home, pts: route.pts, real: route.real,
    startedAt: Date.now(), minutes: settings.minutes, dasher: pick(DASHERS), car: pick(CARS),
  };
  save(KEY_ORDER, order);
  beginTracking();
}

function beginTracking() {
  const food = FOODS.find(f => f.id === order.food) || FOODS[0];
  path = makePath(order.pts); T = timeline(order);
  show('track'); ensureMap(); map.invalidateSize();
  layer.clearLayers();
  const start = path.pts[0];
  routeLine = L.polyline(path.pts, { color: '#231c18', weight: 6, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
  doneLine = L.polyline([], { color: '#231c18', weight: 5, opacity: 0.18, dashArray: '2 10', lineCap: 'round' }).addTo(layer);
  homeM = L.marker(order.home, { icon: pinIcon('🏠', 'home'), zIndexOffset: 100 }).addTo(layer);
  restM = L.marker(start, { icon: pinIcon(food.e), zIndexOffset: 50 }).addTo(layer);
  carM = L.marker(start, { icon: carIcon(order.car[1]), zIndexOffset: 200, opacity: 0 }).addTo(layer);
  setText('#dasherAvatar', order.dasher[1]);
  setText('#dasherName', order.dasher[0]);
  setText('#dasherCar', `Driving a ${order.car[0]} car`);
  requestAnimationFrame(() => { map.invalidateSize(); fit(path.pts, false); });
  keepAwake(true);
  cancelAnimationFrame(rafId); rafId = requestAnimationFrame(tick);
}

function setBar(phase, frac) {
  const segs = document.querySelectorAll('#bar b'), icons = document.querySelectorAll('#barIcons span');
  segs.forEach((b, i) => b.style.setProperty('--f', i < phase ? 1 : i === phase ? frac : 0));
  icons.forEach((s, i) => { s.classList.toggle('done', i < phase); s.classList.toggle('now', i === phase); });
}

function tick() {
  if (!order) return;
  const food = FOODS.find(f => f.id === order.food) || FOODS[0];
  const now = Date.now();
  const el = (now - order.startedAt) * SPEED;
  const dasher = order.dasher[0];

  let phase, frac;
  if (el < T.confirm)        { phase = 0; frac = el / T.confirm; }
  else if (el < T.prepEnd)   { phase = 1; frac = (el - T.confirm) / (T.prepEnd - T.confirm); }
  else if (el < T.pickupEnd) { phase = 2; frac = (el - T.prepEnd) / (T.pickupEnd - T.prepEnd); }
  else if (el < T.end)       { phase = 3; frac = (el - T.pickupEnd) / T.drive; }
  else                       { phase = 5; frac = 1; }
  const statusPhase = phase === 3 && frac > 0.85 ? 4 : phase;

  setBar(Math.min(phase, 3), phase === 5 ? 1 : frac);

  // ETA
  // In ?speed= test mode the ETA still shows real-run minutes, so it reads like the real thing
  const remMs = Math.max(0, T.end - el);
  const arrive = new Date(order.startedAt + T.end);
  setText('#etaLabel', 'Arrives at ' + arrive.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  setText('#etaTime', remMs < 45000 ? 'Now!' : Math.ceil(remMs / 60000) + ' min');

  // Car position
  let d = 0;
  if (phase === 3) d = ease(frac) * path.total;
  if (phase === 5) d = path.total;
  const { p: pos, i } = pointAt(path, d);
  if (phase >= 2) {
    carM.setOpacity(1); carM.setLatLng(pos);
    const ahead = pointAt(path, d + 18).p;
    if (dist(pos, ahead) > 1) {
      const target = bearing(pos, ahead);
      if (heading == null) heading = target;
      heading += ((target - heading + 540) % 360 - 180) * 0.12;
      const rot = carM.getElement()?.querySelector('.car-rot');
      if (rot) rot.style.transform = `rotate(${heading}deg)`;
    }
  }
  if (phase === 3 && now - lastLine > 120) {
    lastLine = now;
    routeLine.setLatLngs([pos, ...path.pts.slice(i + 1)]);
    doneLine.setLatLngs([...path.pts.slice(0, i + 1), pos]);
  }

  // Camera
  if (settings.follow && phase === 3 && now - lastFit > 1500 && now - userMovedAt > 6000) {
    lastFit = now; fit([pos, order.home]);
  }

  // Status text — only when the phase changes
  if (statusPhase !== lastPhase) {
    const first = lastPhase === -1;
    lastPhase = statusPhase;
    restM.getElement()?.querySelector('.pin')?.classList.toggle('cooking', statusPhase === 1);
    const remMi = () => ((path.total - d) / 1609.34).toFixed(1);
    const texts = [
      ['Order received!', `${food.place} got your order.`],
      [`Making your ${food.thing}…`, 'The cooks are getting it ready. 👩‍🍳'],
      [`${dasher} is picking up your food`, `At ${food.place} now.`],
      [`${dasher} is on the way!`, 'Heading to your house.'],
      ['Almost there!', 'Look out the window! 👀'],
      ['Delivered!', ''],
    ];
    setText('#statusTitle', texts[statusPhase][0]);
    setText('#statusSub', texts[statusPhase][1]);
    if (statusPhase === 3) setText('#statusSub', `Heading to your house — ${remMi()} mi away`);
    if (!first) { statusPhase === 4 ? sfx.honk() : statusPhase !== 5 && sfx.ding(); }
    if (statusPhase === 2) fit([pos, order.home]);
  }
  if (statusPhase === 3 && now - lastLine < 20) {
    setText('#statusSub', `Heading to your house — ${((path.total - d) / 1609.34).toFixed(1)} mi away`);
  }

  if (phase === 5) { if (!deliveredShown) delivered(food); return; }
  rafId = requestAnimationFrame(tick);
}

function delivered(food) {
  deliveredShown = true;
  routeLine.setLatLngs([]);
  setText('#deliveredEmoji', food.e);
  setText('#deliveredTitle', `Your ${food.thing} ${food.plural ? 'are' : 'is'} here!`);
  setText('#deliveredSub', `${order.dasher[0]} left your food at the door. Enjoy! 😋`);
  $('#delivered').classList.remove('hidden');
  sfx.yay(); confetti(); keepAwake(false);
  save(KEY_ORDER, null);
}

function endOrder() {
  orderToken++; cancelAnimationFrame(rafId);
  order = null; save(KEY_ORDER, null); keepAwake(false);
  $('#delivered').classList.add('hidden');
  show('order');
}

/* ---------------- confetti ---------------- */
function confetti() {
  const c = $('#confetti'), ctx = c.getContext('2d'), dpr = devicePixelRatio || 1;
  c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; ctx.scale(dpr, dpr);
  const W = c.clientWidth, H = c.clientHeight, colors = ['#ff5a36', '#ffb800', '#2e9e48', '#1e88e5', '#8e24aa', '#ff7eb6'];
  const ps = Array.from({ length: 160 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.45, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 16 - 4,
    s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: pick(colors),
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    });
    if (t - t0 < 5000) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(t0);
}

/* ---------------- settings ---------------- */
let setMap = null, setMarker = null, setCircle = null;
function openSettings(firstRun = false) {
  show('settings');
  $('#setIntro').textContent = firstRun ? 'Welcome! Set your home once and you’re ready to go.' : '';
  $('#radius').value = settings.radiusMi; $('#minutes').value = settings.minutes;
  $('#follow').checked = settings.follow; $('#sound').checked = settings.sound;
  updateLabels();
  if (!setMap) {
    setMap = L.map('homeMap', { zoomControl: true }).setView(settings.home, 13);
    tiles().addTo(setMap);
    setMarker = L.marker(settings.home, { draggable: true, icon: pinIcon('🏠', 'home') }).addTo(setMap);
    setCircle = L.circle(settings.home, { radius: settings.radiusMi * 1609.34, color: '#ff5a36', weight: 2, dashArray: '6 8', fillOpacity: 0.06 }).addTo(setMap);
    setMarker.on('drag', () => setCircle.setLatLng(setMarker.getLatLng()));
    setMap.on('click', e => moveHome([e.latlng.lat, e.latlng.lng]));
  }
  setTimeout(() => { setMap.invalidateSize(); setMap.fitBounds(setCircle.getBounds(), { padding: [20, 20] }); }, 50);
}
function moveHome(ll, zoom) {
  setMarker.setLatLng(ll); setCircle.setLatLng(ll);
  zoom ? setMap.setView(ll, zoom) : setMap.panTo(ll);
}
function updateLabels() {
  const r = Number($('#radius').value), m = Number($('#minutes').value);
  $('#radiusVal').textContent = `${r} mi away`;
  $('#minutesVal').textContent = `${m} min`;
  if (setCircle) setCircle.setRadius(r * 1609.34);
}
$('#radius').addEventListener('input', updateLabels);
$('#minutes').addEventListener('input', updateLabels);

$('#locateBtn').onclick = () => {
  const msg = $('#locMsg');
  if (!window.isSecureContext || !navigator.geolocation) {
    msg.textContent = 'Location needs an https:// address. Drag the 🏠 or search instead.'; return;
  }
  msg.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(
    p => { moveHome([p.coords.latitude, p.coords.longitude], 16); msg.textContent = 'Got it! Nudge the 🏠 if it’s a little off.'; },
    () => { msg.textContent = 'Couldn’t get your location. Drag the 🏠 or search instead.'; },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};
$('#searchForm').onsubmit = async e => {
  e.preventDefault();
  const q = $('#searchBox').value.trim(); if (!q) return;
  const msg = $('#locMsg'); msg.textContent = 'Searching…';
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
    const j = await r.json();
    if (!j.length) { msg.textContent = 'No match — try adding the city.'; return; }
    moveHome([Number(j[0].lat), Number(j[0].lon)], 17);
    msg.textContent = 'Found it! Nudge the 🏠 onto your house if needed.';
  } catch { msg.textContent = 'Search didn’t work — drag the 🏠 instead.'; }
};
$('#doneBtn').onclick = () => {
  const ll = setMarker.getLatLng();
  settings = {
    ...settings, home: [ll.lat, ll.lng], homeSet: true,
    radiusMi: Number($('#radius').value), minutes: Number($('#minutes').value),
    follow: $('#follow').checked, sound: $('#sound').checked,
  };
  save(KEY_SET, settings);
  order ? show('track') : show('order');
  if (order) map?.invalidateSize();
};
$('#resetOrder').onclick = () => { cancelAnimationFrame(rafId); order = null; save(KEY_ORDER, null); keepAwake(false); $('#locMsg').textContent = 'Order cleared.'; };

/* ---------------- wiring ---------------- */
$('#orderBtn').onclick = startOrder;
$('#againBtn').onclick = () => { sfx.tap(); endOrder(); };
$('#cancelBtn').onclick = () => { if (deliveredShown || confirm('Cancel this order?')) endOrder(); };
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && order && !deliveredShown) keepAwake(true);
});
addEventListener('resize', () => { map?.invalidateSize(); setMap?.invalidateSize(); });

renderMenu();
const saved = load(KEY_ORDER, null);
if (saved && saved.pts?.length > 1) {
  const end = timeline(saved).end / SPEED;
  if (Date.now() - saved.startedAt < end + 10 * 60000) { order = saved; beginTracking(); }
  else { save(KEY_ORDER, null); show('order'); }
} else if (!settings.homeSet) {
  openSettings(true);
} else {
  show('order');
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
