// At a Glance page. One live query feeds the hero cards, breakdown, map and cumulative
// chart; the monthly-by-organism chart adds one more when it scrolls into view.
import { gql, aliased, dateRange, months } from './api.js';
import { trimBrackets, isNull, parseCoord, monthKey } from './rules.js';
import { DATE_FIELD, ACTIVE_DAYS, PALETTE } from './config.js';
import { embed, panel, whenVisible, dataTable, colorScale, setFooter, SPINNER } from './charts.js';
import { drawMap } from './map.js';

const DAY = 86400000;
const TODAY = Math.floor(Date.now() / DAY) * DAY; // UTC midnight: same query, same cache entry all day

const SITE_SOURCE = ['data.geo_loc_latitude', 'data.geo_loc_longitude', 'data.geo_loc_name_state_province_territory'];
const INDEX_QUERY = `query($recent: JSON) { analysis {
  hits(first: 0) { total }
  aggregations(aggregations_filter_themselves: true) {
    data__geo_loc_name_site { buckets(max: 5000) { key doc_count top_hits(_source: ${JSON.stringify(SITE_SOURCE)}, size: 1) } }
    data__organism { buckets { key doc_count } }
    data__sample_collected_by_organisation_name { buckets { key doc_count } }
    data__environmental_site { buckets { key doc_count } }
    data__${DATE_FIELD} { stats { min max } histogram(interval: ${DAY}) { buckets { key doc_count } } }
  }
  recent: aggregations(filters: $recent, aggregations_filter_themselves: true) {
    data__geo_loc_name_site { buckets(max: 5000) { key } }
  }
} }`;

const realCount = (buckets) => new Set(buckets.filter((b) => !isNull(b.key)).map((b) => trimBrackets(b.key))).size;

function loadIndex() {
  const recent = {
    op: 'and',
    content: [{ op: '>=', content: { fieldName: `data.${DATE_FIELD}`, value: TODAY - ACTIVE_DAYS * DAY } }],
  };
  return gql(INDEX_QUERY, { recent }).then(({ analysis: a }) => {
    const agg = a.aggregations;
    const dates = agg[`data__${DATE_FIELD}`];
    const active = new Set(a.recent.data__geo_loc_name_site.buckets.map((b) => b.key));
    const siteBuckets = agg.data__geo_loc_name_site.buckets;
    const sites = siteBuckets
      .filter((b) => !isNull(b.key))
      .map((b) => {
        const rec = b.top_hits?.data || {};
        return {
          name: trimBrackets(b.key),
          count: b.doc_count,
          active: active.has(b.key),
          lat: parseCoord(rec.geo_loc_latitude, 'lat'),
          lon: parseCoord(rec.geo_loc_longitude, 'lon'),
          province: trimBrackets(rec.geo_loc_name_state_province_territory),
        };
      });
    return {
      total: a.hits.total,
      sites,
      organisms: realCount(agg.data__organism.buckets),
      sources: realCount(agg.data__sample_collected_by_organisation_name.buckets),
      envBuckets: agg.data__environmental_site.buckets,
      minDate: dates.stats.min,
      maxDate: dates.stats.max,
      daily: dates.histogram.buckets.map((b) => ({ t: Number(b.key), n: b.doc_count })),
    };
  });
}

// ─── Hero cards ──────────────────────────────────────────────────────────────

function formatHero(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

function animateCount(el, target) {
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 900);
    el.textContent = formatHero(Math.round(target * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const HERO_IDS = ['hero-samples', 'hero-sites', 'hero-active', 'hero-organisms', 'hero-sources', 'hero-latest'];

async function hero() {
  const err = document.getElementById('hero-error');
  for (const id of HERO_IDS) document.getElementById(id).innerHTML = SPINNER; // again on retry
  try {
    const d = await loadIndex();
    err.hidden = true;
    const set = (id, v) => animateCount(document.getElementById(id), v);
    set('hero-samples', d.total);
    set('hero-sites', d.sites.length);
    set('hero-active', d.sites.filter((s) => s.active).length);
    set('hero-organisms', d.organisms);
    set('hero-sources', d.sources);
    document.getElementById('hero-latest').textContent = new Date(d.maxDate).toLocaleDateString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
  } catch (e) {
    console.error(e);
    for (const id of HERO_IDS) document.getElementById(id).textContent = '–';
    err.hidden = false;
    err.innerHTML = 'Could not load the summary numbers from the data portal. ';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'retry-btn';
    btn.textContent = 'Try again';
    btn.onclick = hero;
    err.append(btn);
  }
  setFooter();
}

// ─── Sampling activity ───────────────────────────────────────────────────────

const monthStart = (key) => `${key}-01`;

async function monthlyByOrganism(d) {
  const ms = months(d.minDate, d.maxDate);
  const res = await aliased(
    ms.map((m, i) => ({ alias: `m${i}`, sqon: dateRange(m.start, m.end) })),
    'data__organism { buckets { key doc_count } }',
  );
  const rows = [];
  const totals = {};
  ms.forEach((m, i) => {
    for (const b of res[`m${i}`].data__organism.buckets) {
      const organism = b.key === '__missing__' ? 'Not recorded' : trimBrackets(b.key);
      rows.push({ month: monthStart(m.key), organism, n: b.doc_count });
      totals[organism] = (totals[organism] || 0) + b.doc_count;
    }
  });
  // Biggest organisms keep their own colour; anything past the palette folds into "Other".
  const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const keep = new Set(ranked.slice(0, PALETTE.length - 1));
  rows.forEach((r) => { if (!keep.has(r.organism)) r.organism = 'Other'; });
  const order = [...ranked.filter((o) => keep.has(o)), ...(ranked.length > keep.size ? ['Other'] : [])];
  return { rows, order };
}

function cumulativeRows(d) {
  const byMonth = new Map();
  for (const { t, n } of d.daily) byMonth.set(monthKey(t), (byMonth.get(monthKey(t)) || 0) + n);
  let total = 0;
  return [...byMonth.entries()].sort().map(([m, n]) => {
    total += n;
    return { month: monthStart(m), n, total };
  });
}

const X_MONTH = {
  field: 'month', type: 'temporal', timeUnit: 'utcyearmonth', title: null,
  axis: { format: '%Y', grid: false, tickCount: 'year', labelOverlap: true },
};

function monthlySpec({ rows, order }) {
  return {
    width: 'container',
    height: 300,
    data: { values: rows },
    mark: { type: 'bar', strokeWidth: 0 }, // bars are too thin for a gap
    encoding: {
      x: X_MONTH,
      y: { aggregate: 'sum', field: 'n', type: 'quantitative', title: 'Samples', axis: { format: '~s' } },
      color: {
        field: 'organism', type: 'nominal', sort: order, scale: colorScale(order),
        legend: { orient: 'bottom', columns: 1, title: null, labelLimit: 360 },
      },
      order: { field: 'rank', type: 'quantitative' },
      tooltip: [
        { field: 'month', type: 'temporal', timeUnit: 'utcyearmonth', title: 'Month', format: '%B %Y' },
        { field: 'organism', title: 'Organism' },
        { aggregate: 'sum', field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
      ],
    },
    transform: [{ calculate: `indexof(${JSON.stringify(order)}, datum.organism)`, as: 'rank' }],
  };
}

function cumulativeSpec(rows) {
  const x = X_MONTH;
  const y = { field: 'total', type: 'quantitative', title: 'Samples (cumulative)', axis: { format: '~s' } };
  return {
    width: 'container',
    height: 300,
    data: { values: rows },
    layer: [
      { mark: { type: 'area', interpolate: 'monotone', color: '#4A63E726', line: { color: PALETTE[0], strokeWidth: 2 } }, encoding: { x, y } },
      {
        params: [{ name: 'hover', select: { type: 'point', encodings: ['x'], nearest: true, on: 'pointerover', clear: 'pointerout' } }],
        mark: { type: 'rule', color: '#9aa3b2' },
        encoding: {
          x,
          opacity: { condition: { param: 'hover', empty: false, value: 1 }, value: 0 },
          tooltip: [
            { field: 'month', type: 'temporal', timeUnit: 'utcyearmonth', title: 'Month', format: '%B %Y' },
            { field: 'n', type: 'quantitative', title: 'Samples that month', format: ',' },
            { field: 'total', type: 'quantitative', title: 'Total so far', format: ',' },
          ],
        },
      },
    ],
  };
}

function activity() {
  const el = document.getElementById('activity-chart');
  const table = document.getElementById('activity-table');
  const subtitle = document.getElementById('activity-subtitle');
  const btnMonthly = document.getElementById('activity-monthly');
  const btnCumulative = document.getElementById('activity-cumulative');
  let mode = 'cumulative';

  const draw = () => panel(el, async () => {
    const d = await loadIndex();
    if (mode === 'monthly') {
      subtitle.textContent = 'Samples collected per month, by organism';
      const m = await monthlyByOrganism(d);
      el.innerHTML = '';
      await embed(el, monthlySpec(m));
      dataTable(table, [{ key: 'month', label: 'Month' }, { key: 'organism', label: 'Organism' }, { key: 'n', label: 'Samples' }],
        m.rows.map((r) => ({ ...r, month: r.month.slice(0, 7) })));
    } else {
      subtitle.textContent = 'Total samples collected up to each month';
      const rows = cumulativeRows(d);
      el.innerHTML = '';
      await embed(el, cumulativeSpec(rows));
      dataTable(table, [{ key: 'month', label: 'Month' }, { key: 'n', label: 'Samples' }, { key: 'total', label: 'Cumulative' }],
        rows.map((r) => ({ ...r, month: r.month.slice(0, 7) })));
    }
  });

  const setMode = (m) => {
    mode = m;
    btnMonthly.setAttribute('aria-pressed', String(m === 'monthly'));
    btnCumulative.setAttribute('aria-pressed', String(m === 'cumulative'));
    draw();
  };
  btnMonthly.onclick = () => setMode('monthly');
  btnCumulative.onclick = () => setMode('cumulative');
  draw();
}

// ─── Environmental sites ─────────────────────────────────────────────────────

function breakdownRows(buckets) {
  const counts = {};
  for (const b of buckets) {
    const k = (b.key === '__missing__' ? '' : trimBrackets(b.key)) || 'Unknown';
    counts[k] = (counts[k] || 0) + b.doc_count;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 8);
  const other = ranked.slice(8).reduce((s, [, n]) => s + n, 0);
  if (other) top.push(['Other', other]);
  const total = ranked.reduce((s, [, n]) => s + n, 0);
  return top.map(([category, value]) => ({ category, value, pct: value / total }));
}

// One horizontal 100% bar: largest share first, "Other" (gray) last.
// Segment edges are computed here so wide segments can carry their % label.
function breakdownSpec(rows, width) {
  let start = 0;
  const values = rows.map((r) => {
    const v = { ...r, start, end: start + r.pct, mid: start + r.pct / 2, label: `${r.category} (${(r.pct * 100).toFixed(1)}%)` };
    start += r.pct;
    return v;
  });
  const labels = values.map((r) => r.label);
  const { range } = colorScale(rows.map((r) => r.category)); // "Other" stays gray
  const tooltip = [
    { field: 'category', title: 'Environmental site' },
    { field: 'value', type: 'quantitative', title: 'Samples', format: ',' },
    { field: 'pct', type: 'quantitative', title: 'Share', format: '.1%' },
  ];
  const x = { field: 'start', type: 'quantitative', title: null, scale: { domain: [0, 1] }, axis: { format: '%', grid: false, tickCount: 5 } };
  return {
    width: 'container',
    height: 40,
    data: { values },
    layer: [
      {
        mark: { type: 'bar', stroke: '#ffffff', strokeWidth: 2 },
        encoding: {
          x, x2: { field: 'end' }, tooltip,
          color: {
            field: 'label', type: 'nominal', sort: labels, scale: { domain: labels, range },
            legend: { orient: 'bottom', columns: width < 520 ? 1 : width < 900 ? 2 : 3, title: null, labelLimit: 300 },
          },
        },
      },
      {
        transform: [{ filter: 'datum.pct >= 0.08' }],
        mark: { type: 'text', color: '#ffffff', fontSize: 12, fontWeight: 600 },
        encoding: { x: { field: 'mid', type: 'quantitative' }, text: { field: 'pct', format: '.0%' }, tooltip },
      },
    ],
  };
}

function breakdown() {
  const el = document.getElementById('breakdown-chart');
  panel(el, async () => {
    const rows = breakdownRows((await loadIndex()).envBuckets);
    el.innerHTML = '';
    await embed(el, breakdownSpec(rows, el.clientWidth));
    dataTable(document.getElementById('breakdown-table'),
      [{ key: 'category', label: 'Environmental site' }, { key: 'value', label: 'Samples' }],
      rows);
  });
}

// ─── Map ─────────────────────────────────────────────────────────────────────

function coverage() {
  const el = document.getElementById('coverage-chart');
  panel(el, async () => {
    const d = await loadIndex();
    el.innerHTML = '';
    const approx = await drawMap(el, d.sites);
    document.getElementById('coverage-note').textContent =
      approx ? `${approx} site${approx === 1 ? '' : 's'} without coordinates are placed at their province's capital.` : '';
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────

hero();
whenVisible(document.getElementById('activity'), activity);
whenVisible(document.getElementById('breakdown'), breakdown);
whenVisible(document.getElementById('coverage'), coverage);
setFooter();
