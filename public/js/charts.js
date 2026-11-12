// Shared page helpers: panel states, Vega embedding, data tables, URL state, footer.
// Vega, Vega-Lite and vegaEmbed are globals loaded from the CDN in each page.
import { PALETTE, OTHER_COLOR, HELP_URL } from './config.js';
import { fetchedAt } from './api.js';

const SCHEMA = 'https://vega.github.io/schema/vega-lite/v6.json';

// Common look: recessive hairline grid, no axis domain lines, text in ink not series colour.
const VEGA_CONFIG = {
  font: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  background: null,
  view: { stroke: null },
  axis: {
    labelColor: '#52514e', titleColor: '#52514e', labelFontSize: 12, titleFontSize: 12,
    titleFontWeight: 500, gridColor: '#eceef3', domain: false, tickColor: '#eceef3',
  },
  legend: { labelColor: '#1f2933', titleColor: '#52514e', labelFontSize: 12, titleFontWeight: 500, symbolType: 'square' },
  bar: { stroke: '#ffffff', strokeWidth: 1 }, // 2px surface gap between touching segments
  line: { strokeWidth: 2 },
  point: { size: 64 },
};

// Colour scale: entity keeps its colour; "Other" is always neutral gray.
export function colorScale(domain) {
  let i = 0;
  return { domain, range: domain.map((d) => (d === 'Other' ? OTHER_COLOR : PALETTE[i++ % PALETTE.length])) };
}

export function embed(el, spec) {
  return window.vegaEmbed(el, { $schema: SCHEMA, config: VEGA_CONFIG, ...spec }, { actions: false });
}

export const fmt = (n) => (n == null || !Number.isFinite(n) ? '–' : Number(n).toLocaleString('en-CA'));

// ─── Panel states ────────────────────────────────────────────────────────────

function loading(el) {
  el.innerHTML = '<div class="skeleton" aria-busy="true"><span>Loading…</span></div>';
}

export function failed(el, err, retry) {
  console.error(err);
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'panel-error';
  // fetch() throws TypeError only when the request never got an answer (offline, blocked).
  // An HTTP error (e.g. 404) got an answer, so an ad blocker isn't the cause.
  box.innerHTML = err instanceof TypeError
    ? '<p>Could not load this from the data portal.</p>' +
      '<p>Because this site is hosted on Cloudflare, it may be blocked by ad blockers. Please disable any ad blockers and try again.</p>'
    : '<p>Could not load this data. Please try again later.</p>';
  const detail = document.createElement('p');
  detail.className = 'panel-error-detail';
  detail.textContent = err?.message || String(err);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'retry-btn';
  btn.textContent = 'Try again';
  btn.onclick = retry;
  box.append(detail, btn);
  el.append(box);
}

// Run work(el) with a loading state, and an error + retry if it throws.
export async function panel(el, work) {
  loading(el);
  try {
    await work(el);
  } catch (err) {
    failed(el, err, () => panel(el, work));
  }
  setFooter();
}

// Call fn once, when el first scrolls near the viewport.
export function whenVisible(el, fn) {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      fn();
    }
  }, { rootMargin: '200px 0px' });
  io.observe(el);
}

// ─── Data table under a chart (for readers who can't use the colours) ────────

export function dataTable(el, columns, rows, { open = false, title = 'Show data table' } = {}) {
  el.innerHTML = '';
  const det = document.createElement('details');
  det.className = 'data-table';
  const sum = document.createElement('summary');
  sum.textContent = title;
  const wrap = document.createElement('div');
  wrap.className = 'data-table-wrap';
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  columns.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c.label;
    head.append(th);
  });
  const body = table.createTBody();
  // Render rows only when opened: some tables are large.
  det.addEventListener('toggle', () => {
    if (!det.open || body.rows.length) return;
    rows.forEach((r) => {
      const tr = body.insertRow();
      columns.forEach((c) => {
        const v = r[c.key];
        tr.insertCell().textContent = typeof v === 'number' ? fmt(v) : (v ?? '');
      });
    });
  });
  wrap.append(table);
  det.append(sum, wrap);
  el.append(det);
  det.open = open; // fires toggle, which fills the rows
}

// ─── URL state (shared by explorer and viral loads: each touches only its own keys) ──

export const getParam = (k) => new URLSearchParams(location.search).get(k);
export function setParams(obj) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') p.delete(k);
    else p.set(k, v);
  }
  const q = p.toString();
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
}

// ─── Footer ──────────────────────────────────────────────────────────────────

// Tiny meta.json written by the nightly build: date for the footer, counts for the QA panel.
// Fetched once per page; null if missing.
let metaPromise;
export function viralMeta() {
  metaPromise ??= fetch('data/viral/meta.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return metaPromise;
}
const viralDate = () => viralMeta().then((m) => (m ? new Date(m.generatedAt).toLocaleDateString('en-CA', { dateStyle: 'medium' }) : 'unavailable'));

export function setFooter() {
  const f = document.getElementById('footer-fetched');
  if (f && fetchedAt) {
    f.textContent = ` (${new Date(fetchedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })})`;
  }
  const asof = document.getElementById('footer-viral-asof');
  if (asof) viralDate().then((d) => { asof.textContent = d; });
  const help = document.getElementById('footer-help');
  if (help) help.href = HELP_URL;
}
