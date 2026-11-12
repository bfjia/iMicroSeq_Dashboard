// Coverage map: Leaflet (loaded only when needed), Canada outline, one marker per site.
import { ACTIVE_COLOR, HISTORICAL_COLOR, ACTIVE_DAYS } from './config.js';
import { fmt } from './charts.js';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet';

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = `${LEAFLET}.css`;
  document.head.append(css);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${LEAFLET}.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the map library'));
    document.head.append(s);
  });
}

// Province capital for sites without GPS: { "Alberta": [lat, lon], … }
async function capitals() {
  try {
    const text = await (await fetch('data/ProvinceCapitalCoords.csv')).text();
    const out = {};
    for (const line of text.trim().split('\n').slice(1)) {
      const [name, lat, lon] = line.split(',');
      out[name.split(' [')[0].trim()] = [parseFloat(lat), parseFloat(lon)];
    }
    return out;
  } catch {
    return {};
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Draws the map; returns how many sites were placed at a province capital.
export async function drawMap(el, sites) {
  const [, caps, outline] = await Promise.all([
    loadLeaflet(),
    capitals(),
    fetch('data/CAN.geo.json').then((r) => r.json()).catch(() => null),
  ]);
  const L = window.L;
  const map = L.map(el, { preferCanvas: true, scrollWheelZoom: false }).setView([60, -96], 3);
  L.tileLayer('/tiles/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);
  if (outline) {
    L.geoJSON(outline, { style: { fillColor: '#D80621', color: '#a00', weight: 1.5, fillOpacity: 0.08 }, interactive: false }).addTo(map);
  }

  let approx = 0;
  const max = Math.max(1, ...sites.map((s) => s.count));
  // Historical first so active sites draw on top.
  const ordered = [...sites].sort((a, b) => a.active - b.active || b.count - a.count);
  for (const s of ordered) {
    let { lat, lon } = s;
    if (lat == null || lon == null) {
      const cap = caps[s.province];
      if (!cap) continue;
      [lat, lon] = cap;
      approx++;
    }
    const marker = L.circleMarker([lat, lon], {
      radius: 4 + 12 * Math.sqrt(s.count / max),
      fillColor: s.active ? ACTIVE_COLOR : HISTORICAL_COLOR,
      fillOpacity: s.active ? 0.85 : 0.75,
      color: '#ffffff', // surface ring so overlapping markers stay distinct
      weight: 1.5,
    }).addTo(map);
    marker.bindTooltip(
      `<strong>${escapeHtml(s.name)}</strong><br>${fmt(s.count)} samples · ${s.active ? 'Active' : 'Historical'}` +
        `<br><span class="coverage-tooltip-hint">Click for viral loads</span>`,
      { direction: 'top', className: 'coverage-tooltip' },
    );
    marker.on('click', () => {
      location.href = `dashboard.html?site=${encodeURIComponent(s.name)}#viral`;
    });
  }

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML =
      `<span><i style="background:${ACTIVE_COLOR}"></i>Active (sampled in last ${Math.round(ACTIVE_DAYS / 30.4)} months)</span>` +
      `<span><i style="background:${HISTORICAL_COLOR}"></i>Historical</span>` +
      '<span class="map-legend-note">Marker size = number of samples</span>';
    return div;
  };
  legend.addTo(map);
  // Enable wheel zoom only after the user clicks the map, so page scrolling isn't hijacked.
  map.once('click', () => map.scrollWheelZoom.enable());
  return approx;
}
