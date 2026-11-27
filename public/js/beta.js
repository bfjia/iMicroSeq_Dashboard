// Beta page (beta.html): charts not ready for the public. Hidden, not protected: no page links to it (open /beta).
// Compare sites: each site's viral load LOESS trend divided by that site's own peak in the date range, so sites
// with different units, labs and levels share one y axis (% of site peak).
// Data: the nightly site files in data/viral/ (scripts/build-viral-loads.mjs); nothing extra is built.
// Browser globals are only touched inside functions and in the last lines, so the pure helpers import fine in Node.
import { PALETTE, LOESS_SPAN, LOESS_SPAN_MIN, LOESS_SPAN_MAX, BETA_COMPARE_SITES } from './config.js';
import { BLANK } from './rules.js';
import {
  BASE, ALL, PRESETS, toggle, fillSelect, getJSON, siteSeries, withTrend, parseSpan, rangeStart, pickOrganism, label,
  day, dateWindow, xScale, dayText, presetButtons, rangeNote, onDateBox,
} from './viral.js';
import { embed, colorScale, panel, failed, dataTable, getParam, setParams } from './charts.js';

const MAX_SITES = PALETTE.length; // one colour each
const byName = (a, b) => (a === BLANK) - (b === BLANK) || a.localeCompare(b);
const sig = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(4))) : '');

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

// index.json -> every site (province "Not Applicable" left out, as on the dashboard) with a unique label:
// its name, plus the city if another site has that name, plus the province if that's still not enough.
export function siteList(idx) {
  const sites = idx.p.filter((p) => p.n !== 'Not Applicable').flatMap((p) => p.c.flatMap((c) =>
    c.s.map((s) => ({ id: s.id, n: s.n, city: c.n, province: p.n, t: s.t }))));
  const count = (key) => {
    const m = new Map();
    for (const s of sites) m.set(key(s), (m.get(key(s)) || 0) + 1);
    return (s) => m.get(key(s));
  };
  const sameName = count((s) => s.n);
  const sameCity = count((s) => `${s.n}\u0000${s.city}`);
  for (const s of sites) {
    s.label = sameName(s) === 1 ? label(s.n)
      : sameCity(s) === 1 ? `${label(s.n)} (${label(s.city)})`
      : `${label(s.n)} (${label(s.city)}, ${s.province})`;
  }
  return sites;
}

// The site's unit with the most dates for this organism and gene (All: any gene), or null (no data).
// Sites report in different units; scaling each to its own peak is what makes them comparable.
export function bestUnit(file, organism, gene) {
  const dates = {};
  for (const [g, units] of Object.entries(file[organism] || {})) {
    if (gene !== ALL && g !== gene) continue;
    for (const [u, leaf] of Object.entries(units)) dates[u] = (dates[u] || 0) + leaf.d.length;
  }
  return Object.keys(dates).sort((a, b) => dates[b] - dates[a] || a.localeCompare(b))[0] ?? null;
}

// One site's series (sorted by date) -> its rows from `from` to `to` with the LOESS trend (fitted on the
// whole series, or on the window only when full is false), all multiplied by 100 / the trend's highest value
// in the window, so the trend peaks at 100. raw: not multiplied. LOESS is linear in y, so scaling after the
// fit gives the same curve as scaling the data first.
// peak is null when the window has no data; rows is empty when the trend is 0 throughout (nothing to scale).
export function scaleToPeak(series, { from, to, span = LOESS_SPAN, full = true, raw = false }) {
  const visible = series.filter((d) => d.date >= from && d.date <= to);
  if (!visible.length) return { peak: null, rows: [] };
  const fitted = withTrend(visible, full ? series : visible, span);
  const peak = Math.max(...fitted.map((d) => d.valueSmooth));
  const k = raw ? 1 : peak > 0 ? 100 / peak : 0;
  if (!k) return { peak, rows: [] };
  return {
    peak,
    rows: fitted.map((d) => ({
      date: d.date, mean: d.value, n: d.n, trendRaw: d.valueSmooth, value: d.value * k, trend: d.valueSmooth * k,
    })),
  };
}

// rows: { site, unit, date, mean, n, trendRaw, value, trend }. sites: labels in the order chosen (keeps colours).
// Click a legend entry to highlight that site; hover shows the nearest point of any line.
export function compareSpec(rows, { sites, yTitle, log, points, raw, narrow, from, to, empty = 'No data for selected filters' }) {
  if (!rows.length) {
    return {
      description: 'Viral load trends by site',
      data: { values: [{}] },
      mark: { type: 'text', align: 'center', fontSize: 14 },
      encoding: { text: { value: empty } },
    };
  }
  const minPos = Math.min(...rows.map((r) => r.trend).filter((v) => v > 0));
  const scale = log
    ? { type: 'symlog', constant: Number.isFinite(minPos) ? minPos : 1, nice: true }
    : { nice: true, zero: true, domainMin: 0 };
  const x = { field: 'date', type: 'temporal', timeUnit: 'utcyearmonthdate', ...xScale(from, to), axis: { title: 'Date', labelOverlap: true, format: '%b %d, %Y' } };
  const y = (field) => ({ field, type: 'quantitative', scale, axis: { title: yTitle } });
  const color = {
    field: 'site', type: 'nominal', scale: colorScale(sites),
    legend: { title: 'Site (click to highlight)', orient: narrow ? 'bottom' : 'right', labelLimit: 240, columns: narrow ? 1 : undefined },
  };
  const picked = (on, off) => ({ condition: { param: 'pick', value: on }, value: off });
  const tooltip = [
    { field: 'site', type: 'nominal', title: 'Site' },
    { field: 'date', type: 'temporal', timeUnit: 'utcyearmonthdate', title: 'Date', format: '%b %d, %Y' },
    ...(raw ? [] : [{ field: 'trend', type: 'quantitative', title: 'Trend (% of site peak)', format: '.1f' }]),
    { field: 'trendRaw', type: 'quantitative', title: 'Trend', format: '.4~g' },
    { field: 'mean', type: 'quantitative', title: 'Mean', format: '.4~g' },
    { field: 'n', type: 'quantitative', title: 'n' },
    { field: 'unit', type: 'nominal', title: 'Measurement unit' },
  ];
  return {
    description: raw ? 'Viral load trends by site' : 'Viral load trends by site, each as a percentage of its own peak',
    width: 'container',
    height: 520,
    autosize: { type: 'fit', contains: 'padding' },
    data: { values: rows },
    layer: [
      ...(points ? [{ mark: { type: 'point', filled: true, size: 36 }, encoding: { x, y: y('value'), color, opacity: picked(0.45, 0.06) } }] : []),
      {
        // Monotone curve through the fitted values, as on the dashboard: smooth, never overshoots them.
        mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2.5 },
        params: [{ name: 'pick', select: { type: 'point', fields: ['site'] }, bind: 'legend' }],
        encoding: { x, y: y('trend'), color, opacity: picked(1, 0.12) },
      },
      {
        mark: { type: 'point', filled: true, size: 80 },
        params: [{ name: 'hover', select: { type: 'point', nearest: true, on: 'pointerover', clear: 'pointerout' } }],
        encoding: { x, y: y('trend'), color, opacity: { condition: { param: 'hover', empty: false, value: 1 }, value: 0 }, tooltip },
      },
    ],
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

const select = (id, text) =>
  `<label class="field-select viral-field-select"><span class="label">${text}</span><select id="${id}"></select></label>`;

function markup() {
  return `
  <header class="explore-header">
    <div class="explore-kicker">
      <span class="explore-badge">Beta</span>
      <h2 class="explore-kicker-text">Compare sites</h2>
    </div>
    <p class="explore-subtitle">Viral load trends (RT-PCR) at up to ${MAX_SITES} sites on one chart, each shown as a percentage of its own peak.</p>
    <p class="explore-subtitle">Proof of concept demonstration purposes only. Not for scientific interpretation.</p>
  </header>
  <div class="viral-load-content">
    <div class="viral-load-filters">
      <div class="viral-filter-row">
        ${select('beta-organism', 'Organism')}${select('beta-gene', 'Gene Target')}${select('beta-add', 'Add a site')}
      </div>
      <div class="beta-chips" id="beta-chips" role="list" aria-label="Sites compared"></div>
    </div>
    <div class="viral-date-range-wrap" id="beta-date-range">
      <div class="viral-date-calendar-row" role="group" aria-label="Choose dates on the calendar">
        <label class="viral-date-cal-field"><span class="viral-date-cal-label">From</span>
          <input type="date" id="beta-from" class="viral-date-cal-input" /></label>
        <label class="viral-date-cal-field"><span class="viral-date-cal-label">To</span>
          <input type="date" id="beta-to" class="viral-date-cal-input" /></label>
        ${presetButtons()}
      </div>
      <p class="viral-range-note" id="beta-range-note" role="status" hidden></p>
      <div class="viral-chart-toggles">
        ${toggle('beta-scale', '% of each site\'s peak', true)}
        ${toggle('beta-points', 'Show data points', false)}
        ${toggle('beta-full', 'Full-series LOESS', true)}
        ${toggle('beta-log', 'Log scale', false)}
        <label class="viral-span-field"><span>LOESS span</span>
          <input type="number" id="beta-span" class="viral-date-cal-input viral-span-input"
            min="${LOESS_SPAN_MIN}" max="${LOESS_SPAN_MAX}" step="0.05" value="${LOESS_SPAN}" /></label>
      </div>
    </div>
    <p class="viral-notice" id="beta-notice" role="status" hidden></p>
    <div id="beta-chart" class="viral-load-chart"></div>
    <p class="explore-subtitle viral-load-smoothing-note">
      Each line is one site's LOESS trend (polynomial degree 2, span <span id="beta-span-shown">${LOESS_SPAN}</span>), divided by that site's highest trend value between From and To, so 100% is each site's own peak.
      Lines compare timing and shape, not size: 100% at one site can be less virus than 20% at another.<br>
      Scaling removes the measurement unit (each site uses its unit with the most dates), but not differences in lab methods, gene targets or sampling between sites.
      Log scale shows fold change. Click a site in the legend to highlight it.
    </p>
    <div id="beta-table"></div>
  </div>`;
}

// "Add a site" menu: sites with data for the organism and not yet chosen, grouped by province.
function fillAdd(el, sites, chosen, organism) {
  const full = chosen.length >= MAX_SITES;
  el.replaceChildren(new Option(full ? `${MAX_SITES} sites (the most)` : 'Choose…', ''));
  el.disabled = full;
  const groups = new Map();
  for (const s of sites) {
    if (!s.t[organism] || chosen.includes(s.id)) continue;
    if (!groups.has(s.province)) {
      const g = document.createElement('optgroup');
      g.label = s.province;
      groups.set(s.province, g);
      el.append(g);
    }
    groups.get(s.province).append(new Option(s.label, s.id));
  }
  el.value = '';
}

function compareSites(rootEl) {
  rootEl.innerHTML = markup();
  const $ = (id) => rootEl.querySelector(`#${id}`);
  const chartEl = $('beta-chart');
  const files = new Map(); // site id -> Promise<json>
  let idx = null;
  let sites = []; // siteList(idx), by province then label
  let byId = new Map();
  let lost = 0; // sites in the address that aren't in the data (said once)
  let seq = 0;
  let shownDates = [];
  let shown = null; // { from, to } on screen: kept when the sites or other choices change
  // Another choice: same dates as now, so the x-axis stays put.
  const keep = () => { if (shown) Object.assign(st, shown); };
  // Viewer's choices; null = default. Resolved against the data on every update.
  const st = { organism: null, gene: null, ids: [], from: null, to: null, span: null, log: false, raw: false };

  const getFile = (id) => {
    if (!files.has(id)) {
      const req = getJSON(`${BASE}site/${id}.json?v=${encodeURIComponent(idx.generatedAt)}`);
      req.catch(() => files.delete(id));
      files.set(id, req);
    }
    return files.get(id);
  };
  const fail = (err) => {
    chartEl.classList.remove('viral-busy');
    failed(chartEl, err, update);
  };

  function notice(text) {
    const el = $('beta-notice');
    el.hidden = !text;
    el.textContent = text || '';
  }

  function chips(chosen, colors) {
    $('beta-chips').replaceChildren(...chosen.map((s, i) => {
      const chip = document.createElement('span');
      chip.className = 'beta-chip';
      chip.setAttribute('role', 'listitem');
      const dot = document.createElement('span');
      dot.className = 'beta-chip-dot';
      dot.style.background = colors[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'beta-chip-remove';
      btn.textContent = '×';
      btn.title = 'Remove';
      btn.setAttribute('aria-label', `Remove ${s.label}`);
      btn.onclick = () => {
        st.ids = st.ids.filter((id) => id !== s.id);
        keep();
        update();
      };
      chip.append(dot, s.label, btn);
      return chip;
    }));
  }

  async function update() {
    const token = ++seq;
    const organisms = [...new Set(sites.flatMap((s) => Object.keys(s.t)))].sort(byName);
    const organism = pickOrganism(organisms, st.organism);
    fillSelect($('beta-organism'), organisms, organism, false);
    const chosen = st.ids.map((id) => byId.get(id));
    const genes = [...new Set(chosen.flatMap((s) => Object.keys(s.t[organism] || {})))].sort(byName);
    const gene = genes.length === 1 ? genes[0] : genes.includes(st.gene) ? st.gene : ALL;
    fillSelect($('beta-gene'), genes, gene, true);
    fillAdd($('beta-add'), sites, st.ids, organism);
    const labels = chosen.map((s) => s.label);
    chips(chosen, colorScale(labels).range);
    $('beta-scale').checked = !st.raw;
    $('beta-log').checked = st.log;

    chartEl.classList.add('viral-busy');
    let loaded;
    try {
      loaded = await Promise.all(chosen.map((s) => (s.t[organism] ? getFile(s.id) : null)));
      // Let the browser paint the faded chart before the (blocking) redraw.
      await new Promise((done) => requestAnimationFrame(() => setTimeout(done)));
    } catch (err) {
      if (token === seq) fail(err);
      return;
    }
    if (token !== seq) return;

    const per = chosen.map((s, i) => {
      const unit = loaded[i] && bestUnit(loaded[i], organism, gene);
      return { s, unit, series: unit ? siteSeries(loaded[i], organism, gene, unit, false) : [] };
    });
    const dates = [...new Set(per.flatMap((p) => p.series.map((d) => d.date)))].sort();
    $('beta-date-range').classList.toggle('hidden', !dates.length);
    const win = dateWindow(dates, st.from, st.to);
    const { from, to } = win;
    if (dates.length) shown = { from, to };
    syncDates(dates, from, to);
    const withData = per.filter((p) => p.series.length).length;
    rangeNote($('beta-range-note'), win, dates, withData === 1 ? 'This site has' : 'These sites have',
      () => { st.from = dates[0]; st.to = null; update(); });

    const span = st.span ?? LOESS_SPAN;
    $('beta-span').value = span;
    $('beta-span-shown').textContent = span;
    const rows = [];
    const missing = [];
    const outside = [];
    const flat = [];
    for (const p of per) {
      if (!p.series.length) {
        missing.push(p.s.label);
        continue;
      }
      const { peak, rows: r } = scaleToPeak(p.series, { from, to, span, full: $('beta-full').checked, raw: st.raw });
      if (peak == null) outside.push(p.s.label);
      else if (!r.length) flat.push(p.s.label);
      for (const d of r) rows.push({ ...d, site: p.s.label, unit: label(p.unit) });
    }
    const units = [...new Set(per.filter((p) => p.series.length).map((p) => label(p.unit)))];
    const what = gene === ALL ? organism : `${organism} (${label(gene)})`;
    notice([
      lost ? `${lost} site${lost > 1 ? 's' : ''} in the address ${lost > 1 ? 'are' : 'is'} not in the viral load data and left out.` : '',
      missing.length ? `No ${what} data: ${missing.join(', ')}.` : '',
      outside.length && !win.empty ? `No data in this date range: ${outside.join(', ')}.` : '',
      flat.length ? `Trend is 0 throughout this date range, so it can't be scaled: ${flat.join(', ')}.` : '',
      st.raw && units.length > 1 ? `These sites use different units (${units.join('; ')}), so raw values can't be compared. Turn % of each site's peak back on.` : '',
    ].filter(Boolean).join(' '));
    lost = 0;

    const spec = compareSpec(rows, {
      sites: labels,
      yTitle: !st.raw ? "% of site's peak" : units.length === 1 ? units[0] : 'Value (units differ)',
      log: st.log,
      points: $('beta-points').checked,
      raw: st.raw,
      narrow: chartEl.clientWidth < 600,
      from,
      to,
      empty: !chosen.length ? 'Add a site to compare'
        : win.empty && dates.length ? `No data between ${dayText(from)} and ${dayText(to)}` : 'No data for selected filters',
    });
    try {
      const res = await embed(chartEl, spec);
      if (token !== seq) return res.view.finalize(); // a newer update owns the chart
    } catch (err) {
      if (token === seq) fail(err);
      return;
    }
    chartEl.classList.remove('viral-busy');
    dataTable($('beta-table'),
      [{ key: 'site', label: 'Site' }, { key: 'unit', label: 'Unit' }, { key: 'date', label: 'Date' },
        { key: 'mean', label: 'Mean' }, { key: 'n', label: 'n' }, { key: 'trendRaw', label: 'Trend' },
        ...(st.raw ? [] : [{ key: 'trend', label: 'Trend (% of site peak)' }])],
      rows.map((d) => ({ ...d, mean: sig(d.mean), trendRaw: sig(d.trendRaw), trend: d.trend.toFixed(1) })),
      { file: 'compare-sites' });

    const custom = st.from || st.to;
    setParams({
      organism,
      gene: gene === ALL || genes.length === 1 ? null : gene,
      sites: st.ids.join(',') || null,
      from: custom ? from : null,
      to: custom ? to : null,
      span: st.span == null || st.span === LOESS_SPAN ? null : st.span,
      log: st.log ? '1' : null,
      raw: st.raw ? '1' : null,
    });
  }

  function syncDates(dates, from, to) {
    shownDates = dates;
    $('beta-from').value = from || '';
    $('beta-to').value = to || '';
    const last = dates[dates.length - 1];
    rootEl.querySelectorAll('.viral-preset').forEach((b) => {
      const months = PRESETS.find(([t]) => t === b.dataset.preset)[1];
      b.setAttribute('aria-pressed', String(to === last && from === rangeStart(dates, months)));
    });
  }

  function bind() {
    $('beta-organism').onchange = (e) => { st.organism = e.target.value; keep(); update(); };
    $('beta-gene').onchange = (e) => { st.gene = e.target.value; keep(); update(); };
    $('beta-add').onchange = (e) => {
      if (e.target.value && st.ids.length < MAX_SITES) st.ids.push(e.target.value);
      keep();
      update();
    };
    $('beta-from').onchange = onDateBox(st, 'from', update);
    $('beta-to').onchange = onDateBox(st, 'to', update);
    rootEl.querySelectorAll('.viral-preset').forEach((b) => b.addEventListener('click', () => {
      // 12 months is the default (no dates in the URL); other presets become explicit dates.
      const months = PRESETS.find(([t]) => t === b.dataset.preset)[1];
      st.from = months === 12 ? null : rangeStart(shownDates, months);
      st.to = null;
      update();
    }));
    $('beta-scale').onchange = (e) => { st.raw = !e.target.checked; update(); };
    $('beta-points').onchange = update;
    $('beta-full').onchange = update;
    $('beta-log').onchange = (e) => { st.log = e.target.checked; update(); };
    // 'change' fires on Enter or leaving the box. Not a number: back to the current span.
    $('beta-span').onchange = (e) => { st.span = parseSpan(e.target.value) ?? st.span; update(); };
  }

  function setup(loaded) {
    idx = loaded;
    sites = siteList(idx).sort((a, b) => a.province.localeCompare(b.province) || a.label.localeCompare(b.label));
    byId = new Map(sites.map((s) => [s.id, s]));
    const want = getParam('sites');
    const ids = want != null
      ? want.split(',').filter(Boolean)
      : BETA_COMPARE_SITES.map((n) => sites.find((s) => s.n === n)?.id).filter(Boolean);
    st.ids = [...new Set(ids.filter((id) => byId.has(id)))].slice(0, MAX_SITES);
    lost = new Set(ids.filter((id) => !byId.has(id))).size;
    for (const k of ['organism', 'gene']) st[k] = getParam(k);
    st.from = day(getParam('from'));
    st.to = day(getParam('to'));
    st.span = parseSpan(getParam('span'));
    st.log = getParam('log') === '1';
    st.raw = getParam('raw') === '1';
    bind();
  }

  // panel() shows loading, and an error + retry if the index cannot be fetched.
  panel(chartEl, async () => {
    if (!idx) setup(await getJSON(`${BASE}index.json`, { cache: 'no-cache' }));
    await update();
  });
}

if (typeof document !== 'undefined') compareSites(document.getElementById('compare-root'));
