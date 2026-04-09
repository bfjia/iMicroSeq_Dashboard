"""Shared helpers and paths for imicroseq.csv.xz build scripts."""

from __future__ import annotations

import csv
import gzip
import json
import lzma
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = REPO_ROOT / "data"
PUBLIC_DATA_DIR = REPO_ROOT / "public" / "data"
CSV_XZ = DATA_DIR / "imicroseq.csv.xz"
PROVINCE_COORDS_CSV = PUBLIC_DATA_DIR / "ProvinceCapitalCoords.csv"


def trim_brackets(s: str | None) -> str:
    """Remove everything in [], including the brackets, from the value."""
    if s is None:
        return ""
    out = (s or "").strip()
    while "[" in out:
        out = re.sub(r"\[[^\]]*\]", "", out)
    return out.strip()


def parse_lat_lon(raw: str | None, kind: str) -> float | None:
    if raw is None:
        return None
    s = (raw or "").strip()
    if not s or s == "--" or "not provided" in s.lower():
        return None
    m = re.match(r"(-?\d+(?:\.\d+)?)\s*([NSEW])?", s, re.I)
    if not m:
        return None
    try:
        value = float(m.group(1))
    except ValueError:
        return None
    hemi = (m.group(2) or "").upper()
    if hemi in ("S", "W"):
        value = -abs(value)
    elif hemi in ("N", "E"):
        value = abs(value)
    if kind == "lat" and (value < -90 or value > 90):
        return None
    if kind == "lon" and (value < -180 or value > 180):
        return None
    return value


def load_province_coords() -> dict[str, tuple[float, float]]:
    coords: dict[str, tuple[float, float]] = {}
    if not PROVINCE_COORDS_CSV.exists():
        return coords
    with open(PROVINCE_COORDS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = (row.get("Province") or "").strip()
            if not name:
                continue
            try:
                lat = float(row.get("Latitude", 0))
                lon = float(row.get("Longitude", 0))
            except (TypeError, ValueError):
                continue
            coords[name] = (lat, lon)
            short = name.split(" [")[0].strip()
            if short and short != name:
                coords[short] = (lat, lon)
    return coords


def load_csv_rows() -> list[dict[str, str]]:
    if not CSV_XZ.exists():
        print(f"Error: {CSV_XZ} not found", file=sys.stderr)
        sys.exit(1)
    with lzma.open(CSV_XZ, mode="rt", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_json_gz(path: Path, obj: object, *, compresslevel: int = 6) -> None:
    """Write UTF-8 JSON gzip-compressed (same format the browser decompresses with DecompressionStream)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    with gzip.open(path, "wb", compresslevel=compresslevel) as f:
        f.write(raw)


AXIS_OPTIONS = [
    {"value": "organism", "label": "organism"},
    {"value": "purpose of sampling", "label": "purpose of sampling"},
    {
        "value": "geo loc name (state/province/territory)",
        "label": "geo loc name (state/province/territory)",
    },
    {"value": "environmental site", "label": "environmental site"},
    {"value": "collection device", "label": "collection device"},
    {"value": "assay type", "label": "assay type"},
    {"value": "Year", "label": "Year"},
    {"value": "Year-Month", "label": "Year-Month"},
]
