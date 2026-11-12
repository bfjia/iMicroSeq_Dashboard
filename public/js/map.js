// Coverage map: Leaflet (loaded only when needed), Canada outline, one marker per location.
import { ACTIVE_COLOR, HISTORICAL_COLOR, ACTIVE_DAYS, MAP_VIRAL_MIN_SAMPLES, PORTAL_EXPLORER_URL } from './config.js';
import { fmt } from './charts.js';
import { and, isIn } from './api.js';

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
    const viral = (s) => `dashboard.html?site=${encodeURIComponent(s.name)}#viral`;
    const portal = (s) => `${PORTAL_EXPLORER_URL}?filters=${encodeURIComponent(JSON.stringify(and(isIn('geo_loc_name_site', [s.key]))))}`;
    const links = (s) => (s.count >= MAP_VIRAL_MIN_SAMPLES ? `<br><a href="${viral(s)}">See viral loads for this site</a>` : '') +
      `<br><a href="${portal(s)}" target="_blank" rel="noopener">Browse this site's data on the portal ↗</a>`;
    const many = p.sites.length > 1;
    const head = `<span class="coverage-tooltip-hint">${p.sites.length} sites here · ${fmt(p.count)} samples`;
    const hint = `<span class="coverage-tooltip-hint">Click for links to ${many ? 'these sites' : 'this site'}</span>`;
    // Hover: details (several sites: all listed, the list scrolls). Click: a popup with the links per site.
    marker.bindTooltip(
      many
        ? `${head}${p.sites.length > 4 ? ' · scroll for more' : ''}</span>` +
            `<div class="coverage-list">${p.sites.map((s) => `<div class="coverage-site">${line(s)}</div>`).join('')}</div>${hint}`
        : `${line(p.sites[0])}<br>${hint}`,
      { direction: 'top', className: 'coverage-tooltip' },
    );
    marker.bindPopup(
      (many ? `${head}</span>` : '') + p.sites.map((s) => `<div class="coverage-site">${line(s)}${links(s)}</div>`).join(''),
      { className: 'coverage-popup', maxHeight: 300 },
    );
    marker.on('popupopen', () => marker.closeTooltip());
  }

  // Tooltips open below markers in the top half of the map and above the rest, so they stay on the map.
  // A tooltip ignores the mouse, so while one with a long site list is open the wheel scrolls that list.
  let list = null;
  map.on('tooltipopen', (e) => {
    const t = e.tooltip;
    const below = map.latLngToContainerPoint(t.getLatLng()).y < map.getSize().y / 2;
    if (t.options.direction !== (below ? 'bottom' : 'top')) {
      t.options.direction = below ? 'bottom' : 'top';
      t.update();
    }
    list = t.getElement().querySelector('.coverage-list');
  });
  map.on('tooltipclose', () => { list = null; });
  el.addEventListener('wheel', (e) => {
    if (!list || list.scrollHeight <= list.clientHeight) return;
    e.preventDefault();
    e.stopPropagation(); // not a map zoom
    list.scrollTop += e.deltaY;
  }, { passive: false, capture: true });

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
