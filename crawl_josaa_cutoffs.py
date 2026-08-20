"""Download and validate opening/closing ranks from the official JoSAA portal.

The portal is an ASP.NET Web Forms application.  Every query must start with a
fresh GET so its session cookies, __VIEWSTATE and __EVENTVALIDATION fields can
be submitted with the POST request.  Do not reuse or hard-code those values.

Example (current JoSAA session):
    python crawl_josaa_cutoffs.py --year 2026 --rounds 5

The script writes raw HTML snapshots and a new normalized CSV.  It never
overwrites josaa_cutoffs.csv, which keeps the existing app data recoverable.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable

import requests
from bs4 import BeautifulSoup


CURRENT_ORCR_URL = (
    "https://josaa.admissions.nic.in/Applicant/SeatAllotmentResult/currentorcr.aspx"
)
FORM_PREFIX = "ctl00$ContentPlaceHolder1$"
CSV_FIELDS = [
    "year",
    "round",
    "institute_type",
    "institute",
    "academic_program",
    "quota",
    "seat_type",
    "gender",
    "opening_rank",
    "closing_rank",
    "opening_rank_raw",
    "closing_rank_raw",
    "source_url",
    "fetched_at",
]


@dataclass(frozen=True)
class CutoffRow:
    year: int
    round: int
    institute_type: str
    institute: str
    academic_program: str
    quota: str
    seat_type: str
    gender: str
    opening_rank: int | None
    closing_rank: int | None
    opening_rank_raw: str
    closing_rank_raw: str
    source_url: str
    fetched_at: str


def text(value: str | None) -> str:
    return " ".join((value or "").split())


def parse_rank(value: str) -> int | None:
    """Return a sortable rank while preserving a possible preparatory suffix in raw data."""
    # The official portal sometimes serializes whole ranks as e.g. "1173808.0".
    # Accept that representation, as well as the Preparatory Rank List suffix P.
    match = re.fullmatch(r"(\d+)(?:\.0+)?(?:P)?", text(value), flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def hidden_fields(soup: BeautifulSoup) -> dict[str, str]:
    return {
        input_tag["name"]: input_tag.get("value", "")
        for input_tag in soup.select('input[type="hidden"][name]')
    }


def form_fields(soup: BeautifulSoup) -> dict[str, str]:
    """Collect ASP.NET hidden state plus each select's active value."""
    fields = hidden_fields(soup)
    for select in soup.select("select[name]"):
        selected = select.select_one("option[selected]") or select.find("option")
        if selected is not None:
            fields[select["name"]] = selected.get("value", "")
    return fields


def select_options(soup: BeautifulSoup, control_id: str) -> dict[str, str]:
    select = soup.find("select", id=control_id)
    if select is None:
        raise ValueError(f"Official form no longer has select #{control_id}")

    return {
        option.get("value", "").strip(): text(option.get_text())
        for option in select.find_all("option")
        if option.get("value", "").strip() not in {"", "0"}
    }


def fetch_form(session: requests.Session) -> tuple[BeautifulSoup, str]:
    response = session.get(CURRENT_ORCR_URL, timeout=45)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser"), response.url


def postback(
    session: requests.Session,
    soup: BeautifulSoup,
    *,
    control_name: str,
    value: str,
) -> tuple[BeautifulSoup, str]:
    """Apply an AutoPostBack dropdown change and return its refreshed form."""
    payload = form_fields(soup)
    payload.update(
        {
            "__EVENTTARGET": control_name,
            "__EVENTARGUMENT": "",
            control_name: value,
        }
    )
    response = session.post(CURRENT_ORCR_URL, data=payload, timeout=90)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser"), response.url


def submit_query(session: requests.Session, soup: BeautifulSoup) -> tuple[str, str]:
    """Submit an ALL-institute / ALL-program / ALL-category official query."""
    payload = form_fields(soup)
    required_all_controls = (
        f"{FORM_PREFIX}ddlInstitute",
        f"{FORM_PREFIX}ddlBranch",
        f"{FORM_PREFIX}ddlSeattype",
    )
    for control in required_all_controls:
        payload[control] = "ALL"
    payload[f"{FORM_PREFIX}btnSubmit"] = "Submit"
    response = session.post(CURRENT_ORCR_URL, data=payload, timeout=90)
    response.raise_for_status()
    return response.text, response.url


def parse_cutoff_rows(
    html: str,
    *,
    year: int,
    round_number: int,
    institute_type: str,
    source_url: str,
    fetched_at: str,
) -> list[CutoffRow]:
    soup = BeautifulSoup(html, "html.parser")
    # ASP.NET renders the server-control id with its container prefix, e.g.
    # ctl00_ContentPlaceHolder1_GridView1.
    table = soup.select_one('table[id$="GridView1"]')
    if table is None:
        raise ValueError("No #GridView1 cutoff table found in the official response")

    rows: list[CutoffRow] = []
    for tr in table.find_all("tr"):
        cells = [text(cell.get_text(" ", strip=True)) for cell in tr.find_all("td")]
        # The official table has: Institute, Program, Quota, Category, Gender, OR, CR.
        if len(cells) != 7 or cells[0].lower() == "institute":
            continue

        opening_raw, closing_raw = cells[5], cells[6]
        rows.append(
            CutoffRow(
                year=year,
                round=round_number,
                institute_type=institute_type,
                institute=cells[0],
                academic_program=cells[1],
                quota=cells[2],
                seat_type=cells[3],
                gender=cells[4],
                opening_rank=parse_rank(opening_raw),
                closing_rank=parse_rank(closing_raw),
                opening_rank_raw=opening_raw,
                closing_rank_raw=closing_raw,
                source_url=source_url,
                fetched_at=fetched_at,
            )
        )
    return rows


def validation_issues(rows: Iterable[CutoffRow]) -> list[dict[str, object]]:
    """Return review items instead of silently discarding official source data."""
    issues: list[dict[str, object]] = []
    seen: set[tuple[object, ...]] = set()

    for row in rows:
        identity = (
            row.year,
            row.round,
            row.institute,
            row.academic_program,
            row.quota,
            row.seat_type,
            row.gender,
        )
        if identity in seen:
            issues.append({"issue": "duplicate_identity", **asdict(row)})
        seen.add(identity)

        required = (row.institute, row.academic_program, row.quota, row.seat_type, row.gender)
        if not all(required):
            issues.append({"issue": "missing_required_value", **asdict(row)})
        if row.opening_rank is None or row.closing_rank is None:
            issues.append({"issue": "non_numeric_rank", **asdict(row)})
        elif (
            row.opening_rank > row.closing_rank
            and not row.opening_rank_raw.upper().endswith("P")
            and not row.closing_rank_raw.upper().endswith("P")
        ):
            # Preparatory ranks (suffix P) are from a different rank list and
            # cannot be compared numerically with ordinary opening ranks.
            issues.append({"issue": "opening_rank_greater_than_closing_rank", **asdict(row)})
    return issues


def write_csv(path: Path, rows: Iterable[CutoffRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="JoSAA session year, e.g. 2026")
    parser.add_argument("--rounds", nargs="+", type=int, required=True, help="Rounds to download, e.g. 1 2 3 4 5")
    parser.add_argument(
        "--institute-types",
        nargs="*",
        default=None,
        help="Optional official type codes. Defaults to every type currently listed by the portal.",
    )
    parser.add_argument("--delay-seconds", type=float, default=1.0, help="Delay between official requests")
    parser.add_argument("--output", type=Path, default=None, help="Normalized output CSV path")
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw/josaa"), help="Raw HTML snapshot directory")
    parser.add_argument("--reports-dir", type=Path, default=Path("data/reports"), help="Validation report directory")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if any(round_number < 1 for round_number in args.rounds):
        raise SystemExit("Round numbers must be positive")

    output = args.output or Path("data/normalized") / f"josaa_cutoffs_{args.year}.csv"
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "AI-Admission-Agent/1.0 (official JoSAA cutoff data updater)",
            "Accept-Language": "en-IN,en;q=0.9",
        }
    )

    all_rows: list[CutoffRow] = []
    for round_number in args.rounds:
        # The portal populates institute types only after the round's
        # AutoPostBack. Do not rely on a stale code such as "3IT".
        initial_form, _ = fetch_form(session)
        round_form, _ = postback(
            session,
            initial_form,
            control_name=f"{FORM_PREFIX}ddlroundno",
            value=str(round_number),
        )
        type_options = select_options(round_form, f"{FORM_PREFIX.replace('$', '_')}ddlInstype")
        requested_codes = args.institute_types or list(type_options)
        unknown_codes = sorted(set(requested_codes) - set(type_options))
        if unknown_codes:
            raise SystemExit(
                f"Round {round_number} does not support institute type code(s): {', '.join(unknown_codes)}. "
                f"Available: {', '.join(type_options)}"
            )

        for type_code in requested_codes:
            type_name = type_options[type_code]
            print(f"Fetching {args.year} round {round_number}: {type_name} ({type_code})")
            type_form, _ = postback(
                session,
                round_form,
                control_name=f"{FORM_PREFIX}ddlInstype",
                value=type_code,
            )
            html, source_url = submit_query(session, type_form)
            snapshot = args.raw_dir / str(args.year) / f"round-{round_number}_{type_code}.html"
            snapshot.parent.mkdir(parents=True, exist_ok=True)
            snapshot.write_text(html, encoding="utf-8")

            fetched_at = datetime.now(UTC).isoformat()
            rows = parse_cutoff_rows(
                html,
                year=args.year,
                round_number=round_number,
                institute_type=type_name,
                source_url=source_url,
                fetched_at=fetched_at,
            )
            if not rows:
                raise RuntimeError(f"No cutoff rows returned for round {round_number}, type {type_code}")
            all_rows.extend(rows)
            print(f"  saved {len(rows):,} rows")
            time.sleep(max(args.delay_seconds, 0))

    write_csv(output, all_rows)
    issues = validation_issues(all_rows)
    args.reports_dir.mkdir(parents=True, exist_ok=True)
    report = args.reports_dir / f"josaa_validation_{args.year}.json"
    report.write_text(json.dumps(issues, indent=2), encoding="utf-8")
    print(f"\nSaved {len(all_rows):,} rows to {output}")
    print(f"Saved {len(issues):,} validation issue(s) to {report}")


if __name__ == "__main__":
    main()
