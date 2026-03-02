"""
Generate financial seed data (baselines, forecasts, actuals, allocations) as SQL.
Run this script and append the output to seed.sql.
"""

import sys

lines = []

def emit(s=""):
    lines.append(s)


# =============================================================================
# CONFIGURATION
# =============================================================================

# 160 hrs/month = 1 FTE
FTE_HOURS = 160

# Rate table (role_type → EUR/hr for appdev CC)
RATES = {
    "role-sr-dev": 95, "role-dev": 75, "role-ba": 85, "role-pm": 90,
    "role-sa": 105, "role-test": 70, "role-cloud": 85, "role-sysadmin": 70,
}

# Projects with their active month ranges and budgets
# Months are inclusive. Format: YYYY-MM
PROJECTS = {
    "proj-erp2":      {"start": "2025-01", "end": "2026-09", "budget": 1200000, "rag": "red"},
    "proj-sensor":    {"start": "2025-06", "end": "2026-12", "budget": 600000,  "rag": "amber"},
    "proj-sap":       {"start": "2024-01", "end": "2026-06", "budget": 2000000, "rag": "green"},
    "proj-brake":     {"start": "2025-03", "end": "2026-03", "budget": 250000,  "rag": "green"},
    "proj-predmaint": {"start": "2025-09", "end": "2026-12", "budget": 500000,  "rag": "amber"},
    "proj-signal":    {"start": "2024-06", "end": "2026-03", "budget": 1500000, "rag": "green"},
    "proj-raildiag":  {"start": "2025-06", "end": "2027-06", "budget": 700000,  "rag": "green"},
    "proj-fleet":     {"start": "2025-01", "end": "2026-06", "budget": 450000,  "rag": "green"},
    "proj-telem":     {"start": "2025-09", "end": "2026-09", "budget": 300000,  "rag": "amber"},
    "proj-cloud":     {"start": "2025-06", "end": "2026-06", "budget": 400000,  "rag": "green"},
}

# Services with annual budgets
SERVICES = {
    "svc-sap-ops":   400000,
    "svc-netsec":    350000,
    "svc-euc":       200000,
    "svc-raildesk":  250000,
    "svc-railmaint": 300000,
    "svc-cvops":     150000,
    "svc-middleware": 280000,
    "svc-dba":       180000,
}


def month_range(start, end):
    """Generate list of YYYY-MM strings from start to end inclusive."""
    months = []
    y, m = int(start[:4]), int(start[5:7])
    ey, em = int(end[:4]), int(end[5:7])
    while (y, m) <= (ey, em):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def count_months(start, end):
    return len(month_range(start, end))


# =============================================================================
# BASELINES — what was originally planned
# =============================================================================

emit("-- =============================================================================")
emit("-- 14b. baselines (original planned budget per project per month)")
emit("-- =============================================================================")
emit("INSERT INTO baselines (project_id, month, category, sub_category, hours, amount_eur) VALUES")

baseline_rows = []
baseline_id = 0

# Define baseline line items per project
# Each project has internal (by role) and external (by cost type) line items
PROJECT_BASELINES = {
    "proj-erp2": {
        "internal": [
            ("role-sr-dev", 120), ("role-dev", 80), ("role-ba", 60),
            ("role-pm", 40), ("role-sa", 40), ("role-test", 40),
        ],
        "external": [
            ("ext-consulting", 15000), ("ext-cloud", 5000),
            ("ext-travel", 1500), ("ext-training", 8000),
        ],
    },
    "proj-sensor": {
        "internal": [
            ("role-sr-dev", 60), ("role-dev", 40), ("role-cloud", 40), ("role-test", 30),
        ],
        "external": [
            ("ext-consulting", 15000), ("ext-cloud", 8000),
        ],
    },
    "proj-sap": {
        "internal": [
            ("role-sr-dev", 100), ("role-dev", 120), ("role-ba", 40),
            ("role-pm", 60), ("role-sa", 40),
        ],
        "external": [
            ("ext-consulting", 20000), ("ext-cloud", 3000), ("ext-training", 2000),
        ],
    },
    "proj-brake": {
        "internal": [
            ("role-sr-dev", 40), ("role-dev", 60), ("role-test", 30),
        ],
        "external": [
            ("ext-maint-hw", 5000), ("ext-travel", 1000),
        ],
    },
    "proj-predmaint": {
        "internal": [
            ("role-sr-dev", 60), ("role-dev", 80), ("role-ba", 30), ("role-pm", 20),
        ],
        "external": [
            ("ext-consulting", 8000), ("ext-cloud", 5000), ("ext-subscriptions", 3000),
        ],
    },
    "proj-signal": {
        "internal": [
            ("role-sr-dev", 80), ("role-dev", 100), ("role-sa", 60), ("role-test", 40),
        ],
        "external": [
            ("ext-consulting", 10000), ("ext-maint-hw", 8000),
            ("ext-travel", 2000), ("ext-training", 1500),
        ],
    },
    "proj-raildiag": {
        "internal": [
            ("role-sr-dev", 40), ("role-dev", 60), ("role-ba", 20), ("role-test", 20),
        ],
        "external": [
            ("ext-cloud", 5000), ("ext-consulting", 4000),
        ],
    },
    "proj-fleet": {
        "internal": [
            ("role-sr-dev", 40), ("role-dev", 80), ("role-ba", 20), ("role-test", 20),
        ],
        "external": [
            ("ext-cloud", 4000), ("ext-consulting", 3000),
        ],
    },
    "proj-telem": {
        "internal": [
            ("role-dev", 60), ("role-ba", 20), ("role-test", 20),
        ],
        "external": [
            ("ext-cloud", 6000), ("ext-consulting", 5000), ("ext-subscriptions", 2000),
        ],
    },
    "proj-cloud": {
        "internal": [
            ("role-cloud", 80), ("role-sysadmin", 40), ("role-sa", 30),
        ],
        "external": [
            ("ext-cloud", 15000), ("ext-consulting", 5000),
        ],
    },
}

for proj_id, proj in PROJECTS.items():
    bl = PROJECT_BASELINES[proj_id]
    months = month_range(proj["start"], proj["end"])
    for mo in months:
        # Internal line items
        for role, hours in bl["internal"]:
            rate = RATES[role]
            amount = hours * rate
            baseline_rows.append(
                f"('{proj_id}', '{mo}', 'internal', '{role}', {hours}, {amount:.2f})"
            )
        # External line items
        for cost_type, amount in bl["external"]:
            baseline_rows.append(
                f"('{proj_id}', '{mo}', 'external', '{cost_type}', NULL, {amount:.2f})"
            )

# Services — baselines as monthly amounts (annual_budget / 12)
for svc_id, annual in SERVICES.items():
    monthly = annual / 12
    # Services run continuously, baseline for 2025-01 through 2026-12
    for mo in month_range("2025-01", "2026-12"):
        baseline_rows.append(
            f"('{svc_id}', '{mo}', 'internal', 'service-ops', NULL, {monthly:.2f})"
        )

emit(",\n".join(baseline_rows) + ";")
emit()


# =============================================================================
# FORECASTS — current expected spend (may differ from baseline)
# =============================================================================

emit("-- =============================================================================")
emit("-- 14c. forecasts (current expected spend — reflects approved CRs)")
emit("-- =============================================================================")
emit("INSERT INTO forecasts (project_id, month, category, sub_category, hours, amount_eur) VALUES")

forecast_rows = []

# Forecast adjustments from approved CRs
# proj-erp2: SR Dev increased from 120 to 135 hrs from 2025-07+, consulting 15K->18K from 2025-07+
# proj-sensor: stays mostly baseline (amber from timeline slip)
# proj-predmaint: developer hours forecast stays 80 but actuals lower
# Others: same as baseline (green RAG)

for proj_id, proj in PROJECTS.items():
    bl = PROJECT_BASELINES[proj_id]
    months = month_range(proj["start"], proj["end"])
    for mo in months:
        for role, base_hours in bl["internal"]:
            hours = base_hours
            rate = RATES[role]

            # proj-erp2 adjustments (approved CRs)
            if proj_id == "proj-erp2":
                if role == "role-sr-dev" and mo >= "2025-07":
                    hours = 135  # CR1: increased from 120
                if role == "role-sa" and mo >= "2025-08":
                    hours = 60   # CR4: extended SA by 20 hrs

            # proj-sensor: slight forecast uptick in dev hours from 2026-03
            if proj_id == "proj-sensor" and role == "role-dev" and mo >= "2026-03":
                hours = 50  # up from 40

            amount = hours * rate
            forecast_rows.append(
                f"('{proj_id}', '{mo}', 'internal', '{role}', {hours}, {amount:.2f})"
            )

        for cost_type, base_amount in bl["external"]:
            amount = base_amount

            # proj-erp2: consulting increased from 2025-07
            if proj_id == "proj-erp2" and cost_type == "ext-consulting" and mo >= "2025-07":
                amount = 18000  # CR2: increased from 15K

            # proj-sensor: consulting higher from 2026-02 (system suggestion impact)
            if proj_id == "proj-sensor" and cost_type == "ext-consulting" and mo >= "2026-02":
                amount = 18000

            # proj-telem: slight timeline slip adds 1 month cost
            if proj_id == "proj-telem" and cost_type == "ext-cloud" and mo >= "2026-07":
                amount = 7000  # slightly higher cloud costs in extended period

            forecast_rows.append(
                f"('{proj_id}', '{mo}', 'external', '{cost_type}', NULL, {amount:.2f})"
            )

# Services — forecasts same as baseline
for svc_id, annual in SERVICES.items():
    monthly = annual / 12
    for mo in month_range("2025-01", "2026-12"):
        forecast_rows.append(
            f"('{svc_id}', '{mo}', 'internal', 'service-ops', NULL, {monthly:.2f})"
        )

emit(",\n".join(forecast_rows) + ";")
emit()


# =============================================================================
# ACTUALS — real spend through Jan 2026 only
# =============================================================================

emit("-- =============================================================================")
emit("-- 14d. actuals (real spend through Jan 2026 only)")
emit("-- =============================================================================")
emit("INSERT INTO actuals (project_id, month, category, sub_category, hours, amount_eur) VALUES")

actuals_rows = []
import random
random.seed(42)  # deterministic

# Actuals through 2026-01 only
ACTUALS_END = "2026-01"

for proj_id, proj in PROJECTS.items():
    bl = PROJECT_BASELINES[proj_id]
    months = month_range(proj["start"], min(proj["end"], ACTUALS_END))

    for mo in months:
        for role, base_hours in bl["internal"]:
            # Get forecast hours (with adjustments)
            hours = base_hours
            rate = RATES[role]

            if proj_id == "proj-erp2":
                if role == "role-sr-dev" and mo >= "2025-07":
                    hours = 135
                if role == "role-sa" and mo >= "2025-08":
                    hours = 60

            # Actuals diverge from forecast
            # For RED projects (erp2): actuals > forecast (overrun)
            # For AMBER projects: actuals slightly > forecast
            # For GREEN projects: actuals ≈ forecast (within 5%)
            if proj_id == "proj-erp2":
                # ERP overruns: Sr Dev hours creep up, others slightly over
                if role == "role-sr-dev":
                    variance = random.uniform(1.05, 1.15)  # 5-15% over
                else:
                    variance = random.uniform(0.97, 1.08)
            elif proj["rag"] == "amber":
                variance = random.uniform(0.98, 1.10)  # slight overruns
            else:
                variance = random.uniform(0.95, 1.05)  # within budget

            actual_hours = round(hours * variance)
            actual_amount = actual_hours * rate
            actuals_rows.append(
                f"('{proj_id}', '{mo}', 'internal', '{role}', {actual_hours}, {actual_amount:.2f})"
            )

        for cost_type, base_amount in bl["external"]:
            amount = base_amount
            if proj_id == "proj-erp2" and cost_type == "ext-consulting" and mo >= "2025-07":
                amount = 18000
            if proj_id == "proj-sensor" and cost_type == "ext-consulting":
                # Sensor consulting actuals running significantly over
                amount_variance = random.uniform(1.30, 1.50) if mo >= "2025-10" else random.uniform(0.95, 1.10)
                amount = round(base_amount * amount_variance, 2)
            elif proj_id == "proj-erp2":
                amount = round(amount * random.uniform(1.02, 1.12), 2)
            elif proj["rag"] == "amber":
                amount = round(amount * random.uniform(0.98, 1.08), 2)
            else:
                amount = round(amount * random.uniform(0.95, 1.05), 2)

            actuals_rows.append(
                f"('{proj_id}', '{mo}', 'external', '{cost_type}', NULL, {amount:.2f})"
            )

# Services actuals — very close to budget (green RAG)
for svc_id, annual in SERVICES.items():
    monthly = annual / 12
    for mo in month_range("2025-01", ACTUALS_END):
        actual = round(monthly * random.uniform(0.97, 1.03), 2)
        actuals_rows.append(
            f"('{svc_id}', '{mo}', 'internal', 'service-ops', NULL, {actual:.2f})"
        )

emit(",\n".join(actuals_rows) + ";")
emit()


# =============================================================================
# ALLOCATIONS — person × project × month hours
# =============================================================================

emit("-- =============================================================================")
emit("-- 14e. allocations (person × project × month)")
emit("-- =============================================================================")
emit("INSERT INTO allocations (person_id, project_id, month, hours, is_confirmed) VALUES")

alloc_rows = []

# Define person-to-project assignments
# (person_id, project_id, hours_per_month, start_month, end_month, special_overrides)
ASSIGNMENTS = [
    # --- cc-muc-appdev ---
    # p-brenner (PM): svc-middleware management
    ("p-brenner", "svc-middleware", 100, "2025-01", "2026-12", {}),
    ("p-brenner", "proj-erp2", 40, "2025-01", "2026-09", {}),

    # p-fischer (Sr Dev): ERP + SAP — KEY PERSON for over-allocation demo
    # Normal: erp2=84, sap=60 → 144 hrs (90%)
    # Mar-May 2026: erp2=108 → 168 hrs (105%)
    ("p-fischer", "proj-erp2", 84, "2025-01", "2026-09",
     {"2026-03": 108, "2026-04": 108, "2026-05": 108}),
    ("p-fischer", "proj-sap", 60, "2025-01", "2026-06", {}),

    # p-wolf (Dev): brake until 2026-03, then sensor + euc (underutilized ~60%)
    ("p-wolf", "proj-brake", 80, "2025-03", "2026-03", {}),
    ("p-wolf", "svc-euc", 36, "2025-01", "2026-12", {}),
    ("p-wolf", "proj-sensor", 40, "2026-04", "2026-12", {}),

    # p-bauer (SA): ERP primary SA
    ("p-bauer", "proj-erp2", 100, "2025-01", "2026-09", {}),
    ("p-bauer", "svc-middleware", 40, "2025-01", "2026-12", {}),

    # p-schmidt (Dev): ERP developer
    ("p-schmidt", "proj-erp2", 80, "2025-01", "2026-09", {}),
    ("p-schmidt", "proj-sensor", 40, "2025-06", "2026-12", {}),

    # p-mueller (BA): ERP + sensor
    ("p-mueller", "proj-erp2", 60, "2025-01", "2026-09", {}),
    ("p-mueller", "proj-sensor", 40, "2025-06", "2026-12", {}),
    ("p-mueller", "svc-euc", 24, "2025-01", "2026-12", {}),

    # p-keller (Sr Dev): sensor primary + predmaint
    ("p-keller", "proj-sensor", 60, "2025-06", "2026-12", {}),
    ("p-keller", "proj-predmaint", 60, "2025-09", "2026-12", {}),

    # p-hoffmann (Test): ERP + sensor test
    ("p-hoffmann", "proj-erp2", 60, "2025-01", "2026-09", {}),
    ("p-hoffmann", "proj-sensor", 40, "2025-06", "2026-12", {}),
    ("p-hoffmann", "svc-euc", 20, "2025-01", "2026-12", {}),

    # --- cc-muc-infra ---
    # p-wagner (SA): cloud migration SA
    ("p-wagner", "proj-cloud", 80, "2025-06", "2026-06", {}),
    ("p-wagner", "svc-netsec", 60, "2025-01", "2026-12", {}),

    # p-braun (Cloud): cloud migration primary
    ("p-braun", "proj-cloud", 100, "2025-06", "2026-06", {}),
    ("p-braun", "svc-netsec", 40, "2025-01", "2026-12", {}),

    # p-richter (SysAdmin): netsec + euc
    ("p-richter", "svc-netsec", 80, "2025-01", "2026-12", {}),
    ("p-richter", "svc-euc", 40, "2025-01", "2026-12", {}),

    # p-lange (Cloud): cloud + middleware
    ("p-lange", "proj-cloud", 60, "2025-06", "2026-06", {}),
    ("p-lange", "svc-middleware", 60, "2025-01", "2026-12", {}),

    # p-frank (SysAdmin): netsec + euc
    ("p-frank", "svc-netsec", 60, "2025-01", "2026-12", {}),
    ("p-frank", "svc-euc", 50, "2025-01", "2026-12", {}),

    # --- cc-bud-appdev ---
    # p-kovacs (Sr Dev): brake primary + signal
    ("p-kovacs", "proj-brake", 60, "2025-03", "2026-03", {}),
    ("p-kovacs", "proj-signal", 60, "2024-06", "2026-03", {}),

    # p-nagy (Dev): raildiag primary
    ("p-nagy", "proj-raildiag", 80, "2025-06", "2027-06", {}),
    ("p-nagy", "proj-signal", 40, "2024-06", "2026-03", {}),

    # p-szabo (Dev): signal + raildiag
    ("p-szabo", "proj-signal", 80, "2024-06", "2026-03", {}),
    ("p-szabo", "proj-raildiag", 40, "2025-06", "2027-06", {}),

    # p-varga (Test): signal + raildiag test
    ("p-varga", "proj-signal", 40, "2024-06", "2026-03", {}),
    ("p-varga", "proj-raildiag", 40, "2025-06", "2027-06", {}),
    ("p-varga", "svc-railmaint", 40, "2025-01", "2026-12", {}),

    # p-toth (Sr Dev): signal lead + raildiag
    ("p-toth", "proj-signal", 80, "2024-06", "2026-03", {}),
    ("p-toth", "proj-raildiag", 40, "2025-06", "2027-06", {}),

    # p-horvath (Dev): fleet primary + telem
    ("p-horvath", "proj-fleet", 80, "2025-01", "2026-06", {}),
    ("p-horvath", "proj-telem", 40, "2025-09", "2026-09", {}),

    # --- cc-bud-bizsol ---
    # p-kiss (BA): sap + raildesk + dba
    ("p-kiss", "proj-sap", 40, "2024-01", "2026-06", {}),
    ("p-kiss", "svc-raildesk", 50, "2025-01", "2026-12", {}),
    ("p-kiss", "svc-dba", 30, "2025-01", "2026-12", {}),

    # p-molnar (PM): sap lead
    ("p-molnar", "proj-sap", 100, "2024-01", "2026-06", {}),
    ("p-molnar", "svc-railmaint", 40, "2025-01", "2026-12", {}),

    # p-farkas (BA): sap + fleet BA
    ("p-farkas", "proj-sap", 60, "2024-01", "2026-06", {}),
    ("p-farkas", "proj-fleet", 40, "2025-01", "2026-06", {}),
    ("p-farkas", "svc-raildesk", 20, "2025-01", "2026-12", {}),

    # p-balogh (Dev): telem lead + fleet
    ("p-balogh", "proj-telem", 80, "2025-09", "2026-09", {}),
    ("p-balogh", "proj-fleet", 40, "2025-01", "2026-06", {}),

    # --- cc-pun-appdev ---
    # p-patel (Sr Dev): erp2 + predmaint
    ("p-patel", "proj-erp2", 80, "2025-01", "2026-09", {}),
    ("p-patel", "proj-predmaint", 40, "2025-09", "2026-12", {}),

    # p-kumar (Dev): predmaint primary + sensor
    ("p-kumar", "proj-predmaint", 80, "2025-09", "2026-12", {}),
    ("p-kumar", "proj-sensor", 40, "2025-06", "2026-12", {}),

    # p-gupta (Test): erp2 + predmaint test
    ("p-gupta", "proj-erp2", 60, "2025-01", "2026-09", {}),
    ("p-gupta", "proj-predmaint", 40, "2025-09", "2026-12", {}),
    ("p-gupta", "svc-cvops", 20, "2025-01", "2026-12", {}),

    # --- cc-pun-infra ---
    # p-singh (SysAdmin): netsec + cvops
    ("p-singh", "svc-netsec", 60, "2025-01", "2026-12", {}),
    ("p-singh", "svc-cvops", 60, "2025-01", "2026-12", {}),

    # p-reddy (Cloud): cloud migration + cvops
    ("p-reddy", "proj-cloud", 60, "2025-06", "2026-06", {}),
    ("p-reddy", "svc-cvops", 50, "2025-01", "2026-12", {}),

    # p-joshi (SysAdmin): sap-ops + dba
    ("p-joshi", "svc-sap-ops", 80, "2025-01", "2026-12", {}),
    ("p-joshi", "svc-dba", 40, "2025-01", "2026-12", {}),
]

for person_id, project_id, base_hours, start, end, overrides in ASSIGNMENTS:
    months = month_range(start, end)
    for mo in months:
        hours = overrides.get(mo, base_hours)
        # is_confirmed: 1 for historical (<=2026-01), 1 for most future,
        # 0 for p-fischer's erp2 in 2026-03 to 2026-06 (pending confirmation)
        is_confirmed = 1
        if person_id == "p-fischer" and project_id == "proj-erp2" and "2026-03" <= mo <= "2026-06":
            is_confirmed = 0

        alloc_rows.append(
            f"('{person_id}', '{project_id}', '{mo}', {hours}, {is_confirmed})"
        )

emit(",\n".join(alloc_rows) + ";")
emit()

# Write output
output = "\n".join(lines)
print(output)
