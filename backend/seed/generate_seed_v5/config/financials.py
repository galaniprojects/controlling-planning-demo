"""Financials, staffing, externals, forecast adjustments, allocation overrides
and Tech Navigator subscores per project / chargeable entity.

Owned by Phase 2 T2 (financials & lifecycle). Read-only consumed by
``s11_tech_navigator``, ``s13_financials``, ``s14_allocations``,
``s15_change_requests``.

All entity ids reference the FROZEN roster in ``config/entities.py``.
Workforce locations / role types / hourly rates come from ``config/master.py``.

Decision tags:
- [A-PRI-01]: composite ranking score = w_value*VC + w_complexity*Complexity
- [A-TN-01..09]: Tech Navigator profile (3 Complexity + 3 VC + 2 reserved)
- [C-FG-07]: monthly inner zone + quarterly outer zone (provisional flag)
- [F-DM-01]: polymorphic ChargeableEntity (Project / Offering / InternalService)
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Internal Staffing Profiles per ChargeableEntity.
#
# Each entry: {"role": role_type_id, "loc": workforce_location_id,
#              "hours": monthly hours, "co": "capex"|"opex"}.
#
# Hours represent monthly per-line hours (not per-FTE); allocations are
# distributed across people of the matching role+location in s14_allocations.
#
# Rules:
#   - Run-stage projects + Offerings + Internal Services use "opex" exclusively.
#   - Change-stage projects use "capex" by default; some Cluster D-style
#     services in that group can mix.
#   - Role/location combinations must produce a non-None rate via
#     ``master.get_rate`` (e.g. role-sap is unavailable at BUD).
# ---------------------------------------------------------------------------
PROJECT_STAFFING: dict[str, list[dict]] = {
    # --- Change-stage Projects (DoI 0–3) ---
    "proj-mdh-rollout": [
        {"role": "role-sr-arch", "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 80,  "co": "capex"},
        {"role": "role-data-eng","loc": "loc-muc", "hours": 60,  "co": "capex"},
        {"role": "role-data-eng","loc": "loc-bud", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 80,  "co": "capex"},
        {"role": "role-ba",      "loc": "loc-muc", "hours": 30,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 30,  "co": "capex"},
    ],
    "proj-erp2": [
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 80,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-pun", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-muc", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 40,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-sap",     "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-ba",      "loc": "loc-muc", "hours": 30,  "co": "capex"},
    ],
    "proj-sensor": [
        {"role": "role-data-eng","loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 40,  "co": "capex"},
        {"role": "role-cloud",   "loc": "loc-bud", "hours": 30,  "co": "capex"},
    ],
    "proj-predmaint": [
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 60,  "co": "capex"},
        {"role": "role-data-eng","loc": "loc-muc", "hours": 30,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-pun", "hours": 20,  "co": "capex"},
    ],
    "proj-autobrake": [
        {"role": "role-sr-arch", "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 80,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 120, "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 80,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-ba",      "loc": "loc-muc", "hours": 20,  "co": "capex"},
    ],
    "proj-railsafety": [
        {"role": "role-sr-arch", "loc": "loc-muc", "hours": 30,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-bud", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 80,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 30,  "co": "capex"},
    ],
    "proj-dwh": [
        {"role": "role-data-eng","loc": "loc-muc", "hours": 60,  "co": "capex"},
        {"role": "role-data-eng","loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-data-sci","loc": "loc-muc", "hours": 30,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 40,  "co": "capex"},
    ],
    "proj-greenedge": [
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 20,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 30,  "co": "capex"},
    ],
    "proj-connveh": [
        {"role": "role-sr-arch", "loc": "loc-muc", "hours": 40,  "co": "capex"},
        {"role": "role-sr-dev",  "loc": "loc-muc", "hours": 60,  "co": "capex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 100, "co": "capex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 80,  "co": "capex"},
        {"role": "role-qa",      "loc": "loc-bud", "hours": 40,  "co": "capex"},
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 30,  "co": "capex"},
    ],

    # --- Run-stage Projects (DoI 5) ---
    "proj-cloud3-run": [
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-cloud",   "loc": "loc-pun", "hours": 30,  "co": "opex"},
        {"role": "role-sysadmin","loc": "loc-muc", "hours": 30,  "co": "opex"},
    ],
    "proj-iam-run": [
        {"role": "role-network", "loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 30,  "co": "opex"},
        {"role": "role-sysadmin","loc": "loc-bud", "hours": 30,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-muc", "hours": 30,  "co": "opex"},
    ],

    # --- Offerings (Run / steady-state customer products) ---
    "off-mdh": [
        {"role": "role-data-eng","loc": "loc-muc", "hours": 60,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-cloud",   "loc": "loc-muc", "hours": 30,  "co": "opex"},
    ],
    "off-eunify": [
        {"role": "role-sysadmin","loc": "loc-muc", "hours": 50,  "co": "opex"},
        {"role": "role-jr-dev",  "loc": "loc-muc", "hours": 40,  "co": "opex"},
    ],
    "off-bizinsights": [
        {"role": "role-data-eng","loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-data-sci","loc": "loc-bud", "hours": 30,  "co": "opex"},
    ],
    "off-ecollab": [
        {"role": "role-sysadmin","loc": "loc-muc", "hours": 40,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-bud", "hours": 30,  "co": "opex"},
    ],
    "off-fielddx": [
        {"role": "role-dev",     "loc": "loc-muc", "hours": 30,  "co": "opex"},
        {"role": "role-qa",      "loc": "loc-pun", "hours": 20,  "co": "opex"},
    ],
    "off-supplyvis": [
        {"role": "role-data-eng","loc": "loc-muc", "hours": 30,  "co": "opex"},
        {"role": "role-dev",     "loc": "loc-pun", "hours": 30,  "co": "opex"},
    ],

    # --- Internal Services ---
    "svc-ident-auth":       [{"role": "role-network", "loc": "loc-muc", "hours": 40, "co": "opex"},
                             {"role": "role-sysadmin","loc": "loc-bud", "hours": 30, "co": "opex"}],
    "svc-infra-platform":   [{"role": "role-cloud",   "loc": "loc-muc", "hours": 60, "co": "opex"},
                             {"role": "role-sysadmin","loc": "loc-muc", "hours": 40, "co": "opex"},
                             {"role": "role-cloud",   "loc": "loc-pun", "hours": 40, "co": "opex"}],
    "svc-data-stewardship": [{"role": "role-data-eng","loc": "loc-muc", "hours": 30, "co": "opex"},
                             {"role": "role-ba",      "loc": "loc-muc", "hours": 20, "co": "opex"}],
    "svc-sap-basis":        [{"role": "role-sap",     "loc": "loc-muc", "hours": 40, "co": "opex"},
                             {"role": "role-sysadmin","loc": "loc-pun", "hours": 30, "co": "opex"}],
    "svc-euc-support":      [{"role": "role-sysadmin","loc": "loc-muc", "hours": 40, "co": "opex"},
                             {"role": "role-jr-dev",  "loc": "loc-muc", "hours": 30, "co": "opex"}],
    "svc-net-sec":          [{"role": "role-network", "loc": "loc-muc", "hours": 40, "co": "opex"},
                             {"role": "role-cloud",   "loc": "loc-muc", "hours": 30, "co": "opex"}],
    "svc-middleware":       [{"role": "role-sysadmin","loc": "loc-muc", "hours": 40, "co": "opex"},
                             {"role": "role-dev",     "loc": "loc-bud", "hours": 30, "co": "opex"}],
    "svc-dba":              [{"role": "role-sysadmin","loc": "loc-pun", "hours": 40, "co": "opex"},
                             {"role": "role-dev",     "loc": "loc-pun", "hours": 30, "co": "opex"}],
    "svc-rail-desk":        [{"role": "role-sysadmin","loc": "loc-bud", "hours": 50, "co": "opex"},
                             {"role": "role-dev",     "loc": "loc-bud", "hours": 30, "co": "opex"}],
    "svc-rail-maint":       [{"role": "role-dev",     "loc": "loc-bud", "hours": 50, "co": "opex"},
                             {"role": "role-qa",      "loc": "loc-bud", "hours": 30, "co": "opex"}],
    "svc-signal-sup":       [{"role": "role-sysadmin","loc": "loc-bud", "hours": 30, "co": "opex"},
                             {"role": "role-network", "loc": "loc-bud", "hours": 20, "co": "opex"}],
    "svc-tbs-maint":        [{"role": "role-dev",     "loc": "loc-muc", "hours": 50, "co": "opex"},
                             {"role": "role-dev",     "loc": "loc-pun", "hours": 30, "co": "opex"}],
    "svc-data-platform":    [{"role": "role-data-eng","loc": "loc-muc", "hours": 40, "co": "opex"},
                             {"role": "role-sysadmin","loc": "loc-bud", "hours": 30, "co": "opex"}],
    "svc-iot-infra":        [{"role": "role-cloud",   "loc": "loc-bud", "hours": 30, "co": "opex"},
                             {"role": "role-sysadmin","loc": "loc-pun", "hours": 30, "co": "opex"}],
    "svc-monitoring":       [{"role": "role-sysadmin","loc": "loc-muc", "hours": 30, "co": "opex"},
                             {"role": "role-dev",     "loc": "loc-muc", "hours": 20, "co": "opex"}],
    "svc-itsm":             [{"role": "role-sysadmin","loc": "loc-muc", "hours": 30, "co": "opex"},
                             {"role": "role-jr-dev",  "loc": "loc-pun", "hours": 30, "co": "opex"}],
    "svc-devsec-tools":     [{"role": "role-cloud",   "loc": "loc-muc", "hours": 30, "co": "opex"},
                             {"role": "role-dev",     "loc": "loc-muc", "hours": 20, "co": "opex"}],
}


# ---------------------------------------------------------------------------
# External Cost Line Items per ChargeableEntity.
#
# Each entry: {"desc", "cat" (external_cost_type id), "vendor",
#              "co": "capex"|"opex", "base": monthly EUR}.
#
# Five entities carry detailed line lists (Master Data Hub flagship + the
# narrative-bearing projects); the rest carry 1-2 minimal lines so the
# Workbench grids look plausible.
# ---------------------------------------------------------------------------
PROJECT_EXTERNALS: dict[str, list[dict]] = {
    # Detailed lines on demo-narrative entities -----------------------------
    # v5.1 C-07: optional `role` key links external cost line items into the
    # role_types catalogue. Used for the F&P grid `[Category] — [Role Name]`
    # label, the External Costs tab Role column/filter, and the Capacity
    # External badge. Available role IDs come from seed.sql role_types insert
    # (Senior Solution Architect, Senior Developer, Developer, Junior
    # Developer, QA, Cloud, SysAdmin, Network, SAP, BA, Data Engineer, Data
    # Scientist). For consulting / advisory items we approximate
    # "Senior Consultant" as `role-sr-arch` (Senior Solution Architect, the
    # closest senior advisory role) and "Data Architect" as the same.
    "proj-mdh-rollout": [
        {"desc": "MDH Implementation Consulting",     "cat": "ext-consulting",   "vendor": "Accenture",        "co": "capex", "base": 12000, "role": "role-sr-arch"},
        {"desc": "Data Modelling Advisory",           "cat": "ext-consulting",   "vendor": "Thoughtworks",     "co": "capex", "base": 6000,  "role": "role-data-eng"},
        {"desc": "Snowflake Enterprise",              "cat": "ext-cloud",        "vendor": "Snowflake",        "co": "capex", "base": 5000},
        {"desc": "Master Data Governance Toolkit",    "cat": "ext-sw-licenses",  "vendor": "Informatica",      "co": "capex", "base": 4000},
        {"desc": "Cross-location Workshops",          "cat": "ext-travel",       "vendor": None,               "co": "opex",  "base": 1500},
    ],
    "proj-erp2": [
        {"desc": "SAP Implementation Support",        "cat": "ext-consulting",   "vendor": "Deloitte",         "co": "capex", "base": 15000, "role": "role-sr-arch"},
        {"desc": "Process Advisory",                  "cat": "ext-consulting",   "vendor": "MHP Consulting",   "co": "capex", "base": 5000},
        {"desc": "Application Developers (3 FTE)",    "cat": "ext-leased-staff", "vendor": "TCS",              "co": "capex", "base": 12000},
        {"desc": "Azure DevOps Licenses",             "cat": "ext-sw-licenses",  "vendor": "Microsoft",        "co": "opex",  "base": 2000},
        {"desc": "SAP S/4HANA Certification",         "cat": "ext-training",     "vendor": "SAP Education",    "co": "opex",  "base": 3000},
        {"desc": "Munich-Budapest Team Visits",       "cat": "ext-travel",       "vendor": None,               "co": "opex",  "base": 1500},
        {"desc": "Penetration Testing",               "cat": "ext-other",        "vendor": "SecureWorks",      "co": "opex",  "base": 2000},
    ],
    "proj-sensor": [
        {"desc": "Data Engineering Consulting",       "cat": "ext-consulting",   "vendor": "Thoughtworks",     "co": "capex", "base": 10000, "role": "role-data-eng"},
        {"desc": "AWS Kinesis + S3 Pipeline",         "cat": "ext-cloud",        "vendor": "AWS",              "co": "capex", "base": 6000},
        {"desc": "Kafka License",                     "cat": "ext-sw-licenses",  "vendor": "Confluent",        "co": "capex", "base": 3000},
        {"desc": "IoT Sensor Calibration",            "cat": "ext-other",        "vendor": "Bosch Sensortec",  "co": "capex", "base": 2000},
    ],
    "proj-iam-run": [
        {"desc": "ServiceNow ITSM Licenses",          "cat": "ext-sw-licenses",  "vendor": "ServiceNow",       "co": "opex",  "base": 5600},
        {"desc": "Security Operations Retainer",      "cat": "ext-consulting",   "vendor": "PwC",              "co": "opex",  "base": 4000},
        {"desc": "Cisco Network Equipment Support",   "cat": "ext-hw-maint",     "vendor": "Cisco",            "co": "opex",  "base": 2000},
        {"desc": "Cybersecurity Awareness Training",  "cat": "ext-training",     "vendor": "Internal",         "co": "opex",  "base": 1500},
    ],
    "off-mdh": [
        {"desc": "MDH Cloud Hosting (Snowflake)",     "cat": "ext-cloud",        "vendor": "Snowflake",        "co": "opex",  "base": 8000},
        {"desc": "Data Quality Platform",             "cat": "ext-sw-licenses",  "vendor": "Informatica",      "co": "opex",  "base": 4500},
        {"desc": "Data Stewardship Retainer",         "cat": "ext-consulting",   "vendor": "Capgemini",        "co": "opex",  "base": 3000},
    ],

    # Other Change-stage Projects -------------------------------------------
    "proj-predmaint": [
        {"desc": "ML Platform License",               "cat": "ext-sw-licenses",  "vendor": "Databricks",       "co": "capex", "base": 4000},
        {"desc": "Predictive Analytics Consulting",   "cat": "ext-consulting",   "vendor": "McKinsey Digital", "co": "capex", "base": 6000, "role": "role-data-sci"},
        {"desc": "Sensor Data Cloud Storage",         "cat": "ext-cloud",        "vendor": "AWS",              "co": "capex", "base": 3000},
    ],
    "proj-autobrake": [
        {"desc": "ADAS Consulting",                   "cat": "ext-consulting",   "vendor": "Continental Engineering", "co": "capex", "base": 8000},
        {"desc": "Simulation Platform License",       "cat": "ext-sw-licenses",  "vendor": "dSPACE",           "co": "capex", "base": 5000},
        {"desc": "GPU Cloud Compute",                 "cat": "ext-cloud",        "vendor": "AWS",              "co": "capex", "base": 6000},
        {"desc": "Safety Certification",              "cat": "ext-other",        "vendor": "TUV Rheinland",    "co": "capex", "base": 3000},
    ],
    "proj-railsafety": [
        {"desc": "Safety Standards Consulting",       "cat": "ext-consulting",   "vendor": "Ricardo Rail",     "co": "capex", "base": 6000},
        {"desc": "Compliance Software License",       "cat": "ext-sw-licenses",  "vendor": "Siemens",          "co": "capex", "base": 4000},
    ],
    "proj-dwh": [
        {"desc": "Snowflake Enterprise",              "cat": "ext-cloud",        "vendor": "Snowflake",        "co": "capex", "base": 8000},
        {"desc": "ETL Consulting",                    "cat": "ext-consulting",   "vendor": "Informatica",      "co": "capex", "base": 5000},
    ],
    "proj-greenedge": [
        {"desc": "Edge Compute Hardware Refresh",     "cat": "ext-hw-maint",     "vendor": "Dell",             "co": "capex", "base": 1500},
    ],
    "proj-connveh": [
        {"desc": "Connected Platform Consulting",     "cat": "ext-consulting",   "vendor": "Bosch Engineering","co": "capex", "base": 10000},
        {"desc": "Azure IoT Hub",                     "cat": "ext-cloud",        "vendor": "Microsoft",        "co": "capex", "base": 8000},
    ],
    "proj-cloud3-run": [
        {"desc": "AWS EC2 Reserved Instances",        "cat": "ext-cloud",        "vendor": "AWS",              "co": "opex",  "base": 8000},
        {"desc": "AWS S3 Storage",                    "cat": "ext-cloud",        "vendor": "AWS",              "co": "opex",  "base": 3000},
    ],

    # Offerings -------------------------------------------------------------
    "off-eunify":      [{"desc": "Microsoft 365 Licenses",  "cat": "ext-sw-licenses", "vendor": "Microsoft", "co": "opex", "base": 5000}],
    "off-bizinsights": [{"desc": "Tableau Cloud",           "cat": "ext-sw-licenses", "vendor": "Salesforce","co": "opex", "base": 3500},
                        {"desc": "Cloud Hosting",           "cat": "ext-cloud",       "vendor": "AWS",       "co": "opex", "base": 2500}],
    "off-ecollab":     [{"desc": "Collaboration Suite",     "cat": "ext-sw-licenses", "vendor": "Atlassian", "co": "opex", "base": 3000}],
    "off-fielddx":     [{"desc": "Diagnostics Toolkit",     "cat": "ext-sw-licenses", "vendor": "PTC",       "co": "opex", "base": 2000}],
    "off-supplyvis":   [{"desc": "Supply Chain Telemetry",  "cat": "ext-cloud",       "vendor": "Azure",     "co": "opex", "base": 2500}],

    # Internal Services -----------------------------------------------------
    "svc-ident-auth":       [{"desc": "IAM Platform Licenses",     "cat": "ext-sw-licenses", "vendor": "Okta",        "co": "opex", "base": 3000}],
    "svc-infra-platform":   [{"desc": "Cloud Platform Reserve",    "cat": "ext-cloud",       "vendor": "AWS",         "co": "opex", "base": 12000},
                             {"desc": "Datacenter Hosting",        "cat": "ext-infra-onprem","vendor": "Equinix",     "co": "opex", "base": 4000}],
    "svc-data-stewardship": [{"desc": "Data Quality Tooling",      "cat": "ext-sw-licenses", "vendor": "Talend",      "co": "opex", "base": 2000}],
    "svc-sap-basis":        [{"desc": "SAP Basis Support",         "cat": "ext-sw-maint",    "vendor": "SAP",         "co": "opex", "base": 5000}],
    "svc-euc-support":      [{"desc": "Helpdesk Software License", "cat": "ext-sw-licenses", "vendor": "ServiceNow",  "co": "opex", "base": 2500}],
    "svc-net-sec":          [{"desc": "Firewall Licenses",         "cat": "ext-sw-licenses", "vendor": "Palo Alto",   "co": "opex", "base": 4000},
                             {"desc": "SIEM Platform",             "cat": "ext-sw-licenses", "vendor": "Splunk",      "co": "opex", "base": 3500}],
    "svc-middleware":       [{"desc": "Middleware Licenses",       "cat": "ext-sw-licenses", "vendor": "IBM",         "co": "opex", "base": 3500}],
    "svc-dba":              [{"desc": "Database Licenses",         "cat": "ext-sw-licenses", "vendor": "Oracle",      "co": "opex", "base": 3000}],
    "svc-rail-desk":        [{"desc": "ITSM Platform License",     "cat": "ext-sw-licenses", "vendor": "ServiceNow",  "co": "opex", "base": 2500}],
    "svc-rail-maint":       [{"desc": "Application Monitoring",    "cat": "ext-sw-licenses", "vendor": "Dynatrace",   "co": "opex", "base": 2000}],
    "svc-signal-sup":       [{"desc": "Signaling Equipment Support","cat": "ext-hw-maint",   "vendor": "Siemens",     "co": "opex", "base": 2500}],
    "svc-tbs-maint":        [{"desc": "Application Monitoring",    "cat": "ext-sw-licenses", "vendor": "Datadog",     "co": "opex", "base": 2000}],
    "svc-data-platform":    [{"desc": "Cloud Hosting",             "cat": "ext-cloud",       "vendor": "AWS",         "co": "opex", "base": 3500}],
    "svc-iot-infra":        [{"desc": "IoT Hub Hosting",           "cat": "ext-cloud",       "vendor": "Azure",       "co": "opex", "base": 2500}],
    "svc-monitoring":       [{"desc": "Observability Platform",    "cat": "ext-sw-licenses", "vendor": "Datadog",     "co": "opex", "base": 2500}],
    "svc-itsm":             [{"desc": "ITSM SaaS",                 "cat": "ext-sw-licenses", "vendor": "ServiceNow",  "co": "opex", "base": 2000}],
    "svc-devsec-tools":     [{"desc": "DevSecOps Toolchain",       "cat": "ext-sw-licenses", "vendor": "GitLab",      "co": "opex", "base": 2000}],
}


# ---------------------------------------------------------------------------
# Forecast adjustments — drives RAG narratives.
#
# proj-erp2 (red, troubled): Sr Dev MUC up 80→100 from 2025-07; Deloitte
# consulting up 15K→22K from 2025-07; TCS leased staff 12K→15K from 2025-10.
#
# proj-sensor (amber, scope-change): Dev PUN up 40→50 from 2026-03; consulting
# 10K→14K and AWS 6K→9K from 2026-01.
# ---------------------------------------------------------------------------
FORECAST_ADJUSTMENTS: dict[str, dict] = {
    "proj-erp2": {
        "internal": [
            {"role": "role-sr-dev", "loc": "loc-muc", "from": "2025-07", "hours": 100},
        ],
        "external": [
            {"desc": "SAP Implementation Support",     "from": "2025-07", "amount": 22000},
            {"desc": "Application Developers (3 FTE)", "from": "2025-10", "amount": 15000},
        ],
    },
    "proj-sensor": {
        "internal": [
            {"role": "role-dev", "loc": "loc-pun", "from": "2026-03", "hours": 50},
        ],
        "external": [
            {"desc": "Data Engineering Consulting",  "from": "2026-01", "amount": 14000},
            {"desc": "AWS Kinesis + S3 Pipeline",    "from": "2026-01", "amount": 9000},
        ],
    },
}


# ---------------------------------------------------------------------------
# Allocation overrides — narrative-specific exceptions to the auto-generated
# allocations from PROJECT_STAFFING. Drives the over-allocation surfaces in
# the Capacity heatmap.
#
# Keys are tuples of (person_id, chargeable_entity_id).
# ---------------------------------------------------------------------------
ASSIGNMENT_OVERRIDES: dict[tuple[str, str], dict] = {
    # p-fischer over-allocation on proj-erp2 (troubled red project narrative).
    # v5.2 W1 [C]: bumped 2026-04..06 from 110h to 165h (115% utilisation at
    # MUC's 143h/month standard) so the over-allocation filter chip, hotspot
    # list, and red-border summary bar have clear demo signal in the rolling
    # next-12-months window from the 2026-04 demo date.
    ("p-fischer", "proj-erp2"): {
        "base_hours": 80,
        "overrides": {
            "2026-03": 110,
            "2026-04": 165,
            "2026-05": 165,
            "2026-06": 165,
        },
        "unconfirmed_range": ("2026-04", "2026-07"),
    },
    # p-szabo combined over-allocation across proj-mdh-rollout + proj-railsafety.
    # v5.2 W1 [C]: bumped 2026-04..06 from 80h to 180h (120% utilisation at
    # BUD's 150h/month standard) — second over-allocated person required by the
    # Capacity redesign acceptance criteria (≥2 over-allocated people).
    ("p-szabo", "proj-mdh-rollout"): {
        "base_hours": 40,
        "overrides": {
            "2026-03": 80,
            "2026-04": 180,
            "2026-05": 180,
            "2026-06": 180,
        },
    },
}


# ---------------------------------------------------------------------------
# v5.2 W1 [C] — Chronic under-utilisation seed scenario.
#
# People listed here are EXCLUDED from the s14_allocations auto-fill candidate
# pool, so they emerge from seed with zero allocation rows across the entire
# planning horizon. This populates the chronic under-utilisation hotspot
# scenario per the Capacity Module Redesign Spec §1 acceptance criteria
# (≥1 person with 0% utilisation across 6+ consecutive months).
#
# Picked p-iyer (Kavitha Iyer, PUN jr-dev). Junior Developer is a sparsely
# staffed role (only off-eunify / svc-euc-support / svc-itsm consume jr-dev
# capacity), so excluding one of the four jr-devs does not starve any project.
# The remaining hours redistribute to p-hoffmann / p-joshi / p-fekete.
# ---------------------------------------------------------------------------
CHRONIC_UNDERUTIL_PEOPLE: set[str] = {"p-iyer"}


# ---------------------------------------------------------------------------
# Tech Navigator subscores per Project [A-TN-01..09].
#
# Only Change-stage projects (DoI 0–4) are scored; Run-stage projects
# (DoI 5) carry no Tech Navigator profile per spec.
#
# Each entry contains:
#   - complexity sub-criteria (1-5): standardization, usage, maintenance
#   - value creation sub-criteria (1-5): financial, payback, competitive
#   - reserved slots (1-5): both intentionally unrated (None) per [A-TN-04]
#   - project_type: 1=business case / 2=strategic / 3=legal-compliance
#   - transformation_level: T0|T1|T2 per [A-TN-05]
#
# Composite scores are denormalised at emission time from the 50/50 default
# ranking weights and the 40/40/20 default sub-criterion weights so the
# Backlog ranking endpoint shows a meaningful spread on first launch.
# Admin can recompute via POST /api/admin/recompute-scores when weights change.
# ---------------------------------------------------------------------------
TECH_NAV_SCORES: dict[str, dict] = {
    # High-composite flagship demo --------------------------------------
    "proj-mdh-rollout": {
        "complexity":      {"standardization": 5, "usage": 4, "maintenance": 4},
        "value_creation":  {"financial": 5, "payback": 4, "competitive": 4},
        "project_type": 2, "transformation_level": "T2",
    },
    # Active red project --------------------------------------------------
    "proj-erp2": {
        "complexity":      {"standardization": 4, "usage": 4, "maintenance": 3},
        "value_creation":  {"financial": 4, "payback": 4, "competitive": 4},
        "project_type": 1, "transformation_level": "T1",
    },
    # Active amber project ------------------------------------------------
    "proj-sensor": {
        "complexity":      {"standardization": 3, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 4, "payback": 3, "competitive": 3},
        "project_type": 1, "transformation_level": "T1",
    },
    # Approved-stage projects --------------------------------------------
    "proj-predmaint": {
        "complexity":      {"standardization": 3, "usage": 3, "maintenance": 2},
        "value_creation":  {"financial": 4, "payback": 4, "competitive": 3},
        "project_type": 1, "transformation_level": "T1",
    },
    "proj-railsafety": {
        "complexity":      {"standardization": 3, "usage": 2, "maintenance": 2},
        "value_creation":  {"financial": 4, "payback": 5, "competitive": 3},
        "project_type": 3, "transformation_level": "T0",
    },
    # Under-Evaluation late (intake) -------------------------------------
    "proj-autobrake": {
        "complexity":      {"standardization": 4, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 5, "payback": 4, "competitive": 4},
        "project_type": 2, "transformation_level": "T2",
    },
    # Under-Evaluation early ---------------------------------------------
    "proj-dwh": {
        "complexity":      {"standardization": 3, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 4, "payback": 3, "competitive": 3},
        "project_type": 2, "transformation_level": "T1",
    },
    # Proposed (DoI 0) ----------------------------------------------------
    "proj-greenedge": {
        "complexity":      {"standardization": 2, "usage": 2, "maintenance": 2},
        "value_creation":  {"financial": 3, "payback": 3, "competitive": 2},
        "project_type": 1, "transformation_level": "T0",
    },
    "proj-connveh": {
        "complexity":      {"standardization": 4, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 5, "payback": 3, "competitive": 4},
        "project_type": 2, "transformation_level": "T2",
    },
    # --- Backlog expansion (v6) — 16 pre-execution projects ----------------
    "proj-sapupg": {
        "complexity":      {"standardization": 4, "usage": 4, "maintenance": 3},
        "value_creation":  {"financial": 5, "payback": 4, "competitive": 4},
        "project_type": 1, "transformation_level": "T1",
    },
    "proj-crmnext": {
        "complexity":      {"standardization": 4, "usage": 4, "maintenance": 3},
        "value_creation":  {"financial": 5, "payback": 4, "competitive": 4},
        "project_type": 2, "transformation_level": "T2",
    },
    "proj-aiops": {
        "complexity":      {"standardization": 4, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 5, "payback": 4, "competitive": 4},
        "project_type": 2, "transformation_level": "T2",
    },
    "proj-datalake": {
        "complexity":      {"standardization": 4, "usage": 4, "maintenance": 3},
        "value_creation":  {"financial": 5, "payback": 3, "competitive": 4},
        "project_type": 2, "transformation_level": "T2",
    },
    "proj-cloudmig": {
        "complexity":      {"standardization": 4, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 4, "payback": 4, "competitive": 3},
        "project_type": 1, "transformation_level": "T1",
    },
    "proj-iam2": {
        "complexity":      {"standardization": 4, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 4, "payback": 3, "competitive": 3},
        "project_type": 1, "transformation_level": "T1",
    },
    "proj-mes": {
        "complexity":      {"standardization": 3, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 4, "payback": 4, "competitive": 3},
        "project_type": 1, "transformation_level": "T1",
    },
    "proj-warehouse": {
        "complexity":      {"standardization": 3, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 4, "payback": 4, "competitive": 2},
        "project_type": 1, "transformation_level": "T1",
    },
    "proj-apigateway": {
        "complexity":      {"standardization": 4, "usage": 3, "maintenance": 4},
        "value_creation":  {"financial": 3, "payback": 4, "competitive": 2},
        "project_type": 1, "transformation_level": "T1",
    },
    "proj-mdm": {
        "complexity":      {"standardization": 3, "usage": 3, "maintenance": 3},
        "value_creation":  {"financial": 4, "payback": 3, "competitive": 3},
        "project_type": 1, "transformation_level": "T1",
    },
    "proj-zerotrust": {
        "complexity":      {"standardization": 3, "usage": 4, "maintenance": 3},
        "value_creation":  {"financial": 4, "payback": 3, "competitive": 3},
        "project_type": 3, "transformation_level": "T0",
    },
    "proj-ehs": {
        "complexity":      {"standardization": 3, "usage": 3, "maintenance": 2},
        "value_creation":  {"financial": 3, "payback": 4, "competitive": 2},
        "project_type": 3, "transformation_level": "T0",
    },
    "proj-paymtsec": {
        "complexity":      {"standardization": 3, "usage": 3, "maintenance": 2},
        "value_creation":  {"financial": 4, "payback": 4, "competitive": 2},
        "project_type": 3, "transformation_level": "T0",
    },
    "proj-elearning": {
        "complexity":      {"standardization": 4, "usage": 4, "maintenance": 4},
        "value_creation":  {"financial": 3, "payback": 3, "competitive": 2},
        "project_type": 1, "transformation_level": "T0",
    },
    "proj-fielddx2": {
        "complexity":      {"standardization": 3, "usage": 2, "maintenance": 3},
        "value_creation":  {"financial": 3, "payback": 3, "competitive": 3},
        "project_type": 2, "transformation_level": "T1",
    },
    "proj-greenit": {
        "complexity":      {"standardization": 3, "usage": 2, "maintenance": 3},
        "value_creation":  {"financial": 2, "payback": 3, "competitive": 2},
        "project_type": 1, "transformation_level": "T0",
    },
    # Run-stage projects (DoI 5) — Tech Nav profiles per [A-TN-01]:
    # apply regardless of status so Run-stage entities can also be
    # ranked / scored if they're brought back into Change Portfolio.
    "proj-cloud3-run": {
        "complexity":      {"standardization": 4, "usage": 3, "maintenance": 4},
        "value_creation":  {"financial": 4, "payback": 5, "competitive": 3},
        "project_type": 1, "transformation_level": "T1",
    },
    "proj-iam-run": {
        "complexity":      {"standardization": 4, "usage": 4, "maintenance": 4},
        "value_creation":  {"financial": 4, "payback": 5, "competitive": 4},
        "project_type": 1, "transformation_level": "T1",
    },
}


# ---------------------------------------------------------------------------
# Default weight configuration mirrored from
# ``services.tech_navigator.DEFAULT_PARAMS``. Values are *percentages* — the
# weighted-average implementation normalises them, so 40/40/20 is equivalent
# to 0.4/0.4/0.2.
# ---------------------------------------------------------------------------
# Mirrors services.tech_navigator DEFAULT_* so seed-computed composite scores
# match a live recompute (previously drifted: value 40/40/20 + ranking 50/50).
TECH_NAV_DEFAULT_WEIGHTS = {
    "complexity":     {"standardization": 40.0, "usage": 40.0, "maintenance": 20.0},
    "value_creation": {"financial": 50.0, "payback": 40.0, "competitive": 10.0},
    "ranking":        {"value": 70.0, "complexity": 30.0},
}

TSHIRT_THRESHOLDS = {
    "xs_max": 200000,
    "s_max": 500000,
    "m_max": 1000000,
    "l_max": 2000000,
}


def weighted_avg(values: list[int], weights: list[float]) -> float | None:
    """Normalised weighted average. Returns None when weights are zero."""
    if not values or len(values) != len(weights):
        return None
    total = sum(weights)
    if total <= 0:
        return None
    return round(sum(v * w for v, w in zip(values, weights)) / total, 2)


def derive_tshirt(total_budget: float | None) -> str | None:
    """Mirror services.tech_navigator.derive_tshirt."""
    if total_budget is None:
        return None
    b = float(total_budget)
    t = TSHIRT_THRESHOLDS
    if b <= t["xs_max"]:
        return "XS"
    if b <= t["s_max"]:
        return "S"
    if b <= t["m_max"]:
        return "M"
    if b <= t["l_max"]:
        return "L"
    return "XL"
