// Viral loads (RT-PCR): mean per date ± SEM, LOESS trend, optional PMMoV normalisation.
// Data comes from the nightly build in public/data/viral/ (scripts/build-viral-loads.mjs).
// Browser globals are only touched inside functions, so the pure helpers import fine in Node.
import { SARS2, PMMOV, LOESS_SPAN, LOESS_SPAN_MIN, LOESS_SPAN_MAX, VIRAL_ASSAY } from './config.js';
import { meanSem, mergeStat, trimBrackets, viralOrganism } from './rules.js';
import { gql, and, or, isIn, dateRange } from './api.js';
import {
  embed, colorScale, panel, failed, dataTable, getParam, setParams, linkTo, LINK_TIP, LINK_COL,
} from './charts.js';

const BASE = 'data/viral/';
const ALL = 'All';
const BLANK = '(blank)';
const TREND = 'Trend';
const LOESS_DEGREE = 2;
const DEFAULT_ORGANISMS = ['Influenza A virus', SARS2];
const PRESETS = [['3m', 3], ['6m', 6], ['12m', 12], ['All', 0]];

export const label = (v) => (v === BLANK || v === '' ? 'Not Provided' : v);
const byName = (a, b) => (a === BLANK) - (b === BLANK) || a.localeCompare(b);

// ─── LOESS (same algorithm and fallbacks as the previous app.js) ─────────────

function solve3(M, v) {
  const a = M[0][0], b = M[0][1], c = M[0][2];
  const d = M[1][0], e = M[1][1], f = M[1][2];
  const g = M[2][0], h = M[2][1], i = M[2][2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const v0 = v[0], v1 = v[1], v2 = v[2];
  return [
    (v0 * (e * i - f * h) - b * (v1 * i - v2 * f) + c * (v1 * h - v2 * e)) / det,
    (a * (v1 * i - v2 * f) - v0 * (d * i - f * g) + c * (v2 * d - v1 * g)) / det,
    (a * (e * v2 - v1 * h) - b * (d * v2 - v1 * g) + v0 * (d * h - e * g)) / det,
  ];
}

// Tricube LOESS at x[i]: q = max(degree+1, round(span*n)) nearest neighbours, weighted local polynomial.
function loessAt(x, y, i, span, degree) {
  const n = x.length;
  if (n === 0 || !Number.isFinite(y[i])) return y[i];
  const minPts = degree + 1;
  const q = Math.max(minPts, Math.min(n, Math.round(span * n)));
  if (n < minPts) return y[i];

  const distIdx = [];
  for (let j = 0; j < n; j++) distIdx.push({ j, d: Math.abs(x[j] - x[i]) });
  distIdx.sort((a, b) => a.d - b.d || a.j - b.j);
  const neighbors = [];
  for (let k = 0; k < q && k < distIdx.length; k++) neighbors.push(distIdx[k].j);

  let lambda = 0;
  for (const j of neighbors) lambda = Math.max(lambda, Math.abs(x[j] - x[i]));
  if (lambda === 0) {
    let s = 0;
    for (const j of neighbors) s += y[j];
    return s / neighbors.length;
  }

  const p = degree + 1;
  const A = Array.from({ length: p }, () => Array(p).fill(0));
  const b = Array(p).fill(0);
  for (const j of neighbors) {
    const u = Math.abs(x[j] - x[i]) / lambda;
    const wj = u >= 1 ? 0 : (1 - u ** 3) ** 3;
    if (wj === 0) continue;
    const t = x[j] - x[i];
    const tp = new Array(p);
    tp[0] = 1;
    for (let k = 1; k < p; k++) tp[k] = tp[k - 1] * t;
    for (let k = 0; k < p; k++) {
      b[k] += wj * tp[k] * y[j];
      for (let l = 0; l < p; l++) A[k][l] += wj * tp[k] * tp[l];
    }
  }
  const beta = solve3(A, b);
  if (beta == null) {
    let sum = 0;
    let sw = 0;
    for (const j of neighbors) {
      const u = Math.abs(x[j] - x[i]) / lambda;
      const wj = u >= 1 ? 0 : (1 - u ** 3) ** 3;
      sum += wj * y[j];
      sw += wj;
    }
    return sw > 0 ? sum / sw : y[i];
  }
  return beta[0];
}

export function loess(x, y, span = LOESS_SPAN, degree = LOESS_DEGREE) {
  return x.map((_, i) => loessAt(x, y, i, span, degree));
}

// Span typed by the viewer -> a number within [LOESS_SPAN_MIN, LOESS_SPAN_MAX], or null (not a number: use the default).
export function parseSpan(v) {
  const n = v == null || String(v).trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(LOESS_SPAN_MAX, Math.max(LOESS_SPAN_MIN, n)) : null;
}

// rows sorted by date -> rows with valueSmooth. fitRows (default: rows) is what the curve is fitted on.
// Loads can't be negative, so the trend is clamped at 0 (a quadratic fit can undershoot after a steep drop).
export function withTrend(rows, fitRows = rows, span = LOESS_SPAN) {
  const xs = fitRows.map((r) => Date.parse(r.date));
  const x = xs.some((v) => !Number.isFinite(v)) ? fitRows.map((_, i) => i) : xs;
  const fit = loess(x, fitRows.map((r) => r.value), span);
  const byDate = new Map(fitRows.map((r, i) => [r.date, Number.isFinite(fit[i]) ? fit[i] : r.value]));
  return rows.map((r) => ({ ...r, valueSmooth: Math.max(0, byDate.get(r.date) ?? r.value), lineType: TREND }));
}

// ─── Series from the build files ─────────────────────────────────────────────

const genesFor = (file, organism, gene) => (gene === ALL ? Object.keys(file[organism] || {}) : [gene]);

// Site file: raw values per date; genes pooled when gene = All. -> rows sorted by date.
export function siteSeries(file, organism, gene, unit, norm) {
  const byDate = new Map();
  for (const g of genesFor(file, organism, gene)) {
    const leaf = file[organism]?.[g]?.[unit];
    const vals = leaf && (norm ? leaf.r : leaf.v);
    if (!vals) continue;
    leaf.d.forEach((d, i) => {
      if (!vals[i].length) return;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(...vals[i]);
    });
  }
  return [...byDate.keys()].sort().map((date) => {
    const vals = byDate.get(date);
    const n = vals.length;
    const value = vals.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? vals.reduce((s, v) => s + (v - value) ** 2, 0) / (n - 1) : 0;
    const sem = Math.sqrt(variance) / Math.sqrt(n);
    const valuesList = vals.map((v) => (norm || Number.isInteger(v) ? String(v) : v.toFixed(4))).join(', ');
    return { date, value, sem, n, errorLow: value - sem, errorHigh: value + sem, valuesList };
  });
}

// City/province file: [n, sum, sumsq] per date, merged across genes when gene = All.
export function statSeries(file, organism, gene, unit, norm) {
  const byDate = new Map();
  for (const g of genesFor(file, organism, gene)) {
    const leaf = file[organism]?.[g]?.[unit];
    const stats = leaf && (norm ? leaf.r : leaf.v);
    if (!stats) continue;
    leaf.d.forEach((d, i) => {
      if (!stats[i] || !stats[i][0]) return;
      if (!byDate.has(d)) byDate.set(d, [0, 0, 0]);
      mergeStat(byDate.get(d), stats[i]);
    });
  }
  return [...byDate.keys()].sort().map((date) => {
    const { n, mean, sem } = meanSem(byDate.get(date));
    return { date, value: mean, sem, n, errorLow: mean - sem, errorHigh: mean + sem };
  });
}

export function hasRatio(file, organism, gene, unit) {
  return genesFor(file, organism, gene).some((g) => file[organism]?.[g]?.[unit]?.r);
}

// First date within the last `months` months of the series (0 = all).
export function rangeStart(dates, months) {
  if (!dates.length || !months) return dates[0];
  const d = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  const cut = d.toISOString().slice(0, 10);
  return dates.find((x) => x >= cut) ?? dates[0];
}

export function pickOrganism(options, want) {
  if (options.includes(want)) return want;
  return DEFAULT_ORGANISMS.find((o) => options.includes(o)) ?? options[0];
}

// Resolve wanted selections against index.json -> valid selections, dropdown options and the file to load.
// "All" is offered only when there is more than one option (as before).
export function resolve(idx, want) {
  const provs = idx.p.filter((p) => p.n !== 'Not Applicable'); // not a place: left out of the menu
  const prov = provs.find((p) => p.n === want.province) ?? provs[0];
  const one = (list, v) => (list.length === 1 ? list[0] : list.includes(v) ? v : ALL);

  const cityNames = prov.c.map((c) => c.n);
  const city = one(cityNames, want.city);
  const cityNode = prov.c.find((c) => c.n === city);

  const siteNodes = (cityNode ? [cityNode] : prov.c).flatMap((c) => c.s.map((s) => ({ ...s, city: c.n })));
  const dupe = new Set(siteNodes.map((s) => s.n).filter((n, i, a) => a.indexOf(n) !== i));
  const siteOpts = siteNodes.map((s) => ({ value: s.id, text: dupe.has(s.n) ? `${label(s.n)} (${label(s.city)})` : label(s.n) }));
  const siteNode = siteNodes.length === 1
    ? siteNodes[0]
    : siteNodes.find((s) => s.id === want.site) ?? siteNodes.find((s) => s.n === want.site);

  const node = siteNode ?? cityNode ?? prov;
  const organisms = Object.keys(node.t).sort(byName);
  const organism = pickOrganism(organisms, want.organism);
  const genes = Object.keys(node.t[organism]).sort(byName);
  const gene = one(genes, want.gene);
  const units = [...new Set(gene === ALL ? genes.flatMap((g) => node.t[organism][g]) : node.t[organism][gene])].sort(byName);
  const unit = units.includes(want.unit) ? want.unit : units[0];

  const file = siteNode ? `site/${siteNode.id}` : cityNode ? `city/${cityNode.id}` : `province/${prov.id}`;
  return {
    sel: { province: prov.n, city, site: siteNode ? siteNode.id : ALL, siteName: siteNode?.n ?? null, organism, gene, unit },
    opts: { province: provs.map((p) => p.n), city: cityNames, site: siteOpts, organism: organisms, gene: genes, unit: units },
    file,
    single: !!siteNode,
    place: { province: prov.n, city: siteNode ? siteNode.city : cityNode?.n ?? null, site: siteNode?.n ?? null }, // for portal links
  };
}

// ─── Portal links ────────────────────────────────────────────────────────────

const DAY = 86400000;
const PLACE_FIELDS = { province: 'geo_loc_name_state_province_territory', city: 'geo_loc_name_city', site: 'geo_loc_name_site' };
// A record holds up to 3 targets: field prefix + slot number.
const TARGET_FIELDS = { organism: 'target_taxonomic_name_', gene: 'gene_symbol_', unit: 'diagnostic_measurement_unit_' };
const SLOTS = [1, 2, 3];

// Names in the viral files have no [ontology id], but the portal filters on stored values.
// One live query -> { assay: [RT-PCR keys], province|city|site|organism|gene|unit: Map(name -> [stored values]) }.
// Target maps cover all 3 slots. Names are made as the build makes them (blank organism = SARS-CoV-2).
function portalKeys() {
  const targets = Object.entries(TARGET_FIELDS).flatMap(([k, p]) => SLOTS.map((i) => [k, p + i]));
  const fields = ['assay_type', ...Object.values(PLACE_FIELDS), ...targets.map(([, f]) => f)];
  return gql(`{ analysis { aggregations { ${fields.map((f) => `data__${f} { buckets(max: 5000) { key } }`).join(' ')} } } }`)
    .then(({ analysis: { aggregations: a } }) => {
      const out = {
        assay: a.data__assay_type.buckets.map((b) => b.key).filter((k) => trimBrackets(k).toLowerCase() === VIRAL_ASSAY.toLowerCase()),
      };
      const add = (k, f, nameOf) => {
        const m = (out[k] ||= new Map());
        for (const { key } of a[`data__${f}`].buckets) {
          const n = nameOf(key);
          if (!m.get(n)?.includes(key)) m.set(n, [...(m.get(n) || []), key]);
        }
      };
      const name = (key) => (key === '__missing__' ? '' : trimBrackets(key)) || BLANK;
      for (const [k, f] of Object.entries(PLACE_FIELDS)) add(k, f, name);
      for (const [k, f] of targets) add(k, f, k === 'organism' ? viralOrganism : name);
      return out;
    });
}

// Filter for one chart date: RT-PCR records at that place, collected that day, with one target slot matching
// the organism, gene (null = all genes) and unit chosen. null if a name isn't in the portal.
export function dateFilter(keys, place, target, date) {
  const parts = [isIn('assay_type', keys.assay)];
  for (const k of ['province', 'city', 'site']) {
    if (!place[k]) continue;
    const v = keys[k].get(place[k]);
    if (!v) return null;
    parts.push(isIn(PLACE_FIELDS[k], v));
  }
  const want = {};
  for (const k of ['organism', 'gene', 'unit']) {
    if (target[k] == null) continue;
    want[k] = keys[k].get(target[k]);
    if (!want[k]) return null;
  }
  const slot = (i) => and(...Object.keys(want).map((k) => isIn(TARGET_FIELDS[k] + i, want[k])));
  const t = Date.parse(`${date}T00:00:00Z`);
  return and(...parts, or(...SLOTS.map(slot)), dateRange(t, t + DAY));
}

// ─── Chart spec ──────────────────────────────────────────────────────────────

export function viralSpec(rows, { unit, yTitle, showLine, log, single, norm, narrow }) {
  const legendAt = narrow ? 'bottom' : 'right'; // a side legend squeezes the plot on phones
  if (!rows.length) {
    return {
      description: 'Viral load chart',
      data: { values: [{}] },
      mark: { type: 'text', align: 'center', fontSize: 14 },
      encoding: { text: { value: 'No data for selected filters' } },
    };
  }
  const minPos = Math.min(...rows.map((r) => r.value).filter((v) => v > 0));
  const scale = log
    ? { type: 'symlog', constant: Number.isFinite(minPos) ? minPos : 1, nice: true }
    : { nice: true, zero: true, domainMin: 0 };
  const x = { field: 'date', type: 'temporal', timeUnit: 'utcyearmonthdate', axis: { title: 'Date', labelOverlap: true, format: '%b %d, %Y' } };
  const y = (field) => ({ field, type: 'quantitative', scale, axis: { title: yTitle } });
  const num = norm ? '.4~g' : '.4f';
  const tooltip = [
    { field: 'date', type: 'temporal', timeUnit: 'utcyearmonthdate', title: 'Date', format: '%b %d, %Y' },
    { field: 'unit', type: 'nominal', title: 'Measurement unit' },
    ...(single
      ? [
        { field: 'value', type: 'quantitative', title: 'Average', format: num },
        { field: 'valuesList', type: 'nominal', title: 'Datapoints' },
      ]
      : [
        { field: 'value', type: 'quantitative', title: 'Mean', format: num },
        { field: 'n', type: 'quantitative', title: 'n' },
        { field: 'sem', type: 'quantitative', title: 'SEM', format: num },
      ]),
    { field: 'valueSmooth', type: 'quantitative', title: TREND, format: num },
    ...(rows.some((r) => r.link) ? [LINK_TIP] : []),
  ];
  return {
    description: 'Viral load by date: mean with ±SEM error bars and a LOESS trend line',
    width: 'container',
    height: 560,
    autosize: { type: 'fit', contains: 'padding' },
    data: { values: rows.map((r) => ({ ...r, unit })) },
    layer: [
      {
        mark: { type: 'rule', size: 1.5, color: '#a8b3c4', opacity: 0.7 },
        encoding: { x, y: y('errorLow'), y2: { field: 'errorHigh' } },
      },
      {
        mark: showLine
          ? { type: 'line', point: { filled: true, size: 64 }, interpolate: 'linear', strokeWidth: 2 }
          : { type: 'point', size: 64, filled: true },
        encoding: {
          x,
          y: y('value'),
          color: { field: 'unit', type: 'nominal', scale: colorScale([unit]), legend: { title: 'Measurement unit', orient: legendAt } },
        },
      },
      {
        // Monotone curve through the fitted values: smooth, and never overshoots them (so never below 0).
        // Solid: the strokeDash channel ([1, 0] = no gaps) is only there to give the trend a legend entry.
        mark: { type: 'line', interpolate: 'monotone', strokeWidth: 3.125, color: '#878e9b' },
        encoding: {
          x,
          y: y('valueSmooth'),
          strokeDash: { field: 'lineType', type: 'nominal', scale: { domain: [TREND], range: [[1, 0]] }, legend: { title: null, orient: legendAt, symbolStrokeColor: '#878e9b', symbolStrokeWidth: 3 } },
        },
      },
      // Hover: nearest date anywhere in the plot shows a crosshair and the tooltip.
      {
        mark: { type: 'rule', color: '#9ca3af', strokeWidth: 1 },
        params: [{ name: 'hover', select: { type: 'point', encodings: ['x'], nearest: true, on: 'pointerover', clear: 'pointerout' } }],
        encoding: { x, opacity: { condition: { param: 'hover', empty: false, value: 1 }, value: 0 }, tooltip },
      },
    ],
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

const SELECTS = [
  ['province', 'Province'], ['city', 'City'], ['site', 'Site'],
  ['organism', 'Organism'], ['gene', 'Gene Target'], ['unit', 'Measurement Unit'],
];
const WARNING =
  '<strong>Data Aggregation:</strong> Choosing <strong>All</strong> within any filter combines all data in that category. <br>The plot shown below <strong> does not </strong> account for potential batch effects arising from differences within the category. <br>We are actively working on normalization methods to address this.';

function toggle(id, text, checked) {
  return `<label class="viral-show-line-toggle">
    <input type="checkbox" id="${id}" class="viral-toggle-input"${checked ? ' checked' : ''} />
    <span class="viral-toggle-track" aria-hidden="true"></span>
    <span class="viral-toggle-label">${text}</span>
  </label>`;
}
const select = ([key, text]) =>
  `<label class="field-select viral-field-select"><span class="label">${text}</span><select id="viral-${key}"></select></label>`;

function markup() {
  return `
  <header class="explore-header">
    <div class="explore-kicker">
      <span class="explore-badge">Viral Loads</span>
      <h2 class="explore-kicker-text">Trends over time</h2>
    </div>
    <p class="explore-subtitle">See how the portal captures viral load data over time.</p>
    <p class="explore-subtitle">Proof of concept demonstration purposes only. Not for scientific interpretation.</p>
  </header>
  <div class="viral-load-content">
    <div class="viral-load-filters">
      <div class="viral-filter-row">${SELECTS.slice(0, 3).map(select).join('')}</div>
      <div class="viral-filter-row">${SELECTS.slice(3).map(select).join('')}</div>
      <p class="viral-assay-note">RT-PCR (reverse transcription polymerase chain reaction) measurements only.
        Normalise to PMMoV divides each measurement by the same sample's Pepper mild mottle virus value in the same unit.</p>
    </div>
    <div class="viral-date-range-wrap" id="viral-date-range">
      <div class="viral-date-calendar-row" role="group" aria-label="Choose dates on the calendar">
        <label class="viral-date-cal-field"><span class="viral-date-cal-label">From</span>
          <input type="date" id="viral-date-from-cal" class="viral-date-cal-input" /></label>
        <label class="viral-date-cal-field"><span class="viral-date-cal-label">To</span>
          <input type="date" id="viral-date-to-cal" class="viral-date-cal-input" /></label>
        <div class="viral-presets" role="group" aria-label="Date range presets">
          ${PRESETS.map(([t]) => `<button type="button" class="viral-preset" data-preset="${t}" aria-pressed="false">${t}</button>`).join('')}
        </div>
      </div>
      <div class="viral-chart-toggles">
        ${toggle('viral-show-line', 'Show line between points', false)}
        ${toggle('viral-loess-full-series', 'Full-series LOESS', true)}
        ${toggle('viral-norm', 'Normalise to PMMoV', false)}
        ${toggle('viral-log', 'Log scale', false)}
        <label class="viral-span-field"><span>LOESS span</span>
          <input type="number" id="viral-span" class="viral-date-cal-input viral-span-input"
            min="${LOESS_SPAN_MIN}" max="${LOESS_SPAN_MAX}" step="0.05" value="${LOESS_SPAN}" /></label>
      </div>
    </div>
    <p class="explore-subtitle viral-load-smoothing-note">
      The solid gray trend line is LOESS-smoothed (polynomial degree ${LOESS_DEGREE}, span <span id="viral-span-shown">${LOESS_SPAN}</span>).<br>By default it fits across all data matching your filters. Turn off Full-series LOESS to smooth only across the visible date window.
    </p>
    <p id="viral-all-filter-warning" class="viral-all-filter-warning explore-subtitle" hidden aria-live="polite"></p>
    <p class="viral-notice" id="viral-notice" role="status" hidden></p>
    <div id="viral-load-chart" class="viral-load-chart"></div>
    <div id="viral-table"></div>
  </div>`;
}

function fillSelect(el, options, value, withAll) {
  el.textContent = '';
  const add = (v, t) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    el.append(o);
  };
  if (withAll && options.length !== 1) add(ALL, ALL);
  for (const o of options) (typeof o === 'string' ? add(o, label(o)) : add(o.value, o.text));
  el.value = value;
}

export function initViral(rootEl) {
  rootEl.innerHTML = markup();
  const $ = (id) => rootEl.querySelector(`#${id}`);
  const chartEl = $('viral-load-chart');
  const files = new Map(); // path -> Promise<json>
  let idx = null;
  let view = null;
  let seq = 0;
  let shownDates = []; // dates of the series on screen (for the presets)
  const linkKeys = portalKeys().catch((err) => { console.error(err); return null; }); // null: chart without links
  // Wanted selections (resolved against the index on every update) and options.
  const st = { province: null, city: null, site: null, organism: null, gene: null, unit: null, from: null, to: null, norm: false, log: false, span: null };

  const getFile = (p) => {
    if (!files.has(p)) {
      const req = getJSON(`${BASE}${p}.json?v=${encodeURIComponent(idx.generatedAt)}`);
      req.catch(() => files.delete(p));
      files.set(p, req);
    }
    return files.get(p);
  };

  function notice(text) {
    const el = $('viral-notice');
    el.hidden = !text;
    el.textContent = text || '';
  }

  async function update() {
    const token = ++seq;
    const r = resolve(idx, st);
    Object.assign(st, r.sel);
    for (const [key] of SELECTS) {
      fillSelect($(`viral-${key}`), r.opts[key], r.sel[key], ['city', 'site', 'gene'].includes(key));
    }
    const anyAll = [r.sel.city, r.sel.site, r.sel.gene].includes(ALL);
    const warn = $('viral-all-filter-warning');
    warn.hidden = !anyAll;
    warn.innerHTML = anyAll ? WARNING : '';

    chartEl.classList.add('viral-busy');
    let file;
    let keys;
    try {
      [file, keys] = await Promise.all([getFile(r.file), linkKeys]);
    } catch (err) {
      if (token === seq) failed(chartEl, err, update);
      return;
    }
    if (token !== seq) return;

    const { organism, gene, unit } = r.sel;
    const ratioOk = organism !== PMMOV && hasRatio(file, organism, gene, unit);
    const norm = st.norm && ratioOk;
    const normEl = $('viral-norm');
    normEl.disabled = !ratioOk;
    normEl.checked = norm;
    normEl.closest('label').classList.toggle('is-disabled', !ratioOk);
    $('viral-log').checked = st.log;

    const series = (r.single ? siteSeries : statSeries)(file, organism, gene, unit, norm);
    const dates = series.map((d) => d.date);
    $('viral-date-range').classList.toggle('hidden', !dates.length);
    const first = dates[0];
    const last = dates[dates.length - 1];
    let from = st.from && st.from <= last ? (st.from < first ? first : st.from) : rangeStart(dates, 12);
    let to = st.to && st.to >= first ? (st.to > last ? last : st.to) : last;
    if (from > to) [from, to] = [to, from];
    syncDates(dates, from, to);

    const visible = series.filter((d) => d.date >= from && d.date <= to);
    const span = st.span ?? LOESS_SPAN;
    $('viral-span').value = span;
    $('viral-span-shown').textContent = span;
    const links = new Map(); // date -> portal link
    for (const d of keys ? visible : []) {
      const f = dateFilter(keys, r.place, { organism, gene: gene === ALL ? null : gene, unit }, d.date);
      if (f) links.set(d.date, linkTo(f, "Click to browse this date's samples ↗"));
    }
    const rows = withTrend(visible, $('viral-loess-full-series').checked ? series : visible, span)
      .map((d) => ({ ...d, ...(links.get(d.date) ?? linkTo(null)) }));
    const unitLabel = label(unit);
    const spec = viralSpec(rows, {
      unit: unitLabel,
      yTitle: norm ? `${unitLabel} / PMMoV` : unitLabel,
      showLine: $('viral-show-line').checked,
      log: st.log,
      single: r.single,
      norm,
      narrow: $('viral-load-chart')?.clientWidth < 600,
    });
    view?.finalize();
    view = null;
    try {
      const res = await embed(chartEl, spec);
      if (token !== seq) return res.view.finalize(); // a newer update owns the chart
      view = res.view;
    } catch (err) {
      if (token === seq) failed(chartEl, err, update);
      return;
    }
    chartEl.classList.remove('viral-busy');
    const sig = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(4))) : '');
    dataTable($('viral-table'),
      [{ key: 'date', label: 'Date' }, { key: 'unit', label: norm ? `Unit (/ PMMoV)` : 'Unit' },
        { key: 'mean', label: 'Mean' }, { key: 'n', label: 'n' }, { key: 'sem', label: 'SEM' }, LINK_COL],
      visible.map((d) => ({ date: d.date, unit: unitLabel, mean: sig(d.value), n: d.n, sem: sig(d.sem), link: links.get(d.date)?.link })));

    const custom = st.from || st.to;
    setParams({
      province: r.sel.province,
      city: r.sel.city === ALL ? null : r.sel.city,
      site: r.sel.siteName,
      organism,
      gene: gene === ALL ? null : gene,
      unit,
      from: custom ? from : null,
      to: custom ? to : null,
      norm: norm ? '1' : null,
      log: st.log ? '1' : null,
      span: st.span == null || st.span === LOESS_SPAN ? null : st.span,
    });
  }

  function syncDates(dates, from, to) {
    shownDates = dates;
    for (const id of ['viral-date-from-cal', 'viral-date-to-cal']) {
      const el = $(id);
      el.min = dates[0] || '';
      el.max = dates[dates.length - 1] || '';
    }
    $('viral-date-from-cal').value = from || '';
    $('viral-date-to-cal').value = to || '';
    const last = dates[dates.length - 1];
    rootEl.querySelectorAll('.viral-preset').forEach((b) => {
      const months = PRESETS.find(([t]) => t === b.dataset.preset)[1];
      b.setAttribute('aria-pressed', String(to === last && from === rangeStart(dates, months)));
    });
  }

  function bind() {
    for (const [key] of SELECTS) {
      $(`viral-${key}`).addEventListener('change', (e) => {
        st[key] = e.target.value;
        st.from = st.to = null; // new series: back to the last 12 months (as before)
        notice('');
        update();
      });
    }
    $('viral-date-from-cal').addEventListener('change', (e) => { st.from = e.target.value || null; update(); });
    $('viral-date-to-cal').addEventListener('change', (e) => { st.to = e.target.value || null; update(); });
    rootEl.querySelectorAll('.viral-preset').forEach((b) => b.addEventListener('click', () => {
      // 12 months is the default (no dates in the URL); other presets become explicit dates.
      const months = PRESETS.find(([t]) => t === b.dataset.preset)[1];
      st.from = months === 12 ? null : rangeStart(shownDates, months);
      st.to = null;
      update();
    }));
    $('viral-show-line').addEventListener('change', update);
    $('viral-loess-full-series').addEventListener('change', update);
    $('viral-norm').addEventListener('change', (e) => { st.norm = e.target.checked; update(); });
    $('viral-log').addEventListener('change', (e) => { st.log = e.target.checked; update(); });
    // 'change' fires on Enter or leaving the box, not on every keystroke. Not a number: back to the current span.
    $('viral-span').addEventListener('change', (e) => { st.span = parseSpan(e.target.value) ?? st.span; update(); });
  }

  function setup(loaded) {
    for (const k of ['province', 'city', 'site', 'organism', 'gene', 'unit', 'from', 'to']) st[k] = getParam(k);
    st.norm = getParam('norm') === '1';
    st.log = getParam('log') === '1';
    st.span = parseSpan(getParam('span'));
    // ?site=<name> alone (links from the map): find its province and city.
    const wantSite = st.site;
    if (wantSite && !st.province && loaded.lookup[wantSite]) [st.province, st.city] = loaded.lookup[wantSite];
    if (wantSite && resolve(loaded, st).sel.siteName !== wantSite) {
      notice(`No RT-PCR viral load data for site "${wantSite}". Showing the default view instead.`);
      Object.assign(st, { province: null, city: null, site: null, organism: null, gene: null, unit: null, from: null, to: null });
    }
    bind();
    idx = loaded;
  }

  // panel() shows loading, and an error + retry if the index cannot be fetched.
  panel(chartEl, async () => {
    if (!idx) setup(await getJSON(`${BASE}index.json`, { cache: 'no-cache' }));
    await update();
  });
}

async function getJSON(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
