// Data quality checks for data stewards (Interactive Dashboard, not in the public view).
// Loaded only when opened: footer button or ?qa=1. All live except "Viral measurement values",
// which comes from the nightly build (data/viral/meta.json).
import { gql, aliased, isIn } from './api.js';
import { trimBrackets, isNull, parseCoord } from './rules.js';
import { COMPLETENESS_FIELDS, REQUIRED_FIELDS, QA_NAME_FIELDS, DATE_FIELD, ACTIVE_DAYS, PALETTE, OTHER_COLOR } from './config.js';
import { embed, panel, dataTable, viralMeta, fmt } from './charts.js';

const DAY = 86400000;
const TODAY = Math.floor(Date.now() / DAY) * DAY;
const day = (t) => new Date(t).toISOString().slice(0, 10);
// Fields the API stores as numbers/dates: they have stats, not buckets.
const NUMERIC = new Set([
  'sample_collection_start_date', 'sample_collection_end_date', 'presampling_activity_date', 'sequencing_date',
  'amplicon_size', 'host_age', 'water_catchment_area_human_population_measurement_value',
]);
const ISSUE = PALETTE[1]; // orange marks the problem in every QA chart
const OK = PALETTE[0];
// Phones: legend below in one column, shorter axis labels.
const narrow = (el) => el.clientWidth < 600;
const legend = (el) => ({ title: null, labelLimit: 320, orient: narrow(el) ? 'bottom' : 'top', columns: narrow(el) ? 1 : undefined });
const labels = (el) => (narrow(el) ? 130 : 300);

// ─── 1. Metadata completeness ────────────────────────────────────────────────

const STATES = ['Recorded', 'Not provided / not applicable', 'Blank'];

async function completeness(el, tableEl) {
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
    const field = COMPLETENESS_FIELDS[f] + (REQUIRED_FIELDS.includes(f) ? ' (required)' : '');
    [recorded, nulls, blank].forEach((n, i) => rows.push({ field, state: STATES[i], rank: i, n, pct: n / total, recordedPct: recorded / total }));
  }
  const order = [...new Set(rows.slice().sort((x, y) => x.recordedPct - y.recordedPct).map((r) => r.field))]; // worst first
  el.innerHTML = '';
  await embed(el, {
    width: 'container',
    height: { step: 26 },
    data: { values: rows },
    mark: { type: 'bar', height: { band: 0.72 } },
    encoding: {
      y: { field: 'field', type: 'nominal', sort: order, title: null, axis: { labelLimit: labels(el) } },
      x: { aggregate: 'sum', field: 'n', type: 'quantitative', stack: 'normalize', title: 'Share of all samples', axis: { format: '.0%' } },
      color: { field: 'state', type: 'nominal', sort: STATES, scale: { domain: STATES, range: [OK, ISSUE, OTHER_COLOR] }, legend: legend(el) },
      order: { field: 'rank', type: 'quantitative' },
      tooltip: [
        { field: 'field', title: 'Field' },
        { field: 'state', title: 'Status' },
        { aggregate: 'sum', field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
        { aggregate: 'sum', field: 'pct', type: 'quantitative', title: 'Share', format: '.1%' },
      ],
    },
  });
  dataTable(tableEl, [{ key: 'field', label: 'Field' }, { key: 'state', label: 'Status' }, { key: 'n', label: 'Samples' }], rows);
}

// ─── 2. Latest sample per data source ────────────────────────────────────────

async function freshness(el, tableEl) {
  const field = 'sample_collected_by_organisation_name';
  const { analysis: a } = await gql(`{ analysis { aggregations(include_missing: true) { data__${field} { buckets(max: 500) { key doc_count } } } } }`);
  const orgs = a.aggregations[`data__${field}`].buckets.filter((b) => b.key !== '__missing__');
  const res = await aliased(
    orgs.map((b, i) => ({ alias: `o${i}`, sqon: { op: 'and', content: [isIn(field, [b.key])] } })),
    `data__${DATE_FIELD} { stats { max } }`,
  );
  const statuses = [`Sampled in the last ${Math.round(ACTIVE_DAYS / 30.4)} months`, 'No recent samples'];
  const rows = orgs.map((b, i) => {
    const latest = res[`o${i}`][`data__${DATE_FIELD}`].stats.max;
    const name = isNull(b.key) ? `(${trimBrackets(b.key) || 'blank'})` : trimBrackets(b.key);
    const stale = !latest || latest < TODAY - ACTIVE_DAYS * DAY;
    return { name, n: b.doc_count, latest: latest ? day(latest) : '', status: statuses[stale ? 1 : 0], days: latest ? Math.round((TODAY - latest) / DAY) : null };
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
        { field: 'name', title: 'Collecting organisation' },
        { field: 'latest', type: 'temporal', title: 'Latest sample', format: '%Y-%m-%d' },
        { field: 'days', type: 'quantitative', title: 'Days ago', format: ',' },
        { field: 'n', type: 'quantitative', title: 'Samples', format: ',' },
      ],
    },
  });
  dataTable(tableEl, [{ key: 'name', label: 'Collecting organisation' }, { key: 'latest', label: 'Latest sample' }, { key: 'n', label: 'Samples' }], rows);
}

// ─── 3. Values written more than one way ─────────────────────────────────────

async function names(el) {
  const fields = Object.keys(QA_NAME_FIELDS);
  const { analysis: a } = await gql(`{ analysis { aggregations { ${fields.map((f) => `data__${f} { buckets(max: 5000) { key doc_count } }`).join(' ')} } } }`);
  const rows = [];
  for (const f of fields) {
    const groups = {};
    for (const b of a.aggregations[`data__${f}`].buckets) {
      if (b.key === '__missing__') continue;
      // ";" inside brackets is part of a description ("Facility 1 (two wings; hospital)"), not a list.
      if (b.key.replace(/\([^)]*\)/g, '').includes(';')) rows.push({ field: QA_NAME_FIELDS[f], issue: 'Several values in one', values: b.key, n: b.doc_count });
      const k = trimBrackets(b.key).toLowerCase().replace(/\s+/g, ' ');
      (groups[k] ||= []).push(b);
    }
    for (const g of Object.values(groups)) {
      if (g.length < 2) continue;
      rows.push({
        field: QA_NAME_FIELDS[f],
        issue: 'Same value, different spelling',
        values: g.map((b) => `"${b.key}" (${fmt(b.doc_count)})`).join(' / '),
        n: g.reduce((s, b) => s + b.doc_count, 0),
      });
    }
  }
  el.innerHTML = rows.length ? '' : '<p class="qa-ok">No problems found.</p>';
  if (rows.length) {
    dataTable(el, [{ key: 'field', label: 'Field' }, { key: 'issue', label: 'Issue' }, { key: 'values', label: 'Values (samples)' }, { key: 'n', label: 'Samples' }],
      rows, { open: true, title: `${rows.length} value${rows.length === 1 ? '' : 's'} to fix` });
  }
}

// ─── 4. Locations ────────────────────────────────────────────────────────────

const LOC = ['Usable coordinates', 'No usable coordinates'];

async function locations(el, tableEl) {
  const src = ['data.geo_loc_latitude', 'data.geo_loc_longitude', 'data.geo_loc_name_state_province_territory'];
  const { analysis: a } = await gql(`{ analysis { aggregations(include_missing: true) {
    data__geo_loc_name_site { buckets(max: 5000) { key doc_count top_hits(_source: ${JSON.stringify(src)}, size: 1) } }
    data__geo_loc_name_state_province_territory { buckets(max: 100) { key doc_count } }
  } } }`);
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
  const note = document.createElement('p');
  note.className = 'qa-note';
  note.textContent = `${fmt(noSite)} samples have no site recorded; ${fmt(noProv)} have no province/territory recorded.`;
  el.append(note);
  dataTable(tableEl, [{ key: 'province', label: 'Province/Territory' }, { key: 'status', label: 'Status' }, { key: 'n', label: 'Sites' }], rows);
}

// ─── 5. Viral measurement values (nightly build) ─────────────────────────────

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
    ['SARS-CoV-2 above the cap (dropped)', q.capped, PALETTE[3]],
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
  const note = document.createElement('p');
  note.className = 'qa-note';
  note.textContent = `${fmt(total)} measurements in ${fmt(m.records)} RT-PCR records; ${fmt(q.noDate)} records have no collection date and are left out. Build of ${new Date(m.generatedAt).toLocaleDateString('en-CA', { dateStyle: 'medium' })}.`;
  el.append(note);
  const table = [
    ...q.textValues.map(([v, n]) => ({ kind: 'Text value', value: v, n })),
    ...q.units.map(([v, n]) => ({ kind: 'Unit of plotted values', value: v, n })),
  ];
  dataTable(tableEl, [{ key: 'kind', label: 'Kind' }, { key: 'value', label: 'Value' }, { key: 'n', label: 'Measurements' }], table,
    { title: 'Show most common text values and units' });
}

// ─── Start ───────────────────────────────────────────────────────────────────

const CHECKS = [
  ['Metadata completeness', 'How often each key field holds a real value. Worst first.', completeness],
  ['Latest sample per data source', 'Organisations with no samples in the last 12 months are orange.', freshness],
  ['Values written more than one way', 'Values that differ only by capitals, spacing or ontology id, and fields holding several values in one.', names],
  ['Sites without usable coordinates', 'Sites whose latitude/longitude is missing or not a number, by province. These sit at the province capital on the map.', locations],
  ['Viral measurement values', 'Why RT-PCR measurements are or are not plotted. From the nightly build.', measurements],
];

export function initQA(root) {
  if (root.childElementCount) return; // already built
  for (const [title, sub, run] of CHECKS) {
    const block = document.createElement('div');
    block.className = 'qa-block';
    block.innerHTML = `<h3>${title}</h3><p class="qa-sub">${sub}</p><div class="qa-chart"></div><div class="qa-table"></div>`;
    root.append(block);
    const chart = block.querySelector('.qa-chart');
    panel(chart, () => run(chart, block.querySelector('.qa-table')));
  }
}
