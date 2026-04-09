#!/usr/bin/env python3
"""Build public/data/index_growth_per_year.json.gz from data/imicroseq.csv.xz."""

from __future__ import annotations

import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from lib.imicroseq_common import load_csv_rows, write_json_gz  # noqa: E402

REPO_ROOT = SCRIPT_DIR.parent
OUT = REPO_ROOT / "public" / "data" / "index_growth_per_year.json.gz"


def main() -> None:
    rows = load_csv_rows()
    growth_by_year: dict[int, int] = {}
    min_year: float = float("inf")
    max_year: float = float("-inf")

    for row in rows:
        date_str = (row.get("sample collection start date") or "").strip()
        if date_str:
            ym = re.match(r"^(\d{4})", date_str)
            if ym:
                try:
                    year = int(ym.group(1))
                    min_year = min(min_year, year)
                    max_year = max(max_year, year)
                    growth_by_year[year] = growth_by_year.get(year, 0) + 1
                except ValueError:
                    pass

    cumulative = 0
    y_min = int(min_year) if min_year != float("inf") else 0
    y_max = int(max_year) if max_year != float("-inf") else 0
    growth: list[dict[str, int]] = []
    for y in range(y_min, y_max + 1):
        count = growth_by_year.get(y, 0)
        cumulative += count
        growth.append({"year": y, "records": cumulative})

    payload = {"growth": growth}

    write_json_gz(OUT, payload)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
