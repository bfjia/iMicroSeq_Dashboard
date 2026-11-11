// GraphQL access. Proxy first (edge-cached, compressed), portal API directly if that fails.
import { API_PROXY, API_DIRECT, DATE_FIELD } from './config.js';

const memo = new Map(); // same query twice in one page view -> one request
export let fetchedAt = null; // when the data was fetched upstream (shown in the footer)

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error(`GraphQL ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  const at = res.headers.get('x-fetched-at');
  if (at && (!fetchedAt || at < fetchedAt)) fetchedAt = at;
  return json.data;
}

async function run(body) {
  try {
    return await post(API_PROXY, body);
  } catch {
    try {
      return await post(API_DIRECT, body);
    } catch {
      await new Promise((r) => setTimeout(r, 800));
      return post(API_DIRECT, body);
    }
  }
}

export function gql(query, variables = {}) {
  const body = JSON.stringify({ query, variables });
  if (!memo.has(body)) {
    const p = run(body);
    p.catch(() => memo.delete(body)); // let a retry button try again
    memo.set(body, p);
  }
  return memo.get(body);
}

// ─── SQON helpers (filters must always be groups) ────────────────────────────

export const and = (...content) => ({ op: 'and', content: content.filter(Boolean) });
export const isIn = (field, values) => ({ op: 'in', content: { fieldName: `data.${field}`, value: values } });
export const not = (...content) => ({ op: 'not', content });
export const dateRange = (startMs, endMs) => and(
  { op: '>=', content: { fieldName: `data.${DATE_FIELD}`, value: startMs } },
  { op: '<', content: { fieldName: `data.${DATE_FIELD}`, value: endMs } },
);

// Calendar months [start, end) between two epoch-ms dates, as { key: 'YYYY-MM', start, end }.
export function months(minMs, maxMs) {
  const out = [];
  const d = new Date(minMs);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  while (Date.UTC(y, m, 1) <= maxMs) {
    const start = Date.UTC(y, m, 1);
    const end = Date.UTC(y, m + 1, 1);
    out.push({ key: new Date(start).toISOString().slice(0, 7), start, end });
    m += 1;
    if (m === 12) { m = 0; y += 1; }
  }
  return out;
}

export function years(minMs, maxMs) {
  const out = [];
  for (let y = new Date(minMs).getUTCFullYear(); y <= new Date(maxMs).getUTCFullYear(); y++) {
    out.push({ key: String(y), start: Date.UTC(y, 0, 1), end: Date.UTC(y + 1, 0, 1) });
  }
  return out;
}

// One query, one aliased block per period/filter: aliases(list of {alias, sqon}, inner selection).
export function aliased(list, inner) {
  const decl = list.map((a) => `$${a.alias}: JSON`).join(', ');
  const body = list
    .map((a) => `${a.alias}: aggregations(filters: $${a.alias}, aggregations_filter_themselves: true) { ${inner} }`)
    .join('\n');
  const vars = Object.fromEntries(list.map((a) => [a.alias, a.sqon]));
  return gql(`query(${decl}) { analysis { ${body} } }`, vars).then((d) => d.analysis);
}
