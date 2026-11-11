// Every setting a maintainer is likely to change lives here.
// Edit, save, preview with `npm run dev`, then publish (see docs/SOP.md).

// Data API. The site calls its own Worker proxy first (cached, compressed)
// and falls back to the portal API directly if the proxy fails.
export const API_PROXY = '/api/graphql';
export const API_DIRECT = 'https://arranger-environmental.imicroseq-dataportal.ca/graphql';

export const PORTAL_URL = 'https://imicroseq-dataportal.ca/';
export const PORTAL_EXPLORER_URL = 'https://portal-ui.imicroseq-dataportal.ca/explorer/environmental';

// Date field used for every time axis.
export const DATE_FIELD = 'sample_collection_start_date';

// A site is "active" if it has a sample collected within this many days.
export const ACTIVE_DAYS = 365;

// Explorer: fields offered on the X axis / Segment By dropdowns.
// key = portal field name, value = label shown on the page.
// 'Year' and 'Year-Month' are built from DATE_FIELD.
export const EXPLORER_FIELDS = {
  'Year-Month': 'Year-Month',
  Year: 'Year',
  organism: 'Organism',
  geo_loc_name_state_province_territory: 'Province/Territory',
  environmental_site: 'Environmental site',
  environmental_material: 'Environmental material',
  purpose_of_sampling: 'Purpose of sampling',
  collection_device: 'Collection device',
  collection_method: 'Collection method',
  assay_type: 'Assay type',
  sample_collected_by_organisation_name: 'Collecting organisation',
};
export const EXPLORER_DEFAULT_X = 'Year-Month';
export const EXPLORER_DEFAULT_SEGMENT = 'organism';
// Segments beyond the largest N are grouped as "Other".
export const EXPLORER_TOP_N = 12;

// Metadata completeness panel: fields checked, in display order.
export const COMPLETENESS_FIELDS = {
  organism: 'Organism',
  sample_collection_start_date: 'Collection date',
  geo_loc_name_state_province_territory: 'Province/Territory',
  geo_loc_name_city: 'City',
  geo_loc_name_site: 'Site',
  environmental_site: 'Environmental site',
  environmental_material: 'Environmental material',
  collection_device: 'Collection device',
  collection_method: 'Collection method',
  purpose_of_sampling: 'Purpose of sampling',
  sample_collected_by_organisation_name: 'Collecting organisation',
  assay_type: 'Assay type',
  diagnostic_measurement_unit_1: 'Measurement unit (target 1)',
  gene_symbol_1: 'Gene symbol (target 1)',
  water_catchment_area_human_population_measurement_value: 'Catchment population',
};

// Values that mean "no real value" (compared after removing the [ontology id]).
export const NULL_TERMS = [
  '__missing__',
  'Not Provided',
  'Not Applicable',
  'Not Collected',
  'Missing',
  'Restricted Access',
];

// Viral loads (applied by the nightly build, scripts/build-viral-loads.mjs).
export const VIRAL_ASSAY = 'Reverse transcription polymerase chain reaction assay';
export const SARS2 = 'Severe acute respiratory syndrome coronavirus 2';
export const SARS2_MAX = 2000; // SARS-CoV-2 values above this are dropped before averaging
export const PMMOV = 'Pepper mild mottle virus';
export const LOESS_SPAN = 0.2;

// Chart colours, in order of use.
export const PALETTE = [
  '#4A63E7', '#88CCEE', '#CC99BB', '#EE8877', '#6699CC', '#AA4499',
  '#CC6677', '#332288', '#117733', '#44AA99', '#DDCC77', '#999933',
];
export const OTHER_COLOR = '#B8BEC9';
export const ACTIVE_COLOR = '#4A63E7';
export const HISTORICAL_COLOR = '#9AA3B2';
