// Interactive Dashboard page: sample explorer and metadata completeness (live),
// viral loads (nightly files, js/viral.js).
import { gql, aliased, isIn, dateRange, years, months } from './api.js';
import { trimBrackets, isNull, monthKey } from './rules.js';
import {
  DATE_FIELD, EXPLORER_FIELDS, EXPLORER_DEFAULT_X, EXPLORER_DEFAULT_SEGMENT, EXPLORER_TOP_N, COMPLETENESS_FIELDS, PALETTE, OTHER_COLOR,
} from './config.js';
import { embed, panel, whenVisible, dataTable, colorScale, getParam, setParams, setFooter } from './charts.js';
import { initViral } from './viral.js';

const DAY = 86400000;
const TIME = { Year: years, 'Year-Month': months };
const isTime = (f) => f in TIME;
const label = (f) => EXPLORER_FIELDS[f] || COMPLETENESS_FIELDS[f] || f;
// Fields the API stores as numbers/dates: they have stats, not buckets.
const NUMERIC = new Set([
  'sample_collection_start_date', 'sample_collection_end_date', 'presampling_activity_date', 'sequencing_date',
  'amplicon_size', 'host_age', 'water_catchment_area_human_population_measurement_value',
]);

// ─── Explorer ────────────────────────────────────────────────────────────────

// Values per field, merged by name without the [ontology id]:
// { field: [{ label, raw: [keys], n }] sorted by n }, plus date range and daily counts.
function loadDimensions() {
  const fields = Object.keys(EXPLORER_FIELDS).filter((f) => !isTime(f));
  const q = `{ analysis { aggregations(aggregations_filter_themselves: true) {
    ${fields.map((f) => `data__${f} { buckets(max: 5000) { key doc_count } }`).join('\n')}
    data__${DATE_FIELD} { stats { min max } histogram(interval: ${DAY}) { buckets { key doc_count } } }
  } } }`;
  return gql(q).then(({ analysis: { aggregations: a } }) => {
    const dims = {};
    for (const f of fields) dims[f] = mergeBuckets(a[`data__${f}`].buckets);
    const d = a[`data__${DATE_FIELD}`];
    return { dims, min: d.stats.min, max: d.stats.max, daily: d.histogram.buckets.map((b) => [Number(b.key), b.doc_count]) };
  });
}

function mergeBuckets(buckets) {
  const by = new Map();
  for (const b of buckets) {
    if (b.key === '__missing__') continue;
    const k = trimBrackets(b.key) || b.key;
    const e = by.get(k) || { label: k, raw: [], n: 0 };
    e.raw.push(b.key);
    e.n += b.doc_count;
    by.set(k, e);
  }
  return [...by.values()].sort((a, b) => b.n - a.n);
}

const periodDate = (f, key) => (f === 'Year' ? `${key}-01-01` : `${key}-01`);

// -> rows [{ x, seg, n }] for any field pair. One request (dimensions are cached).
async function crossTab(x, seg, dim) {
  const periods = (f) => TIME[f](dim.min, dim.max);
  const name = (k) => trimBrackets(k) || k;

  // One field only: counts straight from the dimensions request.
  if (x === seg || (isTime(x) && isTime(seg))) {
    if (isTime(x)) {
      const keyOf = x === 'Year' ? (t) => new Date(t).getUTCFullYear().toString() : monthKey;
      const by = new Map();
      for (const [t, n] of dim.daily) by.set(keyOf(t), (by.get(keyOf(t)) || 0) + n);
      return [...by].filter(([, n]) => n).map(([k, n]) => ({ x: periodDate(x, k), seg: label(x), n }));
    }
    return dim.dims[x].map((v) => ({ x: v.label, seg: label(x), n: v.n }));
  }

  // Time on X: one block per period, values of the segment field inside.
  if (isTime(x)) {
    const ps = periods(x);
    const res = await aliased(ps.map((p, i) => ({ alias: `p${i}`, sqon: dateRange(p.start, p.end) })), `data__${seg} { buckets(max: 5000) { key doc_count } }`);
    const rows = [];
    ps.forEach((p, i) => {
      for (const b of res[`p${i}`][`data__${seg}`].buckets) {
        if (b.key !== '__missing__') rows.push({ x: periodDate(x, p.key), seg: name(b.key), n: b.doc_count });
      }
    });
    return rows;
  }

  // Time as segment: one block per period, values of the X field inside.
  if (isTime(seg)) {
    const ps = periods(seg);
    const res = await aliased(ps.map((p, i) => ({ alias: `p${i}`, sqon: dateRange(p.start, p.end) })), `data__${x} { buckets(max: 5000) { key doc_count } }`);
    const rows = [];
    ps.forEach((p, i) => {
      for (const b of res[`p${i}`][`data__${x}`].buckets) {
        if (b.key !== '__missing__') rows.push({ x: name(b.key), seg: p.key, n: b.doc_count });
      }
    });
    return rows;
  }

  // Two categories: one block per top segment value, one for all the rest ("Other").
  const values = dim.dims[seg];
  const top = values.slice(0, EXPLORER_TOP_N);
  const rest = values.slice(EXPLORER_TOP_N).flatMap((v) => v.raw);
  const blocks = top.map((v, i) => ({ alias: `s${i}`, sqon: { op: 'and', content: [isIn(seg, v.raw)] }, seg: v.label }));
  if (rest.length) blocks.push({ alias: 'other', sqon: { op: 'and', content: [isIn(seg, rest)] }, seg: 'Other' });
  const res = await aliased(blocks, `data__${x} { buckets(max: 5000) { key doc_count } }`);
  const rows = [];
  for (const b of blocks) {
    for (const k of res[b.alias][`data__${x}`].buckets) {
      if (k.key !== '__missing__') rows.push({ x: name(k.key), seg: b.seg, n: k.doc_count });
    }
  }
  return rows;
}

// Merge duplicate (x, seg) rows; fold segments past the top N into "Other".
function shape(rows, x, seg) {
  const totals = new Map();
  for (const r of rows) totals.set(r.seg, (totals.get(r.seg) || 0) + r.n);
  const ranked = [...totals.keys()].filter((s) => s !== 'Other').sort((a, b) => totals.get(b) - totals.get(a));
  const keep = new Set(ranked.slice(0, EXPLORER_TOP_N));
  const order = ranked.filter((s) => keep.has(s));
  if (isTime(seg)) order.sort(); // periods read best in time order
  const merged = new Map();
  for (const r of rows) {
    const s = keep.has(r.seg) ? r.seg : 'Other';
    const k = `${r.x}␞${s}`;
    const e = merged.get(k) || { x: r.x, seg: s, n: 0 };
    e.n += r.n;
    merged.set(k, e);
  }
  const out = [...merged.values()];
  if (out.some((r) => r.seg === 'Other')) order.push('Other');
  const xTotals = new Map();
  for (const r of out) xTotals.set(r.x, (xTotals.get(r.x) || 0) + r.n);
  const xOrder = [...xTotals.keys()].sort(isTime(x) ? undefined : (a, b) => xTotals.get(b) - xTotals.get(a));
  out.forEach((r) => { r.rank = order.indexOf(r.seg); });
  return { rows: out, order, xOrder };
}

function explorerSpec({ rows, order, xOrder }, x, seg, pct, narrow) {
  const time = isTime(x);
  const unit = x === 'Year' ? 'utcyear' : 'utcyearmonth';
  const xEnc = time
    ? { field: 'x', type: 'temporal', timeUnit: unit, title: null, axis: { format: x === 'Year' ? '%Y' : '%b %Y', labelOverlap: true, grid: false } }
    : { field: 'x', type: 'nominal', sort: xOrder, title: label(x), axis: { labelAngle: xOrder.length > 6 ? -35 : 0, labelLimit: 180 } };
  const single = order.length === 1;
  return {
    width: 'container',
    height: 480,
    data: { values: rows },
    mark: { type: 'bar', ...(time && x !== 'Year' ? { strokeWidth: 0 } : {}) }, // monthly bars too thin for a gap
    encoding: {
      x: xEnc,
      y: {
        aggregate: 'sum', field: 'n', type: 'quantitative', stack: pct ? 'normalize' : 'zero',
        title: pct ? 'Share of samples' : 'Samples', axis: { format: pct ? '.0%' : '~s' },
      },
      color: single
        ? { value: PALETTE[0] }
        : { field: 'seg', type: 'nominal', sort: order, scale: colorScale(order), legend: { title: label(seg), orient: narrow ? 'bottom' : 'right', columns: narrow ? 1 : undefined, labelLimit: 360 } },
      order: { field: 'rank', type: 'quantitative' },
      tooltip: [
        time ? { field: 'x', type: 'temporal', timeUnit: unit, title: label(x), format: x === 'Year' ? '%Y' : '%B %Y' } : { field: 'x', title: label(x) },
        ...(single ? [] : [{ field: 'seg', title: label(seg) }]),
        { aggregate: 'sum', field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
      ],
    },
  };
}

function explorer() {
  const xSel = document.getElementById('explorer-x');
  const segSel = document.getElementById('explorer-seg');
  const chart = document.getElementById('explorer-chart');
  const table = document.getElementById('explorer-table');
  const btnCount = document.getElementById('explorer-count');
  const btnPct = document.getElementById('explorer-pct');

  for (const [f, l] of Object.entries(EXPLORER_FIELDS)) {
    xSel.add(new Option(l, f));
    segSel.add(new Option(l, f));
  }
  const pick = (k, dflt) => (EXPLORER_FIELDS[getParam(k)] ? getParam(k) : dflt);
  xSel.value = pick('x', EXPLORER_DEFAULT_X);
  segSel.value = pick('seg', EXPLORER_DEFAULT_SEGMENT);
  let pct = getParam('pct') === '1';

  const draw = () => {
    const x = xSel.value;
    const seg = segSel.value;
    btnCount.setAttribute('aria-pressed', String(!pct));
    btnPct.setAttribute('aria-pressed', String(pct));
    setParams({ x: x === EXPLORER_DEFAULT_X ? null : x, seg: seg === EXPLORER_DEFAULT_SEGMENT ? null : seg, pct: pct ? '1' : null });
    return panel(chart, async () => {
      const dim = await loadDimensions();
      const shaped = shape(await crossTab(x, seg, dim), x, seg);
      chart.innerHTML = '';
      await embed(chart, explorerSpec(shaped, x, seg, pct, chart.clientWidth < 700));
      dataTable(table, [{ key: 'x', label: label(x) }, { key: 'seg', label: label(seg) }, { key: 'n', label: 'Samples' }],
        shaped.rows.map((r) => ({ ...r, x: isTime(x) ? r.x.slice(0, x === 'Year' ? 4 : 7) : r.x })));
    });
  };

  xSel.onchange = draw;
  segSel.onchange = draw;
  document.getElementById('explorer-swap').onclick = () => {
    [xSel.value, segSel.value] = [segSel.value, xSel.value];
    draw();
  };
  btnCount.onclick = () => { pct = false; draw(); };
  btnPct.onclick = () => { pct = true; draw(); };
  draw();
}

// ─── Metadata completeness ───────────────────────────────────────────────────

const STATES = ['Recorded', 'Not provided / not applicable', 'Blank'];

async function completenessRows() {
  const fields = Object.keys(COMPLETENESS_FIELDS);
  const q = `{ analysis { hits(first: 0) { total } aggregations(aggregations_filter_themselves: true, include_missing: true) {
    ${fields.map((f) => (NUMERIC.has(f) ? `data__${f} { stats { count } }` : `data__${f} { buckets(max: 5000) { key doc_count } }`)).join('\n')}
  } } }`;
  const { analysis: a } = await gql(q);
  const total = a.hits.total;
  const rows = [];
  for (const f of fields) {
    const agg = a.aggregations[`data__${f}`];
    let recorded = 0;
    let nulls = 0;
    if (NUMERIC.has(f)) recorded = agg.stats.count;
    else {
      for (const b of agg.buckets) {
        if (b.key === '__missing__') continue;
        if (isNull(b.key)) nulls += b.doc_count;
        else recorded += b.doc_count;
      }
    }
    // Multivalued fields can list a sample under several values: count each sample once.
    recorded = Math.min(recorded, total);
    nulls = Math.min(nulls, total - recorded);
    const blank = total - recorded - nulls;
    const field = COMPLETENESS_FIELDS[f];
    [recorded, nulls, blank].forEach((n, i) => rows.push({ field, state: STATES[i], rank: i, n, pct: n / total, recordedPct: recorded / total }));
  }
  return { rows, total };
}

function completenessSpec(rows, narrow) {
  const order = [...new Set(rows.slice().sort((a, b) => b.recordedPct - a.recordedPct).map((r) => r.field))];
  return {
    width: 'container',
    height: { step: 26 },
    data: { values: rows },
    mark: { type: 'bar', height: { band: 0.72 } },
    encoding: {
      y: { field: 'field', type: 'nominal', sort: order, title: null, axis: { labelLimit: 240 } },
      x: { aggregate: 'sum', field: 'n', type: 'quantitative', stack: 'normalize', title: 'Share of all samples', axis: { format: '.0%' } },
      color: { field: 'state', type: 'nominal', sort: STATES, scale: { domain: STATES, range: [PALETTE[0], PALETTE[1], OTHER_COLOR] }, legend: { orient: narrow ? 'bottom' : 'top', columns: narrow ? 1 : undefined, title: null, labelLimit: 300 } },
      order: { field: 'rank', type: 'quantitative' },
      tooltip: [
        { field: 'field', title: 'Field' },
        { field: 'state', title: 'Status' },
        { aggregate: 'sum', field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
        { aggregate: 'sum', field: 'pct', type: 'quantitative', title: 'Share', format: '.1%' },
      ],
    },
  };
}

function completeness() {
  const el = document.getElementById('completeness-chart');
  panel(el, async () => {
    const { rows } = await completenessRows();
    el.innerHTML = '';
    await embed(el, completenessSpec(rows, el.clientWidth < 600));
    dataTable(document.getElementById('completeness-table'),
      [{ key: 'field', label: 'Field' }, { key: 'state', label: 'Status' }, { key: 'n', label: 'Samples' }],
      rows);
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────

explorer();
whenVisible(document.getElementById('completeness'), completeness);
const viral = document.getElementById('viral');
const startViral = () => initViral(document.getElementById('viral-root'));
// Deep link from the map (?site=…#viral): load straight away instead of waiting for scroll.
if (getParam('site') || location.hash === '#viral') startViral();
else whenVisible(viral, startViral);
setFooter();
