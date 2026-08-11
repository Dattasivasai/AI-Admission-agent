import pandas as pd
from pathlib import Path

DATA_PATH = Path("josaa_cutoffs.csv")          # adjust if file is elsewhere
OUT_PATH = Path("josaa_cutoffs.csv")           # overwrite same file
# OUT_PATH = Path("josaa_cutoffs_latest.csv")  # or write a new file first

df = pd.read_csv(DATA_PATH, low_memory=False)

print("Before:", len(df), "rows")
print("Years:", sorted(df["year"].dropna().unique()))

# --- keep latest years only ---
KEEP_YEARS = [2024, 2025, 2026]
df = df[df["year"].isin(KEEP_YEARS)].copy()

# --- basic cleaning ---
for col in ["institute", "academic_program", "quota", "seat_type", "gender"]:
    if col in df.columns:
        df[col] = (
            df[col]
            .astype(str)
            .str.replace(r"\s+", " ", regex=True)
            .str.strip()
            .replace({"nan": pd.NA})
        )

df["opening_rank"] = pd.to_numeric(df["opening_rank"], errors="coerce")
df["closing_rank"] = pd.to_numeric(df["closing_rank"], errors="coerce")
df = df.dropna(subset=["closing_rank", "institute", "academic_program"])

# optional: drop PwD-only noise from default dataset (keep if you want full data)
# df = df[~df["seat_type"].astype(str).str.contains("PwD", case=False, na=False)]

df = df.sort_values(["year", "round", "institute", "academic_program"]).reset_index(drop=True)

print("After:", len(df), "rows")
print("Years:", sorted(df["year"].unique()))
print(df["year"].value_counts().sort_index())

df.to_csv(OUT_PATH, index=False)
print("Saved:", OUT_PATH.resolve())
