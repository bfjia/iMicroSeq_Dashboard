// Nightly build of the viral loads data (RT-PCR measurements) into public/data/viral/.
// Run: npm run build:data   (zero dependencies, Node >= 24)
//
// Output (compact JSON):
//   index.json            tree province -> city -> site with available targets, plus a site-name lookup
//   site/<id>.json        per target, per date: raw values and PMMoV ratios
//   city/<id>.json        per target, per date: [n, sum, sumsq] of raw values and of ratios
//   province/<id>.json    same, for the whole province
// The build fails (exit 1, previous output left in place) if fewer/more rows arrive than the API reported.
import { mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { trimBrackets, viralOrganism, viralValue, addStat, slug } from '../public/js/rules.js';
import { API_DIRECT, VIRAL_ASSAY, PMMOV, DATE_FIELD } from '../public/js/config.js';

const OUT = fileURLToPath(new URL('../public/data/viral/', import.meta.url));
const PAGE = 1000; // 5,000-row sorted pages time out upstream
const TRIES = 5;
const BLANK = '(blank)';
const SEP = '\u0000';

const FIELDS = [
  'geo_loc_name_state_province_territory', 'geo_loc_name_city', 'geo_loc_name_site', DATE_FIELD,
  ...[1, 2, 3].flatMap((i) => [
    `target_taxonomic_name_${i}`, `gene_symbol_${i}`, `diagnostic_measurement_value_${i}`, `diagnostic_measurement_unit_${i}`,
  ]),
];

// Sort must be total so searchAfter never skips rows; the sample id breaks date ties.
const HITS = `query($s: JSON, $sa: JSON) { analysis {
  hits(filters: $s, first: ${PAGE}, searchAfter: $sa,
       sort: [{fieldName: "data.${DATE_FIELD}", order: asc}, {fieldName: "data.specimen_collector_sample_id", order: asc}]) {
    total edges { searchAfter node { data { ${FIELDS.join(' ')} } } }
  } } }`;

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export const round = (v, digits = 4) => (v === 0 ? 0 : Number(v.toPrecision(digits)));
const name = (v) => trimBrackets(v) || BLANK;

// Record -> { province, city, site, date, targets: [{ organism, gene, unit, value, ratio }] } or null (no date).
export function parseRecord(d) {
  const date = dateKey(d[DATE_FIELD]);
  if (!date) return null;
  const targets = [];
  for (const i of [1, 2, 3]) {
    const tax = d[`target_taxonomic_name_${i}`];
    const gene = d[`gene_symbol_${i}`];
    const raw = d[`diagnostic_measurement_value_${i}`];
    const unit = d[`diagnostic_measurement_unit_${i}`];
    if (![tax, gene, raw, unit].some((x) => trimBrackets(x))) continue;
    const organism = viralOrganism(tax);
    const value = viralValue(organism, raw);
    if (value == null) continue;
    targets.push({ organism, gene: name(gene), unit: name(unit), value, ratio: null });
  }
  // PMMoV normalisation: same record, same unit, PMMoV > 0 (mean if several PMMoV targets share the unit).
  const pm = {};
  for (const t of targets) {
    if (t.organism !== PMMOV || !(t.value > 0)) continue;
    (pm[t.unit] ||= []).push(t.value);
  }
  for (const t of targets) {
    const p = pm[t.unit];
    if (t.organism === PMMOV || !p) continue;
    t.ratio = t.value / (p.reduce((a, b) => a + b, 0) / p.length);
  }
  return {
    province: name(d.geo_loc_name_state_province_territory),
    city: name(d.geo_loc_name_city),
    site: name(d.geo_loc_name_site),
    date,
    targets,
  };
}

function dateKey(v) {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  return s && Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

// Unique file id: slug, then -2, -3 ... on collision.
export function uniqueId(base, used) {
  let id = base;
  for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
  used.add(id);
  return id;
}

// Names sorted alphabetically, "(blank)" last.
export const byName = (a, b) => (a === BLANK) - (b === BLANK) || a.localeCompare(b);

// Accumulates parsed records into sites, keeping per (organism, gene, unit, date) the values and ratios.
export function makeStore() {
  return { sites: new Map() };
}
export function addRecord(store, rec) {
  if (!rec || !rec.targets.length) return;
  const key = [rec.province, rec.city, rec.site].join(SEP);
  let s = store.sites.get(key);
  if (!s) store.sites.set(key, (s = { province: rec.province, city: rec.city, site: rec.site, n: 0, series: new Map() }));
  for (const t of rec.targets) {
    const k = [t.organism, t.gene, t.unit].join(SEP);
    let byDate = s.series.get(k);
    if (!byDate) s.series.set(k, (byDate = new Map()));
    let cell = byDate.get(rec.date);
    if (!cell) byDate.set(rec.date, (cell = { v: [], r: [] }));
    cell.v.push(round(t.value));
    if (t.ratio != null) cell.r.push(round(t.ratio));
    s.n += 1;
  }
}

// org -> gene -> unit -> leaf, built from a Map keyed "org\0gene\0unit".
function nest(series, leaf) {
  const out = {};
  for (const k of [...series.keys()].sort()) {
    const [o, g, u] = k.split(SEP);
    ((out[o] ||= {})[g] ||= {})[u] = leaf(series.get(k));
  }
  return out;
}
const targetsOf = (keys) => {
  const t = {};
  for (const k of [...keys].sort()) {
    const [o, g, u] = k.split(SEP);
    ((t[o] ||= {})[g] ||= []).push(u);
  }
  return t;
};

function siteLeaf(byDate) {
  const d = [...byDate.keys()].sort();
  const leaf = { d, v: d.map((x) => byDate.get(x).v) };
  if (d.some((x) => byDate.get(x).r.length)) leaf.r = d.map((x) => byDate.get(x).r);
  return leaf;
}

const statRound = (s) => [s[0], round(s[1], 12), round(s[2], 12)];
function statLeaf(byDate) {
  const d = [...byDate.keys()].sort();
  const leaf = { d, v: d.map((x) => statRound(byDate.get(x).v)) };
  if (d.some((x) => byDate.get(x).r)) leaf.r = d.map((x) => (byDate.get(x).r ? statRound(byDate.get(x).r) : 0));
  return leaf;
}

// Roll site cells into a stats map (org/gene/unit -> date -> { v: stat, r: stat|null }).
function rollInto(stats, siteSeries) {
  for (const [k, byDate] of siteSeries) {
    let m = stats.get(k);
    if (!m) stats.set(k, (m = new Map()));
    for (const [date, cell] of byDate) {
      let c = m.get(date);
      if (!c) m.set(date, (c = { v: [0, 0, 0], r: null }));
      for (const v of cell.v) addStat(c.v, v);
      for (const r of cell.r) addStat((c.r ||= [0, 0, 0]), r);
    }
  }
}

// -> { files: Map(relPath -> object), index }
export function buildOutput(store, meta) {
  const files = new Map();
  const usedP = new Set();
  const usedC = new Set();
  const usedS = new Set();
  const tree = new Map(); // province -> city -> [site]
  for (const s of store.sites.values()) {
    if (!s.series.size) continue;
    if (!tree.has(s.province)) tree.set(s.province, new Map());
    const cities = tree.get(s.province);
    if (!cities.has(s.city)) cities.set(s.city, []);
    cities.get(s.city).push(s);
  }
  const lookup = {};
  const lookupN = {};
  const provinces = [];
  for (const p of [...tree.keys()].sort(byName)) {
    const pStats = new Map();
    const cities = [];
    for (const c of [...tree.get(p).keys()].sort(byName)) {
      const cStats = new Map();
      const sites = [];
      for (const s of tree.get(p).get(c).sort((a, b) => byName(a.site, b.site))) {
        const id = uniqueId(slug(s.site), usedS);
        files.set(`site/${id}.json`, nest(s.series, siteLeaf));
        sites.push({ n: s.site, id, t: targetsOf(s.series.keys()) });
        rollInto(cStats, s.series);
        rollInto(pStats, s.series);
        if (s.site !== BLANK && !(lookupN[s.site] >= s.n)) {
          lookup[s.site] = [p, c];
          lookupN[s.site] = s.n;
        }
      }
      const id = uniqueId(`${slug(p)}--${slug(c)}`, usedC);
      files.set(`city/${id}.json`, nest(cStats, statLeaf));
      cities.push({ n: c, id, t: targetsOf(cStats.keys()), s: sites });
    }
    const id = uniqueId(slug(p), usedP);
    files.set(`province/${id}.json`, nest(pStats, statLeaf));
    provinces.push({ n: p, id, t: targetsOf(pStats.keys()), c: cities });
  }
  const index = { generatedAt: meta.generatedAt, records: meta.records, p: provinces, lookup };
  files.set('index.json', index);
  files.set('meta.json', { generatedAt: meta.generatedAt, records: meta.records }); // tiny, for the footer date
  return { files, index };
}

// ─── Fetching ────────────────────────────────────────────────────────────────

async function gql(query, variables) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(API_DIRECT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
      return json.data;
    } catch (err) {
      if (attempt >= TRIES) throw err;
      const wait = 2000 * 2 ** (attempt - 1);
      console.warn(`  request failed (${err.message}); retry ${attempt}/${TRIES - 1} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function assayValue() {
  const d = await gql('{ analysis { aggregations { data__assay_type { buckets { key } } } } }');
  const keys = d.analysis.aggregations.data__assay_type.buckets.map((b) => b.key);
  const hit = keys.find((k) => trimBrackets(k).toLowerCase() === VIRAL_ASSAY.toLowerCase());
  if (!hit) throw new Error(`assay "${VIRAL_ASSAY}" not found in data__assay_type buckets`);
  return hit;
}

async function main() {
  const t0 = Date.now();
  const assay = await assayValue();
  const sqon = { op: 'and', content: [{ op: 'in', content: { fieldName: 'data.assay_type', value: [assay] } }] };
  console.log(`Assay: ${assay}`);

  const store = makeStore();
  let total = null;
  let rows = 0;
  let noDate = 0;
  let sa;
  for (let page = 1; ; page++) {
    const vars = sa ? { s: sqon, sa } : { s: sqon };
    const hits = (await gql(HITS, vars)).analysis.hits;
    if (total == null) {
      total = hits.total;
      console.log(`Total RT-PCR records: ${total} (${Math.ceil(total / PAGE)} pages of ${PAGE})`);
    }
    for (const e of hits.edges) {
      const rec = parseRecord(e.node.data);
      if (!rec) noDate += 1;
      addRecord(store, rec);
    }
    rows += hits.edges.length;
    if (page % 10 === 0 || hits.edges.length < PAGE) {
      console.log(`  page ${page}: ${rows}/${total} rows (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    if (hits.edges.length < PAGE) break;
    sa = hits.edges.at(-1).searchAfter;
  }
  if (rows !== total) {
    console.error(`FAILED: fetched ${rows} rows but the API reported ${total}. Previous output left unchanged.`);
    process.exit(1);
  }

  const { files } = buildOutput(store, { generatedAt: new Date().toISOString(), records: total });

  // Write everything to a temp dir, then swap it in, so a failed build never leaves partial output.
  const tmp = `${OUT.replace(/[\\/]$/, '')}.tmp`;
  const old = `${OUT.replace(/[\\/]$/, '')}.old`;
  await rm(tmp, { recursive: true, force: true });
  let bytes = 0;
  for (const dir of ['site', 'city', 'province']) await mkdir(path.join(tmp, dir), { recursive: true });
  for (const [rel, obj] of files) {
    const text = JSON.stringify(obj);
    bytes += Buffer.byteLength(text);
    await writeFile(path.join(tmp, rel), text);
  }
  await rm(old, { recursive: true, force: true });
  if (existsSync(OUT)) await rename(OUT, old);
  await rename(tmp, OUT);
  await rm(old, { recursive: true, force: true });

  console.log(`Rows: ${rows}/${total} (skipped without date: ${noDate}); sites: ${store.sites.size}`);
  console.log(`Wrote ${files.size} files, ${(bytes / 1e6).toFixed(2)} MB, to ${OUT} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`FAILED: ${err.stack || err}`);
    process.exit(1);
  });
}
