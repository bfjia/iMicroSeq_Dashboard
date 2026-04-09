#!/usr/bin/env python3
"""Build public/data/dashboard_viral_loads.json.gz from data/imicroseq.csv.xz.

Only rows whose ``assay type`` (after bracket stripping) equals
``reverse transcription polymerase chain reaction assay``; comparison is
case-insensitive so it matches portal casing (e.g. ``Reverse transcription…``).
"""

from __future__ import annotations

import csv
import gzip
import json
import lzma
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
CSV_XZ = DATA_DIR / "imicroseq.csv.xz"
OUT_DATA = DATA_DIR / "dashboard_viral_loads.json.gz"
OUT_PUBLIC = REPO_ROOT / "public" / "data" / "dashboard_viral_loads.json.gz"

DATE_COL = "sample collection start date"

NEST_ORDER = [
    "geo loc name (state/province/territory)",
    "geo loc name (city)",
    "geo loc name (site)",
    "assay type",
    "target taxonomic name",
    "gene symbol",
    "diagnostic measurement unit",
    "sample collection start date",
]
VALUE_COL = "diagnostic measurement value"

# Only include measurements from this assay (matches path key after strip_brackets)
RT_PCR_ASSAY = "reverse transcription polymerase chain reaction assay"

METADATA_COLUMNS = [
    "sample collection start date",
    "geo loc name (site)",
    "geo loc name (state/province/territory)",
    "geo loc name (city)",
    "organism",
    "assay type",
]

TARGET_BASE_NAMES = [
    "target taxonomic name",
    "assay target name",
    "gene symbol",
    "diagnostic target presence",
    "diagnostic measurement value",
    "diagnostic measurement unit",
    "diagnostic measurement method",
]


def strip_brackets(s: str) -> str:
    return re.sub(r"\[[^\]]*\]", "", s).strip()


def main() -> None:
    if not CSV_XZ.exists():
        print(f"Error: {CSV_XZ} not found", file=sys.stderr)
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with lzma.open(CSV_XZ, mode="rt", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        meta_ok = [c for c in METADATA_COLUMNS if c in fieldnames]
        meta_missing = [c for c in METADATA_COLUMNS if c not in fieldnames]
        if meta_missing:
            print(
                f"Note: metadata columns not in CSV (skipped): {meta_missing}",
                file=sys.stderr,
            )
        rows = list(reader)

    out_rows: list[dict[str, str]] = []
    for row in rows:
        for target_num in (1, 2, 3):
            out_row: dict[str, str] = {}
            for col in meta_ok:
                out_row[col] = (row.get(col) or "").strip()
            out_row["target"] = str(target_num)
            for base in TARGET_BASE_NAMES:
                col_name = f"{base} {target_num}"
                out_row[base] = (row.get(col_name) or "").strip()
            out_rows.append(out_row)

    def has_target_info(r: dict[str, str]) -> bool:
        return any((r.get(base) or "").strip() for base in TARGET_BASE_NAMES)

    def is_rt_pcr_assay(r: dict[str, str]) -> bool:
        raw = (r.get("assay type") or "").strip()
        return strip_brackets(raw).casefold() == RT_PCR_ASSAY.casefold()

    out_rows = [
        r for r in out_rows if has_target_info(r) and is_rt_pcr_assay(r)
    ]

    def sort_key(r: dict[str, str]) -> tuple[bool, str]:
        d = (r.get(DATE_COL) or "").strip()
        return (not bool(d), d)

    out_rows.sort(key=sort_key)

    def _level8():
        return defaultdict(list)

    def _level7():
        return defaultdict(_level8)

    def _level6():
        return defaultdict(_level7)

    def _level5():
        return defaultdict(_level6)

    def _level4():
        return defaultdict(_level5)

    def _level3():
        return defaultdict(_level4)

    def _level2():
        return defaultdict(_level3)

    nested: dict = defaultdict(_level2)

    for r in out_rows:
        path_vals = []
        for f in NEST_ORDER:
            raw = (r.get(f) or "").strip()
            if f == DATE_COL:
                path_vals.append(strip_brackets(raw) or "(no date)")
            else:
                path_vals.append(strip_brackets(raw) or "(blank)")
        value_val = strip_brackets((r.get(VALUE_COL) or "").strip()) or "(blank)"
        d = nested
        for level_key in path_vals[:-1]:
            d = d[level_key]
        d[path_vals[-1]].append(value_val)

    def _sort_key(item):
        k = item[0]
        return (k in ("(no date)", "(blank)"), k)

    def to_sorted_dict(obj):
        if isinstance(obj, list):
            return {i: obj[i] for i in range(len(obj))}
        if isinstance(obj, dict):
            return dict(
                sorted(
                    ((k, to_sorted_dict(v)) for k, v in obj.items()),
                    key=_sort_key,
                )
            )
        return obj

    out_data = to_sorted_dict(nested)
    json_bytes = json.dumps(out_data, ensure_ascii=False).encode("utf-8")
    with gzip.open(OUT_DATA, "wb", compresslevel=6) as f:
        f.write(json_bytes)
    print(f"Wrote {OUT_DATA} ({len(out_rows)} rows)")

    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT_DATA, OUT_PUBLIC)
    print(f"Copied to {OUT_PUBLIC}")


if __name__ == "__main__":
    main()
