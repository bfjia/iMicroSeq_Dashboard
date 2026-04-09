#!/usr/bin/env python3
"""Build public/data/dashboard_sample_breakdown.json.gz from data/imicroseq.csv.xz."""

from __future__ import annotations

import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from lib.imicroseq_common import (  # noqa: E402
    AXIS_OPTIONS,
    load_csv_rows,
    trim_brackets,
    write_json_gz,
)

REPO_ROOT = SCRIPT_DIR.parent
OUT = REPO_ROOT / "public" / "data" / "dashboard_sample_breakdown.json.gz"


def main() -> None:
    rows = load_csv_rows()
    sample_field_spec_rows: list[dict] = []
    for row in rows:
        date_str = (row.get("sample collection start date") or "").strip()
        year = None
        year_month = None
        if date_str:
            ym = re.match(r"^(\d{4})", date_str)
            if ym:
                try:
                    year = int(ym.group(1))
                except ValueError:
                    pass
            ymm = re.match(r"^(\d{4})-(\d{2})", date_str)
            if ymm:
                year_month = f"{ymm.group(1)}-{ymm.group(2)}"
        sample_field_spec_rows.append(
            {
                "organism": trim_brackets(row.get("organism", "")),
                "purpose of sampling": trim_brackets(row.get("purpose of sampling", "")),
                "geo loc name (state/province/territory)": trim_brackets(
                    row.get("geo loc name (state/province/territory)", "")
                ),
                "environmental site": trim_brackets(row.get("environmental site", "")),
                "collection device": trim_brackets(row.get("collection device", "")),
                "assay type": trim_brackets(row.get("assay type", "")),
                "Year": year,
                "Year-Month": year_month,
            }
        )

    payload = {
        "fields": ["All Records"],
        "sampleFieldSpecRows": sample_field_spec_rows,
        "axisOptions": AXIS_OPTIONS,
    }

    write_json_gz(OUT, payload)
    print(f"Wrote {OUT} ({len(sample_field_spec_rows)} rows)")


if __name__ == "__main__":
    main()
