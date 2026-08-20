import os
import logging
from pathlib import Path
from difflib import get_close_matches
import pandas as pd
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
import operator
from typing import Optional

logger = logging.getLogger("admission_agent")

load_dotenv()

# ====================== DATA LOADING (ONCE) ======================

PROJECT_DIR = Path(__file__).parent
DATA_PATH = PROJECT_DIR / "josaa_cutoffs_2026_round5.csv"


def _load_josaa_data() -> pd.DataFrame:
    # This is the only runtime data source. Use merge_cutoff_csv.py to add
    # validated crawler output to it before restarting the backend.
    df = pd.read_csv(DATA_PATH, low_memory=False)

    df["opening_rank"] = pd.to_numeric(df["opening_rank"], errors="coerce")
    df["closing_rank"] = pd.to_numeric(df["closing_rank"], errors="coerce")
    df = df.dropna(subset=["closing_rank"])

    # Older years sometimes have empty gender
    df["gender"] = df["gender"].fillna("Gender-Neutral")

    return df


JOSAA_DF = _load_josaa_data()
print(
    f"Loaded {len(JOSAA_DF):,} JoSAA records from {DATA_PATH.name} "
    f"({JOSAA_DF['year'].min()}-{JOSAA_DF['year'].max()})"
)


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]


# ====================== ALIASES (CLEANED) ======================

INSTITUTE_ALIASES = {
    # IITs
    "iitb": "Indian Institute of Technology Bombay",
    "iit bombay": "Indian Institute of Technology Bombay",
    "iit delhi": "Indian Institute of Technology Delhi",
    "iitd": "Indian Institute of Technology Delhi",
    "iit madras": "Indian Institute of Technology Madras",
    "iitm": "Indian Institute of Technology Madras",
    "iit kanpur": "Indian Institute of Technology Kanpur",
    "iitk": "Indian Institute of Technology Kanpur",
    "iit kharagpur": "Indian Institute of Technology Kharagpur",
    "iitkgp": "Indian Institute of Technology Kharagpur",
    "iit roorkee": "Indian Institute of Technology Roorkee",
    "iitr": "Indian Institute of Technology Roorkee",
    "iit guwahati": "Indian Institute of Technology Guwahati",
    "iitg": "Indian Institute of Technology Guwahati",
    "iit hyderabad": "Indian Institute of Technology Hyderabad",
    "iith": "Indian Institute of Technology Hyderabad",
    "iit bhu": "Indian Institute of Technology (BHU) Varanasi",
    "iit varanasi": "Indian Institute of Technology (BHU) Varanasi",
    "iit indore": "Indian Institute of Technology Indore",
    "iiti": "Indian Institute of Technology Indore",
    "iit mandi": "Indian Institute of Technology Mandi",
    "iit patna": "Indian Institute of Technology Patna",
    "iit ropar": "Indian Institute of Technology Ropar",
    "iit bhubaneswar": "Indian Institute of Technology Bhubaneswar",
    "iitbbs": "Indian Institute of Technology Bhubaneswar",
    "iit gandhinagar": "Indian Institute of Technology Gandhinagar",
    "iitgn": "Indian Institute of Technology Gandhinagar",
    "iit jodhpur": "Indian Institute of Technology Jodhpur",
    "iitj": "Indian Institute of Technology Jodhpur",
    "iit tirupati": "Indian Institute of Technology Tirupati",
    "iitt": "Indian Institute of Technology Tirupati",
    "iit palakkad": "Indian Institute of Technology Palakkad",
    "iitpkd": "Indian Institute of Technology Palakkad",
    "iit dharwad": "Indian Institute of Technology Dharwad",
    "iitdh": "Indian Institute of Technology Dharwad",
    "iit bhilai": "Indian Institute of Technology Bhilai",
    "iit jammu": "Indian Institute of Technology Jammu",
    "iit goa": "Indian Institute of Technology Goa",
    # NITs
    "nit trichy": "National Institute of Technology, Tiruchirappalli",
    "nit-t": "National Institute of Technology, Tiruchirappalli",
    "nitt": "National Institute of Technology, Tiruchirappalli",
    "nit tiruchirappalli": "National Institute of Technology, Tiruchirappalli",
    "nit warangal": "National Institute of Technology, Warangal",
    "nitw": "National Institute of Technology, Warangal",
    "nit surathkal": "National Institute of Technology Karnataka, Surathkal",
    "nitk": "National Institute of Technology Karnataka, Surathkal",
    "nitk surathkal": "National Institute of Technology Karnataka, Surathkal",
    "nit calicut": "National Institute of Technology Calicut",
    "nitc": "National Institute of Technology Calicut",
    "nit rourkela": "National Institute of Technology, Rourkela",
    "nitr": "National Institute of Technology, Rourkela",
    "nit allahabad": "Motilal Nehru National Institute of Technology Allahabad",
    "mnnit": "Motilal Nehru National Institute of Technology Allahabad",
    "nit jaipur": "Malaviya National Institute of Technology Jaipur",
    "mnit": "Malaviya National Institute of Technology Jaipur",
    "nit kurukshetra": "National Institute of Technology, Kurukshetra",
    "nitkkr": "National Institute of Technology, Kurukshetra",
    "nit durgapur": "National Institute of Technology Durgapur",
    "nitdgp": "National Institute of Technology Durgapur",
    "nit silchar": "National Institute of Technology Silchar",
    "nit hamirpur": "National Institute of Technology Hamirpur",
    "nith": "National Institute of Technology Hamirpur",
    "nit jalandhar": "Dr. B R Ambedkar National Institute of Technology, Jalandhar",
    "nitj": "Dr. B R Ambedkar National Institute of Technology, Jalandhar",
    "nit patna": "National Institute of Technology Patna",
    "nitp": "National Institute of Technology Patna",
    "nit raipur": "National Institute of Technology, Raipur",
    "nitrr": "National Institute of Technology, Raipur",
    "nit agartala": "National Institute of Technology Agartala",
    "nita": "National Institute of Technology Agartala",
    "nit meghalaya": "National Institute of Technology Meghalaya",
    "nitm": "National Institute of Technology Meghalaya",
    "nit goa": "National Institute of Technology Goa",
    "nitg": "National Institute of Technology Goa",
    "nit puducherry": "National Institute of Technology Puducherry",
    "nitpy": "National Institute of Technology Puducherry",
    "nit delhi": "National Institute of Technology Delhi",
    "nitd": "National Institute of Technology Delhi",
    "nit andhra": "National Institute of Technology Andhra Pradesh",
    "nitap": "National Institute of Technology Andhra Pradesh",
    "nit srinagar": "National Institute of Technology, Srinagar",
    "nitsri": "National Institute of Technology, Srinagar",
    "nit jamshedpur": "National Institute of Technology, Jamshedpur",
    "nitjsr": "National Institute of Technology, Jamshedpur",
    "nit manipur": "National Institute of Technology Manipur",
    "nitmnp": "National Institute of Technology Manipur",
    "nit mizoram": "National Institute of Technology Mizoram",
    "nitmz": "National Institute of Technology Mizoram",
    "nit nagaland": "National Institute of Technology Nagaland",
    "nitn": "National Institute of Technology Nagaland",
    "nit sikkim": "National Institute of Technology Sikkim",
    "nitsk": "National Institute of Technology Sikkim",
    "nit arunachal": "National Institute of Technology Arunachal Pradesh",
    "nit uttarakhand": "National Institute of Technology Uttarakhand",
    "nitu": "National Institute of Technology Uttarakhand",
    # IIITs
    "iiit hyderabad": "International Institute of Information Technology, Hyderabad",
    "iiith": "International Institute of Information Technology, Hyderabad",
    "iiit delhi": "Indraprastha Institute of Information Technology, Delhi",
    "iiitd": "Indraprastha Institute of Information Technology, Delhi",
    "iiit bangalore": "International Institute of Information Technology Bangalore",
    "iiitb": "International Institute of Information Technology Bangalore",
    "iiit allahabad": "Indian Institute of Information Technology, Allahabad",
    "iiita": "Indian Institute of Information Technology, Allahabad",
    "iiit lucknow": "Indian Institute of Information Technology, Lucknow",
    "iiitl": "Indian Institute of Information Technology, Lucknow",
    "iiit gwalior": "Atal Bihari Vajpayee Indian Institute of Information Technology and Management Gwalior",
    "iiitm": "Atal Bihari Vajpayee Indian Institute of Information Technology and Management Gwalior",
    "iiit jabalpur": "Pandit Dwarka Prasad Mishra Indian Institute of Information Technology, Design and Manufacturing Jabalpur",
    "iiitdmj": "Pandit Dwarka Prasad Mishra Indian Institute of Information Technology, Design and Manufacturing Jabalpur",
    "iiit kottayam": "Indian Institute of Information Technology(IIIT) Kottayam",
    "iiitk": "Indian Institute of Information Technology(IIIT) Kottayam",
    "iiit sri city": "Indian Institute of Information Technology, Sri City",
    "iiits": "Indian Institute of Information Technology, Sri City",
    "iiit sricity": "Indian Institute of Information Technology, Sri City",
    "iiit guwahati": "Indian Institute of Information Technology Guwahati",
    "iiitg": "Indian Institute of Information Technology Guwahati",
    "iiit pune": "Indian Institute of Information Technology, Pune",
    "iiitp": "Indian Institute of Information Technology, Pune",
    "iiit vadodara": "Indian Institute of Information Technology Vadodara",
    "iiitv": "Indian Institute of Information Technology Vadodara",
    "iiit una": "Indian Institute of Information Technology Una",
    "iiitu": "Indian Institute of Information Technology Una",
    "iiit dharwad": "Indian Institute of Information Technology Dharwad",
    "iiitdh": "Indian Institute of Information Technology Dharwad",
    "iiit kalyani": "Indian Institute of Information Technology Kalyani",
    "iiitkalyani": "Indian Institute of Information Technology Kalyani",
    "iiit kota": "Indian Institute of Information Technology Kota",
    "iiitkota": "Indian Institute of Information Technology Kota",
    "iiit nagpur": "Indian Institute of Information Technology Nagpur",
    "iiitn": "Indian Institute of Information Technology Nagpur",
    "iiit ranchi": "Indian Institute of Information Technology Ranchi",
    "iiitr": "Indian Institute of Information Technology Ranchi",
    "iiit bhagalpur": "Indian Institute of Information Technology Bhagalpur",
    "iiit bhopal": "Indian Institute of Information Technology Bhopal",
    "iiitbhopal": "Indian Institute of Information Technology Bhopal",
    "iiit surat": "Indian Institute of Information Technology Surat",
    "iiitsurat": "Indian Institute of Information Technology Surat",
    "iiit manipur": "Indian Institute of Information Technology Manipur",
    "iiitmnp": "Indian Institute of Information Technology Manipur",
    "iiit trichy": "Indian Institute of Information Technology Tiruchirappalli",
    "iiitt": "Indian Institute of Information Technology Tiruchirappalli",
    "iiit sonepat": "Indian Institute of Information Technology Sonepat",
    "iiitsonepat": "Indian Institute of Information Technology Sonepat",
    "iiit agartala": "Indian Institute of Information Technology Agartala",
}

PROGRAM_ALIASES = {
    "cse": "Computer Science",
    "cs": "Computer Science",
    "computer science": "Computer Science",
    "computer science and engineering": "Computer Science",
    "it": "Information Technology",
    "information technology": "Information Technology",
    "ece": "Electronics and Communication",
    "electronics and communication": "Electronics and Communication",
    "electronics & communication": "Electronics and Communication",
    "ee": "Electrical",
    "electrical": "Electrical",
    "electrical engineering": "Electrical",
    "me": "Mechanical",
    "mechanical": "Mechanical",
    "mechanical engineering": "Mechanical",
    "ce": "Civil",
    "civil": "Civil",
    "civil engineering": "Civil",
    "che": "Chemical",
    "chemical": "Chemical",
    "chemical engineering": "Chemical",
    "ae": "Aerospace",
    "aerospace": "Aerospace",
    "aerospace engineering": "Aerospace",
    "bt": "Biotechnology",
    "biotech": "Biotechnology",
    "biotechnology": "Biotechnology",
    "meta": "Metallurgical",
    "metallurgy": "Metallurgical",
    "metallurgical": "Metallurgical",
    "prod": "Production",
    "production": "Production",
    "industrial": "Industrial",
    "instrumentation": "Instrumentation",
    "ai": "Artificial Intelligence",
    "artificial intelligence": "Artificial Intelligence",
    "data science": "Data Science",
    "ds": "Data Science",
    "mnc": "Mathematics and Computing",
    "maths and computing": "Mathematics and Computing",
    "mathematics and computing": "Mathematics and Computing",
}

# ====================== INSTITUTE REGION MAPPING ======================
# Map institute → region for location-based filtering
# Regions: South, North, Northeast, West, East

INSTITUTE_REGION = {
    # SOUTH
    "nit tiruchirappalli": "South",
    "nit warangal": "South",
    "nit calicut": "South",
    "nit surathkal": "South",
    "nit karnataka": "South",
    "nit puducherry": "South",
    "nit andhra": "South",
    "iit madras": "South",
    "iit tirupati": "South",
    "iit palakkad": "South",
    "iiit hyderabad": "South",
    "iiit bangalore": "South",
    "iiit kottayam": "South",
    "iiit sri city": "South",
    
    # NORTH
    "iit delhi": "North",
    "iit roorkee": "North",
    "iit bhu": "North",
    "iit kanpur": "North",
    "iit bombay": "West",  # Mumbai, but close to North-West
    "nit delhi": "North",
    "nit allahabad": "North",
    "nit jaipur": "North",
    "nit kurukshetra": "North",
    "nit hamirpur": "North",
    "nit jalandhar": "North",
    "nit durgapur": "East",  # West Bengal
    "nit rourkela": "East",  # Odisha
    "mnnit allahabad": "North",
    "mnit jaipur": "North",
    "iiit delhi": "North",
    "iiit allahabad": "North",
    "iiit lucknow": "North",
    "iiit gwalior": "North",
    
    # NORTHEAST
    "iit guwahati": "Northeast",
    "nit silchar": "Northeast",
    "nit agartala": "Northeast",
    "nit meghalaya": "Northeast",
    "nit manipur": "Northeast",
    "nit mizoram": "Northeast",
    "nit nagaland": "Northeast",
    "nit sikkim": "Northeast",
    "nit arunachal": "Northeast",
    "iiit guwahati": "Northeast",
    
    # WEST
    "iit bombay": "West",
    "iit gandhinagar": "West",
    "nit raipur": "West",  # Central/West
    "iiit pune": "West",
    "iiit vadodara": "West",
    "iiit una": "West",
    "iiit surat": "West",
    
    # EAST
    "iit kharagpur": "East",
    "nit patna": "East",
    "nit jamshedpur": "East",
    "nit rourkela": "East",
    "nit durgapur": "East",
    "iiit jabalpur": "East",  # Madhya Pradesh
    "iiit ranchi": "East",
    "iiit bhagalpur": "East",
    
    # NORTHWEST / HIMALAYAN
    "iit mandi": "North",
    "iit ropar": "North",
    "nit srinagar": "North",
    "nit uttarakhand": "North",
}

def get_institute_region(institute_name: str) -> str:
    """Return region for an institute, or 'Unknown' if not mapped."""
    normalized = institute_name.lower().replace(",", "").strip()
    for key, region in INSTITUTE_REGION.items():
        if key in normalized or normalized in key:
            return region
    return "Unknown"


def get_college_overview(institute_query: str) -> Optional[str]:
    """Create a short, source-backed college overview from the loaded CSV."""
    query = institute_query.lower().replace(",", " ").replace("(", " ").replace(")", " ")
    query_tokens = [token for token in query.split() if len(token) > 2]
    if not query_tokens:
        return None

    institute_norm = (
        JOSAA_DF["institute"].astype(str).str.lower()
        .str.replace(",", " ", regex=False)
        .str.replace("(", " ", regex=False)
        .str.replace(")", " ", regex=False)
    )
    # Accept small spelling mistakes such as "Kottaym" → "Kottayam" when
    # identifying a college for a general information request.
    vocabulary = {
        word for name in institute_norm.dropna().unique() for word in name.split()
    }
    matches = pd.Series(True, index=JOSAA_DF.index)
    for token in query_tokens:
        search_token = token
        if not institute_norm.str.contains(token, regex=False, na=False).any():
            close_match = get_close_matches(token, vocabulary, n=1, cutoff=0.82)
            if close_match:
                search_token = close_match[0]
        matches &= institute_norm.str.contains(search_token, regex=False, na=False)

    df = JOSAA_DF[matches].copy()
    if df.empty:
        return None

    latest_year = int(df["year"].max())
    df = df[df["year"] == latest_year]
    latest_round = int(df["round"].max())
    df = df[df["round"] == latest_round]
    institute_name = df["institute"].iloc[0]
    programmes = sorted(df["academic_program"].dropna().unique())

    lines = [
        institute_name,
        f"Available programmes in the official JoSAA {latest_year} Round {latest_round} data:",
    ]
    lines.extend(f"- {programme}" for programme in programmes)
    lines.append("Admissions for these programmes are through JoSAA counselling.")
    lines.append("Ask for a branch or cutoff if you want the opening and closing ranks.")
    return "\n".join(lines)


# ====================== TOOLS ======================


@tool
def search_josaa_cutoffs(
    institute: Optional[str] = None,
    institute_type: Optional[str] = None,
    program: Optional[str] = None,
    year: Optional[int] = None,
    round: Optional[int] = None,
    category: Optional[str] = None,
    quota: Optional[str] = None,
    gender: Optional[str] = None,
    max_closing_rank: Optional[int] = None,
    min_closing_rank: Optional[int] = None,
    limit: int = 100,
) -> str:
    """
    Search real JoSAA opening & closing ranks (2016–2026).
    Always returns NUMBERED LIST format (no tables, all columns visible).

    Use this tool only for explicit cutoff, rank, branch-admission, category,
    quota, year, or round questions. Do not use it when a user simply asks
    "tell me about <college>" without asking for admission cutoffs.
    When the user asks "what can I get with rank X", ALWAYS set min_closing_rank = X.
    For specific college+branch questions, the complete latest final-round result
    set is returned (all quotas, categories and genders) up to 100 rows.
    For rank-range searches, limit=25 shows top 25 colleges user can realistically get into.
    
    OUTPUT FORMAT:
      1. Year R# | Institute | Program | Quota | Category | Gender | OR – CR
    
    If total exceeds the requested limit, user can ask "more" for the next batch.
    Each line shows ALL fields (nothing hidden).
    """
    print("SEARCH ARGS:", institute, institute_type, program, year, round, category, quota, gender, min_closing_rank, max_closing_rank)
    try:
        df = JOSAA_DF.copy()

        # Keep broad questions such as "Which NIT..." inside the requested
        # institute group. Filtering by an institute-name substring alone
        # cannot do this, because a question may not name one college.
        if institute_type:
            requested_type = institute_type.strip().upper()
            if requested_type not in {"IIT", "NIT", "IIIT", "GFTI"}:
                return "Invalid institute_type. Use IIT, NIT, IIIT, or GFTI."
            if requested_type == "IIIT":
                df = df[df["type"].astype(str).str.contains(
                    "IIIT|Information Technology", case=False, na=False, regex=True
                )]
            else:
                df = df[df["type"].astype(str).str.upper() == requested_type]

        if institute:
            inst_lower = institute.lower().strip()
            resolved = INSTITUTE_ALIASES.get(inst_lower, institute)
            # ignore commas so "Technology Tiruchirappalli" matches "Technology, Tiruchirappalli"
            needle = resolved.replace(",", "").strip()
            inst_norm = df["institute"].astype(str).str.replace(",", "", regex=False)
            df = df[inst_norm.str.contains(needle, case=False, na=False, regex=False)]

        if program:
            prog_lower = program.lower().strip()
            resolved_prog = PROGRAM_ALIASES.get(prog_lower, program)
            df = df[
                df["academic_program"].str.contains(resolved_prog, case=False, na=False)
            ]

        if year is not None:
            df = df[df["year"] == year]
        if round is not None:
            df = df[df["round"] == round]
        if category:
            df = df[df["seat_type"].str.contains(category, case=False, na=False)]
        if quota:
            df = df[df["quota"].str.upper() == quota.upper()]
        if gender:
            df = df[df["gender"].str.contains(gender, case=False, na=False)]

        if max_closing_rank is not None:
            df = df[df["closing_rank"] <= max_closing_rank]
        if min_closing_rank is not None:
            df = df[df["closing_rank"] >= min_closing_rank]

            # A candidate has not supplied category/gender in a rank query.
            # Show the standard OPEN, Gender-Neutral benchmark rather than
            # mixing reserved and PwD cutoffs into a general recommendation.
            if category is None:
                df = df[df["seat_type"].astype(str).str.upper() == "OPEN"]
            if gender is None:
                df = df[df["gender"].astype(str).str.contains(
                    "Gender-Neutral", case=False, na=False
                )]

        # A query for one institute and one programme normally means "show me
        # all current cutoffs", not every historical round.  Restrict it to
        # the latest available year and its final published round so the user
        # receives a complete, usable category/quota/gender grid.
        if institute and program and year is None and round is None and not df.empty:
            latest_year = df["year"].max()
            df = df[df["year"] == latest_year]
            final_round = df["round"].max()
            df = df[df["round"] == final_round]

        total = len(df)
        if total == 0:
            return (
                "No matching records found.\n"
                f"Filters → institute={institute}, institute_type={institute_type}, program={program}, year={year}, "
                f"category={category}, quota={quota}, gender={gender}, "
                f"min_closing_rank={min_closing_rank}, max_closing_rank={max_closing_rank}"
            )

        # Prefer non-PwD, OPEN, Gender-Neutral seats when many results exist
        df = df.copy()
        df["_is_pwd"] = df["seat_type"].str.contains("PwD", case=False, na=False)
        df["_is_open"] = df["seat_type"].str.upper().str.startswith("OPEN")
        df["_is_gender_neutral"] = df["gender"].str.contains(
            "Gender-Neutral", case=False, na=False
        )

        df = df.sort_values(
            by=[
                "year",
                "round",
                "_is_pwd",
                "_is_open",
                "_is_gender_neutral",
                "closing_rank",
            ],
            ascending=[False, False, True, False, False, True],
        )

        cols = [
            "year",
            "round",
            "institute",
            "academic_program",
            "quota",
            "seat_type",
            "gender",
            "opening_rank",
            "closing_rank",
        ]
        result_df = df[cols].head(limit)

        lines = [f"Total matching rows: {total}. Rows displayed now: {len(result_df)}.\\n"]
        for i, (_, row) in enumerate(result_df.iterrows(), start=1):
            orank = int(row["opening_rank"]) if pd.notna(row["opening_rank"]) else "N/A"
            crank = int(row["closing_rank"])
            lines.append(
                f"{i}. {row['year']} R{row['round']} | {row['institute']} | {row['academic_program']} | "
                f"{row['quota']} | {row['seat_type']} | {row['gender']} | OR {orank} – CR {crank}"
            )
        
        if total > limit:
            lines.append(f"\\n[Showing {limit} of {total} results. Ask 'more' to see the next batch.]")

        lines.append(f"\\nRows displayed in this response: {len(result_df)}.")

        return "\n".join(lines)

    except Exception as e:
        logger.exception("tool_search_josaa_failed")
        return f"Error searching cutoffs: {e}"


@tool
def percentile_to_rank(percentile: float) -> str:
    """Convert JEE Main percentile to approximate All India Rank (approximate only)."""
    try:
        if percentile >= 99.9:
            rank = int((100 - percentile) * 500)
        elif percentile >= 99:
            rank = int((100 - percentile) * 2500)
        elif percentile >= 97:
            rank = int((100 - percentile) * 12000)
        else:
            rank = int((100 - percentile) * 20000)
        return f"Approximate Rank ≈ {rank:,} for {percentile} percentile (rough estimate based on recent years)."
    except Exception as e:
        logger.exception("tool_percentile_to_rank_failed")
        return f"Error converting percentile: {e}"


@tool
def build_choice_list(
    rank: int,
    category: str,
    gender: str,
    courses: str,
    quota_mode: str = "all_india",
    order_style: str = "stronger_first",
    max_choices: int = 50,
) -> str:
    """
    Build a JoSAA-style preference choice list for a student.

    Use when the user wants choice filling / preference order / which colleges
    they can get for an ordered list of courses.

    Parameters:
    - rank: All India rank (required)
    - category: OPEN, OBC-NCL, EWS, SC, ST, etc.
    - gender: Gender-Neutral or Female-only (or Male → treat as Gender-Neutral)
    - courses: ordered course list as comma-separated text, e.g. "CSE, ECE, IT"
    - quota_mode: "all_india" (OS/AI focus) or "hs_first" (HS then OS)
    - order_style: "stronger_first" (lower CR first among eligible) or "safer_first"
    - max_choices: max rows in the final list (default 50)

    Only uses recent years 2024–2026.
    """
    try:
        # Input validation & normalization
        max_choices = min(int(max_choices), 100)  # Cap at 100 rows
        if rank <= 0 or rank > 2000000:
            return "Invalid rank. Please provide a valid All India rank (1–2000000)."

        df = JOSAA_DF.copy()
        df = df[df["year"].isin([2024, 2025, 2026])]

        # normalize gender
        g = (gender or "").strip().lower()
        if g in ("male", "m", "gender-neutral", "gender neutral", "gn"):
            gender_filter = "Gender-Neutral"
        elif "female" in g or "girls" in g:
            gender_filter = "Female"
        else:
            gender_filter = gender

        cat = (category or "OPEN").strip()

        # parse courses
        course_list = [c.strip() for c in courses.split(",") if c.strip()]
        if not course_list:
            return (
                "No courses provided. Ask the user for course order, e.g. CSE, ECE, IT."
            )

        df = df[df["seat_type"].str.contains(cat, case=False, na=False)]
        df = df[~df["seat_type"].str.contains("PwD", case=False, na=False)]
        df = df[df["gender"].str.contains(gender_filter, case=False, na=False)]
        df = df[df["closing_rank"] >= rank]

        quota_mode = (quota_mode or "all_india").lower().strip()
        order_style = (order_style or "stronger_first").lower().strip()

        rows_out = []
        seen = set()

        for course in course_list:
            if len(rows_out) >= max_choices:
                break

            prog_key = course.lower().strip()
            resolved = PROGRAM_ALIASES.get(prog_key, course)
            cdf = df[
                df["academic_program"].str.contains(resolved, case=False, na=False)
            ]

            if cdf.empty:
                continue

            # latest CR per institute+program+quota
            cdf = cdf.sort_values(["year", "round"], ascending=[False, False])
            latest = cdf.groupby(
                ["institute", "academic_program", "quota"], as_index=False
            ).first()

            if quota_mode == "all_india":
                # prefer OS/AI; still allow HS if no OS
                os_ai = latest[latest["quota"].str.upper().isin(["OS", "AI"])]
                hs = latest[latest["quota"].str.upper() == "HS"]
                ordered_parts = [os_ai, hs]
            else:  # hs_first
                hs = latest[latest["quota"].str.upper() == "HS"]
                os_ai = latest[latest["quota"].str.upper().isin(["OS", "AI"])]
                other = latest[~latest["quota"].str.upper().isin(["HS", "OS", "AI"])]
                ordered_parts = [hs, os_ai, other]

            for part in ordered_parts:
                if part.empty:
                    continue
                if order_style == "safer_first":
                    part = part.sort_values("closing_rank", ascending=False)
                else:
                    part = part.sort_values("closing_rank", ascending=True)

                for _, r in part.iterrows():
                    key = (r["institute"], r["academic_program"], r["quota"])
                    if key in seen:
                        continue
                    seen.add(key)

                    cr = int(r["closing_rank"])
                    # simple bands vs user rank
                    if cr >= int(rank * 1.15):
                        band = "Safe"
                    elif cr >= rank:
                        band = "Moderate"
                    else:
                        band = "Ambitious"

                    rows_out.append(
                        {
                            "institute": r["institute"],
                            "academic_program": r["academic_program"],
                            "quota": r["quota"],
                            "year": int(r["year"]),
                            "round": int(r["round"]),
                            "cr": cr,
                            "band": band,
                            "course": course,
                        }
                    )
                    if len(rows_out) >= max_choices:
                        break
                if len(rows_out) >= max_choices:
                    break

        if not rows_out:
            return (
                "No matching programs found for the given rank/category/gender/courses "
                "in 2024–2026 data. Ask user to relax course list or verify rank/category."
            )

        lines = [
            f"Suggested JoSAA-style choice list | Rank={rank} | {cat} | {gender_filter}",
            f"Courses order: {' → '.join(course_list)}",
            f"Quota mode: {quota_mode} | Order: {order_style}",
            f"Based on latest available rows in 2024–2026 (not a guarantee).",
            "",
            f"{'Choice No':<10} | {'Institute':<55} | {'Academic Program':<70} | Quota | Recent CR | Band",
            "-" * 170,
        ]
        for i, row in enumerate(rows_out, start=1):
            lines.append(
                f"{i:<10} | {row['institute'][:55]:<55} | {row['academic_program'][:70]:<70} | "
                f"{row['quota']:<5} | {row['cr']:<9} | {row['band']}"
            )

        lines.append("")
        lines.append(
            "User can reorder while filling. Stronger options are higher if order_style=stronger_first "
            "so later rounds can only improve upward."
        )
        return "\n".join(lines)

    except Exception as e:
        return f"Error building choice list: {str(e)}"


tools = [search_josaa_cutoffs, percentile_to_rank, build_choice_list]

# ====================== LLM ======================

llm = ChatGroq(
    # Keep this configurable for local development and deployment. The old
    # llama-3.1-70b-versatile model was retired by Groq.
    model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
    temperature=0.1,
    api_key=os.getenv("GROQ_API_KEY") or os.getenv("API_key"),
)

llm_with_tools = llm.bind_tools(tools)

LEGACY_SYSTEM_PROMPT = """You are an expert JEE Main + JoSAA Admission Counselor.
You only use tool results for ranks and cutoffs. Never invent numbers.

═══════════════════════════════════════════════════════════════════════════════
GUIDED INTAKE FLOW ("what can I get?" / "best colleges for me?")
═══════════════════════════════════════════════════════════════════════════════

BEFORE showing a long college list, ASK for missing info:

1) DETECT INTENT:
   - Keywords: "what colleges can I get", "best colleges for me", "which NITs", "colleges for rank X"
   - If all of [rank, branch, location] already given → SKIP to tool call
   - If any missing → ASK ONLY the missing ones (don't re-ask what they said)

2) ASK (if missing):
   a) Rank / AIR:
      "What is your JEE Main All India Rank (AIR)?"
      - If they give percentile instead → use percentile_to_rank tool first
   
   b) Branch Preference:
      "Any branch preference? E.g. CSE only, or 'CSE > ECE > any', or 'any branch'"
      - Default: "any branch" (show mixed colleges)
      - Store as ordered list if specified (e.g. "CSE, ECE, IT")
   
   c) Location / Region:
      "Location preference? South / North / Northeast / West / East / specific state or city / anywhere?"
      - South: NIT Trichy, Calicut, Warangal, Surathkal, Puducherry, IIT Madras, IIIT Hyderabad, Bangalore
      - North: IIT Delhi, Roorkee, Kanpur, NIT Delhi, Jaipur, Kurukshetra, IIIT Delhi, Allahabad
      - Northeast: IIT Guwahati, NIT Silchar, Agartala, Meghalaya, Manipur
      - West: IIT Bombay, Gandhinagar, IIIT Pune, Vadodara, Surat
      - East: IIT Kharagpur, NIT Patna, Jamshedpur, Rourkela
      - Default: "anywhere" (no location filter)
   
   d) Quota (rarely asked first):
      - Default: OS/AI (All-India quotas) — do NOT include HS unless user explicitly asks
      - Only ask if they mention "home state" or "HS"
      - Never assume HS

3) DO NOT ASK IF ALREADY PROVIDED:
   - If user says "Rank 45000, CSE, South" → they gave everything. Call tool immediately.
   - Do NOT re-ask any of those fields.

4) CALL TOOL with context:
   - Use: search_josaa_cutoffs or build_choice_list
   - Set: min_closing_rank = user's rank, quota="OS" (default), branch filter if specified
   - Add region filter (South/North/etc) if needed (post-process results)
   - If location="anywhere" → no region filter

5) OUTPUT: Numbered List ONLY (no markdown tables)
   Format: 1. Year R# | Institute | Program | Quota | Category | Gender | OR – CR
   Organize by: branch match → region → stronger options first → lowest CR

═══════════════════════════════════════════════════════════════════════════════
RESPONSE RULES (always follow)
═══════════════════════════════════════════════════════════════════════════════

1) CHOICE / PREFERENCE LIST
   - Keywords: choice list, preference order, what to fill, JoSAA form, build my choices
   - Call build_choice_list ONCE.
   - Required: rank, category, gender, ordered courses (e.g. CSE, ECE, IT).
   - If course order missing → ASK.
   - If HS vs All-India missing → ASK. Default if unsure: All-India (OS/AI).
   - If stronger vs safer missing → ASK. Default if unsure: stronger-first.
   - Output format ONLY:
     Choice No | Institute | Academic Program
     (optionally add Quota, Year, CR, Band on the same line or a short note below)
   - Do NOT prioritise HS unless the user asked for HS / home state.

2) CUTOFF / COLLEGE SEARCH ANSWERS — FOR SPECIFIC COLLEGE+BRANCH
   - Call search_josaa_cutoffs ONCE with limit=100 for every specific college+branch query.
   - Return EVERY row from the tool's latest final-round result. Do not omit PwD, HS, Female-only, quota, or category rows.
   - This applies to every institute and programme, not only NIT Trichy CSE.
   - NEVER reply with only one number ("the cutoff is 1449") or summarize to just 5 rows.
   - **USE NUMBERED LIST ONLY** (no markdown table — nothing hidden, all columns visible).
   - Each line MUST be pipe-delimited with ALL fields:
     1. Year R# | Institute | Program | Quota | Category | Gender | OR – CR
     Example: 1. 2026 R4 | NIT Trichy | CSE | OS | OPEN | GN | OR 103 – CR 1317
   - COMPLETE useful detail: For specific college+branch, show:
     * Latest year: ALL main quotas (OS, HS) and ALL categories (OPEN, EWS, OBC-NCL, SC, ST)
     * ALL genders (Gender-Neutral, Female-only) when present, across ALL rounds if available
     * Include prior year (e.g. 2025) OPEN OS for comparison if tool returned it
     * Do NOT drop any row (OPEN, OS/HS, categories) to keep it "short"
   - Organize by: latest year first → round (R1 to R6) → quota (OS/HS) → category.
   - **PAGINATION**: If total exceeds the returned rows, state exactly how many were shown and ask the user to request more.
   - Use abbreviations (GN = Gender-Neutral) to keep line width under 120 chars.
   - Prefer recent years (2024–2026). Omit year in tool call unless user specified one.

3) RANK QUESTIONS ("what can I get with rank X")
   - FIRST: Check if rank/branch/location complete. If missing → ASK (use GUIDED INTAKE FLOW)
   - If complete → Call search_josaa_cutoffs with: min_closing_rank = X, quota="OS" (All-India), limit=25 (NOT higher!).
   - ONLY add HS if user explicitly asked for home state / HS quota.
   - If they ask NITs → add institute filter for National Institute of Technology.
   - If they ask IIITs → add institute filter for Indian Institute of Information Technology.
   - **USE NUMBERED LIST ONLY** (no markdown table, no bullet points, nothing hidden).
   - **Every line MUST show all fields** (Quota, Category, Gender, OR, CR).
   - Line format:
     1. 2026 R4 | Institute Name | Program | Quota | Category | Gender | OR X – CR Y
   - DEFAULTS (shown in preamble):
     * Quota: OS/AI (All-India) — never include HS rows unless user explicitly asked.
     * Category: OPEN
     * Gender: Gender-Neutral
   - ONE-LINE PREAMBLE: "Assuming OPEN · Gender-Neutral · OS/AI | Rank ≈ 49000:" (add branch/location if specified)
   - **PAGINATION**: If total > 25, end with: "[Showing 25 of XXX. Ask 'more' for next batch.]"
   - **ABBREVIATE**: Use GN for Gender-Neutral, short institute names, keep lines under 120 chars.
   - If mixed programmes (CSE, ECE, Civil, etc.), add note: "[No branch preference → mixed programmes near CR ≈ 49000]".

4) PERCENTILE
   - Only if user gives a percentile (e.g. 98.5%ile) → percentile_to_rank.
   - NEVER use percentile_to_rank when the user already gave a rank/AIR.

5) ACCURACY
   - NEVER say "no matching records" unless the tool output starts with that.
   - One tool call, then the final answer. No invented cutoffs.
   - Short follow-ups ("any suggestions"): do not repeat the same list unchanged; ask what they want next (branch order, HS, stronger/safer) or offer a choice list.

Tone: direct, clear, student-friendly. Cutoffs change every year — one short disclaimer is enough.
"""

# The model receives this prompt on every tool-call step. Keep it short so a
# complete official cutoff grid can fit within the configured Groq TPM budget.
SYSTEM_PROMPT = """You are a JEE Main and JoSAA admission counselor. Use tool
results for all ranks and cutoffs; never invent values.

Use simple Markdown formatting: use bullet points for lists and bold
subheadings with ** around the heading text. Do not use Markdown tables.

Specific institute + programme cutoff query: call search_josaa_cutoffs once
with limit=100. The tool selects the latest final available round unless the
user requests a year/round. Return every tool row, exactly once, as numbered
pipe-delimited lines: Year R# | Institute | Program | Quota | Category | Gender
| OR x - CR y. Never summarize, omit categories, or make a broken table. If
the tool says results are paginated, state that clearly.

For a general question such as “tell me about IIIT Kottayam”, do not call the
cutoff tool or dump rank rows. Give a short college overview in plain text,
then offer to show its latest cutoffs if the user wants them. Only show cutoff
rows when the user explicitly asks for cutoffs, ranks, a branch, category,
quota, round, or admission chances.

Rank question: ask only for missing rank, branch preference, and location;
do not ask quota. If the user says “any location”, “no location”, “no
preference”, or “anywhere”, that completes the location requirement: search
immediately. Never treat an earlier unknown/typo word as an institute after
the user says no location.

For “Which NIT(s) ...”, call search_josaa_cutoffs with institute_type="NIT".
Likewise use IIT, IIIT, or GFTI when the user names one of those groups. For a
complete rank request call it with min_closing_rank and limit=25. The tool
defaults a general rank request to OPEN and Gender-Neutral unless the user
specified otherwise. Never return IITs for an NIT question.

Always preserve the tool's displayed-row count and state it at the end of a
list. If the user asks how many rows you listed above, answer with that
displayed-row count; never search or report the total CSV row count.

Choice list: call build_choice_list once; ask for missing rank, ordered
courses, HS/All-India preference, and stronger/safer preference.

Percentile only: call percentile_to_rank. Do not use it when an AIR is given.
Be direct and student-friendly. One short cutoff disclaimer is enough."""


def agent_node(state: AgentState):
    messages = list(state["messages"])

    # Always ensure system message is first
    if not messages or not isinstance(messages[0], SystemMessage):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + messages

    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


def should_continue(state: AgentState):
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END


# ====================== GRAPH ======================

workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", ToolNode(tools))
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")

app = workflow.compile()

if __name__ == "__main__":
    print("JEE Admission Agent Ready (Groq + Tools)")
