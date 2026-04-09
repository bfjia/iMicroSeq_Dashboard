#!/usr/bin/env python3
"""Build public/data/index_hero_stats.json.gz from data/imicroseq.csv.xz."""

from __future__ import annotations

import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from lib.imicroseq_common import load_csv_rows, trim_brackets, write_json_gz  # noqa: E402

REPO_ROOT = SCRIPT_DIR.parent
OUT = REPO_ROOT / "public" / "data" / "index_hero_stats.json.gz"


def main() -> None:
    rows = load_csv_rows()
    site_set: set[str] = set()
    org_set: set[str] = set()
    organisms_set: set[str] = set()
    min_year: float = float("inf")
    max_year: float = float("-inf")

    for row in rows:
        site = (row.get("geo loc name (site)") or "").strip()
        if site:
            site_set.add(site)
        org = (row.get("sample collected by organisation name") or "").strip()
        if org:
            org_set.add(org)
        organism = trim_brackets(row.get("organism") or "") or ""
        if organism:
            organisms_set.add(organism)

        date_str = (row.get("sample collection start date") or "").strip()
        if date_str:
            ym = re.match(r"^(\d{4})", date_str)
            if ym:
                try:
                    year = int(ym.group(1))
                    min_year = min(min_year, year)
                    max_year = max(max_year, year)
                except ValueError:
                    pass

    payload = {
        "summary": {
            "records": len(rows),
            "sites": len(site_set),
            "timeSpan": {
                "start": int(min_year) if min_year != float("inf") else None,
                "end": int(max_year) if max_year != float("-inf") else None,
            },
            "organisms": len(organisms_set),
            "dataSources": len(org_set),
        }
    }

    write_json_gz(OUT, payload)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
