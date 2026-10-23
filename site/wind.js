'use strict';

// Datenquellen (frei, ohne API-Key, CORS-fähig):
// - Open-Meteo Forecast: Wind, Druck und Tageswerte; "best_match" nutzt für die Niederlande
//   KNMI HARMONIE und für Deutschland DWD ICON. Isobarenkarte: DWD ICON (icon_seamless).
// - Open-Meteo Marine: Wellenhöhe, -richtung und -periode.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const TZ = 'Europe/Berlin';
const DAYS = 10;
const UNIT_KEY = 'wetter.windunit';
const SPOT_KEY = 'wetter.windspot';

// Koordinaten leicht seewärts, damit auch Wellendaten verfügbar sind.
const SPOTS = [
  { group: 'Niederlande', name: 'Vlissingen', lat: 51.45, lon: 3.48 },
  { group: 'Niederlande', name: 'Scheveningen', lat: 52.11, lon: 4.24 },
  { group: 'Niederlande', name: 'IJmuiden', lat: 52.47, lon: 4.50 },
  { group: 'Niederlande', name: 'Den Helder', lat: 52.97, lon: 4.66 },
  { group: 'Niederlande', name: 'Terschelling', lat: 53.44, lon: 5.30 },
  { group: 'Deutsche Nordsee', name: 'Borkum', lat: 53.60, lon: 6.62 },
  { group: 'Deutsche Nordsee', name: 'Norderney', lat: 53.73, lon: 7.15 },
  { group: 'Deutsche Nordsee', name: 'Helgoland', lat: 54.18, lon: 7.88 },
  { group: 'Deutsche Nordsee', name: 'Cuxhaven', lat: 53.92, lon: 8.62 },
  { group: 'Deutsche Nordsee', name: 'St. Peter-Ording', lat: 54.32, lon: 8.55 },
  { group: 'Deutsche Nordsee', name: 'Sylt', lat: 54.91, lon: 8.24 },
];

// Raster für die Isobarenkarte (Nordatlantik/Europa)
const GRID = { lat0: 42, lat1: 66, lon0: -24, lon1: 24, step: 2 };
const ISO_STEP = 5; // hPa

// Beaufort-Grenzen in Knoten und Farben
const BFT_KN = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
const BFT_COLORS = ['#eef6fb', '#d4ecf7', '#b3e0f2', '#8fd3e8', '#7fd6a8', '#b4e06a', '#f0e14a',
  '#f7b733', '#f58a2c', '#ec5a2b', '#d6332b', '#b0174a', '#7a0f6b'];
const WMO = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌧️', 57: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️', 77: '❄️', 80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '🌨️', 86: '❄️', 95: '⛈️', 96: '⛈️', 99: '⛈️',
};

const $ = (id) => document.getElementById(id);
const bft = (kn) => (kn == null ? null : BFT_KN.filter((t) => kn >= t).length);
const bftColor = (kn) => BFT_COLORS[bft(kn) ?? 0];
const dec = (v, d = 0) => (v == null ? '–' : Number(v).toFixed(d).replace('.', ','));
const compass = (deg) => (deg == null ? '' : ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]);
// Pfeil zeigt in Zugrichtung: Wind aus Nord (0°) weht nach Süd ↓
const arrow = (deg) => (deg == null ? '' : `<span class="arr" style="transform:rotate(${Math.round(deg)}deg)">↓</span>`);

let unit = 'kn';
try { unit = localStorage.getItem(UNIT_KEY) || 'kn'; } catch (_) { /* ignore */ }
$('unit').value = unit;

function speed(kn) {
  if (kn == null) return '–';
  switch (unit) {
    case 'bft': return String(bft(kn));
    case 'kmh': return dec(kn * 1.852);
    case 'ms': return dec(kn * 0.5144, 1);
    default: return dec(kn);
  }
}
const UNIT_LABEL = { kn: 'kn', bft: 'Bft', kmh: 'km/h', ms: 'm/s' };
const chartValue = (kn) => (kn == null ? null : unit === 'kmh' ? kn * 1.852 : unit === 'ms' ? kn * 0.5144 : unit === 'bft' ? bft(kn) : kn);

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
const asList = (data) => (Array.isArray(data) ? data : [data]);

function dayLabel(date, i) {
  if (i === 0) return 'Heute';
  return new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function showError(el, err) {
  console.error(err);
  el.innerHTML = `<p class="error">Daten konnten nicht geladen werden (${String(err.message).replace(/</g, '&lt;')}).</p>`;
}

// ---------- Daten laden ----------
let spotData = [];   // Forecast je Spot
let marineData = []; // Marine je Spot (kann null sein)

async function loadSpots() {
  const lat = SPOTS.map((s) => s.lat).join(',');
  const lon = SPOTS.map((s) => s.lon).join(',');
  const fc = getJSON(`${FORECAST}?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(TZ)}` +
    `&forecast_days=${DAYS}&wind_speed_unit=kn` +
    '&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,' +
    'wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant');
  const ma = getJSON(`${MARINE}?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(TZ)}` +
    '&forecast_days=8&hourly=wave_height,wave_direction,wave_period&daily=wave_height_max')
    .then(asList).catch((err) => { console.warn('Marine', err); return []; });
  spotData = asList(await fc);
  marineData = await ma;
}

// ---------- Übersicht ----------
let selected = 0;
try {
  const s = Number(localStorage.getItem(SPOT_KEY));
  if (s >= 0 && s < SPOTS.length) selected = s;
} catch (_) { /* ignore */ }

function renderOverview() {
  const dates = spotData[0].daily.time;
  let html = `<thead><tr><th class="spot">Ort</th>${dates.map((d, i) => `<th>${dayLabel(d, i)}</th>`).join('')}</tr></thead><tbody>`;
  let group = null;
  SPOTS.forEach((spot, si) => {
    if (spot.group !== group) {
      group = spot.group;
      html += `<tr class="group"><th class="spot" colspan="${dates.length + 1}">${group}</th></tr>`;
    }
    const d = spotData[si].daily;
    html += `<tr data-spot="${si}" class="${si === selected ? 'selected' : ''}"><th class="spot">${spot.name}</th>`;
    dates.forEach((_, i) => {
      const kn = d.wind_speed_10m_max[i];
      html += `<td style="background:${bftColor(kn)}" title="${compass(d.wind_direction_10m_dominant[i])} ${dec(kn)} kn, Bft ${bft(kn) ?? '–'}, Böen ${dec(d.wind_gusts_10m_max[i])} kn">
        ${arrow(d.wind_direction_10m_dominant[i])} <span class="v">${speed(kn)}</span>
        <span class="g">${speed(d.wind_gusts_10m_max[i])}</span></td>`;
    });
    html += '</tr>';
  });
  $('overview').innerHTML = `${html}</tbody>`;
  $('overview').querySelectorAll('tr[data-spot]').forEach((tr) => {
    tr.addEventListener('click', () => {
      selected = Number(tr.dataset.spot);
      try { localStorage.setItem(SPOT_KEY, String(selected)); } catch (_) { /* ignore */ }
      $('overview').querySelectorAll('tr[data-spot]').forEach((r) => r.classList.toggle('selected', r === tr));
      renderDetail();
      $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $('legend').innerHTML = BFT_COLORS.map((c, i) => `<span style="background:${c}">${i} Bft${i ? ` ≥ ${BFT_KN[i - 1]} kn` : ''}</span>`).join('');
}

// ---------- Detail ----------
let windChart = null;
let waveChart = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function timeLabels(times) {
  return times.map((t) => {
    const d = new Date(`${t}:00`);
    return d.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  });
}

function baseOptions() {
  const text = cssVar('--muted');
  const grid = cssVar('--border');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: text, boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: text, maxRotation: 0, autoSkip: true, maxTicksLimit: window.innerWidth < 600 ? 4 : 8 }, grid: { color: grid } },
    },
  };
}

function renderDetail() {
  const spot = SPOTS[selected];
  const fc = spotData[selected];
  const ma = marineData[selected];
  $('spot-name').textContent = `${spot.name} (${spot.group})`;
  $('spot-info').textContent = `${spot.lat.toFixed(2)}° N, ${spot.lon.toFixed(2)}° O · Modell: Open-Meteo best match (${spot.group === 'Niederlande' ? 'KNMI HARMONIE / ' : ''}DWD ICON)`;

  // stündlich ab der aktuellen Stunde
  const now = Date.now() - 36e5;
  const h = fc.hourly;
  const start = Math.max(0, h.time.findIndex((t) => new Date(`${t}:00`).getTime() >= now));
  const sl = (arr) => arr.slice(start);
  const times = sl(h.time);
  const wind = sl(h.wind_speed_10m);
  const dirs = sl(h.wind_direction_10m);
  const ul = UNIT_LABEL[unit];

  const opts = baseOptions();
  opts.scales.y = { title: { display: true, text: ul, color: cssVar('--muted') }, ticks: { color: cssVar('--muted') }, grid: { color: cssVar('--border') }, beginAtZero: true };
  opts.scales.y1 = { position: 'right', title: { display: true, text: 'hPa', color: cssVar('--muted') }, ticks: { color: cssVar('--muted') }, grid: { drawOnChartArea: false } };
  opts.plugins.tooltip = {
    callbacks: {
      afterBody: (items) => {
        const i = items[0].dataIndex;
        return `Richtung: ${compass(dirs[i])} (${dirs[i] ?? '–'}°) · Bft ${bft(wind[i]) ?? '–'}`;
      },
    },
  };

  if (windChart) windChart.destroy();
  windChart = new Chart($('wind-chart'), {
    type: 'line',
    data: {
      labels: timeLabels(times),
      datasets: [
        {
          label: `Mittelwind (${ul})`, data: wind.map(chartValue), yAxisID: 'y',
          borderColor: cssVar('--accent'), backgroundColor: cssVar('--accent'), borderWidth: 2, tension: 0.3,
          pointStyle: 'triangle', pointRotation: (c) => (dirs[c.dataIndex] ?? 0) + 180,
          pointRadius: (c) => (c.dataIndex % (window.innerWidth < 600 ? 6 : 3) === 0 ? 5 : 0),
        },
        {
          label: `Böen (${ul})`, data: sl(h.wind_gusts_10m).map(chartValue), yAxisID: 'y',
          borderColor: '#ec5a2b', backgroundColor: '#ec5a2b', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.3,
        },
        {
          label: 'Luftdruck (hPa)', data: sl(h.pressure_msl), yAxisID: 'y1',
          borderColor: '#8e7cc3', backgroundColor: '#8e7cc3', borderWidth: 1.5, pointRadius: 0, tension: 0.3,
        },
      ],
    },
    options: opts,
  });

  // Wellen
  const waveBox = $('wave-box');
  const hasWaves = ma && ma.hourly && ma.hourly.wave_height && ma.hourly.wave_height.some((v) => v != null);
  waveBox.hidden = !hasWaves;
  if (waveChart) { waveChart.destroy(); waveChart = null; }
  if (hasWaves) {
    const mh = ma.hourly;
    const ms = Math.max(0, mh.time.findIndex((t) => new Date(`${t}:00`).getTime() >= now));
    const wopts = baseOptions();
    wopts.scales.y = { title: { display: true, text: 'm', color: cssVar('--muted') }, ticks: { color: cssVar('--muted') }, grid: { color: cssVar('--border') }, beginAtZero: true };
    wopts.scales.y1 = { position: 'right', title: { display: true, text: 's', color: cssVar('--muted') }, ticks: { color: cssVar('--muted') }, grid: { drawOnChartArea: false } };
    waveChart = new Chart($('wave-chart'), {
      type: 'line',
      data: {
        labels: timeLabels(mh.time.slice(ms)),
        datasets: [
          { label: 'Wellenhöhe (m)', data: mh.wave_height.slice(ms), yAxisID: 'y', borderColor: '#1e88e5', backgroundColor: 'rgba(30,136,229,.2)', fill: true, pointRadius: 0, tension: 0.3 },
          { label: 'Periode (s)', data: (mh.wave_period || []).slice(ms), yAxisID: 'y1', borderColor: '#43a047', backgroundColor: '#43a047', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        ],
      },
      options: wopts,
    });
  }

  // Tagesprognose
  const d = fc.daily;
  const waveMax = ma && ma.daily ? ma.daily.wave_height_max : [];
  let rows = '<thead><tr><th></th><th></th><th>Temp.</th><th>Wind</th><th>Böen</th><th>Bft</th><th>Regen</th><th>Welle</th></tr></thead><tbody>';
  d.time.forEach((date, i) => {
    const kn = d.wind_speed_10m_max[i];
    rows += `<tr><td class="l">${dayLabel(date, i)}</td><td>${WMO[d.weather_code[i]] || '❔'}</td>
      <td>${dec(d.temperature_2m_min[i])}° / ${dec(d.temperature_2m_max[i])}°</td>
      <td>${arrow(d.wind_direction_10m_dominant[i])} ${compass(d.wind_direction_10m_dominant[i])} ${speed(kn)} ${ul}</td>
      <td>${speed(d.wind_gusts_10m_max[i])} ${ul}</td>
      <td><span class="bft" style="background:${bftColor(kn)}">${bft(kn) ?? '–'}</span></td>
      <td>${dec(d.precipitation_sum[i], 1)} mm</td>
      <td>${waveMax && waveMax[i] != null ? `${dec(waveMax[i], 1)} m` : '–'}</td></tr>`;
  });
  $('daily-table').innerHTML = `${rows}</tbody>`;
}

// ---------- Isobarenkarte ----------
const isoMap = L.map('isomap', { zoomSnap: 0.5, worldCopyJump: false }).setView([54, 4], 4.5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 9, attribution: '© OpenStreetMap' }).addTo(isoMap);
const isoLayer = L.layerGroup().addTo(isoMap);
const windLayer = L.layerGroup().addTo(isoMap);
SPOTS.forEach((s) => L.marker([s.lat, s.lon], {
  icon: L.divIcon({ className: '', html: '<div class="spot-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
}).bindTooltip(s.name).addTo(isoMap));

const lats = [];
const lons = [];
for (let la = GRID.lat0; la <= GRID.lat1; la += GRID.step) lats.push(la);
for (let lo = GRID.lon0; lo <= GRID.lon1; lo += GRID.step) lons.push(lo);
const NX = lons.length;
const NY = lats.length;
let grid = null; // { times, steps, p[t][j][i], ws, wd }

async function loadGrid() {
  const la = [];
  const lo = [];
  for (const y of lats) for (const x of lons) { la.push(y); lo.push(x); }
  const data = asList(await getJSON(`${FORECAST}?latitude=${la.join(',')}&longitude=${lo.join(',')}` +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=7&models=icon_seamless&wind_speed_unit=kn` +
    '&hourly=pressure_msl,wind_speed_10m,wind_direction_10m'));
  const times = data[0].hourly.time;
  const now = Date.now() - 36e5;
  const steps = [];
  times.forEach((t, k) => {
    const ms = new Date(`${t}:00`).getTime();
    if (ms >= now && Number(t.slice(11, 13)) % 3 === 0) steps.push(k);
  });
  const at = (k, field) => {
    const rows = [];
    for (let j = 0; j < NY; j++) {
      const row = [];
      for (let i = 0; i < NX; i++) row.push(data[j * NX + i].hourly[field][k]);
      rows.push(row);
    }
    return rows;
  };
  grid = { times, steps, at };
  $('time').max = String(steps.length - 1);
}

// Bilineare Verfeinerung des Rasters für glattere Isobaren
const F = 4;
function upsample(rows) {
  const nx = (NX - 1) * F + 1;
  const ny = (NY - 1) * F + 1;
  const out = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    const j = Math.min(Math.floor(y / F), NY - 2);
    const fy = y / F - j;
    for (let x = 0; x < nx; x++) {
      const i = Math.min(Math.floor(x / F), NX - 2);
      const fx = x / F - i;
      const v = rows[j][i] * (1 - fx) * (1 - fy) + rows[j][i + 1] * fx * (1 - fy)
        + rows[j + 1][i] * (1 - fx) * fy + rows[j + 1][i + 1] * fx * fy;
      out[y * nx + x] = v;
    }
  }
  return { values: out, nx, ny };
}

function renderIsobars() {
  if (!grid || !grid.steps.length) return;
  const idx = Number($('time').value);
  const k = grid.steps[idx];
  $('time-label').textContent = new Date(`${grid.times[k]}:00`).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr';

  isoLayer.clearLayers();
  const p = grid.at(k, 'pressure_msl');
  if (p.some((row) => row.some((v) => v == null))) return;
  const { values, nx, ny } = upsample(p);
  const min = Math.floor(d3.min(values) / ISO_STEP) * ISO_STEP;
  const max = Math.ceil(d3.max(values) / ISO_STEP) * ISO_STEP;
  const levels = d3.range(min, max + ISO_STEP, ISO_STEP);
  const res = GRID.step / F;
  const eps = 1e-6;
  const onBorder = ([x, y]) => x <= eps || y <= eps || x >= nx - eps || y >= ny - eps;
  const toLatLng = ([x, y]) => [GRID.lat0 + (y - 0.5) * res, GRID.lon0 + (x - 0.5) * res];

  d3.contours().size([nx, ny]).thresholds(levels)(values).forEach((c) => {
    const bold = c.value % 20 === 0;
    c.coordinates.forEach((poly) => poly.forEach((ring) => {
      // Ring in Linienstücke zerlegen und Kanten am Rasterrand weglassen
      const lines = [];
      let cur = [];
      ring.forEach((pt) => {
        if (onBorder(pt)) { if (cur.length > 1) lines.push(cur); cur = []; } else cur.push(toLatLng(pt));
      });
      if (cur.length > 1) lines.push(cur);
      lines.forEach((line) => {
        L.polyline(line, { color: '#37474f', weight: bold ? 2 : 1.2, opacity: 0.85, interactive: false }).addTo(isoLayer);
        if (line.length > 20) {
          L.marker(line[Math.floor(line.length / 2)], {
            interactive: false,
            icon: L.divIcon({ className: 'iso-label', html: String(c.value), iconSize: [36, 14], iconAnchor: [18, 7] }),
          }).addTo(isoLayer);
        }
      });
    }));
  });

  // Hoch- und Tiefdruckzentren (lokale Extrema im groben Raster)
  const R = 2;
  for (let j = 1; j < NY - 1; j++) {
    for (let i = 1; i < NX - 1; i++) {
      const v = p[j][i];
      let isMax = true;
      let isMin = true;
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          if (!dj && !di) continue;
          const w = p[j + dj] && p[j + dj][i + di];
          if (w == null) continue;
          if (w >= v) isMax = false;
          if (w <= v) isMin = false;
        }
      }
      if ((isMax && v >= 1015) || (isMin && v <= 1010)) {
        const cls = isMax ? 'h' : 't';
        L.marker([lats[j], lons[i]], {
          interactive: false,
          icon: L.divIcon({ className: `hl-label ${cls}`, html: `${isMax ? 'H' : 'T'}<small>${Math.round(v)}</small>`, iconSize: [40, 36], iconAnchor: [20, 18] }),
        }).addTo(isoLayer);
      }
    }
  }

  // Windpfeile
  windLayer.clearLayers();
  if ($('show-wind').checked) {
    const ws = grid.at(k, 'wind_speed_10m');
    const wd = grid.at(k, 'wind_direction_10m');
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        if (ws[j][i] == null || wd[j][i] == null) continue;
        L.marker([lats[j], lons[i]], {
          interactive: false,
          icon: L.divIcon({
            className: 'wind-arrow',
            html: `<span style="display:inline-block;color:${BFT_COLORS[Math.max(bft(ws[j][i]), 4)]};filter:brightness(.8);transform:rotate(${Math.round(wd[j][i])}deg)">⬇</span>`,
            iconSize: [18, 18], iconAnchor: [9, 9],
          }),
        }).addTo(windLayer);
      }
    }
  }
}

$('time').addEventListener('input', renderIsobars);
$('show-wind').addEventListener('change', renderIsobars);
let playTimer = null;
$('play').addEventListener('click', () => {
  if (playTimer) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
  $('play').textContent = '⏸';
  playTimer = setInterval(() => {
    const t = $('time');
    t.value = String((Number(t.value) + 1) % (Number(t.max) + 1));
    renderIsobars();
  }, 700);
});

$('unit').addEventListener('change', (e) => {
  unit = e.target.value;
  try { localStorage.setItem(UNIT_KEY, unit); } catch (_) { /* ignore */ }
  if (spotData.length) { renderOverview(); renderDetail(); }
});

// ---------- Start ----------
loadSpots()
  .then(() => { renderOverview(); renderDetail(); })
  .catch((err) => { showError($('overview'), err); });
loadGrid()
  .then(renderIsobars)
  .catch((err) => { showError($('time-label'), err); });
