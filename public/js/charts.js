// Shared page helpers: panel states, Vega embedding, data tables, URL state, footer.
// Vega, Vega-Lite and vegaEmbed are globals loaded from the CDN in each page.
import { PALETTE, OTHER_COLOR, HELP_URL } from './config.js';
import { fetchedAt, portalUrl } from './api.js';

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

export async function embed(el, spec) {
  const res = await window.vegaEmbed(el, { $schema: SCHEMA, config: VEGA_CONFIG, ...spec }, { actions: false });
  linkClicks(res.view);
  return res;
}

// ─── Links to the portal explorer ────────────────────────────────────────────

// A chart row with `...linkTo(sqon)` links to those records in the portal explorer: clicking its mark
// opens them in a new tab. Add LINK_TIP to the tooltip, and LINK_COL to the data table.
// Charts that aggregate (sum) also need `detail: { field: 'link' }` so the link survives the aggregation.
// No sqon: no link, and the tooltip shows "–" (a missing field would read "undefined").
export const linkTo = (sqon, tip = 'Click to browse these samples ↗') => (sqon ? { link: portalUrl(sqon), linkTip: tip } : { linkTip: '–' });
export const LINK_TIP = { field: 'linkTip', title: 'Data portal' };
export const LINK_COL = { key: 'link', label: 'Data portal', link: true };

let armed = null; // touch screens: the first tap shows the tooltip, a second tap on the same mark opens the link
function linkClicks(view) {
  // The "nearest point" layers (crosshair charts) answer with a voronoi cell wrapping the real mark.
  const linkOf = (item) => (item?.isVoronoi ? item.datum : item)?.datum?.link;
  view.addEventListener('click', (e, item) => {
    const url = linkOf(item);
    if (!url) return;
    if (e.pointerType === 'touch' && armed !== url) {
      armed = url;
      return;
    }
    armed = null;
    window.open(url, '_blank', 'noopener');
  });
  view.addEventListener('pointermove', (e, item) => {
    e.target.style.cursor = linkOf(item) ? 'pointer' : '';
  });
}

export const fmt = (n) => (n == null || !Number.isFinite(n) ? '–' : Number(n).toLocaleString('en-CA'));

// ─── Panel states ────────────────────────────────────────────────────────────

// Animated loading circle, used in panels, hero cards and the footer.
export const SPINNER = '<span class="spinner" role="status" aria-label="Loading"></span>';

function loading(el) {
  el.innerHTML = `<div class="panel-loading" aria-busy="true">${SPINNER}</div>`;
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

// One CSV cell. Text starting like a formula gets a ' so spreadsheets show it as text.
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !Number.isFinite(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)), ...rows.map((r) => columns.map((c) => csvCell(r[c.key])))];
  return lines.map((l) => l.join(',')).join('\r\n');
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/csv;charset=utf-8' })); // BOM: Excel reads UTF-8
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// file: download name without extension (default: the element id, e.g. "explorer-table").
export function dataTable(el, columns, rows, { open = false, title = 'Show data table', file } = {}) {
  el.innerHTML = '';
  const det = document.createElement('details');
  det.className = 'data-table';
  const sum = document.createElement('summary');
  sum.textContent = title;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'csv-btn';
  btn.textContent = 'Download CSV';
  btn.onclick = (e) => {
    e.preventDefault(); // don't open/close the table
    const today = new Date().toISOString().slice(0, 10);
    download(`imicroseq-${file || el.id || 'data'}-${today}.csv`, toCsv(columns.filter((c) => !c.link), rows));
  };
  btn.hidden = true;
  sum.append(btn);
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
    btn.hidden = !det.open;
    if (!det.open || body.rows.length) return;
    rows.forEach((r) => {
      const tr = body.insertRow();
      columns.forEach((c) => {
        const v = r[c.key];
        const td = tr.insertCell();
        if (!c.link) td.textContent = typeof v === 'number' ? fmt(v) : (v ?? '');
        else if (v) {
          const a = document.createElement('a');
          a.href = v;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'Browse ↗';
          td.append(a);
        }
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
