import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loess, withTrend, siteSeries, statSeries, hasRatio, rangeStart, pickOrganism, resolve, viralSpec, label,
} from '../public/js/viral.js';
import { parseRecord, makeStore, addRecord, buildOutput, uniqueId, round } from '../scripts/build-viral-loads.mjs';
import { meanSem } from '../public/js/rules.js';
import { SARS2, PMMOV } from '../public/js/config.js';

// ─── Old implementation (git show 3bf8ef1:public/app.js), copied verbatim minus logging ──
const OLD_SPAN = 0.2;
const OLD_DEGREE = 2;
function oldSolve3(M, v) {
  const a = M[0][0], b = M[0][1], c = M[0][2];
  const d = M[1][0], e = M[1][1], f = M[1][2];
  const g = M[2][0], h = M[2][1], i = M[2][2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const v0 = v[0], v1 = v[1], v2 = v[2];
  return [
    (v0 * (e * i - f * h) - b * (v1 * i - v2 * f) + c * (v1 * h - v2 * e)) / det,
    (a * (v1 * i - v2 * f) - v0 * (d * i - f * g) + c * (v2 * d - v1 * g)) / det,
    (a * (e * v2 - v1 * h) - b * (d * v2 - v1 * g) + v0 * (d * h - e * g)) / det
  ];
}
function oldLoessSmoothAt(x, y, i, span, degree) {
  const n = x.length;
  if (n === 0 || !Number.isFinite(y[i])) return y[i];
  const minPts = degree + 1;
  const q = Math.max(minPts, Math.min(n, Math.round(span * n)));
  if (n < minPts) return y[i];
  const distIdx = [];
  for (let j = 0; j < n; j++) {
    distIdx.push({ j, d: Math.abs(x[j] - x[i]) });
  }
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
  const beta = oldSolve3(A, b);
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
function oldAddSmoothingTrend(data) {
  if (!data || data.length === 0) return data;
  const byUnit = {};
  for (const d of data) {
    const u = d.measurementUnit;
    if (!byUnit[u]) byUnit[u] = [];
    byUnit[u].push({ ...d });
  }
  const out = [];
  for (const unit of Object.keys(byUnit)) {
    const arr = byUnit[unit].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const n = arr.length;
    const xNum = arr.map((d) => {
      const t = Date.parse(String(d.date));
      return Number.isFinite(t) ? t : NaN;
    });
    const useIndex = xNum.some((v) => !Number.isFinite(v));
    const x = useIndex ? arr.map((_, idx) => idx) : xNum;
    const y = arr.map((d) => d.value);
    for (let i = 0; i < n; i++) {
      const valueSmooth = oldLoessSmoothAt(x, y, i, OLD_SPAN, OLD_DEGREE);
      out.push({ ...arr[i], valueSmooth: Number.isFinite(valueSmooth) ? valueSmooth : arr[i].value, lineType: 'Trend' });
    }
  }
  return out;
}
const oldKey = (d) => String(d.date) + '␞' + d.measurementUnit;
function oldMergeLoessFromFullSeries(displayRows, fullRowsForLoess) {
  if (!displayRows || displayRows.length === 0) return displayRows;
  if (!fullRowsForLoess || fullRowsForLoess.length === 0) return oldAddSmoothingTrend(displayRows);
  const smoothedFull = oldAddSmoothingTrend(fullRowsForLoess);
  const map = Object.create(null);
  for (const r of smoothedFull) map[oldKey(r)] = r.valueSmooth;
  return displayRows.map((r) => ({ ...r, valueSmooth: map[oldKey(r)] ?? r.value, lineType: 'Trend' }));
}

// Deterministic series: irregular dates (gaps, bursts), noisy seasonal values, some zeros and ties.
function sample(n, seed = 42) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const rows = [];
  let t = Date.UTC(2021, 0, 3);
  for (let i = 0; i < n; i++) {
    t += 86400000 * (1 + Math.floor(rnd() * (rnd() < 0.1 ? 30 : 6)));
    const base = 50 + 40 * Math.sin(i / 15);
    const value = rnd() < 0.05 ? 0 : i % 17 === 0 ? 12 : Math.max(0, base + (rnd() - 0.5) * 30);
    rows.push({ date: new Date(t).toISOString().slice(0, 10), measurementUnit: 'u', value });
  }
  return rows;
}

test('LOESS matches the old implementation exactly', () => {
  for (const n of [0, 1, 2, 3, 4, 7, 25, 120, 400]) {
    const rows = sample(n, 7 + n);
    const old = oldAddSmoothingTrend(rows) ?? [];
    const neu = withTrend(rows);
    assert.deepEqual(neu.map((r) => r.valueSmooth), old.map((r) => r.valueSmooth), `n=${n}`);
  }
});

test('full-series LOESS matches the old merge, windowed LOESS matches old on the window', () => {
  const full = sample(300, 3);
  const win = full.slice(180, 260);
  assert.deepEqual(withTrend(win, full).map((r) => r.valueSmooth), oldMergeLoessFromFullSeries(win, full).map((r) => r.valueSmooth));
  assert.deepEqual(withTrend(win).map((r) => r.valueSmooth), oldAddSmoothingTrend(win).map((r) => r.valueSmooth));
});

test('loess on raw arrays, including the lambda = 0 fallback', () => {
  assert.deepEqual(loess([5, 5, 5], [1, 2, 3]), [2, 2, 2]);
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = x.map((v) => 2 * v * v - v + 1); // a quadratic is fitted exactly
  loess(x, y, 0.5).forEach((v, i) => assert.ok(Math.abs(v - y[i]) < 1e-6));
});

// ─── Series helpers ─────────────────────────────────────────────────────────

const siteFile = {
  [SARS2]: {
    N1: { 'copies/L': { d: ['2024-01-01', '2024-01-08'], v: [[1, 3], [5]], r: [[0.1], []] } },
    N2: { 'copies/L': { d: ['2024-01-01', '2024-01-15'], v: [[2], [4, 6]] } },
  },
  [PMMOV]: { '(blank)': { 'copies/L': { d: ['2024-01-01'], v: [[100]] } } },
};

test('siteSeries pools genes for All, and returns mean ± SEM per date', () => {
  const rows = siteSeries(siteFile, SARS2, 'All', 'copies/L', false);
  assert.deepEqual(rows.map((r) => r.date), ['2024-01-01', '2024-01-08', '2024-01-15']);
  assert.equal(rows[0].value, 2);
  assert.equal(rows[0].n, 3);
  assert.equal(rows[0].sem, 1 / Math.sqrt(3));
  assert.equal(rows[0].valuesList, '1, 3, 2');
  assert.equal(rows[1].sem, 0);
  const one = siteSeries(siteFile, SARS2, 'N1', 'copies/L', false);
  assert.deepEqual(one.map((r) => r.value), [2, 5]);
  const norm = siteSeries(siteFile, SARS2, 'All', 'copies/L', true);
  assert.deepEqual(norm.map((r) => [r.date, r.value]), [['2024-01-01', 0.1]]);
});

test('statSeries merges [n,sum,sumsq] across genes and matches pooled raw values', () => {
  const statFile = {
    [SARS2]: {
      N1: { 'copies/L': { d: ['2024-01-01', '2024-01-08'], v: [[2, 4, 10], [1, 5, 25]], r: [[1, 0.1, 0.01], 0] } },
      N2: { 'copies/L': { d: ['2024-01-01', '2024-01-15'], v: [[1, 2, 4], [2, 10, 52]] } },
    },
  };
  const a = statSeries(statFile, SARS2, 'All', 'copies/L', false);
  const b = siteSeries(siteFile, SARS2, 'All', 'copies/L', false);
  assert.deepEqual(a.map((r) => r.n), b.map((r) => r.n));
  a.forEach((r, i) => {
    assert.ok(Math.abs(r.value - b[i].value) < 1e-12);
    assert.ok(Math.abs(r.sem - b[i].sem) < 1e-12);
  });
  assert.deepEqual(statSeries(statFile, SARS2, 'All', 'copies/L', true).map((r) => r.date), ['2024-01-01']);
  assert.ok(hasRatio(statFile, SARS2, 'All', 'copies/L'));
  assert.ok(!hasRatio(statFile, SARS2, 'N2', 'copies/L'));
});

test('rangeStart, pickOrganism, label', () => {
  const dates = ['2023-01-01', '2023-06-01', '2023-12-31', '2024-03-01', '2024-06-15'];
  assert.equal(rangeStart(dates, 12), '2023-12-31');
  assert.equal(rangeStart(dates, 3), '2024-06-15');
  assert.equal(rangeStart(dates, 0), '2023-01-01');
  assert.equal(pickOrganism(['A', 'Influenza A virus', SARS2], null), 'Influenza A virus');
  assert.equal(pickOrganism(['A', SARS2], 'nope'), SARS2);
  assert.equal(pickOrganism(['B', 'A'], null), 'B');
  assert.equal(pickOrganism(['B', 'A'], 'A'), 'A');
  assert.equal(label('(blank)'), 'Not Provided');
});

// ─── Build: record parsing and output shape ─────────────────────────────────

const rec = (o) => ({
  geo_loc_name_state_province_territory: 'Ontario [GAZ:00002563]', geo_loc_name_city: 'Peterborough',
  geo_loc_name_site: 'Site A', sample_collection_start_date: '2024-01-01', ...o,
});

test('parseRecord: organism, value rules, PMMoV ratio in the same unit only', () => {
  assert.equal(parseRecord(rec({ sample_collection_start_date: null })), null);
  const r = parseRecord(rec({
    target_taxonomic_name_1: '', gene_symbol_1: 'N1', diagnostic_measurement_value_1: '10', diagnostic_measurement_unit_1: 'gc/mL [X:1]',
    target_taxonomic_name_2: `${PMMOV} [NCBITaxon:12239]`, gene_symbol_2: null, diagnostic_measurement_value_2: '1000', diagnostic_measurement_unit_2: 'gc/mL',
    target_taxonomic_name_3: 'Influenza A virus', gene_symbol_3: 'M', diagnostic_measurement_value_3: '5', diagnostic_measurement_unit_3: 'gc/L',
  }));
  assert.equal(r.province, 'Ontario');
  assert.deepEqual(r.targets.map((t) => [t.organism, t.gene, t.unit, t.value, t.ratio]), [
    [SARS2, 'N1', 'gc/mL', 10, 0.01],
    [PMMOV, '(blank)', 'gc/mL', 1000, null],
    ['Influenza A virus', 'M', 'gc/L', 5, null],
  ]);
  const capped = parseRecord(rec({ gene_symbol_1: 'N1', diagnostic_measurement_value_1: '2500', diagnostic_measurement_unit_1: 'u' }));
  assert.equal(capped.targets.length, 0);
  const zeroPm = parseRecord(rec({
    target_taxonomic_name_1: SARS2, diagnostic_measurement_value_1: '3', diagnostic_measurement_unit_1: 'u',
    target_taxonomic_name_2: PMMOV, diagnostic_measurement_value_2: '0', diagnostic_measurement_unit_2: 'u',
  }));
  assert.equal(zeroPm.targets[0].ratio, null);
});

test('uniqueId and round', () => {
  const used = new Set();
  assert.deepEqual([uniqueId('a', used), uniqueId('a', used), uniqueId('a', used)], ['a', 'a-2', 'a-3']);
  assert.equal(round(1.5313266217708588), 1.531);
  assert.equal(round(0), 0);
  assert.equal(round(123456), 123500);
});

test('buildOutput: tree, lookup, unique ids, rollups equal site values', () => {
  const store = makeStore();
  const t = (v, pm) => ({
    target_taxonomic_name_1: SARS2, gene_symbol_1: 'N1', diagnostic_measurement_value_1: String(v), diagnostic_measurement_unit_1: 'u',
    ...(pm ? { target_taxonomic_name_2: PMMOV, diagnostic_measurement_value_2: String(pm), diagnostic_measurement_unit_2: 'u' } : {}),
  });
  addRecord(store, parseRecord(rec({ ...t(1, 10) })));
  addRecord(store, parseRecord(rec({ ...t(3) })));
  addRecord(store, parseRecord(rec({ geo_loc_name_site: 'Site A', geo_loc_name_city: 'Other', ...t(5) })));
  addRecord(store, parseRecord(rec({ geo_loc_name_site: 'Site B', ...t(7), sample_collection_start_date: '2024-01-02' })));
  addRecord(store, parseRecord(rec({ geo_loc_name_site: 'Nothing', diagnostic_measurement_value_1: 'n/a', gene_symbol_1: 'x' })));
  const { files, index } = buildOutput(store, { generatedAt: 'now', records: 5 });

  const on = index.p[0];
  assert.equal(on.n, 'Ontario');
  assert.deepEqual(on.c.map((c) => c.n), ['Other', 'Peterborough']);
  assert.deepEqual(on.c[1].s.map((s) => s.n), ['Site A', 'Site B']); // "Nothing" has no plottable values
  const ids = on.c.flatMap((c) => c.s.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(index.lookup['Site A'], ['Ontario', 'Peterborough']); // the larger of the two "Site A"s
  assert.deepEqual(on.t, { [SARS2]: { N1: ['u'] }, [PMMOV]: { '(blank)': ['u'] } });

  const siteA = files.get(`site/${on.c[1].s[0].id}.json`);
  assert.deepEqual(siteA[SARS2].N1.u, { d: ['2024-01-01'], v: [[1, 3]], r: [[0.1]] });
  const prov = files.get(`province/${on.id}.json`);
  assert.deepEqual(prov[SARS2].N1.u.d, ['2024-01-01', '2024-01-02']);
  assert.deepEqual(prov[SARS2].N1.u.v[0], [3, 9, 35]);
  assert.deepEqual(prov[SARS2].N1.u.r, [[1, 0.1, 0.01], 0]);
  assert.equal(meanSem(prov[SARS2].N1.u.v[0]).mean, 3);
  assert.ok(files.has(`city/${on.c[1].id}.json`));
  assert.ok(files.has('index.json'));

  const r = resolve(index, { province: null, site: 'Site B' });
  assert.equal(r.sel.city, 'All');
  assert.equal(r.sel.siteName, 'Site B');
  assert.equal(r.file, `site/${on.c[1].s[1].id}`);
  assert.ok(r.single);
  const all = resolve(index, {});
  assert.equal(all.file, `province/${on.id}`);
  assert.equal(all.sel.organism, SARS2);
  assert.equal(all.sel.gene, 'N1'); // only one gene: no "All"
  // Same site name in two cities is labelled with its city when listed together.
  assert.ok(all.opts.site.some((o) => o.text === 'Site A (Other)'));
});

test('viralSpec: empty, linear and symlog', () => {
  assert.equal(viralSpec([], {}).mark.type, 'text');
  const rows = withTrend([{ date: '2024-01-01', value: 0, sem: 0, n: 1, errorLow: 0, errorHigh: 0 },
    { date: '2024-01-02', value: 0.5, sem: 0.1, n: 2, errorLow: 0.4, errorHigh: 0.6 }]);
  const lin = viralSpec(rows, { unit: 'u', yTitle: 'u', single: false });
  assert.equal(lin.layer.length, 4);
  assert.equal(lin.layer[1].encoding.y.scale.zero, true);
  const log = viralSpec(rows, { unit: 'u', yTitle: 'u / PMMoV', log: true, single: true, norm: true });
  assert.deepEqual(log.layer[1].encoding.y.scale, { type: 'symlog', constant: 0.5, nice: true });
  assert.equal(log.layer[2].mark.color, '#6b7280');
  assert.deepEqual(log.layer[2].encoding.strokeDash.scale.range, [[8, 5]]);
});
