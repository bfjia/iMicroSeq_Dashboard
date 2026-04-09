#!/usr/bin/env python3
"""Build public/data/index_sample_coverage_map.json.gz from data/imicroseq.csv.xz."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from lib.imicroseq_common import (  # noqa: E402
    load_csv_rows,
    load_province_coords,
    parse_lat_lon,
    write_json_gz,
)

REPO_ROOT = SCRIPT_DIR.parent
OUT = REPO_ROOT / "public" / "data" / "index_sample_coverage_map.json.gz"


def main() -> None:
    rows = load_csv_rows()
    province_coords = load_province_coords()
    coord_counts: dict[str, int] = {}

    for row in rows:
        lat = parse_lat_lon(row.get("geo loc latitude"), "lat")
        lon = parse_lat_lon(row.get("geo loc longitude"), "lon")
        if lat is None or lon is None:
            state_province = (
                row.get("geo loc name (state/province/territory)") or ""
            ).strip()
            fallback = province_coords.get(state_province) if state_province else None
            if fallback:
                lat, lon = fallback
        if lat is not None and lon is not None:
            key = f"{lat},{lon}"
            coord_counts[key] = coord_counts.get(key, 0) + 1

    coverage_points = []
    for key, count in coord_counts.items():
        lat_s, lon_s = key.split(",", 1)
        coverage_points.append(
            {"latitude": float(lat_s), "longitude": float(lon_s), "count": count}
        )
    coverage_points.sort(key=lambda x: -x["count"])

    payload = {"coveragePoints": coverage_points}

    write_json_gz(OUT, payload)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
