import pandas as pd
import requests
from io import StringIO
from pathlib import Path

# All available CSVs from PardhavMaradani
BASE = "https://raw.githubusercontent.com/PardhavMaradani/josaa-sql-interface/main/csv/"
FILES = [
    "josaa-2016-r6-all.csv",
    "josaa-2017-r7-all.csv",
    "josaa-2018-r7-all.csv",
    "josaa-2019-r7-all.csv",
    "josaa-2020-r6-all.csv",
    "josaa-2021-r6-all.csv",
    "josaa-2022-r6-all.csv",
    "josaa-2023-r6-all.csv",
    "josaa-2024-r1-all.csv",
    "josaa-2024-r2-all.csv",
    "josaa-2024-r3-all.csv",
    "josaa-2024-r4-all.csv",
    "josaa-2024-r5-all.csv",
]

def clean_rank(val):
    """Handle preparatory ranks like '238P' → 238 and flag them later if needed."""
    if pd.isna(val):
        return None
    s = str(val).strip().upper()
    if s.endswith("P"):
        try:
            return int(s[:-1])
        except:
            return None
    try:
        return int(float(s))
    except:
        return None

dfs = []
for fname in FILES:
    url = BASE + fname
    print(f"Downloading {fname} ...")
    r = requests.get(url)
    r.raise_for_status()
    df = pd.read_csv(StringIO(r.text))
    dfs.append(df)

print("Merging...")
full = pd.concat(dfs, ignore_index=True)

# Standardize column names to match what we want
full = full.rename(columns={
    "program": "academic_program",
    "category": "seat_type",
    "orank": "opening_rank",
    "crank": "closing_rank",
})

# Clean ranks
full["opening_rank"] = full["opening_rank"].apply(clean_rank)
full["closing_rank"] = full["closing_rank"].apply(clean_rank)

# Drop rows with missing critical fields
full = full.dropna(subset=["institute", "academic_program", "closing_rank"])

# Keep useful columns in sensible order
cols = [
    "year", "round", "type", "institute", "academic_program",
    "quota", "seat_type", "gender", "opening_rank", "closing_rank"
]
full = full[cols]

# Sort for readability
full = full.sort_values(["year", "round", "type", "institute", "academic_program"]).reset_index(drop=True)

out_path = Path("josaa_cutoffs.csv")
full.to_csv(out_path, index=False)
print(f"\nDone! Saved {len(full):,} rows → {out_path.resolve()}")
print(full["year"].value_counts().sort_index())
print("\nSample:")
print(full.head(3).to_string())