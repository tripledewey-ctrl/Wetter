'use strict';

// Datenquellen (alle frei, ohne API-Key, CORS-fähig):
// - Bright Sky (https://brightsky.dev): JSON-API für DWD Open Data (Messwerte, MOSMIX-Vorhersage, Warnungen)
// - DWD GeoServer (https://maps.dwd.de): WMS-Karten für Radar und Warnungen
// - Open-Meteo Geocoding: Ortssuche
const BRIGHTSKY = 'https://api.brightsky.dev';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const DWD_WMS = 'https://maps.dwd.de/geoserver/dwd/wms';
const TZ = 'Europe/Berlin';
const FAVORITES = [
  { name: 'Wiesbaden', lat: 50.0826, lon: 8.2400 },
  { name: 'Hamburg', lat: 53.5511, lon: 9.9937 },
  { name: 'Rendsburg', lat: 54.3044, lon: 9.6631 },
];
const DEFAULT_PLACE = FAVORITES[0];
const STORAGE_KEY = 'wetter.place';

const ICONS = {
  'clear-day': '☀️', 'clear-night': '🌙',
  'partly-cloudy-day': '⛅', 'partly-cloudy-night': '☁️',
  'cloudy': '☁️', 'fog': '🌫️', 'wind': '💨',
  'rain': '🌧️', 'sleet': '🌨️', 'snow': '❄️', 'hail': '🌨️', 'thunderstorm': '⛈️',
};
const CONDITIONS = {
  dry: 'trocken', fog: 'Nebel', rain: 'Regen', sleet: 'Schneeregen',
  snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter',
};

const $ = (id) => document.getElementById(id);
const icon = (name) => ICONS[name] || '❔';
const round = (v, d = 0) => (v == null ? null : Number(v).toFixed(d).replace('.', ','));
const fmt = (v, unit, d = 0) => (v == null ? '–' : `${round(v, d)} ${unit}`);

function compass(deg) {
  if (deg == null) return '';
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// Bright Sky liefert bei current_weather Werte mit Suffix (_10, _30, _60 Minuten).
function pick(obj, key) {
  for (const k of [key, `${key}_10`, `${key}_30`, `${key}_60`]) {
    if (obj[k] != null) return obj[k];
  }
  return null;
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function berlinDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
}

function loadPlace() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (p && typeof p.lat === 'number' && typeof p.lon === 'number') return p;
  } catch (_) { /* ignore */ }
  return DEFAULT_PLACE;
}

function savePlace(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (_) { /* ignore */ }
}

// ---------- Aktuelles Wetter ----------
async function renderCurrent(place) {
  const data = await getJSON(`${BRIGHTSKY}/current_weather?lat=${place.lat}&lon=${place.lon}&tz=${TZ}`);
  const w = data.weather;
  const src = (data.sources || [])[0];
  $('cur-icon').textContent = icon(w.icon);
  $('cur-temp').textContent = w.temperature == null ? '–' : `${round(w.temperature)}°`;
  const time = new Date(w.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  $('station').textContent = src
    ? `Messstation ${src.station_name} (${round(src.distance / 1000, 1)} km) · Stand ${time} Uhr`
    : `Stand ${time} Uhr`;

  const wind = pick(w, 'wind_speed');
  const items = [
    ['Wetterlage', CONDITIONS[w.condition] || w.condition || '–'],
    ['Wind', wind == null ? '–' : `${round(wind)} km/h ${compass(pick(w, 'wind_direction'))}`],
    ['Böen', fmt(pick(w, 'wind_gust_speed'), 'km/h')],
    ['Luftfeuchte', fmt(w.relative_humidity, '%')],
    ['Luftdruck', fmt(w.pressure_msl, 'hPa')],
    ['Niederschlag (1 h)', fmt(w.precipitation_60 ?? pick(w, 'precipitation'), 'mm', 1)],
    ['Bewölkung', fmt(w.cloud_cover, '%')],
    ['Sicht', w.visibility == null ? '–' : `${round(w.visibility / 1000, 1)} km`],
    ['Taupunkt', fmt(w.dew_point, '°C', 1)],
  ];
  $('cur-details').innerHTML = items
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');
}

// ---------- Vorhersage ----------
async function renderForecast(place) {
  const now = new Date();
  const start = berlinDate(now);
  const end = berlinDate(new Date(now.getTime() + 8 * 864e5));
  const data = await getJSON(
    `${BRIGHTSKY}/weather?lat=${place.lat}&lon=${place.lon}&date=${start}&last_date=${end}&tz=${TZ}`
  );
  const hours = data.weather || [];

  // 24 Stunden ab jetzt
  const upcoming = hours.filter((h) => new Date(h.timestamp) >= new Date(now.getTime() - 36e5)).slice(0, 24);
  $('hourly').innerHTML = upcoming.map((h) => {
    const t = new Date(h.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', timeZone: TZ });
    const p = h.precipitation_probability != null ? `${h.precipitation_probability} %`
      : h.precipitation ? `${round(h.precipitation, 1)} mm` : '';
    return `<div class="hour"><div>${t}</div><span class="i">${icon(h.icon)}</span>
      <strong>${round(h.temperature)}°</strong><div class="p">${p}</div></div>`;
  }).join('');

  // Tageswerte aus Stundenwerten
  const days = new Map();
  for (const h of hours) {
    const key = h.timestamp.slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(h);
  }
  const summary = [...days.entries()].slice(0, 7).map(([date, list]) => {
    const temps = list.map((h) => h.temperature).filter((t) => t != null);
    const rain = list.reduce((s, h) => s + (h.precipitation || 0), 0);
    const probs = list.map((h) => h.precipitation_probability).filter((p) => p != null);
    // häufigstes Symbol tagsüber (9–18 Uhr)
    const daytime = list.filter((h) => { const hr = +h.timestamp.slice(11, 13); return hr >= 9 && hr <= 18; });
    const counts = {};
    for (const h of (daytime.length ? daytime : list)) counts[h.icon] = (counts[h.icon] || 0) + 1;
    const ic = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      date, icon: ic, rain,
      min: temps.length ? Math.min(...temps) : null,
      max: temps.length ? Math.max(...temps) : null,
      prob: probs.length ? Math.max(...probs) : null,
    };
  }).filter((d) => d.min != null);

  const lo = Math.min(...summary.map((d) => d.min));
  const hi = Math.max(...summary.map((d) => d.max));
  const span = Math.max(hi - lo, 1);
  $('daily').innerHTML = summary.map((d, i) => {
    const label = i === 0 ? 'Heute' : new Date(`${d.date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const left = ((d.min - lo) / span) * 100;
    const width = ((d.max - d.min) / span) * 100;
    const rain = d.prob != null ? `💧 ${d.prob} % · ${round(d.rain, 1)} mm` : `💧 ${round(d.rain, 1)} mm`;
    return `<div class="day"><strong>${label}</strong><span class="i">${icon(d.icon)}</span>
      <div class="range"><span>${round(d.min)}°</span><div class="bar"><span style="left:${left}%;width:${Math.max(width, 2)}%"></span></div><span>${round(d.max)}°</span></div>
      <span class="rain">${rain}</span></div>`;
  }).join('');
}

// ---------- Warnungen ----------
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderAlerts(place) {
  const box = $('alerts');
  const data = await getJSON(`${BRIGHTSKY}/alerts?lat=${place.lat}&lon=${place.lon}&tz=${TZ}`);
  const alerts = data.alerts || [];
  if (!alerts.length) { box.hidden = true; box.innerHTML = ''; return; }
  const opts = { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ };
  box.innerHTML = alerts.map((a) => {
    const from = a.onset ? new Date(a.onset).toLocaleString('de-DE', opts) : '';
    const to = a.expires ? new Date(a.expires).toLocaleString('de-DE', opts) : 'auf Weiteres';
    return `<article class="alert ${escapeHTML(a.severity)}">
      <h3>⚠️ ${escapeHTML(a.headline_de || a.event_de)}</h3>
      <p class="muted">${escapeHTML(from)} – ${escapeHTML(to)}</p>
      <p>${escapeHTML(a.description_de)}</p>
      ${a.instruction_de ? `<details><summary>Handlungsempfehlung</summary><p>${escapeHTML(a.instruction_de)}</p></details>` : ''}
    </article>`;
  }).join('');
  box.hidden = false;
}

// ---------- Karte ----------
const map = L.map('map', { zoomSnap: 0.5 }).setView([51.2, 10.4], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 12, attribution: '© OpenStreetMap',
}).addTo(map);
const wms = (layer) => L.tileLayer.wms(DWD_WMS, {
  layers: layer, format: 'image/png', transparent: true, opacity: 0.7, attribution: 'Datenbasis: DWD',
});
const layers = { radar: wms('dwd:Niederschlagsradar'), warn: wms('dwd:Warnungen_Gemeinden') };
let activeLayer = 'radar';
layers.radar.addTo(map);
let marker = null;

document.querySelectorAll('.map-toggle button').forEach((btn) => {
  btn.addEventListener('click', () => {
    map.removeLayer(layers[activeLayer]);
    activeLayer = btn.dataset.layer;
    layers[activeLayer].addTo(map);
    document.querySelectorAll('.map-toggle button').forEach((b) => b.classList.toggle('active', b === btn));
  });
});

// Radar alle 5 Minuten neu laden
setInterval(() => layers[activeLayer].setParams({ _t: Date.now() }), 5 * 60e3);

// ---------- Laden ----------
let currentPlace = null;

async function show(place, { moveMap = true } = {}) {
  currentPlace = place;
  savePlace(place);
  $('place').textContent = place.name;
  document.querySelectorAll('#favorites button').forEach((b) => b.classList.toggle('active', b.textContent === place.name));
  document.title = `${place.name} – Deutschlandwetter`;
  if (marker) marker.remove();
  marker = L.marker([place.lat, place.lon]).addTo(map).bindTooltip(place.name);
  if (moveMap) map.setView([place.lat, place.lon], Math.max(map.getZoom(), 7));

  const tasks = [
    [renderCurrent, 'cur-details'],
    [renderForecast, 'daily'],
    [renderAlerts, null],
  ];
  await Promise.all(tasks.map(async ([fn, target]) => {
    try { await fn(place); } catch (err) {
      console.error(err);
      if (target) $(target).innerHTML = `<p class="error">Daten konnten nicht geladen werden (${escapeHTML(err.message)}).</p>`;
    }
  }));
}

// Schnellwahl
for (const fav of FAVORITES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = fav.name;
  btn.addEventListener('click', () => show(fav));
  $('favorites').appendChild(btn);
}

// Ortssuche
const sugg = $('suggestions');
async function geocode(q) {
  const data = await getJSON(`${GEOCODE}?name=${encodeURIComponent(q)}&count=6&language=de&countryCode=DE`);
  return (data.results || []).map((r) => ({
    name: r.name, lat: r.latitude, lon: r.longitude,
    label: [r.name, r.admin1].filter(Boolean).join(', '),
  }));
}

function showSuggestions(list) {
  if (!list.length) { sugg.hidden = true; return; }
  sugg.innerHTML = '';
  for (const p of list) {
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.textContent = p.label;
    const choose = () => { sugg.hidden = true; $('q').value = p.label; show({ name: p.name, lat: p.lat, lon: p.lon }); };
    li.addEventListener('click', choose);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') choose(); });
    sugg.appendChild(li);
  }
  sugg.hidden = false;
}

let debounce;
$('q').addEventListener('input', (e) => {
  clearTimeout(debounce);
  const q = e.target.value.trim();
  if (q.length < 2) { sugg.hidden = true; return; }
  debounce = setTimeout(() => geocode(q).then(showSuggestions).catch(() => {}), 250);
});

$('search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (!q) return;
  try {
    const [first] = await geocode(q);
    sugg.hidden = true;
    if (first) show({ name: first.name, lat: first.lat, lon: first.lon });
    else alert(`Kein Ort „${q}" in Deutschland gefunden.`);
  } catch (err) { alert(`Ortssuche fehlgeschlagen: ${err.message}`); }
});

document.addEventListener('click', (e) => { if (!$('search').contains(e.target)) sugg.hidden = true; });

$('locate').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('Standortbestimmung wird nicht unterstützt.');
  navigator.geolocation.getCurrentPosition(
    (pos) => show({ name: 'Mein Standort', lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4) }),
    (err) => alert(`Standort nicht verfügbar: ${err.message}`)
  );
});

// Klick in die Karte wählt einen Ort
map.on('click', (e) => show({ name: `${e.latlng.lat.toFixed(2)}° N, ${e.latlng.lng.toFixed(2)}° O`, lat: +e.latlng.lat.toFixed(4), lon: +e.latlng.lng.toFixed(4) }));

// Daten alle 15 Minuten aktualisieren
setInterval(() => currentPlace && show(currentPlace, { moveMap: false }), 15 * 60e3);

show(loadPlace());
