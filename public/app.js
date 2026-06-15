
// Format large numbers as K/M for summary cards
function formatNumber(value) {
  if (value == null) return '–';
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

// Animate a numeric element from 0 to targetValue over durationMs (easeOutCubic)
function animateCount(el, targetValue, durationMs = 900) {
  if (!el) return;
  if (targetValue == null || !Number.isFinite(targetValue)) {
    el.textContent = '–';
    return;
  }

  const startValue = 0;
  const startTime = performance.now();

  const tick = (now) => {
    const t = Math.min(1, (now - startTime) / durationMs);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - t, 3);
    const current = Math.round(startValue + (targetValue - startValue) * eased);
    el.textContent = formatNumber(current);
    if (t < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

// Populate the four hero cards with animated counts from API summary
function populateSummary(summary) {
  animateCount(document.getElementById('records-count'), summary.records);
  animateCount(document.getElementById('countries-count'), summary.sites);
  animateCount(document.getElementById('organism-count'), summary.organisms);
  animateCount(document.getElementById('data-sources'), summary.dataSources);
}

// Colorblind-friendly qualitative palette – banner blue first, then lighter blue/purple/red, rest
const CATEGORY_PALETTE = [
  '#4A63E7', '#88CCEE', '#CC99BB', '#EE8877', '#6699CC', '#AA4499',
  '#CC6677', '#332288', '#117733', '#44AA99', '#DDCC77', '#999933'
];

// Vega-Lite spec: cumulative growth area chart (year vs samples)
function createGrowthSpec(data) {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: 'container',
    autosize: {type: 'fit', contains: 'padding'},

    description: 'Database growth area chart',
    data: { values: data },
    mark: {
      type: 'area',
      line: { color: '#4A63E7', strokeWidth: 4 },
      color: {
        x1: 1,
        y1: 1,
        x2: 1,
        y2: 0,
        gradient: 'linear',
        stops: [
          { offset: 0, color: '#4A63E710' },
          { offset: 1, color: '#4A63E744' }
        ]
      },
      interpolate: 'monotone'
    },
    encoding: {
      x: {
        field: 'year',
        type: 'ordinal',
        axis: { title: 'Year', grid: false }
      },
      y: {
        field: 'records',
        type: 'quantitative',
        axis: { title: 'Samples', grid: true },
        scale: { nice: true }
      },
      tooltip: [
        { field: 'year', type: 'ordinal', title: 'Year' },
        { field: 'records', type: 'quantitative', title: 'Samples' }
      ]
    }
  };
}

// Vega-Lite spec: stacked bar chart by year and category (unused; pie used instead)
function createBreakdownBarSpec(data) {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'Category breakdown stacked bars',
    width: 'container',
    autosize: {type: 'fit', contains: 'padding'},
    data: { values: data },
    mark: { type: 'bar', cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 },
    encoding: {
      x: {
        field: 'year',
        type: 'ordinal',
        axis: { title: 'Year', labelAngle: 0 }
      },
      y: {
        aggregate: 'sum',
        field: 'value',
        type: 'quantitative',
        axis: { title: 'Samples' }
      },
      color: {
        field: 'category',
        type: 'nominal',
        scale: { range: CATEGORY_PALETTE },
        legend: null,//{
        //  "orient" : "top",   
          //"labelExpr": "length(datum.label) > 12 ? slice(datum.label, 0, 12) + '\\n' + slice(datum.label, 12) : datum.label",
          //"labelLineHeight": 14
        //}
      },
      tooltip: [
        { field: 'year', type: 'ordinal' },
        { field: 'category', type: 'nominal' },
        { field: 'value', type: 'quantitative', title: 'Value' }
      ]
    }
  };
}

// Vega-Lite spec: category breakdown pie chart (slices descending, Other last)
function createBreakdownPieSpec(data) {
  const sorted = [...(data || [])].sort((a, b) => {
    if (String(a.category).toLowerCase() === 'other') return 1;
    if (String(b.category).toLowerCase() === 'other') return -1;
    return (b.value ?? 0) - (a.value ?? 0);
  });
  // Add order index so Vega-Lite uses our slice order (not alphabetical)
  const valuesWithOrder = sorted.map((d, i) => ({ ...d, _order: i }));
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'Category breakdown pie chart',
    width: 'container',
    autosize: {type: 'fit', contains: 'padding'},
    data: { values: valuesWithOrder },
    mark: { type: 'arc', tooltip: true },
    encoding: {
      theta: { field: 'value', type: 'quantitative' }, // Pie slice size
      order: { field: '_order', type: 'quantitative' }, // Slice order: descending value, Other last
      color: {
        field: 'category',
        type: 'nominal',
        sort: null, // Don't sort categories alphabetically
        scale: { range: CATEGORY_PALETTE },
        legend: { orient: 'right' },
      },
      tooltip: [
        { field: 'category', type: 'nominal' },
        { field: 'value', type: 'quantitative', title: 'Value' }
      ]
    }
  };
}

// Initialize Leaflet map: CARTO basemap, Canada GeoJSON overlay, circle markers for sample density
function initLeafletMap(container, points) {
  if (!container || typeof L === 'undefined') return;
  container.innerHTML = '';
  const map = L.map(container, { scrollWheelZoom: true }).setView([62.5, -96], 3);
  // CARTO light basemap
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>', 
    maxZoom: 19
  }).addTo(map);
  // Add circle markers scaled by sample count; tooltip shows count and lat/lon
  function addPoints() {
    if (!points || points.length === 0) return;
    console.log(points);

    const maxCount = Math.max(...points.map((d) => d.count), 1);
    points.forEach((d) => {
      const radius = Math.max(6, Math.min(30, 4 + (d.count / maxCount) * 10));
      const fillOpacity = Math.min(0.8, 0.4 + (d.count / maxCount) * 0.3);
      const marker = L.circleMarker([d.latitude, d.longitude], {
        radius,
        fillColor: '#000080',
        color: '#fff',
        weight: 1,
        opacity: 1,
        fillOpacity
      }).addTo(map);
      marker.bindTooltip(
        `<strong># of Samples</strong>: ${d.count}`,
        { permanent: false, direction: 'top', className: 'coverage-tooltip' }
      );
      /*marker.bindTooltip(
        `<strong>Samples</strong>: ${d.count}<br>Lat: ${d.latitude.toFixed(4)}<br>Lon: ${d.longitude.toFixed(4)}`,
        { permanent: false, direction: 'top', className: 'coverage-tooltip' }
      );*/
    });
  }

  // Canada GeoJSON overlay (simplified shape); then add sample points
  fetch('data/CAN.geo.json')
    .then((r) => r.json())
    .then((geojson) => {
      L.geoJSON(geojson, {
        style: {
          fillColor: '#D80621',
          color: '#a00',
          weight: 1.5,
          fillOpacity: 0.15
        }
      }).addTo(map);
      addPoints();
    })
    .catch(() => {
      addPoints();
    });
}


// Max number of top categories to show in Explore chart (rest collapsed)
const SAMPLE_FIELD_SPEC_MAX_LINES = 12;

// Axis field options for Explore chart dropdowns (fallback if API doesn't provide)
const AXIS_OPTIONS = [
  { value: 'organism', label: 'organism' },
  { value: 'purpose of sampling', label: 'purpose of sampling' },
  { value: 'geo loc name (state/province/territory)', label: 'geo loc name (state/province/territory)' },
  { value: 'environmental site', label: 'environmental site' },
  { value: 'collection device', label: 'collection device' },
  { value: 'assay type', label: 'assay type' },
  { value: 'Year', label: 'Year' },
  { value: 'Year-Month', label: 'Year-Month' }
];

// Get display value for a field from a sample row (handles Year/Year-Month and empty/–)
function getAxisValue(row, field) {
  const v = field === 'Year' ? row.Year : field === 'Year-Month' ? row['Year-Month'] : row[field];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' || s === '--' ? null : (field === 'Year' ? v : s);
}

// Aggregate sample rows into x/y/count for stacked bar; top N y-categories, sorted by total
function aggregateForSampleChart(rows, xField, yField) {
  const countBy = new Map();
  const xValues = new Set();
  const yValues = new Set();

  rows.forEach((row) => {
    const xVal = getAxisValue(row, xField);
    const yVal = getAxisValue(row, yField);
    if (xVal == null || yVal == null) return;
    const key = `${xVal}\t${yVal}`;
    countBy.set(key, (countBy.get(key) || 0) + 1);
    xValues.add(xVal);
    yValues.add(yVal);
  });

  const data = [];
  countBy.forEach((count, key) => {
    const [x, y] = key.split('\t');
    data.push({
      x: xField === 'Year' ? Number(x) : x,
      yCategory: y,
      count
    });
  });

  const xSorted = Array.from(xValues);
  if (xField === 'Year') xSorted.sort((a, b) => Number(a) - Number(b));
  else if (xField === 'Year-Month') xSorted.sort((a, b) => String(a).localeCompare(String(b)));
  else xSorted.sort((a, b) => String(a).localeCompare(String(b)));

  const yOrder = Array.from(yValues);
  const yTotals = new Map();
  data.forEach((d) => {
    yTotals.set(d.yCategory, (yTotals.get(d.yCategory) || 0) + d.count);
  });
  yOrder.sort((a, b) => (yTotals.get(b) || 0) - (yTotals.get(a) || 0));
  const topY = yOrder.slice(0, SAMPLE_FIELD_SPEC_MAX_LINES);
  const topYSet = new Set(topY);

  const filtered = data.filter((d) => topYSet.has(d.yCategory));

  const xIsYear = xField === 'Year';
  const xIsYearMonth = xField === 'Year-Month';
  return { data: filtered, xSorted, xIsYear, xIsYearMonth };
}

// Aggregate sample rows into x/count for line chart
function aggregateForLineChart(rows, xField) {
  const countBy = new Map();
  const xValues = new Set();

  rows.forEach((row) => {
    const xVal = getAxisValue(row, xField);
    if (xVal == null) return;
    countBy.set(xVal, (countBy.get(xVal) || 0) + 1);
    xValues.add(xVal);
  });

  const data = [];
  countBy.forEach((count, xVal) => {
    data.push({
      x: xField === 'Year' ? Number(xVal) : xVal,
      count
    });
  });

  const xSorted = Array.from(xValues);
  if (xField === 'Year') xSorted.sort((a, b) => Number(a) - Number(b));
  else if (xField === 'Year-Month') xSorted.sort((a, b) => String(a).localeCompare(String(b)));
  else xSorted.sort((a, b) => String(a).localeCompare(String(b)));

  const xIsYear = xField === 'Year';
  return { data, xSorted, xIsYear };
}

// Vega-Lite spec: line chart for Explore (single axis); empty state shows "No data for selected axis"
function createLineSpec(aggregated, xField) {
  const { data, xSorted, xIsYear } = aggregated;
  if (!data || data.length === 0) {
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      description: 'SampleFieldSpec line chart',
      data: { values: [{}] },
      mark: { type: 'text', align: 'center', fontSize: 14 },
      encoding: { text: { value: 'No data for selected axis' } }
    };
  }

  const xScale = xIsYear
    ? { type: 'linear', domain: [Math.min(...xSorted), Math.max(...xSorted)] }
    : { type: 'ordinal', sort: xSorted };

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'SampleFieldSpec line chart',
    width: 'container',
    height: 640,
    autosize: { type: 'fit', contains: 'padding' },
    data: { values: data },
    mark: { type: 'line', point: true, interpolate: 'monotone', strokeWidth: 2, color: '#4A63E7' },
    encoding: {
      x: {
        field: 'x',
        type: xIsYear ? 'quantitative' : 'ordinal',
        scale: xScale,
        axis: { title: xField === 'Year' ? 'Year' : xField }
      },
      y: {
        field: 'count',
        type: 'quantitative',
        axis: { title: 'Samples' },
        scale: { nice: true, zero: true }
      },
      tooltip: [
        { field: 'x', type: xIsYear ? 'quantitative' : 'nominal', title: xField },
        { field: 'count', type: 'quantitative', title: 'Samples' }
      ]
    }
  };
}

// Vega-Lite spec: stacked bar for Explore (x vs yCategory, count); empty state shows "No data for selected axes"
function createSampleFieldSpec(aggregated, xField, yField) {
  const { data, xSorted, xIsYear } = aggregated;
  if (!data || data.length === 0) {
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      description: 'SampleFieldSpec stacked bar chart',
      data: { values: [{}] },
      mark: { type: 'text', align: 'center', fontSize: 14 },
      encoding: { text: { value: 'No data for selected axes' } }
    };
  }

  const xScale = xIsYear
    ? { type: 'linear', domain: [Math.min(...xSorted), Math.max(...xSorted)] }
    : { type: 'ordinal', sort: xSorted, paddingInner: 0.05, paddingOuter: 0.05 };

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'SampleFieldSpec stacked bar chart',
    width: 'container',
    height: 640,
    autosize: { type: 'fit', contains: 'padding' },
    config: { bar: { continuousBandSize: 30 } },
    data: { values: data },
    mark: { type: 'bar', cornerRadiusTopLeft: 2, cornerRadiusTopRight: 2 },
    encoding: {
      x: {
        field: 'x',
        type: xIsYear ? 'quantitative' : 'ordinal',
        scale: xScale,
        axis: { title: xField === 'Year' ? 'Year' : xField }
      },
      y: {
        aggregate: 'sum',
        field: 'count',
        type: 'quantitative',
        axis: { title: 'Samples' },
        scale: { nice: true, zero: true }
      },
      color: {
        field: 'yCategory',
        type: 'nominal',
        scale: { range: CATEGORY_PALETTE },
        legend: { title: yField === 'Year' ? 'Year' : yField }
      },
      tooltip: [
        { field: 'x', type: xIsYear ? 'quantitative' : 'nominal', title: xField },
        { field: 'yCategory', type: 'nominal', title: yField },
        { field: 'count', type: 'quantitative', title: 'Samples' }
      ]
    }
  };
}

// Render growth area chart in #growth-chart
function initGrowthChart(data) {
  return vegaEmbed('#growth-chart', createGrowthSpec(data.growth), {
    actions: false
  });
}

// Render breakdown pie chart in #breakdown-chart
function initBreakdownChart(data) {
  return vegaEmbed('#breakdown-chart', createBreakdownPieSpec(data.breakdown), {
    actions: false
  });
}

// Render coverage map in #coverage-chart using Leaflet
function initCoverageMap(data) {
  const container = document.getElementById('coverage-chart');
  initLeafletMap(container, data.coveragePoints || []);
}

// Set up Explore chart: axis selects, plot type (line vs stacked bar), and lazy vegaEmbed on change
function initSampleChart(data) {
  const plotTypeSelect = document.getElementById('sample-chart-plot-type');
  const xSelect = document.getElementById('sample-chart-x');
  const ySelect = document.getElementById('sample-chart-y');
  const rows = data.sampleFieldSpecRows || [];
  const axisOptions = data.axisOptions && data.axisOptions.length > 0 ? data.axisOptions : AXIS_OPTIONS;

  axisOptions.forEach((opt) => {
    const xOpt = document.createElement('option');
    xOpt.value = opt.value;
    xOpt.textContent = opt.label;
    xSelect.appendChild(xOpt);
    const yOpt = document.createElement('option');
    yOpt.value = opt.value;
    yOpt.textContent = opt.label;
    ySelect.appendChild(yOpt);
  });

  plotTypeSelect.value = 'stacked-bar';
  xSelect.value = 'Year-Month';
  ySelect.value = 'organism';

  const yWrap = document.getElementById('sample-chart-y-wrap');

  // Re-aggregate and re-render when plot type or axes change
  const updateSampleChart = async () => {
    const plotType = plotTypeSelect.value;
    const xField = xSelect.value;
    const yField = ySelect.value;

    if (plotType === 'line') {
      yWrap.classList.add('hidden');
    } else {
      yWrap.classList.remove('hidden');
    }

    if (plotType === 'line') {
      const aggregated = aggregateForLineChart(rows, xField);
      await vegaEmbed(
        '#sample-chart',
        createLineSpec(aggregated, xField),
        { actions: false }
      );
    } else {
      const aggregated = aggregateForSampleChart(rows, xField, yField);
      await vegaEmbed(
        '#sample-chart',
        createSampleFieldSpec(aggregated, xField, yField),
        { actions: false }
      );
    }
  };

  plotTypeSelect.addEventListener('change', updateSampleChart);
  xSelect.addEventListener('change', updateSampleChart);
  ySelect.addEventListener('change', updateSampleChart);
  return updateSampleChart();
}

// ——— Viral Loads: 8-level nested structure (Province→City→Site→Assay→Organism→Gene→Unit→Date→values) ———
const TREND_LEGEND_LABEL = 'Trend';

/** Target taxonomic name in nested JSON; "(blank)" is treated as this organism when filtering. */
const VIRAL_ORGANISM_SARS2 = 'Severe acute respiratory syndrome coronavirus 2';
const VIRAL_ORGANISM_INFLUENZA_A = 'Influenza A virus';
const VIRAL_ORGANISM_BLANK = '(blank)';
/** When Organism is SARS-CoV-2, drop raw measurements above this before averaging. */
const VIRAL_SARS2_MAX_MEASUREMENT = 2000;

/** Keys to traverse under organism when user selects SARS-CoV-2 (includes missing/blank taxon). */
function viralOrganismBranchKeys(obj) {
  const out = [];
  if (obj && obj[VIRAL_ORGANISM_SARS2]) out.push(VIRAL_ORGANISM_SARS2);
  if (obj && obj[VIRAL_ORGANISM_BLANK]) out.push(VIRAL_ORGANISM_BLANK);
  return out;
}

/** Dropdown options: hide duplicate "(blank)" when SARS-CoV-2 exists; lone blank → show as SARS-CoV-2. */
function normalizeOrganismOptionsForSelect(keys) {
  const arr = [...keys];
  const hasSars = arr.includes(VIRAL_ORGANISM_SARS2);
  const hasBlank = arr.includes(VIRAL_ORGANISM_BLANK);
  const filtered = arr.filter((k) => !(hasSars && hasBlank && k === VIRAL_ORGANISM_BLANK));
  if (filtered.length === 1 && filtered[0] === VIRAL_ORGANISM_BLANK) {
    return [VIRAL_ORGANISM_SARS2];
  }
  return filtered.sort();
}


/** Nested quant: level 0=Province … level 6=Unit, 7=date -> [value strings] */
function getViralLoadOptionsAtLevel(nested, level, selections) {
  const keys = new Set();
  const sel = [selections.province, selections.city, selections.site, selections.assayType, selections.organism, selections.geneSymbol, selections.measurementUnit];

  function walk(obj, depth, ancestorSars2) {
    if (depth === level) {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        Object.keys(obj).forEach((k) => {
          const sars2 =
            ancestorSars2 ||
            (depth === 4 && (k === VIRAL_ORGANISM_SARS2 || k === VIRAL_ORGANISM_BLANK));
          if (viralSubtreeHasPlottableValues(obj[k], depth + 1, sars2)) keys.add(k);
        });
      }
      return;
    }
    const s = sel[depth];
    let nextKeys;
    if (!s || s === 'All') {
      nextKeys = Object.keys(obj || {});
    } else if (depth === 4 && s === VIRAL_ORGANISM_SARS2) {
      nextKeys = viralOrganismBranchKeys(obj);
    } else {
      nextKeys = [s];
    }
    for (const k of nextKeys) {
      if (obj && obj[k] && typeof obj[k] === 'object') {
        const nextSars2 =
          ancestorSars2 ||
          (depth === 4 && (k === VIRAL_ORGANISM_SARS2 || k === VIRAL_ORGANISM_BLANK));
        walk(obj[k], depth + 1, nextSars2);
      }
    }
  }
  walk(nested, 0, false);
  return [...keys].sort();
}

// Leaf values in viralLoadData.json are serialized as objects { "0": v, "1": v, ... } by Python, not arrays
function leafToNumbers(leaf) {
  if (Array.isArray(leaf)) return leaf.map((s) => parseFloat(String(s).trim())).filter((n) => Number.isFinite(n));
  if (leaf && typeof leaf === 'object') return Object.values(leaf).map((s) => parseFloat(String(s).trim())).filter((n) => Number.isFinite(n));
  return [];
}

/** True if subtree contains at least one plotable raw value (same SARS-CoV-2 cap as collectViralLoadSeries when path is SARS-CoV-2 / blank). */
function viralSubtreeHasPlottableValues(obj, depth, organismSars2Path) {
  if (!obj || typeof obj !== 'object') return false;
  if (depth === 7) {
    for (const leaf of Object.values(obj)) {
      let nums = leafToNumbers(leaf);
      if (organismSars2Path) {
        nums = nums.filter((v) => v <= VIRAL_SARS2_MAX_MEASUREMENT);
      }
      if (nums.length) return true;
    }
    return false;
  }
  for (const k of Object.keys(obj)) {
    const childSars2 =
      organismSars2Path ||
      (depth === 4 && (k === VIRAL_ORGANISM_SARS2 || k === VIRAL_ORGANISM_BLANK));
    if (viralSubtreeHasPlottableValues(obj[k], depth + 1, childSars2)) return true;
  }
  return false;
}

// Collect by (date, measurementUnit); keep average and individual values for tooltip
function collectViralLoadSeries(nested, selections) {
  const keyToValues = Object.create(null); // "date\u241Eunit" -> number[] (record sep avoids | in labels)
  const sep = '\u241E';
  const sel = [selections.province, selections.city, selections.site, selections.assayType, selections.organism, selections.geneSymbol, selections.measurementUnit];

  function walk(obj, depth, currentUnit) {
    if (depth === 7) {
      if (!obj || typeof obj !== 'object') return;
      for (const [date, leaf] of Object.entries(obj)) {
        let nums = leafToNumbers(leaf);
        if (sel[4] === VIRAL_ORGANISM_SARS2) {
          nums = nums.filter((v) => v <= VIRAL_SARS2_MAX_MEASUREMENT);
        }
        if (nums.length && currentUnit != null) {
          const key = date + sep + currentUnit;
          if (!keyToValues[key]) keyToValues[key] = [];
          keyToValues[key].push(...nums);
        }
      }
      return;
    }
    const s = sel[depth];
    let nextKeys;
    if (!s || s === 'All') {
      nextKeys = Object.keys(obj || {});
    } else if (depth === 4 && s === VIRAL_ORGANISM_SARS2) {
      nextKeys = viralOrganismBranchKeys(obj);
    } else {
      nextKeys = [s];
    }
    const isUnitLevel = depth === 6;
    for (const k of nextKeys) {
      if (obj && obj[k] && typeof obj[k] === 'object') {
        walk(obj[k], depth + 1, isUnitLevel ? k : currentUnit);
      }
    }
  }
  walk(nested, 0, null);

  const result = Object.entries(keyToValues)
    .map(([key, vals]) => {
      const i = key.indexOf(sep);
      const date = i >= 0 ? key.slice(0, i) : key;
      const measurementUnit = i >= 0 ? key.slice(i + sep.length) : '';
      const n = vals.length;
      const value = vals.reduce((a, b) => a + b, 0) / n;
      const variance = n > 1 ? vals.reduce((s, v) => s + (v - value) ** 2, 0) / (n - 1) : 0;
      const stdDev = Math.sqrt(variance);
      const stderr = n > 0 ? stdDev / Math.sqrt(n) : 0;
      const errorLow = value - stderr;
      const errorHigh = value + stderr;
      const valuesList = vals.map((v) => (Number.isInteger(v) ? String(v) : v.toFixed(4))).join(', ');
      return { date, measurementUnit, value, values: vals, valuesList, errorLow, errorHigh };
    })
    .filter((d) => d.value != null && Number.isFinite(d.value))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.measurementUnit).localeCompare(String(b.measurementUnit)));

  console.log('[Viral Load] Selections:', selections);
  console.log('[Viral Load] Collected series (count, first 5):', result.length, result.slice(0, 5));
  console.log('[Viral Load] Full collected data:', result);
  return result;
}

// LOESS (Cleveland) on the current series (already limited to the chart’s date range): span 0.2, local polynomial degree 2
const LOESS_SPAN = 0.2;
const LOESS_DEGREE = 2;

function solve3(M, v) {
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

/** Tricube LOESS at x[i]: q = max(degree+1, round(span*n)) nearest neighbors in x, weighted local polynomial fit (degree), predict at x[i]. */
function loessSmoothAt(x, y, i, span, degree) {
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
  const beta = solve3(A, b);
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

function addSmoothingTrend(data) {
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
      const valueSmooth = loessSmoothAt(x, y, i, LOESS_SPAN, LOESS_DEGREE);
      out.push({ ...arr[i], valueSmooth: Number.isFinite(valueSmooth) ? valueSmooth : arr[i].value, lineType: TREND_LEGEND_LABEL });
    }
  }
  return out;
}

const VIRAL_ROW_KEY_SEP = '\u241E';

function viralDataRowKey(d) {
  return String(d.date) + VIRAL_ROW_KEY_SEP + d.measurementUnit;
}

/** LOESS on full filtered series; copy valueSmooth onto visible-range rows by (date, unit). */
function mergeLoessFromFullSeries(displayRows, fullRowsForLoess) {
  if (!displayRows || displayRows.length === 0) return displayRows;
  if (!fullRowsForLoess || fullRowsForLoess.length === 0) return addSmoothingTrend(displayRows);
  const smoothedFull = addSmoothingTrend(fullRowsForLoess);
  const map = Object.create(null);
  for (const r of smoothedFull) {
    map[viralDataRowKey(r)] = r.valueSmooth;
  }
  return displayRows.map((r) => ({
    ...r,
    valueSmooth: map[viralDataRowKey(r)] ?? r.value,
    lineType: TREND_LEGEND_LABEL
  }));
}

function createViralLoadLineSpec(data, yAxisTitle, showLine = true, loessUseFullSeries = false, fullDataForLoess = null) {
  const yTitle = (yAxisTitle && String(yAxisTitle).trim()) ? String(yAxisTitle).trim() : 'Average value';
  if (!data || data.length === 0) {
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      description: 'Viral load chart',
      data: { values: [{}] },
      mark: { type: 'text', align: 'center', fontSize: 14 },
      encoding: { text: { value: 'No data for selected filters' } }
    };
  }
  const dataWithTrend =
    loessUseFullSeries && fullDataForLoess && fullDataForLoess.length
      ? mergeLoessFromFullSeries(data, fullDataForLoess)
      : addSmoothingTrend(data);
  const dataMark = showLine
    ? { type: 'line', point: true, interpolate: 'linear', strokeWidth: 2.5 }
    : { type: 'point', size: 60, filled: true, strokeWidth: 1 };
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'Viral load line by date and measurement unit with error bars (SEM) and trend',
    width: 'container',
    height: 640,
    autosize: { type: 'fit', contains: 'padding' },
    data: { values: dataWithTrend },
    layer: [
      {
        mark: { type: 'rule', size: 1.5, color: '#a8b3c4', opacity: 0.7 },
        encoding: {
          x: { field: 'date', type: 'temporal', axis: { title: 'Date', labelOverlap: true, format: '%b %d, %Y' } },
          y: { field: 'errorLow', type: 'quantitative' },
          y2: { field: 'errorHigh', type: 'quantitative' }
        }
      },
      {
        mark: dataMark,
        encoding: {
          x: { field: 'date', type: 'temporal', axis: { title: 'Date', labelOverlap: true, format: '%b %d, %Y' } },
          y: { field: 'value', type: 'quantitative', axis: { title: yTitle }, scale: { nice: true, zero: true, domainMin: 0 } },
          color: {
            field: 'measurementUnit',
            type: 'nominal',
            scale: { range: CATEGORY_PALETTE },
            legend: { title: 'Measurement unit' }
          },
          tooltip: [
            { field: 'date', type: 'temporal', title: 'Date' },
            { field: 'measurementUnit', type: 'nominal', title: 'Measurement unit' },
            { field: 'value', type: 'quantitative', title: 'Average', format: '.4f' },
            { field: 'valuesList', type: 'nominal', title: 'Datapoints' }
          ]
        }
      },
      {
        mark: { type: 'line', interpolate: 'linear', strokeWidth: 4, opacity: 1, color: '#6b7280' },
        encoding: {
          x: { field: 'date', type: 'temporal', axis: { title: 'Date', labelOverlap: true, format: '%b %d, %Y' } },
          y: { field: 'valueSmooth', type: 'quantitative', axis: { title: yTitle }, scale: { nice: true, zero: true, domainMin: 0 } },
          strokeDash: {
            field: 'lineType',
            type: 'nominal',
            scale: { domain: [TREND_LEGEND_LABEL], range: [[8, 5]] },
            legend: { title: null }
          }
        }
      }
    ]
  };
}

function populateViralLoadSelect(selectId, options, prependAll = false) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  sel.textContent = '';
  if (prependAll && options.length !== 1) {
    const all = document.createElement('option');
    all.value = 'All';
    all.textContent = 'All';
    sel.appendChild(all);
  }
  const blankLabel = 'Not Provided';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = (opt === '(blank)' || opt === '') ? blankLabel : opt;
    sel.appendChild(o);
  }
  if (options.includes(current)) sel.value = current;
  else if (
    selectId === 'viral-organism' &&
    (!current || !options.includes(current))
  ) {
    if (options.includes(VIRAL_ORGANISM_INFLUENZA_A)) sel.value = VIRAL_ORGANISM_INFLUENZA_A;
    else if (options.includes(VIRAL_ORGANISM_SARS2)) sel.value = VIRAL_ORGANISM_SARS2;
    else if (options.length) sel.value = options[0];
  } else if (prependAll && options.length !== 1) sel.value = 'All';
  else if (options.length) sel.value = options[0];
}

/** YYYY-MM-DD from a data date string for input type=date */
function viralDateKeyForInput(s) {
  const t = String(s).trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/** Map calendar day to slider index: start = first sample on/after pick; end = last sample on/before pick. */
function viralCalendarIndexFrom(dates, yyyyMmDd, isEnd) {
  if (!dates.length) return 0;
  if (!yyyyMmDd) return isEnd ? dates.length - 1 : 0;
  if (isEnd) {
    let last = 0;
    for (let i = 0; i < dates.length; i++) {
      const k = viralDateKeyForInput(dates[i]);
      if (k <= yyyyMmDd) last = i;
      else break;
    }
    return last;
  }
  for (let i = 0; i < dates.length; i++) {
    if (viralDateKeyForInput(dates[i]) >= yyyyMmDd) return i;
  }
  return dates.length - 1;
}

function syncViralCalendarInputs(dates, fromIdx, toIdx) {
  const fromCal = document.getElementById('viral-date-from-cal');
  const toCal = document.getElementById('viral-date-to-cal');
  if (!fromCal || !toCal || !dates.length) return;
  const first = viralDateKeyForInput(dates[0]);
  const last = viralDateKeyForInput(dates[dates.length - 1]);
  if (first) {
    fromCal.min = first;
    fromCal.max = last;
    toCal.min = first;
    toCal.max = last;
  }
  const fk = viralDateKeyForInput(dates[fromIdx]);
  const tk = viralDateKeyForInput(dates[toIdx]);
  if (fk) fromCal.value = fk;
  if (tk) toCal.value = tk;
}

function initViralLoadChart() {
  const ids = ['viral-province', 'viral-city', 'viral-site', 'viral-assay', 'viral-organism', 'viral-gene', 'viral-unit'];
  const getSelections = () => ({
    province: document.getElementById('viral-province')?.value ?? '',
    city: document.getElementById('viral-city')?.value ?? '',
    site: document.getElementById('viral-site')?.value ?? '',
    assayType: document.getElementById('viral-assay')?.value ?? '',
    organism: document.getElementById('viral-organism')?.value ?? '',
    geneSymbol: document.getElementById('viral-gene')?.value ?? '',
    measurementUnit: document.getElementById('viral-unit')?.value ?? ''
  });
  const getLoessUseFullSeries = () => document.getElementById('viral-loess-full-series')?.checked === true;
  let quantData = null;
  let currentDateList = []; // sorted unique dates from current filtered data

  function updateViralAllAggregationWarning() {
    const s = getSelections();
    const el = document.getElementById('viral-all-filter-warning');
    if (!el) return;
    const hasAll = Object.values(s).some((v) => v === 'All');
    if (hasAll) {
      el.hidden = false;
      el.innerHTML =
        '<strong>Data Aggregation:</strong> Choosing <strong>All</strong> within any filter combines all data in that category. <br>The plot shown below <strong> does not </strong> account for potential batch effects arising from differences within the category. <br>We are actively working on normalization methods to address this.';
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  }

  // Index of first date that is within the last 12 months of the max date (or 0 if unparseable)
  function indexForLast12Months(dates) {
    if (!dates || dates.length === 0) return 0;
    const lastStr = String(dates[dates.length - 1]);
    const lastDate = new Date(lastStr);
    if (Number.isNaN(lastDate.getTime())) return Math.max(0, dates.length - 12);
    const twelveMonthsAgo = new Date(lastDate);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    for (let i = 0; i < dates.length; i++) {
      const d = new Date(String(dates[i]));
      if (!Number.isNaN(d.getTime()) && d >= twelveMonthsAgo) return i;
    }
    return 0;
  }

  const onCalendarDateChange = () => {
    const dates = currentDateList;
    if (dates.length === 0) return;
    const fromCal = document.getElementById('viral-date-from-cal');
    const toCal = document.getElementById('viral-date-to-cal');
    let fromIdx = viralCalendarIndexFrom(dates, fromCal?.value || '', false);
    let toIdx = viralCalendarIndexFrom(dates, toCal?.value || '', true);
    if (fromIdx > toIdx) {
      const t = fromIdx;
      fromIdx = toIdx;
      toIdx = t;
    }
    const fromEl = document.getElementById('viral-date-from');
    const toEl = document.getElementById('viral-date-to');
    fromEl.value = fromIdx;
    toEl.value = toIdx;
    onDateRangeInput();
  };

  const updateChart = (preserveDateRange = false) => {
    if (!quantData) return;
    const selections = getSelections();
    const fullData = collectViralLoadSeries(quantData, selections);
    const dates = [...new Set(fullData.map((d) => d.date))].sort((a, b) => String(a).localeCompare(String(b)));
    currentDateList = dates;
    const n = dates.length;

    const fromEl = document.getElementById('viral-date-from');
    const toEl = document.getElementById('viral-date-to');
    const rangeWrap = document.getElementById('viral-date-range');

    if (n === 0) {
      if (rangeWrap) rangeWrap.classList.add('hidden');
      const showLine = document.getElementById('viral-show-line')?.checked !== false;
      vegaEmbed('#viral-load-chart', createViralLoadLineSpec([], selections.measurementUnit, showLine, false, null), { actions: false }).catch((err) => console.error('Viral load chart:', err));
      updateViralAllAggregationWarning();
      return;
    }
    if (rangeWrap) rangeWrap.classList.remove('hidden');

    fromEl.min = 0;
    fromEl.max = n - 1;
    toEl.min = 0;
    toEl.max = n - 1;
    let toIdx;
    let fromIdx;
    if (preserveDateRange) {
      fromIdx = Math.min(n - 1, Math.max(0, Number(fromEl.value) || 0));
      toIdx = Math.min(n - 1, Math.max(0, Number(toEl.value) ?? n - 1));
      if (fromIdx > toIdx) toIdx = fromIdx;
      if (toIdx < fromIdx) fromIdx = toIdx;
      fromEl.value = fromIdx;
      toEl.value = toIdx;
    } else {
      toIdx = n - 1;
      fromIdx = indexForLast12Months(dates);
      if (fromIdx > toIdx) fromIdx = toIdx;
      fromEl.value = fromIdx;
      toEl.value = toIdx;
    }

    const dateMin = dates[fromIdx];
    const dateMax = dates[toIdx];
    syncViralCalendarInputs(dates, fromIdx, toIdx);

    const filteredData = fullData.filter((d) => {
      const t = String(d.date);
      return t >= String(dateMin) && t <= String(dateMax);
    });
    const yTitle = selections.measurementUnit || 'Average value';
    const showLine = document.getElementById('viral-show-line')?.checked !== false;
    console.log('[Viral Load] updateChart: data points =', filteredData.length, '(date range', dateMin, '–', dateMax, ')');
    vegaEmbed(
      '#viral-load-chart',
      createViralLoadLineSpec(filteredData, yTitle, showLine, getLoessUseFullSeries(), fullData),
      { actions: false }
    ).catch((err) => console.error('Viral load chart:', err));
    updateViralAllAggregationWarning();
  };

  const onDateRangeInput = () => {
    const fromEl = document.getElementById('viral-date-from');
    const toEl = document.getElementById('viral-date-to');
    const dates = currentDateList;
    const n = dates.length;
    if (n === 0) return;
    let fromIdx = Math.max(0, Math.min(n - 1, Number(fromEl.value) || 0));
    let toIdx = Math.max(0, Math.min(n - 1, Number(toEl.value) ?? n - 1));
    if (fromIdx > toIdx) toIdx = fromIdx;
    if (toIdx < fromIdx) fromIdx = toIdx;
    fromEl.value = fromIdx;
    toEl.value = toIdx;
    syncViralCalendarInputs(dates, fromIdx, toIdx);
    // Re-filter current data by date range and re-render (no new collect)
    const dateMin = dates[fromIdx];
    const dateMax = dates[toIdx];
    const selections = getSelections();
    const fullData = collectViralLoadSeries(quantData, selections);
    const filteredData = fullData.filter((d) => {
      const t = String(d.date);
      return t >= String(dateMin) && t <= String(dateMax);
    });
    const yTitle = getSelections().measurementUnit || 'Average value';
    const showLine = document.getElementById('viral-show-line')?.checked !== false;
    vegaEmbed(
      '#viral-load-chart',
      createViralLoadLineSpec(filteredData, yTitle, showLine, getLoessUseFullSeries(), fullData),
      { actions: false }
    ).catch((err) => console.error('Viral load chart:', err));
    updateViralAllAggregationWarning();
  };

  const updateDependentDropdowns = () => {
    if (!quantData) return;
    const selections = getSelections();
    const cityOpts = getViralLoadOptionsAtLevel(quantData, 1, selections);
    populateViralLoadSelect('viral-city', cityOpts, true);
    const siteOpts = getViralLoadOptionsAtLevel(quantData, 2, getSelections());
    populateViralLoadSelect('viral-site', siteOpts, true);
    const assayOpts = getViralLoadOptionsAtLevel(quantData, 3, getSelections());
    populateViralLoadSelect('viral-assay', assayOpts, true);
    const organismOpts = getViralLoadOptionsAtLevel(quantData, 4, getSelections());
    populateViralLoadSelect('viral-organism', normalizeOrganismOptionsForSelect(organismOpts));
    const geneOpts = getViralLoadOptionsAtLevel(quantData, 5, getSelections());
    populateViralLoadSelect('viral-gene', geneOpts, true);
    const unitOpts = getViralLoadOptionsAtLevel(quantData, 6, getSelections());
    populateViralLoadSelect('viral-unit', unitOpts);
    updateChart();
  };

  return fetchViralLoadsData()
    .then((data) => {
      quantData = data;
      const provinceOpts = getViralLoadOptionsAtLevel(data, 0, {});
      populateViralLoadSelect('viral-province', provinceOpts);
      if (provinceOpts.length) updateDependentDropdowns();
      else updateChart();

      ids.forEach((id) => {
        document.getElementById(id)?.addEventListener('change', () => {
          if (id === 'viral-province') updateDependentDropdowns();
          else if (id === 'viral-city') updateDependentDropdowns();
          else {
            updateDependentDropdowns();
          }
        });
      });
      document.getElementById('viral-date-from')?.addEventListener('input', onDateRangeInput);
      document.getElementById('viral-date-to')?.addEventListener('input', onDateRangeInput);
      document.getElementById('viral-date-from-cal')?.addEventListener('change', onCalendarDateChange);
      document.getElementById('viral-date-to-cal')?.addEventListener('change', onCalendarDateChange);
      document.getElementById('viral-show-line')?.addEventListener('change', () => updateChart(true));
      document.getElementById('viral-loess-full-series')?.addEventListener('change', () => updateChart(true));
    })
    .catch((err) => {
      console.error('Viral load data:', err);
      const chartEl = document.getElementById('viral-load-chart');
      const msg = err && err.message ? err.message : String(err);
      chartEl.innerHTML = '<p class="explore-subtitle">Failed to load viral load data. ' +
        'Because this site is hosted on Cloudflare, it may be blocked by ad blockers. Please disable any ad blockers and try again.' +
        (msg ? '<p class="explore-subtitle viral-load-err-detail"></p>' : '');
      if (msg) {
        const detail = chartEl.querySelector('.viral-load-err-detail');
        if (detail) detail.textContent = 'Error: ' + msg;
      }
    });
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('aria-busy', 'false');
}

function attachLazyChartObserver(data, options) {
  const { includeIndexCharts = false, includeDashboardCharts = false } = options || {};
  const loadedCharts = new Set();

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('visible');

        const chart = el.dataset.chart;
        if (!chart || loadedCharts.has(chart)) return;
        loadedCharts.add(chart);

        if (chart === 'growth' && includeIndexCharts) {
          initGrowthChart(data).catch((err) => console.error('Growth chart:', err));
        } else if (chart === 'breakdown' && includeIndexCharts) {
          initBreakdownChart(data).catch((err) => console.error('Breakdown chart:', err));
        } else if (chart === 'coverage' && includeIndexCharts) {
          try {
            initCoverageMap(data);
          } catch (coverageErr) {
            console.error('Error rendering coverage map:', coverageErr);
          }
        } else if (chart === 'sample' && includeDashboardCharts) {
          initSampleChart(data).catch((err) => console.error('Sample chart:', err));
        } else if (chart === 'viral-load' && includeDashboardCharts) {
          initViralLoadChart().catch((err) => console.error('Viral load chart:', err));
        }
      });
    },
    { rootMargin: '80px 0px', threshold: 0.01 }
  );

  document.querySelectorAll('.lazy-section').forEach((section) => {
    observer.observe(section);
  });
}

/** Home / At a Glance: hero stats + three chart shards */
async function initIndexPage() {
  const data = await fetchIndexData();
  populateSummary(data.summary);
  hideLoadingOverlay();
  attachLazyChartObserver(data, {
    includeIndexCharts: true,
    includeDashboardCharts: false,
  });
}

/** Interactive dashboard: sample breakdown + viral loads only */
async function initDashboardPage() {
  const data = await fetchSampleBreakdownData();
  hideLoadingOverlay();
  attachLazyChartObserver(data, {
    includeIndexCharts: false,
    includeDashboardCharts: true,
  });
}

async function initDashboard() {
  if (document.getElementById('records-count')) {
    await initIndexPage();
  } else {
    await initDashboardPage();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initDashboard().catch((err) => {
    hideLoadingOverlay();
    // eslint-disable-next-line no-console
    console.error(err);
  });
});

