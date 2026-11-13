// Data quality checks page (qa.html) for data stewards, linked from the Interactive Dashboard footer.
// All live except "Viral measurement values", which comes from the nightly build (data/viral/meta.json).
// Field dropdowns list every portal field: the list comes live from the API (configs.extended).
import { gql, aliased, aliasedMany, and, isIn, dateRange, years, months, fieldList } from './api.js';
import { trimBrackets, isNull, parseCoord, valuePattern } from './rules.js';
import {
  COMPLETENESS_FIELDS, REQUIRED_FIELDS, QA_NAME_FIELDS, QA_GROUP_FIELDS, QA_MAX_GROUPS, QA_DEFAULTS, QA_FILTER_FIELD, EXPLORER_FIELDS,
  DATE_FIELD, ACTIVE_DAYS, PALETTE, OTHER_COLOR, SARS2_MAX,
} from './config.js';
import { embed, panel, whenVisible, dataTable, viralMeta, fmt, setFooter, getParam, setParams, SPINNER } from './charts.js';

const DAY = 86400000;
const TODAY = Math.floor(Date.now() / DAY) * DAY;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '–');
// Used only if the field list can't load: fields the API stores as numbers/dates (stats, not buckets).
const NUMERIC = new Set([
  'sample_collection_start_date', 'sample_collection_end_date', 'presampling_activity_date', 'sequencing_date',
  'amplicon_size', 'host_age', 'water_catchment_area_human_population_measurement_value',
]);
const ISSUE = PALETTE[1]; // orange marks the problem in every QA chart
const OK = PALETTE[0];
const OTHER_VALUES = '#6b7280'; // "Other values" (real values) next to "Blank" (OTHER_COLOR)
const SCAN = 200; // buckets read per field to find "Not Provided" etc.; exact for fields with fewer values
const MAX_BUCKETS = 5000;
// Phones: legend below in one column, shorter axis labels.
const narrow = (el) => el.clientWidth < 600;
const legend = (el) => ({ title: null, labelLimit: 320, orient: narrow(el) ? 'bottom' : 'top', columns: narrow(el) ? 1 : undefined });
const labels = (el) => (narrow(el) ? 130 : 300);
const note = (el, text) => {
  const p = document.createElement('p');
  p.className = 'qa-note';
  p.textContent = text;
  el.append(p);
};
const div = (parent) => parent.appendChild(document.createElement('div'));

// ─── Fields ──────────────────────────────────────────────────────────────────

const FIELDS = {}; // field -> { label, num, date }
const KNOWN = { ...EXPLORER_FIELDS, ...QA_GROUP_FIELDS, ...QA_NAME_FIELDS, ...COMPLETENESS_FIELDS };
const label = (f) => FIELDS[f]?.label || f;
const isNum = (f) => (FIELDS[f] ? FIELDS[f].num : NUMERIC.has(f));

async function loadFields() {
  let list;
  try {
    list = await fieldList();
  } catch (err) {
    console.error(err);
    list = Object.fromEntries(Object.keys(COMPLETENESS_FIELDS).map((f) => [f, { name: f, type: NUMERIC.has(f) ? 'long' : 'keyword' }]));
  }
  for (const [f, m] of Object.entries(list)) {
    FIELDS[f] = { label: KNOWN[f] || m.name.charAt(0).toUpperCase() + m.name.slice(1), num: m.type !== 'keyword', date: m.type === 'date' };
  }
}

// ─── Page-wide filter ("only this organisation") ─────────────────────────────

// SQON group every query is limited to, or null for all records. Set by the bar at the top.
let FILTER = null;
// Block filter = page filter + this block's own conditions (and() drops the null).
const scoped = (...content) => and(FILTER, ...content);

// One aggregation request under a filter (default: the page filter) -> { total, a: aggregations }.
async function agg(sel, filter = FILTER) {
  const { analysis: x } = await gql(`query($f: JSON) { analysis { hits(first: 0, filters: $f) { total }
    aggregations(filters: $f, aggregations_filter_themselves: true) { ${sel} } } }`, { f: filter });
  return { total: x.hits.total, a: x.aggregations };
}

// Selection for one field: buckets (values) or stats (numbers, dates).
const aggSel = (f, max = SCAN) => (isNum(f) ? `data__${f} { stats { count } }` : `data__${f} { buckets(max: ${max}) { key doc_count } }`);

// One field's aggregation -> { recorded, nullN, nulls: { term: n }, blank } out of `total` records.
// Blank is the exact __missing__ bucket; "Not provided" terms are found among the buckets read.
function states(f, agg, total) {
  if (isNum(f)) {
    const recorded = Math.min(agg.stats.count, total);
    return { recorded, nullN: 0, nulls: {}, blank: total - recorded };
  }
  let blank = 0;
  let nullN = 0;
  const nulls = {};
  for (const b of agg.buckets) {
    if (b.key === '__missing__') blank = b.doc_count;
    else if (isNull(b.key)) {
      const k = trimBrackets(b.key) || '(empty text)';
      nulls[k] = (nulls[k] || 0) + b.doc_count;
      nullN += b.doc_count;
    }
  }
  blank = Math.min(blank, total);
  nullN = Math.min(nullN, total - blank); // multivalued fields can list a sample twice
  return { recorded: total - blank - nullN, nullN, nulls, blank };
}

// All values of one field (up to MAX_BUCKETS) and the record total. Shared by several reports (memoised).
async function valuesOf(f, filter = FILTER) {
  const { total, a } = await agg(`data__${f} { buckets(max: ${MAX_BUCKETS}) { key doc_count } }`, filter);
  return { total, buckets: a[`data__${f}`].buckets };
}

// Buckets merged by name without the [ontology id]: [{ label, raw: [keys], n, isNull }], largest first.
function merge(buckets) {
  const by = new Map();
  for (const b of buckets) {
    if (b.key === '__missing__') continue;
    const k = isNull(b.key) ? `(${trimBrackets(b.key) || 'empty text'})` : trimBrackets(b.key);
    const e = by.get(k) || { label: k, raw: [], n: 0, isNull: isNull(b.key) };
    e.raw.push(b.key);
    e.n += b.doc_count;
    by.set(k, e);
  }
  return [...by.values()].sort((x, y) => y.n - x.n);
}

// Values that differ only by capitals, spacing or ontology id, and several values packed into one.
function spellings(fieldLabel, buckets) {
  const rows = [];
  const groups = {};
  for (const b of buckets) {
    if (b.key === '__missing__') continue;
    // ";" inside brackets is part of a description ("Facility 1 (two wings; hospital)"), not a list.
    if (b.key.replace(/\([^)]*\)/g, '').includes(';')) rows.push({ field: fieldLabel, issue: 'Several values in one', values: b.key, n: b.doc_count });
    const k = trimBrackets(b.key).toLowerCase().replace(/\s+/g, ' ');
    (groups[k] ||= []).push(b);
  }
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    rows.push({
      field: fieldLabel,
      issue: 'Same value, different spelling',
      values: g.map((b) => `"${b.key}" (${fmt(b.doc_count)})`).join(' / '),
      n: g.reduce((s, b) => s + b.doc_count, 0),
    });
  }
  return rows;
}
const SPELL_COLS = [{ key: 'field', label: 'Field' }, { key: 'issue', label: 'Issue' }, { key: 'values', label: 'Values (samples)' }, { key: 'n', label: 'Samples' }];

// ─── 1. Metadata completeness ────────────────────────────────────────────────

const STATES = ['Recorded', 'Not provided / not applicable', 'Blank'];
const STATE_COLORS = [OK, ISSUE, OTHER_COLOR];

// Stacked share bar per row (`y`): Recorded / Not provided / Blank. Rows: { [y], state, rank, n, pct }.
function stateBars(el, rows, y, yTitle, order, step = 26) {
  return embed(el, {
    width: 'container',
    height: { step },
    data: { values: rows },
    mark: { type: 'bar', height: { band: 0.72 } },
    encoding: {
      y: { field: y, type: 'nominal', sort: order, title: null, axis: { labelLimit: labels(el) } },
      x: { aggregate: 'sum', field: 'n', type: 'quantitative', stack: 'normalize', title: 'Share of samples', axis: { format: '.0%' } },
      color: { field: 'state', type: 'nominal', sort: STATES, scale: { domain: STATES, range: STATE_COLORS }, legend: legend(el) },
      order: { field: 'rank', type: 'quantitative' },
      tooltip: [
        { field: y, title: yTitle },
        { field: 'state', title: 'Status' },
        { aggregate: 'sum', field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
        { aggregate: 'sum', field: 'pct', type: 'quantitative', title: 'Share', format: '.1%' },
      ],
    },
  });
}

async function completeness(el, tableEl, { set }) {
  const fields = set === 'all' ? Object.keys(FIELDS) : Object.keys(COMPLETENESS_FIELDS);
  const { total, a } = await agg(fields.map((f) => aggSel(f)).join('\n'));
  if (!total) return empty(el);
  const rows = [];
  for (const f of fields) {
    const s = states(f, a[`data__${f}`], total);
    const field = label(f) + (REQUIRED_FIELDS.includes(f) ? ' (required)' : '');
    [s.recorded, s.nullN, s.blank].forEach((n, i) => rows.push({ field, state: STATES[i], rank: i, n, pct: n / total, recordedPct: s.recorded / total }));
  }
  const order = [...new Set(rows.slice().sort((x, y) => x.recordedPct - y.recordedPct).map((r) => r.field))]; // worst first
  el.innerHTML = '';
  await stateBars(el, rows, 'field', 'Field', order, set === 'all' ? 20 : 26);
  if (set === 'all') note(el, `${fields.length} fields. "Not provided" counts are approximate for fields with more than ${SCAN} different values.`);
  dataTable(tableEl, [{ key: 'field', label: 'Field' }, { key: 'state', label: 'Status' }, { key: 'n', label: 'Samples' }], rows,
    { file: 'qa-completeness' });
}

// ─── 2. Completeness by group ────────────────────────────────────────────────

const groupBlocks = (group, list) => list.map((g, i) => ({ alias: `g${i}`, sqon: scoped(isIn(group, g.raw)) }));
const empty = (el) => { el.innerHTML = '<p class="qa-ok">No samples.</p>'; };
const leftOut = (el, all, group) => {
  if (all.length > QA_MAX_GROUPS) note(el, `Largest ${QA_MAX_GROUPS} of ${all.length} ${label(group).toLowerCase()} values shown.`);
};

async function byGroup(el, tableEl, { field, group }) {
  const all = merge((await valuesOf(group)).buckets);
  if (!all.length) return empty(el);
  const groups = all.slice(0, QA_MAX_GROUPS);
  const fields = field ? [field] : Object.keys(COMPLETENESS_FIELDS);
  const res = await aliasedMany(groupBlocks(group, groups), fields.map((f) => aggSel(f, 100)).join(' '), field ? 80 : 30);
  const rows = [];
  groups.forEach((g, i) => {
    for (const f of fields) {
      const s = states(f, res[`g${i}`][`data__${f}`], g.n);
      rows.push({ group: g.label, field: label(f), total: g.n, recorded: s.recorded, nullN: s.nullN, blank: s.blank, pct: g.n ? s.recorded / g.n : 0 });
    }
  });
  el.innerHTML = '';
  const groupOrder = groups.map((g) => g.label);
  if (field) {
    const bars = rows.flatMap((r) => [r.recorded, r.nullN, r.blank].map((n, i) => ({ group: r.group, state: STATES[i], rank: i, n, pct: r.total ? n / r.total : 0 })));
    await stateBars(el, bars, 'group', label(group), groupOrder, 22);
  } else {
    const small = narrow(el);
    await embed(el, {
      width: 'container',
      height: { step: 22 },
      data: { values: rows },
      encoding: {
        x: { field: 'field', type: 'nominal', sort: fields.map(label), title: null, axis: { orient: 'top', labelAngle: -40, labelLimit: 160 } },
        y: { field: 'group', type: 'nominal', sort: groupOrder, title: null, axis: { labelLimit: labels(el) } },
        tooltip: [ // shared, so hovering the % text works too
          { field: 'group', title: label(group) },
          { field: 'field', title: 'Field' },
          { field: 'pct', type: 'quantitative', title: 'Recorded', format: '.1%' },
          { field: 'nullN', type: 'quantitative', title: 'Not provided / not applicable', format: ',' },
          { field: 'blank', type: 'quantitative', title: 'Blank', format: ',' },
          { field: 'total', type: 'quantitative', title: 'Samples', format: ',' },
        ],
      },
      layer: [
        {
          mark: { type: 'rect', stroke: '#ffffff', strokeWidth: 2 },
          encoding: {
            color: {
              field: 'pct', type: 'quantitative', title: 'Recorded', scale: { domain: [0, 1], range: ['#eef1fd', OK] },
              legend: { format: '.0%', orient: small ? 'bottom' : 'right', gradientLength: small ? 200 : 160 },
            },
          },
        },
        ...(small ? [] : [{
          mark: { type: 'text', fontSize: 10 },
          encoding: {
            text: { field: 'pct', type: 'quantitative', format: '.0%' },
            color: { condition: { test: 'datum.pct > 0.55', value: '#ffffff' }, value: '#1f2933' },
          },
        }]),
      ],
    });
  }
  leftOut(el, all, group);
  note(el, `Samples with no ${label(group).toLowerCase()} are left out.`);
  dataTable(tableEl, [
    { key: 'group', label: label(group) }, { key: 'field', label: 'Field' }, { key: 'recorded', label: 'Recorded' },
    { key: 'nullN', label: 'Not provided / not applicable' }, { key: 'blank', label: 'Blank' }, { key: 'total', label: 'Samples' },
  ], rows, { file: 'qa-completeness-by-group' });
}

// ─── 3. Latest sample by group ───────────────────────────────────────────────

async function freshness(el, tableEl, { group }) {
  const all = merge((await valuesOf(group)).buckets);
  if (!all.length) return empty(el);
  const groups = all.slice(0, QA_MAX_GROUPS);
  const res = await aliasedMany(groupBlocks(group, groups), `data__${DATE_FIELD} { stats { max } }`);
  const statuses = [`Sampled in the last ${Math.round(ACTIVE_DAYS / 30.4)} months`, 'No recent samples'];
  const rows = groups.map((g, i) => {
    const latest = res[`g${i}`][`data__${DATE_FIELD}`].stats.max;
    const stale = !latest || latest < TODAY - ACTIVE_DAYS * DAY;
    return { name: g.label, n: g.n, latest: latest ? day(latest) : '', status: statuses[stale ? 1 : 0], days: latest ? Math.round((TODAY - latest) / DAY) : null };
  }).sort((x, y) => (y.latest || '').localeCompare(x.latest || ''));
  el.innerHTML = '';
  await embed(el, {
    width: 'container',
    height: { step: 22 },
    data: { values: rows.filter((r) => r.latest) },
    mark: { type: 'point', filled: true, size: 80, opacity: 1 },
    encoding: {
      y: { field: 'name', type: 'nominal', sort: null, title: null, axis: { labelLimit: labels(el) } },
      x: { field: 'latest', type: 'temporal', title: 'Latest collection date', axis: { format: '%Y', labelOverlap: true } },
      color: { field: 'status', type: 'nominal', scale: { domain: statuses, range: [OK, ISSUE] }, legend: legend(el) },
      tooltip: [
        { field: 'name', title: label(group) },
        { field: 'latest', type: 'temporal', title: 'Latest sample', format: '%Y-%m-%d' },
        { field: 'days', type: 'quantitative', title: 'Days ago', format: ',' },
        { field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
      ],
    },
  });
  leftOut(el, all, group);
  dataTable(tableEl, [{ key: 'name', label: label(group) }, { key: 'latest', label: 'Latest sample' }, { key: 'n', label: 'Samples' }], rows,
    { file: 'qa-latest-sample' });
}

// ─── 4. Field profile ────────────────────────────────────────────────────────

// 1, 2, 5 x 10^n step near `raw`.
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

async function profile(el, tableEl, { field: f }) {
  return isNum(f) ? numberProfile(el, tableEl, f) : textProfile(el, tableEl, f);
}

async function textProfile(el, tableEl, f) {
  const { total, buckets } = await valuesOf(f);
  if (!total) return empty(el);
  const s = states(f, { buckets }, total);
  const values = buckets.filter((b) => b.key !== '__missing__');
  const real = values.filter((b) => !isNull(b.key));
  const kind = (b) => (b.key === '__missing__' ? STATES[2] : isNull(b.key) ? STATES[1] : STATES[0]);
  const top = buckets.slice().sort((x, y) => y.doc_count - x.doc_count).slice(0, 25)
    .map((b) => ({ value: b.key === '__missing__' ? '(blank)' : b.key, kind: kind(b), n: b.doc_count, pct: b.doc_count / total }));
  el.innerHTML = '';
  await embed(el, {
    width: 'container',
    height: { step: 20 },
    data: { values: top },
    mark: { type: 'bar', height: { band: 0.72 } },
    encoding: {
      y: { field: 'value', type: 'nominal', sort: null, title: null, axis: { labelLimit: labels(el) } },
      x: { field: 'n', type: 'quantitative', title: 'Samples', axis: { format: '~s' } },
      color: { field: 'kind', type: 'nominal', sort: STATES, scale: { domain: STATES, range: STATE_COLORS }, legend: legend(el) },
      tooltip: [
        { field: 'value', title: 'Value' },
        { field: 'kind', title: 'Status' },
        { field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
        { field: 'pct', type: 'quantitative', title: 'Share', format: '.1%' },
      ],
    },
  });
  const nullText = Object.entries(s.nulls).map(([k, n]) => `${k} ${fmt(n)}`).join(', ');
  const many = buckets.length >= MAX_BUCKETS;
  note(el, `${fmt(total)} samples: ${pct(s.recorded, total)} recorded, ${pct(s.nullN, total)} not provided / not applicable${nullText ? ` (${nullText})` : ''}, ${pct(s.blank, total)} blank. `
    + `${many ? `More than ${fmt(MAX_BUCKETS)}` : fmt(real.length)} different values${many ? `; the ${fmt(MAX_BUCKETS)} most common are checked below` : ''}. Largest 25 shown.`);

  // Value patterns: mixed formats stand out ("9.9 A" next to "-9.9").
  const pats = new Map();
  for (const b of real) {
    const p = valuePattern(b.key);
    const e = pats.get(p) || { pattern: p, values: 0, n: 0, examples: [] };
    e.values += 1;
    e.n += b.doc_count;
    if (e.examples.length < 3) e.examples.push(b.key);
    pats.set(p, e);
  }
  const patRows = [...pats.values()].sort((x, y) => y.n - x.n).map((p) => ({ ...p, examples: p.examples.join(' | ') }));
  const spell = spellings(label(f), values);
  const [t1, t2, t3] = [div(tableEl), div(tableEl), div(tableEl)];
  dataTable(t1, [{ key: 'pattern', label: 'Pattern' }, { key: 'values', label: 'Different values' }, { key: 'n', label: 'Samples' }, { key: 'examples', label: 'Examples' }],
    patRows, { open: patRows.length > 1 && patRows.length <= 30, title: `${patRows.length} value pattern${patRows.length === 1 ? '' : 's'} (A = letters, 9 = digits)`, file: `qa-patterns-${f}` });
  if (spell.length) {
    dataTable(t2, SPELL_COLS, spell, { open: true, title: `${spell.length} value${spell.length === 1 ? '' : 's'} written more than one way`, file: `qa-spellings-${f}` });
  }
  dataTable(t3, [{ key: 'value', label: 'Value' }, { key: 'kind', label: 'Status' }, { key: 'n', label: 'Samples' }],
    values.map((b) => ({ value: b.key, kind: kind(b), n: b.doc_count })), { title: 'Show all values', file: `qa-values-${f}` });
}

async function numberProfile(el, tableEl, f) {
  const date = FIELDS[f]?.date;
  const { total, a } = await agg(`data__${f} { stats { count min max avg } }`);
  const st = a[`data__${f}`].stats;
  el.innerHTML = '';
  if (!st.count) {
    el.innerHTML = '<p class="qa-ok">No sample has a value in this field.</p>';
    return;
  }
  const span = st.max - st.min;
  const step = date ? Math.max(DAY, Math.ceil(span / 60 / DAY) * DAY) : Math.max(1, niceStep(span / 40));
  const extra = date
    ? aliased([{ alias: 'future', sqon: scoped({ op: '>=', content: { fieldName: `data.${f}`, value: TODAY + DAY } }) }], `data__${f} { stats { count } }`)
    : null;
  const { a: h } = await agg(`data__${f} { histogram(interval: ${step}) { buckets { key doc_count } } }`);
  const bins = h[`data__${f}`].histogram.buckets.filter((b) => b.doc_count)
    .map((b) => ({ from: Number(b.key), to: Number(b.key) + step, n: b.doc_count }));
  const type = date ? 'temporal' : 'quantitative';
  await embed(el, {
    width: 'container',
    height: 220,
    data: { values: bins },
    mark: { type: 'rect', color: OK, stroke: '#ffffff', strokeWidth: 1 },
    encoding: {
      x: { field: 'from', type, title: label(f), axis: date ? { format: '%Y', labelOverlap: true } : { format: '~s' } },
      x2: { field: 'to' },
      y: { field: 'n', type: 'quantitative', title: 'Samples', axis: { format: '~s' } },
      y2: { datum: 0 },
      tooltip: [
        { field: 'from', type, title: 'From', format: date ? '%Y-%m-%d' : ',' },
        { field: 'to', type, title: 'To (not including)', format: date ? '%Y-%m-%d' : ',' },
        { field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
      ],
    },
  });
  const range = date ? `Earliest ${day(st.min)}, latest ${day(st.max)}` : `Lowest ${fmt(st.min)}, highest ${fmt(st.max)}, mean ${fmt(Math.round(st.avg * 100) / 100)}`;
  const future = extra ? (await extra).future[`data__${f}`].stats.count : 0;
  note(el, `${fmt(total)} samples: ${fmt(st.count)} (${pct(st.count, total)}) have a value, ${fmt(total - st.count)} (${pct(total - st.count, total)}) blank. ${range}.${date ? ` ${fmt(future)} dated after today.` : ''}`);
  dataTable(tableEl, [{ key: 'from', label: 'From' }, { key: 'to', label: 'To (not including)' }, { key: 'n', label: 'Samples' }],
    bins.map((b) => (date ? { ...b, from: day(b.from), to: day(b.to) } : b)), { file: `qa-histogram-${f}` });
}

// ─── 5. Field over time ──────────────────────────────────────────────────────

const VALUE_COLORS = PALETTE.filter((c) => c !== ISSUE); // orange stays "not provided"

async function overTime(el, tableEl, { field: f, period }) {
  const { a: ag } = await agg(`data__${DATE_FIELD} { stats { min max } histogram(interval: ${DAY}) { buckets { key doc_count } } }`);
  const d = ag[`data__${DATE_FIELD}`];
  if (!d.stats.min) return empty(el);
  const ps = (period === 'month' ? months : years)(d.stats.min, d.stats.max);
  const keyOf = (t) => new Date(t).toISOString().slice(0, period === 'month' ? 7 : 4);
  const totals = new Map();
  for (const b of d.histogram.buckets) totals.set(keyOf(Number(b.key)), (totals.get(keyOf(Number(b.key))) || 0) + b.doc_count);
  const top = isNum(f) ? [] : merge((await valuesOf(f)).buckets).filter((v) => !v.isNull).slice(0, VALUE_COLORS.length);
  const res = await aliasedMany(ps.map((p, i) => ({ alias: `p${i}`, sqon: scoped(dateRange(p.start, p.end)) })), aggSel(f, 100));
  const cats = isNum(f) ? ['Recorded', STATES[2]] : [...top.map((v) => v.label), 'Other values', STATES[1], STATES[2]];
  const colors = isNum(f) ? [OK, OTHER_COLOR] : [...top.map((_, i) => VALUE_COLORS[i]), OTHER_VALUES, ISSUE, OTHER_COLOR];
  const rows = [];
  ps.forEach((p, i) => {
    const total = totals.get(p.key) || 0;
    if (!total) return;
    const agg = res[`p${i}`][`data__${f}`];
    const s = states(f, agg, total);
    const counts = isNum(f) ? [s.recorded, s.blank] : (() => {
      const byLabel = new Map();
      for (const b of agg.buckets) if (!isNull(b.key)) byLabel.set(trimBrackets(b.key), (byLabel.get(trimBrackets(b.key)) || 0) + b.doc_count);
      const tops = top.map((v) => byLabel.get(v.label) || 0);
      const sum = tops.reduce((x, y) => x + y, 0);
      return [...tops, Math.max(0, s.recorded - sum), s.nullN, s.blank];
    })();
    counts.forEach((n, k) => { if (n) rows.push({ period: period === 'month' ? `${p.key}-01` : `${p.key}-01-01`, key: p.key, cat: cats[k], rank: k, n, pct: n / total }); });
  });
  el.innerHTML = '';
  await embed(el, {
    width: 'container',
    height: 300,
    data: { values: rows },
    mark: { type: 'bar', ...(period === 'month' ? { strokeWidth: 0 } : {}) },
    encoding: {
      x: period === 'month'
        ? { field: 'period', type: 'temporal', timeUnit: 'utcyearmonth', title: null, axis: { format: '%b %Y', labelOverlap: true, grid: false } }
        : { field: 'key', type: 'ordinal', title: null, axis: { labelAngle: narrow(el) ? -90 : 0, grid: false } },
      y: { aggregate: 'sum', field: 'n', type: 'quantitative', stack: 'normalize', title: 'Share of samples', axis: { format: '.0%' } },
      color: { field: 'cat', type: 'nominal', sort: cats, scale: { domain: cats, range: colors }, legend: { ...legend(el), orient: 'bottom', columns: narrow(el) ? 1 : 3 } },
      order: { field: 'rank', type: 'quantitative' },
      tooltip: [
        { field: 'key', title: period === 'month' ? 'Month' : 'Year' },
        { field: 'cat', title: label(f) },
        { aggregate: 'sum', field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
        { aggregate: 'sum', field: 'pct', type: 'quantitative', title: 'Share', format: '.1%' },
      ],
    },
  });
  note(el, `By ${label(DATE_FIELD).toLowerCase()}; samples without one are left out.${isNum(f) ? '' : ` ${top.length === 1 ? 'The most common value has its' : `The ${top.length} most common values have their`} own colour.`}`);
  dataTable(tableEl, [{ key: 'key', label: period === 'month' ? 'Month' : 'Year' }, { key: 'cat', label: label(f) }, { key: 'n', label: 'Samples' }], rows,
    { file: `qa-over-time-${f}` });
}

// ─── 6. Each X should have one Y ─────────────────────────────────────────────

const MAX_BLOCKS = 1000;

async function oneToOne(el, tableEl, { each: fa, one: fb }) {
  if (fa === fb) {
    el.innerHTML = '<p class="qa-ok">Pick two different fields.</p>';
    return;
  }
  const [A, B] = await Promise.all([valuesOf(fa), valuesOf(fb)]);
  const va = merge(A.buckets).filter((v) => !v.isNull);
  const vb = merge(B.buckets);
  // One block per value of the field with fewer values; the other field's values inside.
  const onB = vb.length <= va.length;
  const [side, sideField, other] = onB ? [vb, fb, fa] : [va, fa, fb];
  if (side.length > MAX_BLOCKS) {
    el.innerHTML = `<p class="qa-ok">Both fields have more than ${fmt(MAX_BLOCKS)} different values: too many to compare. Pick a field with fewer values.</p>`;
    return;
  }
  const res = await aliasedMany(side.map((v, i) => ({ alias: `v${i}`, sqon: scoped(isIn(sideField, v.raw)) })), `data__${other} { buckets(max: ${MAX_BUCKETS}) { key doc_count } }`);
  const map = new Map(); // value of A -> Map(value of B -> samples)
  let cut = false;
  side.forEach((v, i) => {
    const inner = res[`v${i}`][`data__${other}`].buckets;
    if (inner.length >= MAX_BUCKETS) cut = true;
    for (const b of merge(inner)) {
      const [a, bv] = onB ? [b, v] : [v, b];
      if (a.isNull) continue;
      const m = map.get(a.label) || new Map();
      m.set(bv.label, (m.get(bv.label) || 0) + b.n);
      map.set(a.label, m);
    }
  });
  const rows = [...map].filter(([, m]) => m.size > 1).map(([a, m]) => {
    const list = [...m].sort((x, y) => y[1] - x[1]);
    return { a, count: m.size, values: list.map(([k, n]) => `"${k}" (${fmt(n)})`).join(' / '), n: list.reduce((s, x) => s + x[1], 0) };
  }).sort((x, y) => y.count - x.count || y.n - x.n);
  const [la, lb] = [label(fa), label(fb)];
  el.innerHTML = rows.length ? '' : `<p class="qa-ok">No problems found: every ${la.toLowerCase()} has one ${lb.toLowerCase()}.</p>`;
  if (rows.length) note(el, `${fmt(rows.length)} of ${fmt(map.size)} ${la.toLowerCase()} values have more than one ${lb.toLowerCase()}.`);
  if (A.buckets.length >= MAX_BUCKETS || cut) note(el, `${la} has more than ${fmt(MAX_BUCKETS)} different values: only the most common were checked.`);
  if (rows.length) {
    dataTable(tableEl, [{ key: 'a', label: la }, { key: 'count', label: `Different ${lb.toLowerCase()} values` }, { key: 'values', label: `${lb} (samples)` }, { key: 'n', label: 'Samples' }],
      rows, { open: true, title: `${rows.length} value${rows.length === 1 ? '' : 's'} to check`, file: `qa-one-${fa}-${fb}` });
  }
}

// ─── 7. Values written more than one way ─────────────────────────────────────

async function names(el) {
  const fields = Object.keys(QA_NAME_FIELDS);
  const { a } = await agg(fields.map((f) => `data__${f} { buckets(max: 5000) { key doc_count } }`).join(' '));
  const rows = fields.flatMap((f) => spellings(QA_NAME_FIELDS[f], a[`data__${f}`].buckets));
  el.innerHTML = rows.length ? '' : '<p class="qa-ok">No problems found.</p>';
  if (rows.length) {
    dataTable(el, SPELL_COLS, rows, { open: true, title: `${rows.length} value${rows.length === 1 ? '' : 's'} to fix`, file: 'qa-spellings' });
  }
}

// ─── 8. Locations ────────────────────────────────────────────────────────────

const LOC = ['Usable coordinates', 'No usable coordinates'];

async function locations(el, tableEl) {
  const src = ['data.geo_loc_latitude', 'data.geo_loc_longitude', 'data.geo_loc_name_state_province_territory'];
  const { total, a: aggs } = await agg(`
    data__geo_loc_name_site { buckets(max: 5000) { key doc_count top_hits(_source: ${JSON.stringify(src)}, size: 1) } }
    data__geo_loc_name_state_province_territory { buckets(max: 100) { key doc_count } }`);
  if (!total) return empty(el);
  const a = { aggregations: aggs };
  const by = {};
  for (const b of a.aggregations.data__geo_loc_name_site.buckets) {
    if (isNull(b.key)) continue;
    const r = b.top_hits?.data || {};
    const prov = trimBrackets(r.geo_loc_name_state_province_territory) || '(blank)';
    const ok = parseCoord(r.geo_loc_latitude, 'lat') != null && parseCoord(r.geo_loc_longitude, 'lon') != null;
    by[prov] ||= { province: prov, [LOC[0]]: 0, [LOC[1]]: 0 };
    by[prov][LOC[ok ? 0 : 1]] += 1;
  }
  const provs = Object.values(by).sort((x, y) => y[LOC[1]] - x[LOC[1]] || x.province.localeCompare(y.province));
  const rows = provs.flatMap((p) => LOC.map((s, i) => ({ province: p.province, status: s, rank: i, n: p[s] })));
  const siteBuckets = a.aggregations.data__geo_loc_name_site.buckets.filter((b) => isNull(b.key));
  const provBuckets = a.aggregations.data__geo_loc_name_state_province_territory.buckets.filter((b) => isNull(b.key));
  const noSite = siteBuckets.reduce((s, b) => s + b.doc_count, 0);
  const noProv = provBuckets.reduce((s, b) => s + b.doc_count, 0);
  el.innerHTML = '';
  await embed(el, {
    width: 'container',
    height: { step: 24 },
    data: { values: rows },
    mark: { type: 'bar', height: { band: 0.72 } },
    encoding: {
      y: { field: 'province', type: 'nominal', sort: provs.map((p) => p.province), title: null, axis: { labelLimit: labels(el) } },
      x: { aggregate: 'sum', field: 'n', type: 'quantitative', stack: true, title: 'Sites' },
      color: { field: 'status', type: 'nominal', sort: LOC, scale: { domain: LOC, range: [OK, ISSUE] }, legend: legend(el) },
      order: { field: 'rank', type: 'quantitative' },
      tooltip: [{ field: 'province', title: 'Province/Territory' }, { field: 'status', title: 'Status' }, { aggregate: 'sum', field: 'n', type: 'quantitative', title: 'Sites' }],
    },
  });
  note(el, `${fmt(noSite)} samples have no site recorded; ${fmt(noProv)} have no province/territory recorded.`);
  dataTable(tableEl, [{ key: 'province', label: 'Province/Territory' }, { key: 'status', label: 'Status' }, { key: 'n', label: 'Sites' }], rows,
    { file: 'qa-locations' });
}

// ─── 9. Viral measurement values (nightly build) ─────────────────────────────

async function measurements(el, tableEl) {
  const m = await viralMeta();
  if (!m?.qa) {
    el.innerHTML = '<p class="qa-ok">Available after the next nightly build.</p>';
    return;
  }
  const q = m.qa;
  const cats = [
    ['Plotted', q.plotted, OK],
    ['Not provided / blank', q.missing, OTHER_COLOR],
    ['Text, not a number', q.text, ISSUE],
    [`SARS-CoV-2 above the cap (>${SARS2_MAX})`, q.capped, PALETTE[3]],
  ];
  const total = cats.reduce((s, c) => s + c[1], 0);
  let start = 0;
  const rows = cats.map(([cat, n]) => {
    const r = { cat, n, pct: n / total, start, end: start + n / total };
    start = r.end;
    return r;
  });
  el.innerHTML = '';
  await embed(el, {
    width: 'container',
    height: 40,
    data: { values: rows },
    mark: { type: 'bar', stroke: '#ffffff', strokeWidth: 2 },
    encoding: {
      x: { field: 'start', type: 'quantitative', title: null, scale: { domain: [0, 1] }, axis: { format: '%', grid: false } },
      x2: { field: 'end' },
      color: { field: 'cat', type: 'nominal', sort: cats.map((c) => c[0]), scale: { domain: cats.map((c) => c[0]), range: cats.map((c) => c[2]) }, legend: { ...legend(el), orient: 'bottom' } },
      tooltip: [{ field: 'cat', title: 'Measurement' }, { field: 'n', type: 'quantitative', title: 'Count', format: ',' }, { field: 'pct', type: 'quantitative', title: 'Share', format: '.1%' }],
    },
  });
  if (FILTER) note(el, 'Not limited by the organisation filter: the nightly build counts all organisations.');
  note(el, `${fmt(total)} measurements in ${fmt(m.records)} RT-PCR records; ${fmt(q.noDate)} records have no collection date and are left out. Build of ${new Date(m.generatedAt).toLocaleDateString('en-CA', { dateStyle: 'medium' })}.`);
  const table = [
    ...q.textValues.map(([v, n]) => ({ kind: 'Text value', value: v, n })),
    ...q.units.map(([v, n]) => ({ kind: 'Unit of plotted values', value: v, n })),
  ];
  dataTable(tableEl, [{ key: 'kind', label: 'Kind' }, { key: 'value', label: 'Value' }, { key: 'n', label: 'Measurements' }], table,
    { title: 'Show most common text values and units', file: 'qa-viral-values' });
}

// ─── Start ───────────────────────────────────────────────────────────────────

// Dropdown choices: a list of [value, label], or 'fields' / 'text' (every portal field / text fields only).
const GROUPS = Object.entries(QA_GROUP_FIELDS);
const D = QA_DEFAULTS;
// [title, subtitle, run(chart, table, choices), controls: { name, key (URL), label, options, dflt, first? }]
const CHECKS = [
  ['Metadata completeness', 'How often each field holds a real value. Worst first.', completeness, [
    { name: 'set', key: 'fields', label: 'Fields', options: [['key', 'Key fields'], ['all', 'All fields']], dflt: 'key' },
  ]],
  ['Completeness by group', 'Who fills a field in and who leaves it out: share of each group\'s samples with a real value.', byGroup, [
    { name: 'field', key: 'gfield', label: 'Field', options: 'fields', first: ['', 'All key fields (heatmap)'], dflt: D.groupField },
    { name: 'group', key: 'group', label: 'Group by', options: GROUPS, dflt: D.group },
  ]],
  ['Latest sample by group', 'Groups with no samples in the last 12 months are orange.', freshness, [
    { name: 'group', key: 'lgroup', label: 'Group by', options: GROUPS, dflt: 'sample_collected_by_organisation_name' },
  ]],
  ['Field profile', 'Everything about one field: most common values, how it is left empty, value formats and spellings. Number and date fields show their range.', profile, [
    { name: 'field', key: 'profile', label: 'Field', options: 'fields', dflt: D.profile },
  ]],
  ['Field over time', 'How a field is filled in over time: spot when a value, unit or habit changed.', overTime, [
    { name: 'field', key: 'tfield', label: 'Field', options: 'fields', dflt: D.timeField },
    { name: 'period', key: 'period', label: 'By', options: [['year', 'Year'], ['month', 'Month']], dflt: 'year' },
  ]],
  ['One value per item', 'Values of the first field that appear with more than one value of the second, e.g. a site recorded in two provinces. Names are compared without the ontology id.', oneToOne, [
    { name: 'each', key: 'each', label: 'Each', options: 'text', dflt: D.each },
    { name: 'one', key: 'one', label: 'should have one', options: 'text', dflt: D.one },
  ]],
  ['Values written more than one way', 'Values that differ only by capitals, spacing or ontology id, and fields holding several values in one. Any other field: see Field profile.', names],
  ['Sites without usable coordinates', 'Sites whose latitude/longitude is missing or not a number, by province. These sit at the province capital on the map.', locations],
  ['Viral measurement values', 'Why RT-PCR measurements are or are not plotted. From the nightly build.', measurements],
];

// Fields grouped: key fields first, then every other portal field A-Z.
function fieldOptions(sel, textOnly) {
  const ok = (f) => FIELDS[f] && !(textOnly && isNum(f));
  const key = Object.keys(COMPLETENESS_FIELDS).filter(ok);
  const rest = Object.keys(FIELDS).filter((f) => ok(f) && !key.includes(f)).sort((x, y) => label(x).localeCompare(label(y)));
  for (const [name, list] of [['Key fields', key], ['All other fields', rest]]) {
    const g = document.createElement('optgroup');
    g.label = name;
    list.forEach((f) => g.append(new Option(label(f), f)));
    sel.append(g);
  }
}

function control(row, c) {
  const wrap = document.createElement('label');
  wrap.className = 'field-select';
  wrap.innerHTML = `<span class="label">${c.label}</span>`;
  const sel = document.createElement('select');
  if (c.first) sel.add(new Option(c.first[1], c.first[0]));
  if (Array.isArray(c.options)) c.options.forEach(([v, l]) => sel.add(new Option(l, v)));
  else fieldOptions(sel, c.options === 'text');
  const has = (v) => v != null && [...sel.options].some((o) => o.value === v);
  sel.value = has(getParam(c.key)) ? getParam(c.key) : has(c.dflt) ? c.dflt : sel.options[0].value;
  wrap.append(sel);
  row.append(wrap);
  return sel;
}

const root = document.getElementById('qa-root');
root.innerHTML = `<div class="panel-loading" aria-busy="true">${SPINNER}</div>`;
await loadFields();
const orgs = merge((await valuesOf(QA_FILTER_FIELD, null).catch(() => ({ buckets: [] }))).buckets);
root.innerHTML = '';

// Filter bar: sticks under the site header so the active filter stays in view.
const bar = div(root);
bar.className = 'qa-filter';
const fsel = control(bar, {
  key: 'org', label: `Only this ${label(QA_FILTER_FIELD).toLowerCase()}`,
  first: ['', `All (${fmt(orgs.reduce((s, o) => s + o.n, 0))} samples)`], options: orgs.map((o) => [o.label, `${o.label} (${fmt(o.n)})`]), dflt: '',
});
const setFilter = () => {
  const o = orgs.find((x) => x.label === fsel.value);
  FILTER = o ? and(isIn(QA_FILTER_FIELD, o.raw)) : null;
  bar.classList.toggle('qa-filter-on', !!o);
  setParams({ org: o ? o.label : null });
};
setFilter();
const stick = () => { bar.style.top = `${document.querySelector('.site-header')?.offsetHeight || 0}px`; };
stick();
addEventListener('resize', stick);

const draws = []; // blocks already drawn: redrawn when the filter changes
for (const [title, sub, run, controls = []] of CHECKS) {
  const block = document.createElement('div');
  block.className = 'qa-block';
  block.innerHTML = `<h3>${title}</h3><p class="qa-sub">${sub}</p>`;
  const row = controls.length ? div(block) : null;
  if (row) row.className = 'axis-selects qa-controls';
  const sels = controls.map((c) => control(row, c));
  const chartHost = div(block);
  const tableHost = div(block);
  root.append(block);
  // Each draw renders into fresh boxes, so a slow earlier answer can't overwrite a newer one.
  const draw = () => {
    const choice = Object.fromEntries(controls.map((c, i) => [c.name, sels[i].value]));
    setParams(Object.fromEntries(controls.map((c, i) => [c.key, sels[i].value === c.dflt ? null : sels[i].value])));
    const chart = document.createElement('div');
    chart.className = 'qa-chart';
    const table = document.createElement('div');
    table.className = 'qa-table';
    chartHost.replaceChildren(chart);
    tableHost.replaceChildren(table);
    return panel(chart, () => run(chart, table, choice));
  };
  sels.forEach((s) => { s.onchange = draw; });
  whenVisible(block, () => { draws.push(draw); draw(); });
}
fsel.onchange = () => {
  setFilter();
  draws.forEach((d) => d());
};
setFooter();
