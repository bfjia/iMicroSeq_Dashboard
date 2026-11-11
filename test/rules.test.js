import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trimBrackets, isNull, parseCoord, viralOrganism, viralValue, addStat, mergeStat, meanSem, dayKey, monthKey, slug,
} from '../public/js/rules.js';
import { months, years } from '../public/js/api.js';
import { SARS2 } from '../public/js/config.js';

test('trimBrackets', () => {
  assert.equal(trimBrackets('Alberta [GAZ:00002566]'), 'Alberta');
  assert.equal(trimBrackets('a [x] b [y]'), 'a b');
  assert.equal(trimBrackets(null), '');
});

test('isNull', () => {
  assert.ok(isNull('Not Provided [GENEPIO:0001668]'));
  assert.ok(isNull('__missing__'));
  assert.ok(isNull(''));
  assert.ok(!isNull('Ontario [GAZ:00002563]'));
});

test('parseCoord', () => {
  assert.equal(parseCoord('51.18 N', 'lat'), 51.18);
  assert.equal(parseCoord('115.57 W', 'lon'), -115.57);
  assert.equal(parseCoord(['-79.4'], 'lon'), -79.4);
  assert.equal(parseCoord('Not Provided', 'lat'), null);
  assert.equal(parseCoord('95', 'lat'), null);
});

test('viral rules', () => {
  assert.equal(viralOrganism(''), SARS2);
  assert.equal(viralOrganism(`${SARS2} [NCBITaxon:2697049]`), SARS2);
  assert.equal(viralOrganism('Influenza A virus [NCBITaxon:11320]'), 'Influenza A virus');
  assert.equal(viralValue(SARS2, '1.5'), 1.5);
  assert.equal(viralValue(SARS2, '2500'), null);
  assert.equal(viralValue('Influenza A virus', '2500'), 2500);
  assert.equal(viralValue(SARS2, 'Not Provided'), null);
  assert.equal(viralValue(SARS2, ''), null);
});

test('stats combine exactly', () => {
  const vals = [1, 2, 3, 4, 10];
  const all = vals.reduce((s, v) => addStat(s, v), [0, 0, 0]);
  const a = [1, 2].reduce((s, v) => addStat(s, v), [0, 0, 0]);
  const b = [3, 4, 10].reduce((s, v) => addStat(s, v), [0, 0, 0]);
  assert.deepEqual(mergeStat(a, b), all);
  const { n, mean, sem } = meanSem(all);
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - 4) ** 2, 0) / 4);
  assert.equal(n, 5);
  assert.equal(mean, 4);
  assert.ok(Math.abs(sem - sd / Math.sqrt(5)) < 1e-12);
  assert.equal(meanSem([1, 7, 49]).sem, 0);
});

test('date keys and periods', () => {
  const ms = Date.UTC(2024, 1, 29);
  assert.equal(dayKey(ms), '2024-02-29');
  assert.equal(monthKey(ms), '2024-02');
  const m = months(Date.UTC(2023, 10, 15), Date.UTC(2024, 1, 2));
  assert.deepEqual(m.map((x) => x.key), ['2023-11', '2023-12', '2024-01', '2024-02']);
  assert.equal(m[1].end, Date.UTC(2024, 0, 1));
  assert.deepEqual(years(Date.UTC(2020, 5, 1), Date.UTC(2022, 0, 1)).map((x) => x.key), ['2020', '2021', '2022']);
});

test('slug', () => {
  assert.equal(slug('Peterborough: Peterborough Wastewater Treatment Plant'), 'peterborough-peterborough-wastewater-treatment-plant');
  assert.equal(slug(''), 'blank');
});
