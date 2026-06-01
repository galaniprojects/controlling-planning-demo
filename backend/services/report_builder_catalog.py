"""Report Builder data catalog — dimensions and measures with DB mapping metadata.

This is the semantic layer that exposes VIPER's data model as business-friendly
objects for the OLAP-style Report Builder.  It is static metadata (not stored in
the database) because it describes the *schema*, not user data.
"""

from __future__ import annotations

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Dataclass definitions
# ---------------------------------------------------------------------------

@dataclass
class DimensionDef:
    id: str
    display_name: str
    category: str  # Planning Object | Organisation | Resource | External Cost | Financial | Time
    data_type: str  # text | enum | year | quarter | month
    hierarchy_parent: str | None = None  # ID of parent dimension in hierarchy
    hierarchy_note: str | None = None
    # DB mapping hints (used by the query engine)
    source: str = ""  # table or "derived"
    column: str = ""  # column name
    join_path: str = ""  # description of required joins


@dataclass
class MeasureDef:
    id: str
    display_name: str
    category: str  # Financial | Cost Breakdown | Capacity | Portfolio
    aggregation: str  # SUM | COUNT | COUNT_DISTINCT | WEIGHTED | DERIVED
    format: str  # currency | percent | number | hours
    source_tables: list[str] = field(default_factory=list)  # which fact tables
    compatibility_note: str | None = None  # warning when incompatible dims used


# ---------------------------------------------------------------------------
# Dimensions (D01 – D18)
# ---------------------------------------------------------------------------

DIMENSIONS: list[DimensionDef] = [
    # --- Planning Object ---
    DimensionDef(
        id="D01", display_name="Project / Service", category="Planning Object",
        data_type="text", source="projects", column="name",
    ),
    DimensionDef(
        id="D02", display_name="Project Type", category="Planning Object",
        data_type="enum", source="projects", column="is_service",
        hierarchy_note="Project vs Service; sub-types within Service",
    ),
    DimensionDef(
        id="D03", display_name="Project Status", category="Planning Object",
        data_type="enum", source="projects", column="status",
    ),
    DimensionDef(
        id="D04", display_name="RAG Status", category="Planning Object",
        data_type="enum", source="projects", column="rag_status",
    ),
    # --- Organisation ---
    DimensionDef(
        id="D05", display_name="Line of Business", category="Organisation",
        data_type="text", source="grouping_entities", column="name",
        join_path="project_grouping_assignments → grouping_entities (walk to top-level)",
    ),
    DimensionDef(
        id="D06", display_name="Cost Center", category="Organisation",
        data_type="text", source="cost_centers", column="name",
        join_path="allocations.person → people.cost_center → cost_centers",
    ),
    DimensionDef(
        id="D07", display_name="Competence Center", category="Organisation",
        data_type="text", source="competence_centers", column="name",
        join_path="cost_centers.competence_center → competence_centers",
    ),
    DimensionDef(
        id="D08", display_name="Location", category="Organisation",
        data_type="text", source="locations", column="city",
        join_path="cost_centers.location → locations",
    ),
    # --- Resource ---
    DimensionDef(
        id="D09", display_name="Role", category="Resource",
        data_type="text", source="role_types", column="name",
        join_path="financial.sub_category = role_types.id (internal rows)",
    ),
    DimensionDef(
        id="D10", display_name="Person", category="Resource",
        data_type="text", source="people", column="name",
        join_path="allocations.person → people",
    ),
    # --- External Cost ---
    DimensionDef(
        id="D11", display_name="Vendor", category="External Cost",
        data_type="text", source="financial", column="vendor",
    ),
    DimensionDef(
        id="D12", display_name="External Cost Category", category="External Cost",
        data_type="text", source="external_cost_types", column="name",
        join_path="financial.sub_category = external_cost_types.id (external rows)",
    ),
    DimensionDef(
        id="D13", display_name="External Cost Status", category="External Cost",
        data_type="enum", source="financial", column="ext_status",
    ),
    # --- Financial ---
    DimensionDef(
        id="D14", display_name="CapEx / OpEx", category="Financial",
        data_type="enum", source="projects", column="capex_opex",
    ),
    DimensionDef(
        id="D15", display_name="Change / Run", category="Financial",
        data_type="enum", source="derived",
        hierarchy_note="Projects = Change; Services = Run (derived from is_service)",
    ),
    # --- Time ---
    DimensionDef(
        id="D16", display_name="Fiscal Year", category="Time",
        data_type="year", source="financial", column="month",
        hierarchy_note="Contains Quarters / Months",
    ),
    DimensionDef(
        id="D17", display_name="Quarter", category="Time",
        data_type="quarter", source="financial", column="month",
        hierarchy_parent="D16",
    ),
    DimensionDef(
        id="D18", display_name="Month", category="Time",
        data_type="month", source="financial", column="month",
        hierarchy_parent="D17",
    ),
]


# ---------------------------------------------------------------------------
# Measures (M01 – M16)
# ---------------------------------------------------------------------------

MEASURES: list[MeasureDef] = [
    # --- Financial ---
    MeasureDef(
        id="M01", display_name="Baseline Budget (€)", category="Financial",
        aggregation="SUM", format="currency", source_tables=["baselines"],
    ),
    MeasureDef(
        id="M02", display_name="Current Forecast (€)", category="Financial",
        aggregation="SUM", format="currency", source_tables=["forecasts"],
    ),
    MeasureDef(
        id="M03", display_name="Actuals (€)", category="Financial",
        aggregation="SUM", format="currency", source_tables=["actuals"],
    ),
    MeasureDef(
        id="M04", display_name="Variance: Forecast vs Baseline (€)", category="Financial",
        aggregation="DERIVED", format="currency", source_tables=["forecasts", "baselines"],
    ),
    MeasureDef(
        id="M05", display_name="Variance: Forecast vs Baseline (%)", category="Financial",
        aggregation="DERIVED", format="percent", source_tables=["forecasts", "baselines"],
    ),
    MeasureDef(
        id="M06", display_name="Variance: Actuals vs Forecast (€)", category="Financial",
        aggregation="DERIVED", format="currency", source_tables=["actuals", "forecasts"],
    ),
    MeasureDef(
        id="M07", display_name="Remaining Forecast (€)", category="Financial",
        aggregation="DERIVED", format="currency", source_tables=["forecasts", "actuals"],
    ),
    # --- Cost Breakdown ---
    MeasureDef(
        id="M08", display_name="Internal Cost (€)", category="Cost Breakdown",
        aggregation="SUM", format="currency", source_tables=["forecasts"],
    ),
    MeasureDef(
        id="M09", display_name="External Cost (€)", category="Cost Breakdown",
        aggregation="SUM", format="currency", source_tables=["forecasts"],
        compatibility_note="Not meaningful when broken down by Role or Person (external costs are not person-based).",
    ),
    MeasureDef(
        id="M10", display_name="Obligo / Committed (€)", category="Cost Breakdown",
        aggregation="SUM", format="currency", source_tables=["forecasts"],
        compatibility_note="Requires External Cost Status for a meaningful breakdown.",
    ),
    # --- Capacity ---
    MeasureDef(
        id="M11", display_name="Planned Hours", category="Capacity",
        aggregation="SUM", format="hours", source_tables=["forecasts"],
        compatibility_note="Only meaningful with Cost Center, Competence Center, Location, Role, or Person dimension.",
    ),
    MeasureDef(
        id="M12", display_name="Actual Hours", category="Capacity",
        aggregation="SUM", format="hours", source_tables=["actuals"],
        compatibility_note="Only meaningful with Cost Center, Competence Center, Location, Role, or Person dimension.",
    ),
    MeasureDef(
        id="M13", display_name="Available Hours", category="Capacity",
        aggregation="SUM", format="hours", source_tables=["allocations"],
        compatibility_note="Only meaningful with Cost Center, Competence Center, Location, Role, or Person dimension.",
    ),
    MeasureDef(
        id="M14", display_name="Utilisation (%)", category="Capacity",
        aggregation="DERIVED", format="percent", source_tables=["allocations"],
        compatibility_note="Cannot be calculated at the Project level alone. Requires a resource or cost center dimension.",
    ),
    # --- Portfolio ---
    MeasureDef(
        id="M15", display_name="Project Count", category="Portfolio",
        aggregation="COUNT_DISTINCT", format="number", source_tables=["projects"],
    ),
    MeasureDef(
        id="M16", display_name="Headcount", category="Portfolio",
        aggregation="COUNT_DISTINCT", format="number", source_tables=["allocations"],
        compatibility_note="Only meaningful with Cost Center, Competence Center, Location, Role, or Person dimension.",
    ),
]


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

DIMENSION_MAP: dict[str, DimensionDef] = {d.id: d for d in DIMENSIONS}
MEASURE_MAP: dict[str, MeasureDef] = {m.id: m for m in MEASURES}

# Dimension categories (ordered)
DIMENSION_CATEGORIES = ["Planning Object", "Organisation", "Resource", "External Cost", "Financial", "Time"]
MEASURE_CATEGORIES = ["Financial", "Cost Breakdown", "Capacity", "Portfolio"]

# Capacity-related dimension IDs (for compatibility checks)
CAPACITY_DIMENSION_IDS = {"D06", "D07", "D08", "D09", "D10"}


def get_catalog_response() -> dict:
    """Build the full catalog JSON response for the frontend."""
    dimensions = []
    for d in DIMENSIONS:
        dimensions.append({
            "id": d.id,
            "display_name": d.display_name,
            "category": d.category,
            "data_type": d.data_type,
            "hierarchy_parent": d.hierarchy_parent,
        })

    measures = []
    for m in MEASURES:
        measures.append({
            "id": m.id,
            "display_name": m.display_name,
            "category": m.category,
            "aggregation": m.aggregation,
            "format": m.format,
            "compatibility_note": m.compatibility_note,
        })

    return {
        "dimensions": dimensions,
        "dimension_categories": DIMENSION_CATEGORIES,
        "measures": measures,
        "measure_categories": MEASURE_CATEGORIES,
    }


def check_compatibility_warnings(
    dimension_ids: list[str],
    measure_ids: list[str],
) -> list[str]:
    """Return warnings for incompatible dimension–measure combinations."""
    warnings = []
    dim_set = set(dimension_ids)
    has_capacity_dim = bool(dim_set & CAPACITY_DIMENSION_IDS)

    for mid in measure_ids:
        m = MEASURE_MAP.get(mid)
        if not m or not m.compatibility_note:
            continue
        # Capacity measures need a capacity-related dimension
        if mid in ("M11", "M12", "M13", "M14", "M16") and not has_capacity_dim:
            warnings.append(f"{m.display_name}: {m.compatibility_note}")
        # External cost measures shouldn't be broken down by Role/Person
        if mid in ("M09",) and dim_set & {"D09", "D10"}:
            warnings.append(f"{m.display_name}: {m.compatibility_note}")
        # Obligo needs ext_status
        if mid == "M10" and "D13" not in dim_set:
            warnings.append(f"{m.display_name}: {m.compatibility_note}")

    return warnings
