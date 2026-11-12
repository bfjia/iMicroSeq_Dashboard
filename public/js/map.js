// Coverage map: Leaflet (loaded only when needed), Canada outline, one marker per location.
import { ACTIVE_COLOR, HISTORICAL_COLOR, ACTIVE_DAYS } from './config.js';
import { fmt } from './charts.js';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet';
const TOOLTIP_SITES = 8; // a merged marker's hover list shows this many sites; the click list shows all

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

  // Sites at the same spot (e.g. several placed at one province capital) share one marker.
  let approx = 0;
  const spots = new Map();
  for (const s of sites) {
    let { lat, lon } = s;
    if (lat == null || lon == null) {
      const cap = caps[s.province];
      if (!cap) continue;
      [lat, lon] = cap;
      approx++;
    }
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (!spots.has(key)) spots.set(key, { lat, lon, sites: [], count: 0, active: false });
    const p = spots.get(key);
    p.sites.push(s);
    p.count += s.count;
    p.active ||= s.active;
  }

  const max = Math.max(1, ...[...spots.values()].map((p) => p.count));
  // Historical first so active spots draw on top.
  const ordered = [...spots.values()].sort((a, b) => a.active - b.active || b.count - a.count);
  for (const p of ordered) {
    p.sites.sort((a, b) => b.count - a.count);
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 3.2 + 9.6 * Math.sqrt(p.count / max),
      fillColor: p.active ? ACTIVE_COLOR : HISTORICAL_COLOR,
      fillOpacity: p.active ? 0.85 : 0.75,
      color: '#ffffff', // surface ring so overlapping markers stay distinct
      weight: 1.5,
    }).addTo(map);
    const line = (s) => `<strong>${escapeHtml(s.name)}</strong><br>${fmt(s.count)} samples · ${s.active ? 'Active' : 'Historical'}`;
    const link = (s) => `dashboard.html?site=${encodeURIComponent(s.name)}#viral`;
    if (p.sites.length === 1) {
      const s = p.sites[0];
      marker.bindTooltip(`${line(s)}<br><span class="coverage-tooltip-hint">Click to see viral loads for this site</span>`,
        { direction: 'top', className: 'coverage-tooltip' });
      marker.on('click', () => { location.href = link(s); });
      continue;
    }
    // Several sites: hover lists them (first few), click opens a list with a viral loads link per site.
    const shown = p.sites.slice(0, TOOLTIP_SITES);
    const more = p.sites.length - shown.length;
    marker.bindTooltip(
      `<span class="coverage-tooltip-hint">${p.sites.length} sites here · ${fmt(p.count)} samples</span>` +
        shown.map((s) => `<div class="coverage-site">${line(s)}</div>`).join('') +
        (more ? `<div class="coverage-site">+ ${more} more site${more === 1 ? '' : 's'}</div>` : '') +
        '<span class="coverage-tooltip-hint">Click to see viral loads for these sites</span>',
      { direction: 'top', className: 'coverage-tooltip' },
    );
    marker.bindPopup(
      `<span class="coverage-tooltip-hint">${p.sites.length} sites here · ${fmt(p.count)} samples</span>` +
        p.sites.map((s) => `<div class="coverage-site">${line(s)}<br><a href="${link(s)}">See viral loads for this site</a></div>`).join(''),
      { className: 'coverage-popup', maxHeight: 300 },
    );
    marker.on('popupopen', () => marker.closeTooltip());
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
