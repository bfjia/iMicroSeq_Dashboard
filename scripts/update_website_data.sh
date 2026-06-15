#!/usr/bin/env bash
# Regenerate dashboard JSON assets for the site from data/imicroseq.csv.xz.
# Index-page data is now pulled live via GraphQL — only dashboard static files need rebuilding.
# Run from repo root: bash scripts/update_website_data.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-python3}"

echo "==> Dashboard: sample breakdown (explore chart)"
"$PY" scripts/build_dashboard_sample_breakdown.py

echo "==> Dashboard: viral loads"
"$PY" scripts/build_dashboard_viral_loads.py

echo "Done. Outputs are under public/data/"
