// Every setting a maintainer is likely to change lives here.
// Edit, save, preview with `npm run dev`, then publish (see docs/SOP.md).

// Data API. The site calls its own Worker proxy first (cached, compressed)
// and falls back to the portal API directly if the proxy fails.
export const API_PROXY = '/api/graphql';
export const API_DIRECT = 'https://arranger-environmental.imicroseq-dataportal.ca/graphql';

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
// Segments beyond the largest N are grouped as "Other" (max 8: one per palette colour).
export const EXPLORER_TOP_N = 7;

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
  geo_loc_name_country: 'Country',
};

// Fields the data specification marks as required (data_specification/fields.tsv, required = TRUE).
// Marked "(required)" in the QA completeness chart. Sequencing-only required fields are left out:
// they are "Not Applicable" for RT-PCR samples by design.
export const REQUIRED_FIELDS = [
  'organism', 'purpose_of_sampling', 'sample_collected_by_organisation_name',
  'sample_collection_start_date', 'geo_loc_name_country', 'geo_loc_name_state_province_territory',
];

// QA: fields checked for values written more than one way ("Barrie" / "BARRIE"),
// and for several values packed into one ("Lab A;Lab B").
export const QA_NAME_FIELDS = {
  geo_loc_name_site: 'Site',
  geo_loc_name_city: 'City',
  geo_loc_name_state_province_territory: 'Province/Territory',
  sample_collected_by_organisation_name: 'Collecting organisation',
  environmental_site: 'Environmental site',
  environmental_material: 'Environmental material',
  collection_device: 'Collection device',
  collection_method: 'Collection method',
  organism: 'Organism',
  gene_symbol_1: 'Gene symbol (target 1)',
  diagnostic_measurement_unit_1: 'Measurement unit (target 1)',
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
export const LOESS_SPAN = 0.2; // default; viewers can change it on the page within the range below
export const LOESS_SPAN_MIN = 0.05;
export const LOESS_SPAN_MAX = 1;

// Chart colours, in order of use. Checked for colour-blind separation; if you
// change them, keep at most 8 and re-check (see docs/ARCHITECTURE.md, "Charts").
export const PALETTE = ['#4A63E7', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const OTHER_COLOR = '#B8BEC9';

// Map markers: active sites in brand blue, historical in a lighter shade of it.
export const ACTIVE_COLOR = '#4A63E7';
export const HISTORICAL_COLOR = '#A9B7F4';
// Map: sites with fewer samples than this get no "see viral loads" link or click-through.
export const MAP_VIRAL_MIN_SAMPLES = 10;

// Link behind "How to use this dashboard" in the footer.
export const HELP_URL = 'https://github.com/bfjia/iMicroSeq_Dashboard/blob/main/docs/SOP.md#4-using-the-dashboard';
