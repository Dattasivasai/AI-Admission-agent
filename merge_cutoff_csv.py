"""Merge a newly crawled JoSAA CSV into the single canonical cutoff dataset.

The canonical file is josaa_cutoffs.csv. A new official crawl replaces only
records with the same year, round, institute, program, quota, category and
gender; all other historical records are kept.

Example::

    .\\.venv\\Scripts\\python.exe merge_cutoff_csv.py data\\normalized\\josaa_cutoffs_2026_r5_nit.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).parent
CANONICAL_PATH = ROOT / "josaa_cutoffs.csv"
KEY_COLUMNS = [
    "year", "round", "institute", "academic_program", "quota", "seat_type", "gender"
]
CANONICAL_COLUMNS = [
    "year", "round", "type", "institute", "academic_program", "quota",
    "seat_type", "gender", "opening_rank", "closing_rank",
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Validated crawler CSV to merge")
    args = parser.parse_args()

    if not args.source.is_file():
        raise SystemExit(f"Source file not found: {args.source}")

    existing = pd.read_csv(CANONICAL_PATH, low_memory=False)
    incoming = pd.read_csv(args.source, low_memory=False)
    incoming = incoming.rename(columns={"institute_type": "type"})

    missing = set(KEY_COLUMNS + ["opening_rank", "closing_rank"]) - set(incoming.columns)
    if missing:
        raise SystemExit(f"Source file is missing required columns: {sorted(missing)}")

    for column in CANONICAL_COLUMNS:
        if column not in incoming.columns:
            incoming[column] = pd.NA

    incoming = incoming[CANONICAL_COLUMNS]
    combined = pd.concat([existing, incoming], ignore_index=True, sort=False)
    # Incoming official rows appear last, so they replace an older version of
    # the same record without deleting any different year/round data.
    combined = combined.drop_duplicates(subset=KEY_COLUMNS, keep="last")
    combined = combined.sort_values(
        ["year", "round", "institute", "academic_program", "quota", "seat_type", "gender"]
    ).reset_index(drop=True)

    backup = CANONICAL_PATH.with_name("josaa_cutoffs.backup.csv")
    if not backup.exists():
        existing.to_csv(backup, index=False)

    combined.to_csv(CANONICAL_PATH, index=False)
    print(f"Merged {len(incoming):,} rows into {CANONICAL_PATH.name}")
    print(f"Canonical total: {len(combined):,} rows")
    print(f"Backup: {backup.name}")


if __name__ == "__main__":
    main()
