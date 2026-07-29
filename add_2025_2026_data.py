import pandas as pd
import requests
from io import StringIO
from pathlib import Path

def clean_rank(val):
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

# ====================== 2025 (three-tap) ======================
BASE_2025 = "https://raw.githubusercontent.com/three-tap-com/data-file-TT/main/2025/"
ROUNDS_2025 = {
    1: "Round1/R1-25.csv",
    2: "Round2/R2-25.csv",
    3: "Round3/R3-25.csv",
    4: "Round4/R4-25.csv",
    5: "Round5/R5-25.csv",
    6: "Round6/R6-25.csv",
}

for rnd, path in ROUNDS_2025.items():
    url = BASE_2025 + path
    print(f"Downloading 2025 Round {rnd} ...")
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        df = pd.read_csv(StringIO(r.text))
        df = df.rename(columns={
            "Institute": "institute",
            "Branch": "academic_program",
            "Quota": "quota",
            "Category": "seat_type",
            "Gender": "gender",
            "OpenRank": "opening_rank",
            "CloseRank": "closing_rank",
        })
        df["year"] = 2025
        df["round"] = rnd
        df["type"] = None
        df["opening_rank"] = df["opening_rank"].apply(clean_rank)
        df["closing_rank"] = df["closing_rank"].apply(clean_rank)
        dfs.append(df)
        print(f"  → {len(df):,} rows")
    except Exception as e:
        print(f"  Failed 2025 R{rnd}: {e}")

# ====================== 2026 (Harith-Y) ======================
BASE_2026 = "https://raw.githubusercontent.com/Harith-Y/JoSAA-CSAB-Closing-Rank-Predictor/main/data/"
ROUNDS_2026 = {
    1: "Round1-2026.csv",
    2: "Round2-2026.csv",
    3: "Round3-2026.csv",
    4: "Round4-2026.csv",
    # Round 5 not available yet in this repo
}

for rnd, path in ROUNDS_2026.items():
    url = BASE_2026 + path
    print(f"Downloading 2026 Round {rnd} ...")
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        df = pd.read_csv(StringIO(r.text))
        df = df.rename(columns={
            "Institute": "institute",
            "Academic Program Name": "academic_program",
            "Quota": "quota",
            "Seat Type": "seat_type",
            "Gender": "gender",
            "Opening Rank": "opening_rank",
            "Closing Rank": "closing_rank",
        })
        df["year"] = 2026
        df["round"] = rnd
        df["type"] = None
        df["opening_rank"] = df["opening_rank"].apply(clean_rank)
        df["closing_rank"] = df["closing_rank"].apply(clean_rank)
        dfs.append(df)
        print(f"  → {len(df):,} rows")
    except Exception as e:
        print(f"  Failed 2026 R{rnd}: {e}")

if not dfs:
    print("No new data downloaded. Stop.")
    exit()

new_data = pd.concat(dfs, ignore_index=True)
cols = ["year", "round", "type", "institute", "academic_program",
        "quota", "seat_type", "gender", "opening_rank", "closing_rank"]
new_data = new_data[[c for c in cols if c in new_data.columns]]

print(f"\nNew rows to add: {len(new_data):,}")

# Load existing and merge
existing = pd.read_csv("josaa_cutoffs.csv")
print(f"Existing rows: {len(existing):,}")

combined = pd.concat([existing, new_data], ignore_index=True)
combined = combined.drop_duplicates()
combined = combined.sort_values(["year", "round", "institute", "academic_program"]).reset_index(drop=True)

combined.to_csv("josaa_cutoffs.csv", index=False)
print(f"\nDone! Final total rows: {len(combined):,}")
print("\nYear distribution:")
print(combined["year"].value_counts().sort_index())