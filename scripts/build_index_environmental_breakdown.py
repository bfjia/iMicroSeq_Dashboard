#!/usr/bin/env python3
"""Build public/data/index_environmental_breakdown.json.gz from data/imicroseq.csv.xz."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from lib.imicroseq_common import load_csv_rows, trim_brackets, write_json_gz  # noqa: E402

REPO_ROOT = SCRIPT_DIR.parent
OUT = REPO_ROOT / "public" / "data" / "index_environmental_breakdown.json.gz"


def main() -> None:
    rows = load_csv_rows()
    site_counts: dict[str, int] = {}
    for row in rows:
        site = trim_brackets(row.get("environmental site")) or "Unknown"
        site_counts[site] = site_counts.get(site, 0) + 1
    top_sites = [
        name for name, _ in sorted(site_counts.items(), key=lambda x: -x[1])[:8]
    ]
    category_counts: dict[str, int] = {}
    for row in rows:
        site = trim_brackets(row.get("environmental site")) or "Unknown"
        cat = site if site in top_sites else "Other"
        category_counts[cat] = category_counts.get(cat, 0) + 1

    breakdown = [
        {"category": k, "value": v}
        for k, v in sorted(
            category_counts.items(),
            key=lambda x: (x[0].lower() == "other", -x[1]),
        )
    ]

    payload = {"breakdown": breakdown}

    write_json_gz(OUT, payload)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
