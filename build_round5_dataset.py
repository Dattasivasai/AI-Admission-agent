"""Create one verified dataset containing only the four 2026 JoSAA Round 5 files."""

from pathlib import Path

import pandas as pd


ROOT = Path(__file__).parent
INPUT_DIR = ROOT / "data" / "normalized"
OUTPUT = ROOT / "josaa_cutoffs_2026_round5.csv"
FILES = [
    "josaa_cutoffs_2026_r5_iit.csv",
    "josaa_cutoffs_2026_r5_nit.csv",
    "josaa_cutoffs_2026_r5_iiit.csv",
    "josaa_cutoffs_2026_r5_gfti.csv",
]
COLUMNS = [
    "year", "round", "type", "institute", "academic_program", "quota",
    "seat_type", "gender", "opening_rank", "closing_rank",
]


def main() -> None:
    frames = []
    for filename in FILES:
        path = INPUT_DIR / filename
        if not path.is_file():
            raise SystemExit(f"Missing validated source file: {path}")
        frame = pd.read_csv(path, low_memory=False).rename(columns={"institute_type": "type"})
        frames.append(frame[COLUMNS])

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates().sort_values(
        ["type", "institute", "academic_program", "quota", "seat_type", "gender"]
    )
    combined.to_csv(OUTPUT, index=False)
    print(f"Saved {len(combined):,} Round 5 rows to {OUTPUT.name}")


if __name__ == "__main__":
    main()
