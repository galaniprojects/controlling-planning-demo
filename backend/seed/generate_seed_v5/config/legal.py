"""Cluster F master data — countries, regions, charging locations, legal entities.

Owned by Phase 1; read-only for Phase 2 charging team (T1).

Per [F-MD-01..02]:
- 90 charging locations (the KB-internal charging code master). Naming pattern
  ``<FictionalDivision> <Country> <City>``.
- ~120 legal entities (registered companies). Naming pattern
  ``<FictionalCorpRoot> <CountryCode> <Number>``. Each has a many-to-one rollup
  to a charging location plus its own ``country_id`` per [F-MD-02] divergence.
- All flagship-referenced charging locations from the demo plan are guaranteed
  present (DE-MUC/STG/WOL, FR-LYO, UK-LON, IT-MIL, ES-MAD, NL-AMS, PL-POZ,
  HU-BUD, CZ-PRG, AT-VIE, US-DET, BR-SAO, CN-SHA, IN-PUN, JP-TOK).

The geographic distribution from the plan:
  EMEA 62 (DE 14, FR 8, UK 6, IT 5, ES 4, NL 3, PL 4, HU 3, CZ 3, AT 2, BE 2,
           SE 2, DK 1, FI 1, NO 1, IE 1, PT 1, CH 1)
  Americas 14 (US 8, CA 2, BR 2, MX 2)
  APAC 14 (CN 4, IN 3, JP 2, KR 2, AU 2, SG 1)
  Total = 90.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Regions
# ---------------------------------------------------------------------------
REGIONS: list[dict] = [
    {"id": "reg-emea",     "code": "EMEA",     "name": "Europe, Middle East & Africa"},
    {"id": "reg-americas", "code": "AMERICAS", "name": "Americas"},
    {"id": "reg-apac",     "code": "APAC",     "name": "Asia Pacific"},
]

# ---------------------------------------------------------------------------
# Countries (ISO 3166-1 alpha-2 codes used as KB-internal idents).
# Each row: {id, iso_code, name, region_id}.
# ---------------------------------------------------------------------------
COUNTRIES: list[dict] = [
    # --- EMEA ---
    {"id": "ctry-de", "iso_code": "DE", "name": "Germany",        "region_id": "reg-emea"},
    {"id": "ctry-fr", "iso_code": "FR", "name": "France",         "region_id": "reg-emea"},
    {"id": "ctry-uk", "iso_code": "UK", "name": "United Kingdom", "region_id": "reg-emea"},
    {"id": "ctry-it", "iso_code": "IT", "name": "Italy",          "region_id": "reg-emea"},
    {"id": "ctry-es", "iso_code": "ES", "name": "Spain",          "region_id": "reg-emea"},
    {"id": "ctry-nl", "iso_code": "NL", "name": "Netherlands",    "region_id": "reg-emea"},
    {"id": "ctry-pl", "iso_code": "PL", "name": "Poland",         "region_id": "reg-emea"},
    {"id": "ctry-hu", "iso_code": "HU", "name": "Hungary",        "region_id": "reg-emea"},
    {"id": "ctry-cz", "iso_code": "CZ", "name": "Czechia",        "region_id": "reg-emea"},
    {"id": "ctry-at", "iso_code": "AT", "name": "Austria",        "region_id": "reg-emea"},
    {"id": "ctry-be", "iso_code": "BE", "name": "Belgium",        "region_id": "reg-emea"},
    {"id": "ctry-se", "iso_code": "SE", "name": "Sweden",         "region_id": "reg-emea"},
    {"id": "ctry-dk", "iso_code": "DK", "name": "Denmark",        "region_id": "reg-emea"},
    {"id": "ctry-fi", "iso_code": "FI", "name": "Finland",        "region_id": "reg-emea"},
    {"id": "ctry-no", "iso_code": "NO", "name": "Norway",         "region_id": "reg-emea"},
    {"id": "ctry-ie", "iso_code": "IE", "name": "Ireland",        "region_id": "reg-emea"},
    {"id": "ctry-pt", "iso_code": "PT", "name": "Portugal",       "region_id": "reg-emea"},
    {"id": "ctry-ch", "iso_code": "CH", "name": "Switzerland",    "region_id": "reg-emea"},
    # --- Americas ---
    {"id": "ctry-us", "iso_code": "US", "name": "United States",  "region_id": "reg-americas"},
    {"id": "ctry-ca", "iso_code": "CA", "name": "Canada",         "region_id": "reg-americas"},
    {"id": "ctry-br", "iso_code": "BR", "name": "Brazil",         "region_id": "reg-americas"},
    {"id": "ctry-mx", "iso_code": "MX", "name": "Mexico",         "region_id": "reg-americas"},
    # --- APAC ---
    {"id": "ctry-cn", "iso_code": "CN", "name": "China",          "region_id": "reg-apac"},
    {"id": "ctry-in", "iso_code": "IN", "name": "India",          "region_id": "reg-apac"},
    {"id": "ctry-jp", "iso_code": "JP", "name": "Japan",          "region_id": "reg-apac"},
    {"id": "ctry-kr", "iso_code": "KR", "name": "South Korea",    "region_id": "reg-apac"},
    {"id": "ctry-au", "iso_code": "AU", "name": "Australia",      "region_id": "reg-apac"},
    {"id": "ctry-sg", "iso_code": "SG", "name": "Singapore",      "region_id": "reg-apac"},
]

# ---------------------------------------------------------------------------
# Charging locations (90 total). Each row carries:
#   id, code, city, country_id (FK), region_id (FK), division (free text).
# Code format: KB-internal "CL-<COUNTRY>-<3-letter-city-or-num>". Sequential.
# Names: "<FictionalDivision> <Country-name> <City>".
# Division is one of the four FICTIONAL_DIVISIONS from branding.py — assigned
# in a deterministic round-robin based on the location's index in the list.
# ---------------------------------------------------------------------------
_DIVISIONS = ["Manufacturing Operations", "Logistics Engineering", "Enterprise Shared Services", "Digital Innovation"]


def _div_for_index(idx: int) -> str:
    """Round-robin division across the four fictional divisions."""
    return _DIVISIONS[idx % len(_DIVISIONS)]


def _cl(idx: int, code_suffix: str, city: str, country: str, country_name: str) -> dict:
    return {
        "id": f"cl-{code_suffix.lower()}",
        "code": f"CL-{code_suffix}",
        "city": city,
        "country_id": f"ctry-{country.lower()}",
        "region_id": _country_region(country),
        "division": _div_for_index(idx),
        "country_name": country_name,
    }


def _country_region(iso: str) -> str:
    if iso in {"US", "CA", "BR", "MX"}:
        return "reg-americas"
    if iso in {"CN", "IN", "JP", "KR", "AU", "SG"}:
        return "reg-apac"
    return "reg-emea"


# Charging locations as ordered tuples (idx, code_suffix, city, iso, country_name)
# ─────────────────────────────────────────────────────────────────────────
# Build deterministically. Only the locations explicitly enumerated below
# are seeded; numeric distribution follows the plan (62 EMEA + 14 Americas
# + 14 APAC = 90).
# ─────────────────────────────────────────────────────────────────────────
_RAW_CHARGING_LOCATIONS: list[tuple] = [
    # Germany 14 (DE-MUC/STG/WOL guaranteed)
    ("DE-MUC", "Munich",        "DE", "Germany"),
    ("DE-STG", "Stuttgart",     "DE", "Germany"),
    ("DE-WOL", "Wolfsburg",     "DE", "Germany"),
    ("DE-FRA", "Frankfurt",     "DE", "Germany"),
    ("DE-BER", "Berlin",        "DE", "Germany"),
    ("DE-HAM", "Hamburg",       "DE", "Germany"),
    ("DE-COL", "Cologne",       "DE", "Germany"),
    ("DE-DUS", "Dusseldorf",    "DE", "Germany"),
    ("DE-NUR", "Nuremberg",     "DE", "Germany"),
    ("DE-LEI", "Leipzig",       "DE", "Germany"),
    ("DE-DRE", "Dresden",       "DE", "Germany"),
    ("DE-HAN", "Hanover",       "DE", "Germany"),
    ("DE-ESS", "Essen",         "DE", "Germany"),
    ("DE-BRE", "Bremen",        "DE", "Germany"),
    # France 8 (FR-LYO guaranteed)
    ("FR-LYO", "Lyon",          "FR", "France"),
    ("FR-PAR", "Paris",         "FR", "France"),
    ("FR-MAR", "Marseille",     "FR", "France"),
    ("FR-TOU", "Toulouse",      "FR", "France"),
    ("FR-BOR", "Bordeaux",      "FR", "France"),
    ("FR-NAN", "Nantes",        "FR", "France"),
    ("FR-LIL", "Lille",         "FR", "France"),
    ("FR-STR", "Strasbourg",    "FR", "France"),
    # United Kingdom 6 (UK-LON guaranteed)
    ("UK-LON", "London",        "UK", "United Kingdom"),
    ("UK-MAN", "Manchester",    "UK", "United Kingdom"),
    ("UK-BIR", "Birmingham",    "UK", "United Kingdom"),
    ("UK-LEE", "Leeds",         "UK", "United Kingdom"),
    ("UK-EDI", "Edinburgh",     "UK", "United Kingdom"),
    ("UK-GLA", "Glasgow",       "UK", "United Kingdom"),
    # Italy 5 (IT-MIL guaranteed)
    ("IT-MIL", "Milan",         "IT", "Italy"),
    ("IT-ROM", "Rome",          "IT", "Italy"),
    ("IT-TUR", "Turin",         "IT", "Italy"),
    ("IT-NAP", "Naples",        "IT", "Italy"),
    ("IT-BOL", "Bologna",       "IT", "Italy"),
    # Spain 4 (ES-MAD guaranteed)
    ("ES-MAD", "Madrid",        "ES", "Spain"),
    ("ES-BAR", "Barcelona",     "ES", "Spain"),
    ("ES-VAL", "Valencia",      "ES", "Spain"),
    ("ES-SEV", "Seville",       "ES", "Spain"),
    # Netherlands 3 (NL-AMS guaranteed)
    ("NL-AMS", "Amsterdam",     "NL", "Netherlands"),
    ("NL-RTM", "Rotterdam",     "NL", "Netherlands"),
    ("NL-EIN", "Eindhoven",     "NL", "Netherlands"),
    # Poland 4 (PL-POZ guaranteed)
    ("PL-POZ", "Poznan",        "PL", "Poland"),
    ("PL-WAR", "Warsaw",        "PL", "Poland"),
    ("PL-KRA", "Krakow",        "PL", "Poland"),
    ("PL-WRO", "Wroclaw",       "PL", "Poland"),
    # Hungary 3 (HU-BUD guaranteed)
    ("HU-BUD", "Budapest",      "HU", "Hungary"),
    ("HU-DEB", "Debrecen",      "HU", "Hungary"),
    ("HU-SZE", "Szeged",        "HU", "Hungary"),
    # Czechia 3 (CZ-PRG guaranteed)
    ("CZ-PRG", "Prague",        "CZ", "Czechia"),
    ("CZ-BRN", "Brno",          "CZ", "Czechia"),
    ("CZ-OST", "Ostrava",       "CZ", "Czechia"),
    # Austria 2 (AT-VIE guaranteed)
    ("AT-VIE", "Vienna",        "AT", "Austria"),
    ("AT-GRZ", "Graz",          "AT", "Austria"),
    # Belgium 2
    ("BE-BRU", "Brussels",      "BE", "Belgium"),
    ("BE-ANT", "Antwerp",       "BE", "Belgium"),
    # Sweden 2
    ("SE-STO", "Stockholm",     "SE", "Sweden"),
    ("SE-GOT", "Gothenburg",    "SE", "Sweden"),
    # Denmark 1
    ("DK-CPH", "Copenhagen",    "DK", "Denmark"),
    # Finland 1
    ("FI-HEL", "Helsinki",      "FI", "Finland"),
    # Norway 1
    ("NO-OSL", "Oslo",          "NO", "Norway"),
    # Ireland 1
    ("IE-DUB", "Dublin",        "IE", "Ireland"),
    # Portugal 1
    ("PT-LIS", "Lisbon",        "PT", "Portugal"),
    # Switzerland 1
    ("CH-ZUR", "Zurich",        "CH", "Switzerland"),
    # United States 8 (US-DET guaranteed)
    ("US-DET", "Detroit",       "US", "United States"),
    ("US-NYC", "New York",      "US", "United States"),
    ("US-CHI", "Chicago",       "US", "United States"),
    ("US-LAX", "Los Angeles",   "US", "United States"),
    ("US-ATL", "Atlanta",       "US", "United States"),
    ("US-DAL", "Dallas",        "US", "United States"),
    ("US-SFO", "San Francisco", "US", "United States"),
    ("US-BOS", "Boston",        "US", "United States"),
    # Canada 2
    ("CA-TOR", "Toronto",       "CA", "Canada"),
    ("CA-MTL", "Montreal",      "CA", "Canada"),
    # Brazil 2 (BR-SAO guaranteed)
    ("BR-SAO", "Sao Paulo",     "BR", "Brazil"),
    ("BR-RIO", "Rio de Janeiro", "BR", "Brazil"),
    # Mexico 2
    ("MX-MEX", "Mexico City",   "MX", "Mexico"),
    ("MX-MTY", "Monterrey",     "MX", "Mexico"),
    # China 4 (CN-SHA guaranteed)
    ("CN-SHA", "Shanghai",      "CN", "China"),
    ("CN-BEI", "Beijing",       "CN", "China"),
    ("CN-SHE", "Shenzhen",      "CN", "China"),
    ("CN-GUA", "Guangzhou",     "CN", "China"),
    # India 3 (IN-PUN guaranteed)
    ("IN-PUN", "Pune",          "IN", "India"),
    ("IN-BAN", "Bangalore",     "IN", "India"),
    ("IN-MUM", "Mumbai",        "IN", "India"),
    # Japan 2 (JP-TOK guaranteed)
    ("JP-TOK", "Tokyo",         "JP", "Japan"),
    ("JP-OSA", "Osaka",         "JP", "Japan"),
    # South Korea 2
    ("KR-SEO", "Seoul",         "KR", "South Korea"),
    ("KR-BUS", "Busan",         "KR", "South Korea"),
    # Australia 2
    ("AU-SYD", "Sydney",        "AU", "Australia"),
    ("AU-MEL", "Melbourne",     "AU", "Australia"),
    # Singapore 1
    ("SG-SIN", "Singapore",     "SG", "Singapore"),
]


CHARGING_LOCATIONS: list[dict] = [
    _cl(idx, code_suffix, city, iso, country_name)
    for idx, (code_suffix, city, iso, country_name) in enumerate(_RAW_CHARGING_LOCATIONS)
]


# ---------------------------------------------------------------------------
# Legal entities (~120). Each rollups to one charging location, with optional
# country_id divergence (LE country need not match charging-location country).
# Naming: "<FictionalCorpRoot> <CountryCode> <NNN>" — corp root rotates across
# the four roots from branding.py.
# ---------------------------------------------------------------------------
_LE_CORP_ROOTS = [
    "Apex Industries",
    "Apex Mobility",
    "Apex Manufacturing",
    "Apex Logistics",
]

# How many legal entities to seed at each charging location. Hubs get extras
# per the plan: DE-Munich 4, DE-Stuttgart 3, FR-Lyon 2, UK-London 3,
# US-Detroit 3, IN-Pune 2, CN-Shanghai 2. Everything else gets 1, with a few
# locations getting 2 to push the total to ~120.
_LE_COUNT_OVERRIDES: dict[str, int] = {
    "cl-de-muc": 4, "cl-de-stg": 3, "cl-de-wol": 2, "cl-de-fra": 2,
    "cl-fr-lyo": 2, "cl-fr-par": 2,
    "cl-uk-lon": 3, "cl-uk-man": 2,
    "cl-it-mil": 2,
    "cl-es-mad": 2,
    "cl-nl-ams": 2,
    "cl-pl-poz": 2,
    "cl-hu-bud": 2,
    "cl-cz-prg": 2,
    "cl-us-det": 3, "cl-us-nyc": 2, "cl-us-chi": 2,
    "cl-in-pun": 2, "cl-in-ban": 2,
    "cl-cn-sha": 2, "cl-cn-bei": 2,
    "cl-jp-tok": 2,
    "cl-ca-tor": 2,
    "cl-au-syd": 2,
    "cl-sg-sin": 2,
}


def _build_legal_entities() -> list[dict]:
    out: list[dict] = []
    seq = 1  # 3-digit sequential suffix in code, e.g. "LE-DE-042".
    for cl in CHARGING_LOCATIONS:
        # Derive ISO from the charging-location code suffix (e.g. "DE-MUC" → "DE").
        iso = cl["code"].split("-")[1]
        country_id = cl["country_id"]
        n = _LE_COUNT_OVERRIDES.get(cl["id"], 1)
        for i in range(n):
            corp_root = _LE_CORP_ROOTS[(seq - 1) % len(_LE_CORP_ROOTS)]
            le_id = f"le-{iso.lower()}-{seq:03d}"
            le_code = f"LE-{iso}-{seq:03d}"
            out.append(
                {
                    "id": le_id,
                    "code": le_code,
                    "name": f"{corp_root} {iso} {seq:03d}",
                    "charging_location_id": cl["id"],
                    "country_id": country_id,
                }
            )
            seq += 1
    return out


LEGAL_ENTITIES: list[dict] = _build_legal_entities()
