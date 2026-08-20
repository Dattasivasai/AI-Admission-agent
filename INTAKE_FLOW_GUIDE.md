# 🎓 Guided Intake Flow Implementation Guide

## Overview

The agent now implements a **guided intake** before showing college recommendations. This prevents dumping 40+ rows and instead asks clarifying questions to provide personalized results.

---

## What Changed

### 1. **INSTITUTE_REGION Mapping** (NEW)
Added `INSTITUTE_REGION` dictionary in `agent.py` that maps 70+ institutes to their geographic regions:

```python
INSTITUTE_REGION = {
    # SOUTH: NIT Trichy, Calicut, Warangal, IIT Madras, IIIT Hyderabad, etc.
    # NORTH: IIT Delhi, Roorkee, Kanpur, NIT Jaipur, etc.
    # NORTHEAST: IIT Guwahati, NIT Silchar, Agartala, Meghalaya, etc.
    # WEST: IIT Bombay, Gandhinagar, IIIT Pune, Vadodara, etc.
    # EAST: IIT Kharagpur, NIT Patna, Jamshedpur, Rourkela, etc.
}
```

**Helper function:**
```python
def get_institute_region(institute_name: str) -> str:
    """Return region for an institute, or 'Unknown' if not mapped."""
```

### 2. **Updated SYSTEM_PROMPT** (MAJOR CHANGE)
The system prompt now includes a **GUIDED INTAKE FLOW** section before response rules:

```
GUIDED INTAKE FLOW ("what can I get?" / "best colleges for me?")
├─ DETECT INTENT → Check for rank/branch/location
├─ ASK (if missing):
│  ├─ Rank / AIR (required)
│  ├─ Branch preference (optional, default: any)
│  ├─ Location / Region (optional, default: anywhere)
│  └─ Quota (rarely asked, default: OS/AI)
├─ DO NOT RE-ASK what's already provided
└─ CALL TOOL → search_josaa_cutoffs with context
```

---

## How It Works

### Example Conversation Flow

**User:** "What colleges can I get?"
```
Agent: To shortlist properly, I need:
  1) Your JEE Main All India Rank (AIR)
  2) Branch preference? (e.g. CSE only, or 'CSE > ECE > any', or 'any branch')
  3) Location? (South / North / Northeast / West / East / anywhere)
```

**User:** "Rank 49000, CSE preferred, South India"
```
Agent: [Calls search_josaa_cutoffs with min_closing_rank=49000, program=CSE, filters South]

Output (numbered list):
  1. 2026 R4 | NIT Trichy | CSE | OS | OPEN | Gender-Neutral | OR 450 – CR 1245
  2. 2026 R4 | NIT Warangal | CSE | OS | OPEN | Gender-Neutral | OR 520 – CR 1380
  3. 2026 R4 | NIT Calicut | CSE | OS | OPEN | Gender-Neutral | OR 480 – CR 1420
  ...
```

### Key Features

✅ **No re-asking** — If user provides rank + branch + location in one message, agent skips questions  
✅ **Smart defaults** — Branch: any | Location: anywhere | Quota: OS/AI (no HS unless asked)  
✅ **Region buckets** — South, North, Northeast, West, East (no real GPS needed)  
✅ **Filtered output** — Only relevant colleges shown; organized by branch match → region → strength  
✅ **Numbered list format** — No markdown tables (tables break in UI)

---

## Region Mapping Reference

| Region | Key Institutes |
|--------|---|
| **South** | NIT Trichy, Warangal, Calicut, Surathkal; IIT Madras, Tirupati, Palakkad; IIIT Hyderabad, Bangalore, Kottayam |
| **North** | IIT Delhi, Roorkee, Kanpur, BHU; NIT Delhi, Jaipur, Kurukshetra, Hamirpur, Jalandhar; IIIT Delhi, Allahabad, Lucknow, Gwalior |
| **Northeast** | IIT Guwahati; NIT Silchar, Agartala, Meghalaya, Manipur, Mizoram, Nagaland, Sikkim, Arunachal; IIIT Guwahati |
| **West** | IIT Bombay, Gandhinagar; IIIT Pune, Vadodara, Una, Surat |
| **East** | IIT Kharagpur; NIT Patna, Jamshedpur, Rourkela, Durgapur; IIIT Jabalpur, Ranchi, Bhagalpur |

---

## Implementation Details

### Where It Lives

**File:** `agent.py`

**Key Sections:**
1. Lines ~245–315: `INSTITUTE_REGION` dictionary
2. Lines ~315–320: `get_institute_region()` helper function
3. Lines ~670–750+: Updated `SYSTEM_PROMPT` with guided intake flow

### Usage Examples

#### Example 1: Complete Info (No Re-ask)
```
User: "I have rank 35000, want CSE, prefer North India"
Agent: [Detects all fields provided] → Calls tool → Shows list (no re-asking)
```

#### Example 2: Missing Branch
```
User: "Rank 60000, South India"
Agent: "Any branch preference? E.g. CSE only, or 'CSE > ECE > any', or 'any branch'?"
User: "Any branch"
Agent: [Calls tool with min_closing_rank=60000, location=South] → Shows mixed programs
```

#### Example 3: Specific College Query (Different Flow)
```
User: "What's the cutoff for NIT Trichy CSE?"
Agent: [Recognizes specific college+branch] → Calls search_josaa_cutoffs with institute="NIT Trichy", program="CSE" 
       → Shows complete history (all years, rounds, quotas, categories)
       [Does NOT use guided intake — specific query doesn't need it]
```

---

## Next Steps (Optional Enhancements)

### 1. **Post-Process Region Filtering in Tool** 
Modify `search_josaa_cutoffs()` to accept a region parameter and filter results:

```python
@tool
def search_josaa_cutoffs(
    institute: Optional[str] = None,
    program: Optional[str] = None,
    region: Optional[str] = None,  # NEW: "South", "North", etc.
    # ... existing params ...
) -> str:
    # ... existing code ...
    if region:
        df = df[df["institute"].apply(
            lambda x: get_institute_region(x).lower() == region.lower()
        )]
```

### 2. **Add State/City Mapping**
If users ask for a specific state (e.g. "Tamil Nadu"), extend the mapping:

```python
STATE_TO_REGION = {
    "tamil nadu": "South",
    "karnataka": "South",
    "telangana": "South",
    "delhi": "North",
    "punjab": "North",
    "assam": "Northeast",
    # ...
}
```

### 3. **Distance Calculation** (Future)
Once you have coordinates (lat/long), calculate real distances:

```python
INSTITUTE_COORDS = {
    "nit trichy": (11.3886, 79.1495),  # lat, long
    "nit warangal": (17.4695, 78.5625),
    # ...
}

from math import radians, cos, sin, asin, sqrt

def haversine(lon1, lat1, lon2, lat2):
    """Calculate great circle distance between two points (in km)."""
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371  # Earth radius in km
    return c * r
```

---

## Testing the Flow

### Test Case 1: Guided Intake
```
Input:  "Best colleges for me?"
Output: Asks for rank, branch, location
Input:  "Rank 52000, any branch, North India"
Output: Shows 50 North Indian colleges ≥ CR 52000
```

### Test Case 2: No Re-ask
```
Input:  "What colleges can I get with rank 35000, CSE, East India?"
Output: Immediate list (no "what's your rank?" re-ask)
```

### Test Case 3: Specific Query (Different Flow)
```
Input:  "NIT Trichy CSE cutoff"
Output: Complete history (doesn't use guided intake)
```

### Test Case 4: Percentile
```
Input:  "I got 95.5 percentile, CSE, South"
Output: Converts percentile → rank, then shows list
```

---

## Key Rules Enforced by Prompt

| Rule | Details |
|------|---------|
| **Ask Once** | Don't re-ask fields already provided by the user |
| **Detect Intent** | "What can I get?" = guided intake; "NIT Trichy CSE?" = specific query |
| **Defaults** | Branch=any, Location=anywhere, Quota=OS/AI (no HS) |
| **Output Format** | Numbered list only (no markdown tables) |
| **Quota Rules** | Never include HS by default; only if user explicitly asks |
| **Region Filter** | Use INSTITUTE_REGION mapping (5 buckets, not GPS distance) |
| **No Invention** | Only use tool results; never invent cutoffs |

---

## FAQ

**Q: How do I add more institutes to the region mapping?**  
A: Edit `INSTITUTE_REGION` dict in agent.py. Key format: lowercase, no commas. Region: one of (South, North, Northeast, West, East).

**Q: Can users ask for specific states (e.g. "Tamil Nadu")?**  
A: Not yet. The mapping is region-level only. You can extend it with a `STATE_TO_REGION` dict (see "Next Steps").

**Q: What if an institute isn't in the mapping?**  
A: `get_institute_region()` returns "Unknown". Those colleges will still appear in results but won't be filtered by region preference.

**Q: Why no real GPS distance?**  
A: CSV doesn't have coordinates. Using region buckets (5 categories) is a practical trade-off. Add coordinates later if needed.

**Q: What happens if user doesn't give a rank?**  
A: Agent asks "What is your JEE Main All India Rank (AIR)?". If they give percentile instead, agent calls `percentile_to_rank` first.

**Q: Can branch be a comma-separated list?**  
A: Yes. User can say "CSE, ECE, IT" and agent stores that order. `build_choice_list` tool handles ordered lists.

---

## Files Modified

- **agent.py** 
  - Lines ~245–315: Added `INSTITUTE_REGION` dict
  - Lines ~315–320: Added `get_institute_region()` function
  - Lines ~670–750+: Updated `SYSTEM_PROMPT` with GUIDED INTAKE FLOW section

## Files Created

- **INTAKE_FLOW_GUIDE.md** (this file)

---

## Summary

✅ **Before:** Agent dumped 40+ colleges without context  
✅ **After:** Agent asks rank/branch/location → shows filtered, ordered list  
✅ **Smart:** No re-asking if all info provided  
✅ **Practical:** Region buckets (South/North/East/West/Northeast) without GPS  
✅ **Ready to scale:** Add state mapping or coordinates later

**Status:** 🚀 **Ready for testing!**
