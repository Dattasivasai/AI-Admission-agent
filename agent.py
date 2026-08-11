import os
from pathlib import Path
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

load_dotenv()

# ====================== DATA LOADING (ONCE) ======================

DATA_PATH = Path(__file__).parent / "josaa_cutoffs.csv"


def _load_josaa_data() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH)

    df["opening_rank"] = pd.to_numeric(df["opening_rank"], errors="coerce")
    df["closing_rank"] = pd.to_numeric(df["closing_rank"], errors="coerce")
    df = df.dropna(subset=["closing_rank"])

    # Older years sometimes have empty gender
    df["gender"] = df["gender"].fillna("Gender-Neutral")

    return df


JOSAA_DF = _load_josaa_data()
print(
    f"✅ Loaded {len(JOSAA_DF):,} JoSAA records ({JOSAA_DF['year'].min()}–{JOSAA_DF['year'].max()})"
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


# ====================== TOOLS ======================


@tool
def search_josaa_cutoffs(
    institute: str = None,
    program: str = None,
    year: int = None,
    round: int = None,
    category: str = None,
    quota: str = None,
    gender: str = None,
    max_closing_rank: int = None,
    min_closing_rank: int = None,
    limit: int = 10,
) -> str:
    """
    Search real JoSAA opening & closing ranks (2016–2026).

    Use this tool for ANY question about colleges, branches, cutoffs, ranks, categories, years, quotas.
    When the user asks "what can I get with rank X", ALWAYS set min_closing_rank = X.
    """
    df = JOSAA_DF.copy()

    if institute:
        inst_lower = institute.lower().strip()
        resolved = INSTITUTE_ALIASES.get(inst_lower, institute)
        df = df[
            df["institute"].str.contains(resolved, case=False, na=False, regex=False)
        ]

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

    total = len(df)
    if total == 0:
        return (
            "No matching records found.\n"
            f"Filters → institute={institute}, program={program}, year={year}, "
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

    lines = [
        f"Found {total} matching rows "
        f"(showing top {len(result_df)} by latest year/round, preferring non-PwD & OPEN):\n"
    ]
    for _, row in result_df.iterrows():
        orank = int(row["opening_rank"]) if pd.notna(row["opening_rank"]) else "N/A"
        crank = int(row["closing_rank"])
        lines.append(
            f"• {row['year']} R{row['round']} | {row['institute']} | {row['academic_program']} | "
            f"{row['quota']} | {row['seat_type']} | {row['gender']} | OR {orank} – CR {crank}"
        )

    return "\n".join(lines)


@tool
def percentile_to_rank(percentile: float) -> str:
    """Convert JEE Main percentile to approximate All India Rank (approximate only)."""
    if percentile >= 99.9:
        rank = int((100 - percentile) * 500)
    elif percentile >= 99:
        rank = int((100 - percentile) * 2500)
    elif percentile >= 97:
        rank = int((100 - percentile) * 12000)
    else:
        rank = int((100 - percentile) * 20000)
    return f"Approximate Rank ≈ {rank:,} for {percentile} percentile (rough estimate based on recent years)."


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
            return "No courses provided. Ask the user for course order, e.g. CSE, ECE, IT."

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
            cdf = df[df["academic_program"].str.contains(resolved, case=False, na=False)]

            if cdf.empty:
                continue

            # latest CR per institute+program+quota
            cdf = cdf.sort_values(["year", "round"], ascending=[False, False])
            latest = (
                cdf.groupby(["institute", "academic_program", "quota"], as_index=False)
                .first()
            )

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
    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    temperature=0.1,
    api_key=os.getenv("GROQ_API_KEY") or os.getenv("API_key"),
)

llm_with_tools = llm.bind_tools(tools)

SYSTEM_PROMPT = """You are an expert JEE Main + JoSAA Admission Counselor with real cutoff data (prefer 2024–2026).

STRICT TOOL ROUTING (one tool call, then answer):
1) Choice list / preference order / "what should I fill" / "build my choices" / "JoSAA form"
    → call build_choice_list ONCE.
    → Need rank, category, gender, ordered courses. If missing, ASK.
    → If user is unsure: quota_mode=all_india, order_style=stronger_first.
    → NEVER use search_josaa_cutoffs for a full preference list.

2) User gives a RANK or AIR (e.g. "25000 rank", "AIR 12000") and asks what they can get
    → call search_josaa_cutoffs ONCE with:
        min_closing_rank = that rank
        year = 2025
        category = OPEN if not specified
        institute = "National Institute of Technology" if they ask NITs
        institute = "Indian Institute of Technology" if they ask IITs
        limit = 10
    → NEVER call percentile_to_rank for rank questions.

3) User gives a PERCENTILE only (e.g. 98.5 percentile, 95%ile)
    → call percentile_to_rank only.

4) Specific college/branch cutoff (e.g. "CSE cutoffs for NIT Trichy")
    → call search_josaa_cutoffs ONCE with institute + program (+ year if given).

ANSWER RULES:

CRITICAL: Copy numbers from the tool output. For each college, use a separate bullet:
• {year} R{round} | {institute} | {program} | {quota} | {category} | {gender} | OR {opening} – CR {closing}
If the tool did not return rows, say so. Never invent a prose-only list without ranks.

- After the tool result, give ONE clear final answer.
- For every college/cutoff line include: Year, Round, Institute, Program, Quota, Category, Gender, Opening Rank, Closing Rank.
- Never list only institute + branch.
- Do not retry tools with different years unless the tool returned no rows.
- Do not invent cutoffs. If category/gender were assumed, state that in one line.
- Short follow-ups like "any suggestions": do NOT repeat the same list; ask branch order / HS vs All-India / stronger vs safer, or offer build_choice_list.

Tone: direct, honest, student-friendly. Cutoffs change every year."""


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
    print("🚀 JEE Admission Agent Ready (Groq + Tools)")
