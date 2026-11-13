// Data rules shared by the browser and the nightly build (Node). No DOM here.
import { NULL_TERMS, SARS2, SARS2_MAX } from './config.js';

// "Alberta [GAZ:00002560]" -> "Alberta"
export function trimBrackets(s) {
  return (s == null ? '' : String(s)).replace(/\s*\[[^\]]*\]/g, '').trim();
}

const NULLS = new Set(NULL_TERMS.map((t) => t.toLowerCase()));
export function isNull(v) {
  const s = trimBrackets(v).toLowerCase();
  return s === '' || s === '--' || NULLS.has(s);
}

// Multivalued fields come back as arrays: take the first element.
function firstVal(v) {
  return Array.isArray(v) ? (v.length ? v[0] : '') : v;
}

// "51.18 N" / "115.57 W" / "-79.4" -> signed number, or null.
export function parseCoord(raw, kind) {
  if (raw == null) return null;
  const s = String(firstVal(raw)).trim();
  if (!s || s === '--' || s.toLowerCase().includes('not provided')) return null;
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*([NSEW])?/i);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  const hemi = (m[2] || '').toUpperCase();
  if (hemi === 'S' || hemi === 'W') v = -Math.abs(v);
  else if (hemi === 'N' || hemi === 'E') v = Math.abs(v);
  if (kind === 'lat' && (v < -90 || v > 90)) return null;
  if (kind === 'lon' && (v < -180 || v > 180)) return null;
  return v;
}

// Target organism for viral loads: blank taxon counts as SARS-CoV-2.
export function viralOrganism(taxon) {
  const t = trimBrackets(taxon);
  return t && !isNull(t) ? t : SARS2;
}

// Measurement text -> number, or null if not plottable (SARS-CoV-2 cap applied).
export function viralValue(organism, raw) {
  const s = String(raw ?? '').trim();
  if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  if (organism === SARS2 && v > SARS2_MAX) return null;
  return v;
}

// Running stats [n, sum, sumsq] so groups combine exactly.
export function addStat(s, v) {
  s[0] += 1;
  s[1] += v;
  s[2] += v * v;
  return s;
}
export function mergeStat(a, b) {
  a[0] += b[0];
  a[1] += b[1];
  a[2] += b[2];
  return a;
}
// -> { n, mean, sem } (sample SD, SEM = 0 when n = 1)
export function meanSem([n, sum, sumsq]) {
  const mean = sum / n;
  const variance = n > 1 ? Math.max(0, (sumsq - n * mean * mean) / (n - 1)) : 0;
  return { n, mean, sem: Math.sqrt(variance / n) };
}

// Shape of a value, for spotting mixed formats: letters -> A, digits -> 9, runs collapsed,
// ontology ids -> [id], spaces at either end -> ␣. "49.26 N" -> "9.9 A", "2021-08-23" -> "9-9-9".
export function valuePattern(v) {
  const s = String(v ?? '');
  const core = s.trim().replace(/\s*\[[^\]]*\]/g, '\u0000').replace(/\p{L}+/gu, 'A').replace(/\d+/g, '9')
    .replace(/\s+/g, ' ').replace(/\u0000/g, ' [id]');
  const p = (/^\s/.test(s) ? '␣' : '') + core + (/\s$/.test(s) ? '␣' : '');
  return p.length > 40 ? `${p.slice(0, 40)}…` : p || '(empty)';
}

// Epoch ms -> 'YYYY-MM-DD' / 'YYYY-MM' (UTC)
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const monthKey = (ms) => new Date(ms).toISOString().slice(0, 7);

// Short stable id for file names: lowercase, safe characters only.
export function slug(s) {
  return trimBrackets(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'blank';
}
