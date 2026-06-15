// graphql.js — Data layer for the iMicroSeq Dashboard.
//
//   • Index page  → pulled LIVE on load from the Arranger GraphQL API.
//   • Dashboard   → served from the pre-built gzip JSON files in public/data
//                   (sample breakdown + viral loads are too large to pull live).
//
// Runs entirely in the browser; the Cloudflare Worker only serves static assets.
//
// Arranger API quirks handled below (see query_examples/arranger.py):
//   • Aggregation fields are exposed as `data__<field>` (double underscore).
//   • SQON `fieldName` uses the `data.` prefix; date fields filter as epoch-ms.
//   • Date fields are NumericAggregations — only `stats`, never `buckets`.
//   • Aggregation `filters` must be a group ({op:'and',content:[…]}), never a bare leaf.

const GRAPHQL_ENDPOINT = 'https://arranger-environmental.imicroseq-dataportal.ca/graphql';
const DATE_FIELD = 'sample_collection_start_date';
const MAX_CONCURRENCY = 8; // simultaneous in-flight GraphQL requests
const DATA_BASE = '/data';

// ─── Small helpers ───────────────────────────────────────────────────────────

// Strip ontology annotations: "Alberta [GAZ:00002560]" → "Alberta"
function trimBrackets(s) {
  return (s == null ? '' : String(s)).replace(/\s*\[[^\]]*\]/g, '').trim();
}

// Multivalued fields come back as arrays in hits — take the first element.
function firstVal(v) {
  if (Array.isArray(v)) return v.length ? v[0] : '';
  return v;
}

// Parse a stored coordinate like "51.18 N" / "115.57 W" / "-79.4" → signed float.
// Hemisphere letter (N/E → +, S/W → −) wins; "--" / "not provided" / out-of-range → null.
function parseCoord(raw, kind) {
  if (raw == null) return null;
  const s = String(firstVal(raw)).trim();
  if (!s || s === '--' || s.toLowerCase().includes('not provided')) return null;
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*([NSEW])?/i);
  if (!m) return null;
  let value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const hemi = (m[2] || '').toUpperCase();
  if (hemi === 'S' || hemi === 'W') value = -Math.abs(value);
  else if (hemi === 'N' || hemi === 'E') value = Math.abs(value);
  if (kind === 'lat' && (value < -90 || value > 90)) return null;
  if (kind === 'lon' && (value < -180 || value > 180)) return null;
  return value;
}

// ─── Concurrency-limited GraphQL fetch (with one retry on transient failure) ────

let _active = 0;
const _waiters = [];
function _acquire() {
  if (_active < MAX_CONCURRENCY) {
    _active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => _waiters.push(resolve));
}
function _release() {
  _active--;
  const next = _waiters.shift();
  if (next) {
    _active++;
    next();
  }
}
const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gqlFetch(query, variables = {}) {
  await _acquire();
  try {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables }),
        });
        if (!res.ok) throw new Error(`GraphQL ${res.status}: ${res.statusText}`);
        const json = await res.json();
        if (json.errors && json.errors.length) {
          throw new Error(json.errors.map((e) => e.message).join('; '));
        }
        return json.data;
      } catch (err) {
        lastErr = err;
        if (attempt === 0) await _sleep(500);
      }
    }
    throw lastErr;
  } finally {
    _release();
  }
}

// SQON for a date range [startMs, endMs) (epoch-ms). Always a group, so it is also
// valid as an aggregation `filters` argument.
function dateRangeSqon(startMs, endMs) {
  return {
    op: 'and',
    content: [
      { op: '>=', content: { fieldName: `data.${DATE_FIELD}`, value: startMs } },
      { op: '<', content: { fieldName: `data.${DATE_FIELD}`, value: endMs } },
    ],
  };
}

async function countSqon(sqon) {
  const data = await gqlFetch(
    'query($sqon: JSON){ analysis { hits(filters: $sqon){ total } } }',
    { sqon: sqon || null }
  );
  return data.analysis.hits.total;
}

// Load province capital coordinates from static CSV (coverage-map fallback).
// Returns { "Alberta [GAZ:…]": { lat, lon }, "Alberta": { lat, lon }, … }
let _provinceCoords = null;
async function loadProvinceCoords() {
  if (_provinceCoords) return _provinceCoords;
  try {
    const res = await fetch(`${DATA_BASE}/ProvinceCapitalCoords.csv`);
    if (!res.ok) return {};
    const text = await res.text();
    const map = {};
    text
      .trim()
      .split('\n')
      .slice(1)
      .forEach((line) => {
        const parts = line.split(',');
        if (parts.length >= 3) {
          const province = parts[0].trim();
          const lat = parseFloat(parts[1]);
          const lon = parseFloat(parts[2]);
          if (province && Number.isFinite(lat) && Number.isFinite(lon)) {
            map[province] = { lat, lon };
            // Also index by the bracket-free name so lookups by either form work.
            const short = province.split(' [')[0].trim();
            if (short && short !== province) map[short] = { lat, lon };
          }
        }
      });
    _provinceCoords = map;
    return map;
  } catch {
    return {};
  }
}

// Representative coordinate + province for each site, batched via GraphQL aliases
// (one tiny hits query per site, ~25 per request). Returns
// { "<site>": { geo_loc_latitude, geo_loc_longitude, geo_loc_name_state_province_territory } }.
async function fetchSiteCoords(siteKeys) {
  const BATCH = 25;
  const result = {};
  const batches = [];
  for (let i = 0; i < siteKeys.length; i += BATCH) batches.push(siteKeys.slice(i, i + BATCH));
  await Promise.all(
    batches.map(async (batch) => {
      const varDecls = batch.map((_, j) => `$s${j}: JSON`).join(', ');
      const aliases = batch
        .map(
          (_, j) =>
            `a${j}: hits(filters: $s${j}, first: 1){ edges { node { data { geo_loc_latitude geo_loc_longitude geo_loc_name_state_province_territory } } } }`
        )
        .join('\n        ');
      const query = `query(${varDecls}){ analysis {\n        ${aliases}\n      } }`;
      const variables = {};
      batch.forEach((site, j) => {
        variables[`s${j}`] = {
          op: 'and',
          content: [{ op: 'in', content: { fieldName: 'data.geo_loc_name_site', value: [site] } }],
        };
      });
      const data = await gqlFetch(query, variables);
      batch.forEach((site, j) => {
        const edges = (data.analysis[`a${j}`] || {}).edges || [];
        if (edges.length) result[site] = edges[0].node.data;
      });
    })
  );
  return result;
}

// ─── Index page (LIVE) ─────────────────────────────────────────────────────────

// Returns { summary, growth, breakdown, coveragePoints } from Arranger aggregations
// (no record download — distinct counts via bucket_count, growth via ranged counts).
async function fetchIndexData() {
  const AGG_QUERY = `
    query indexAggregations {
      analysis {
        hits(first: 0) { total }
        aggregations(aggregations_filter_themselves: true) {
          data__geo_loc_name_site { bucket_count buckets { key doc_count } }
          data__organism { bucket_count }
          data__sample_collected_by_organisation_name { bucket_count }
          data__environmental_site { buckets { key doc_count } }
          data__${DATE_FIELD} { stats { min max count } }
        }
      }
    }
  `;

  const [aggData, provinceCoords] = await Promise.all([gqlFetch(AGG_QUERY), loadProvinceCoords()]);

  const total = aggData.analysis.hits.total;
  const agg = aggData.analysis.aggregations;
  const stats = (agg[`data__${DATE_FIELD}`] || {}).stats || {};
  const minYear = stats.min != null ? new Date(stats.min).getUTCFullYear() : null;
  const maxYear = stats.max != null ? new Date(stats.max).getUTCFullYear() : null;

  // Hero summary card counts
  const summary = {
    records: total,
    sites: agg.data__geo_loc_name_site.bucket_count,
    organisms: agg.data__organism.bucket_count,
    dataSources: agg.data__sample_collected_by_organisation_name.bucket_count,
    timeSpan: { start: minYear, end: maxYear },
  };

  // Cumulative growth per year — one ranged count per year (parallel), matching
  // build_index_growth_per_year.py (carries the cumulative total across all years).
  let growth = [];
  if (minYear != null && maxYear != null) {
    const tasks = [];
    for (let y = minYear; y <= maxYear; y++) {
      const start = Date.UTC(y, 0, 1);
      const end = Date.UTC(y + 1, 0, 1);
      tasks.push(countSqon(dateRangeSqon(start, end)).then((count) => ({ year: y, count })));
    }
    const perYear = (await Promise.all(tasks)).sort((a, b) => a.year - b.year);
    let cumulative = 0;
    growth = perYear.map(({ year, count }) => {
      cumulative += count;
      return { year, records: cumulative };
    });
  }

  // Environmental breakdown: trim brackets, top 8 by count, rest → "Other", Other last.
  const envMap = {};
  agg.data__environmental_site.buckets.forEach((b) => {
    const key = (b.key === '__missing__' ? '' : trimBrackets(b.key)) || 'Unknown';
    envMap[key] = (envMap[key] || 0) + b.doc_count;
  });
  const topEnvSet = new Set(
    Object.entries(envMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k)
  );
  const catMap = {};
  Object.entries(envMap).forEach(([key, count]) => {
    const cat = topEnvSet.has(key) ? key : 'Other';
    catMap[cat] = (catMap[cat] || 0) + count;
  });
  const breakdown = Object.entries(catMap)
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => (a.category === 'Other') - (b.category === 'Other') || b.value - a.value);

  // Coverage map: each site's representative lat/lon straight from the dataset,
  // falling back to the province capital for sites whose samples carry no GPS.
  // Counts are merged by coordinate (mirrors build_index_sample_coverage_map.py).
  const siteBuckets = agg.data__geo_loc_name_site.buckets.filter((b) => b.key !== '__missing__');
  const siteCoordData = await fetchSiteCoords(siteBuckets.map((b) => b.key));
  const coordCounts = new Map(); // "lat,lon" -> count
  siteBuckets.forEach((b) => {
    const rec = siteCoordData[b.key];
    let lat = rec ? parseCoord(rec.geo_loc_latitude, 'lat') : null;
    let lon = rec ? parseCoord(rec.geo_loc_longitude, 'lon') : null;
    if (lat == null || lon == null) {
      const prov = rec ? rec.geo_loc_name_state_province_territory : '';
      const cap = provinceCoords[trimBrackets(prov)] || provinceCoords[prov];
      if (cap) {
        lat = cap.lat;
        lon = cap.lon;
      }
    }
    if (lat != null && lon != null) {
      const key = `${lat},${lon}`;
      coordCounts.set(key, (coordCounts.get(key) || 0) + b.doc_count);
    }
  });
  const coveragePoints = [...coordCounts.entries()]
    .map(([key, count]) => {
      const ci = key.indexOf(',');
      return { latitude: parseFloat(key.slice(0, ci)), longitude: parseFloat(key.slice(ci + 1)), count };
    })
    .sort((a, b) => b.count - a.count);

  return { summary, growth, breakdown, coveragePoints };
}

// ─── Dashboard page (STATIC public/data) ─────────────────────────────────────────

// Decompress gzip JSON produced by the build scripts (write_json_gz).
async function fetchJsonGz(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const body = res.body;
  if (!body) throw new Error('No response body');
  const decompressed = new Response(body.pipeThrough(new DecompressionStream('gzip')));
  return JSON.parse(await decompressed.text());
}

// { sampleFieldSpecRows, axisOptions } for the Explore chart.
async function fetchSampleBreakdownData() {
  return fetchJsonGz(`${DATA_BASE}/dashboard_sample_breakdown.json.gz`);
}

// The 8-level nested viral-loads structure
// (Province → City → Site → Assay → Organism → Gene → Unit → Date → values).
async function fetchViralLoadsData() {
  return fetchJsonGz(`${DATA_BASE}/dashboard_viral_loads.json.gz`);
}
