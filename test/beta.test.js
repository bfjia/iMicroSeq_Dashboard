import test from 'node:test';
import assert from 'node:assert/strict';
import { siteList, bestUnit, scaleToPeak, compareSpec } from '../public/js/beta.js';
import { withTrend } from '../public/js/viral.js';
import { BLANK } from '../public/js/rules.js';

const site = (n, id) => ({ n, id, t: { Flu: { [BLANK]: ['C/ml'] } } });
const IDX = {
  p: [
    { n: 'Alberta', c: [{ n: 'Calgary', s: [site('North', 'north'), site(BLANK, 'blank')] }, { n: 'Edmonton', s: [site('North', 'north-2')] }] },
    { n: 'Manitoba', c: [{ n: 'Calgary', s: [site('North', 'north-3')] }, { n: BLANK, s: [site('Winnipeg', 'winnipeg')] }] },
    { n: 'Not Applicable', c: [{ n: BLANK, s: [site(BLANK, 'na')] }] },
  ],
};

test('siteList: every site but "Not Applicable", labels made unique by city, then province', () => {
  const s = siteList(IDX);
  assert.deepEqual(s.map((x) => x.id), ['north', 'blank', 'north-2', 'north-3', 'winnipeg']);
  assert.deepEqual(s.map((x) => x.label), [
    'North (Calgary, Alberta)', 'Not Provided', 'North (Edmonton)', 'North (Calgary, Manitoba)', 'Winnipeg',
  ]);
  assert.deepEqual([s[1].city, s[4].province], ['Calgary', 'Manitoba']);
});

test('bestUnit: unit with the most dates, for one gene or all genes', () => {
  const file = { Flu: { N1: { 'C/L': { d: ['a', 'b'] }, 'C/ml': { d: ['a'] } }, N2: { 'C/ml': { d: ['b', 'c'] } } } };
  assert.equal(bestUnit(file, 'Flu', 'All'), 'C/ml');
  assert.equal(bestUnit(file, 'Flu', 'N1'), 'C/L');
  assert.equal(bestUnit(file, 'Flu', 'N3'), null);
  assert.equal(bestUnit(file, 'RSV', 'All'), null);
});

const days = (vals) => vals.map((value, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, value, n: 1 }));

test('scaleToPeak: trend peaks at 100 in the window; same shape as the raw trend', () => {
  const series = days([1, 4, 9, 20, 40, 30, 12, 5, 2, 1]);
  const win = { from: '2024-01-02', to: '2024-01-09', span: 0.5 };
  const { peak, rows } = scaleToPeak(series, win);
  assert.equal(rows.length, 8);
  assert.equal(Math.max(...rows.map((r) => r.trend)), 100);
  const raw = withTrend(series.slice(1, 9), series, 0.5);
  assert.equal(peak, Math.max(...raw.map((r) => r.valueSmooth)));
  rows.forEach((r, i) => {
    assert.equal(r.trendRaw, raw[i].valueSmooth);
    assert.ok(Math.abs(r.trend - (100 * raw[i].valueSmooth) / peak) < 1e-9);
    assert.ok(Math.abs(r.value - (100 * r.mean) / peak) < 1e-9);
  });
});

test('scaleToPeak: scaling the data first gives the same curve (units drop out)', () => {
  const a = days([1, 4, 9, 20, 40, 30, 12, 5, 2, 1]);
  const b = a.map((d) => ({ ...d, value: d.value * 1000 })); // same site in C/L instead of C/ml
  const win = { from: '2024-01-01', to: '2024-01-10' };
  const ra = scaleToPeak(a, win).rows;
  const rb = scaleToPeak(b, win).rows;
  ra.forEach((r, i) => assert.ok(Math.abs(r.trend - rb[i].trend) < 1e-6));
});

test('scaleToPeak: raw keeps values, empty window and all-zero trend give no rows', () => {
  const series = days([2, 4, 6, 4, 2]);
  const raw = scaleToPeak(series, { from: '2024-01-01', to: '2024-01-05', raw: true });
  raw.rows.forEach((r) => assert.equal(r.trend, r.trendRaw));
  assert.deepEqual(scaleToPeak(series, { from: '2025-01-01', to: '2025-02-01' }), { peak: null, rows: [] });
  assert.deepEqual(scaleToPeak(days([0, 0, 0, 0]), { from: '2024-01-01', to: '2024-01-04' }), { peak: 0, rows: [] });
  // Windowed fit (full = false) only sees the window.
  const w = scaleToPeak(days([100, 1, 2, 3, 2, 1]), { from: '2024-01-02', to: '2024-01-06', full: false, span: 1 });
  assert.ok(w.peak < 10);
});

test('compareSpec: empty text, legend highlight, colours in chosen order, symlog', () => {
  assert.equal(compareSpec([], { sites: [], empty: 'Add a site to compare' }).encoding.text.value, 'Add a site to compare');
  const rows = [
    { site: 'B', unit: 'u', date: '2024-01-01', mean: 1, n: 1, trendRaw: 1, value: 50, trend: 0 },
    { site: 'A', unit: 'u', date: '2024-01-01', mean: 2, n: 1, trendRaw: 2, value: 100, trend: 25 },
  ];
  const spec = compareSpec(rows, { sites: ['B', 'A'], yTitle: '%' });
  assert.equal(spec.layer.length, 2);
  assert.deepEqual(spec.layer[0].encoding.color.scale.domain, ['B', 'A']);
  assert.equal(spec.layer[0].params[0].bind, 'legend');
  assert.equal(spec.layer[0].encoding.y.scale.zero, true);
  assert.ok(spec.layer[1].encoding.tooltip.some((t) => t.field === 'trend'));
  const log = compareSpec(rows, { sites: ['B', 'A'], yTitle: 'u', log: true, points: true, raw: true });
  assert.equal(log.layer.length, 3);
  assert.deepEqual(log.layer[0].encoding.y.scale, { type: 'symlog', constant: 25, nice: true });
  assert.ok(!log.layer[2].encoding.tooltip.some((t) => t.field === 'trend'));
});
