#!/usr/bin/env bash
# Regenerate all JSON assets for the site from data/imicroseq.csv.xz.
# Run from repo root: bash scripts/update_website_data.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-python3}"

echo "==> Index: hero stats"
"$PY" scripts/build_index_hero_stats.py

echo "==> Index: samples per year (cumulative)"
"$PY" scripts/build_index_growth_per_year.py

echo "==> Index: environmental sites breakdown"
"$PY" scripts/build_index_environmental_breakdown.py

echo "==> Index: sample coverage map"
"$PY" scripts/build_index_sample_coverage_map.py

echo "==> Dashboard: sample breakdown (explore chart)"
"$PY" scripts/build_dashboard_sample_breakdown.py

echo "==> Dashboard: viral loads"
"$PY" scripts/build_dashboard_viral_loads.py

echo "Done. Outputs are under public/data/"
