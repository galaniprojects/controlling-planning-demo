"""AI Report Builder service — orchestrates Claude conversations and SQL execution."""

from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import anthropic
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

import config
from config import BASE_DIR, DEMO_DATE
from models.system import PlanningParameter
from schemas.common import CurrentUser

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ROW_LIMIT = 500
QUERY_TIMEOUT_MS = 2000
CONVERSATION_TTL_MINUTES = 30
MAX_SQL_RETRIES = 2

BLOCKED_KEYWORDS = re.compile(
    r"\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Read-only SQLite engine
# ---------------------------------------------------------------------------

_ro_engine = None


def _get_readonly_engine():
    """Return a read-only SQLite engine (singleton)."""
    global _ro_engine
    if _ro_engine is None:
        db_path = os.path.join(BASE_DIR, "creta_demo.db")
        _ro_engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )
        # Set query_only pragma on connect
        from sqlalchemy import event

        @event.listens_for(_ro_engine, "connect")
        def set_readonly(dbapi_conn, _rec):
            dbapi_conn.execute("PRAGMA query_only = ON")

    return _ro_engine


# ---------------------------------------------------------------------------
# SQL safety
# ---------------------------------------------------------------------------


def validate_sql(sql: str) -> str | None:
    """Return an error message if the SQL is unsafe, else None."""
    stripped = sql.strip().rstrip(";").strip()
    if BLOCKED_KEYWORDS.search(stripped):
        return "Only SELECT queries are allowed. DDL/DML statements are blocked."
    if not stripped.upper().startswith("SELECT") and not stripped.upper().startswith("WITH"):
        return "Only SELECT (or WITH ... SELECT) queries are allowed."
    return None


def execute_sql(sql: str) -> dict:
    """Execute a read-only SQL query and return results as a dict.

    Returns {"columns": [...], "rows": [...], "row_count": N} on success
    or {"error": "..."} on failure.
    """
    error = validate_sql(sql)
    if error:
        return {"error": error}

    engine = _get_readonly_engine()
    try:
        with engine.connect() as conn:
            result = conn.execute(text(sql))
            columns = list(result.keys())
            rows = []
            for i, row in enumerate(result):
                if i >= ROW_LIMIT:
                    break
                rows.append(dict(zip(columns, row)))
            return {
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "truncated": i >= ROW_LIMIT if rows else False,
            }
    except Exception as e:
        return {"error": f"SQL execution error: {str(e)}"}


# ---------------------------------------------------------------------------
# Role-based scoping
# ---------------------------------------------------------------------------


def build_scoping_context(user: CurrentUser, db: Session | None = None) -> str:
    """Build a scoping instruction for the system prompt based on user role.

    When *db* is provided the function queries for the actual set of visible
    project IDs (including dynamically created projects).  Without *db* it
    falls back to the static ``user.project_ids`` list.
    """
    if user.role in ("controller", "executive"):
        return "This user has full access to all projects and data."
    if user.role == "project_lead":
        if db is not None:
            from dependencies import pl_project_filter
            from models.projects import Project
            visible_ids = [
                r[0] for r in db.query(Project.id).filter(
                    Project.is_active.is_(True), pl_project_filter(user)
                ).all()
            ]
        else:
            visible_ids = list(user.project_ids)
        ids = ", ".join(f"'{pid}'" for pid in visible_ids)
        return (
            f"IMPORTANT: This user is a Project Lead and can only see their own projects. "
            f"You MUST filter all queries to include only these project IDs: {ids}. "
            f"Add WHERE project_id IN ({ids}) to every query involving projects, "
            f"forecasts, baselines, or actuals."
        )
    if user.role == "cost_center_owner":
        return (
            f"IMPORTANT: This user is a Cost Center Owner managing cost center '{user.cost_center_id}'. "
            f"They can see projects that have resource allocations from their cost center. "
            f"Filter project data to only projects that appear in the allocations table "
            f"for people belonging to cost_center_id = '{user.cost_center_id}'."
        )
    return "This user has full access to all projects and data."


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an AI report builder for {app_name}, a financial planning and project portfolio management application for {company_name} IT. You help users create custom reports by querying the database.

## Demo Context
- Current date: {demo_date} (April 2026)
- Currency: EUR with European formatting (dot for thousands, comma for decimals: €14.400,00)
- This is a demo with realistic mock data

## Database Schema

The SQLite database contains these tables:

**projects** — IT projects
- id (PK), name, description, status (active/completed/on_hold/proposed/cancelled), rag_status (green/amber/red), capex_opex (capex/opex), start_month (YYYY-MM), end_month, projected_end_month, pl_person_id (FK→people), is_service (bool), annual_budget, total_budget, is_active

**forecasts** — Monthly forecast line items
- id (PK), project_id (FK→projects), month (YYYY-MM), category (internal/external), sub_category (role type ID for internal, cost type for external), hours, amount_eur, capex_opex, vendor, ext_status (invoiced/ordered/goods_received/accrual/open), po_number

**baselines** — Original budget plan (same structure as forecasts)
- id (PK), project_id (FK→projects), month, category, sub_category, hours, amount_eur, capex_opex, vendor, ext_status

**actuals** — Recorded actual spend (same structure as forecasts)
- id (PK), project_id (FK→projects), month, category, sub_category, hours, amount_eur, capex_opex, vendor, ext_status

**people** — Personnel
- id (PK), name, role_type_id (FK→role_types), cost_center_id (FK→cost_centers), competence_center_id (FK→competence_centers), is_active

**role_types** — Job roles (e.g., Senior Developer, Project Manager)
- id (PK), name

**cost_centers** — Organizational cost centers
- id (PK), name, location_id (FK→locations), competence_center_id (FK→competence_centers), is_active

**locations** — Office locations
- id (PK), city, country, is_active

**competence_centers** — Competence centers
- id (PK), name, is_active

**allocations** — Person-to-project monthly hour allocations
- id (PK), person_id (FK→people), project_id (FK→projects), month (YYYY-MM), hours, is_confirmed (bool)

**grouping_entities** — Organizational hierarchy (Lines of Business, Programs)
- id (PK), entity_type_id (FK→grouping_entity_types), name, parent_entity_id (self FK), is_active

**grouping_entity_types** — Entity type definitions
- id (PK), name (e.g., "Line of Business", "Program")

**project_grouping_assignments** — Links projects to grouping entities
- id (PK), project_id (FK→projects), grouping_entity_id (FK→grouping_entities)

**rate_table** — Hourly rates by role and competence center
- id (PK), role_type_id, competence_center_id, hourly_rate, effective_date

**change_requests** — Change request workflow
- id (PK), project_id (FK→projects), submitted_by_id (FK→people), status (draft/pending_cc_confirmation/pending_controller_approval/approved/rejected/withdrawn), change_category (forecast_update/timeline_change/budget_increase/budget_decrease/scope_change/resource_change), summary

**resource_requests** — Resource/budget requests
- id (PK), project_id (FK→projects), cost_center_id (FK→cost_centers), request_type (internal/external), role_type_id, hours_or_amount_per_month, period_start, period_end, priority (high/medium/low), status (pending/approved/partially_approved/rejected/fulfilled)

## Data Relationships
- To find which Line of Business a project belongs to: JOIN project_grouping_assignments ON project_id, then JOIN grouping_entities to get the entity name. Top-level entities (parent_entity_id IS NULL) with entity_type_id = 'get-lob' are Lines of Business.
- To find the Program: same join but entity_type_id = 'get-prog'.
- Internal costs use role-based sub_categories (e.g., 'role-sr-dev'). Join role_types to get the role name.
- External costs use cost type sub_categories. The vendor field identifies the vendor.

## User Context
{scoping_context}

## Your Task
Help the user create a report. Follow this process:

1. **Understand**: Read the user's request carefully.
2. **Clarify** (if needed): Ask at most 1-2 brief clarifying questions. If the request is clear, skip this step.
3. **Query**: Use the execute_sql tool to fetch data. You can make multiple queries.
4. **Generate**: Once you have the data, produce the final report by including a JSON block in your response.

## Output Format
When you have gathered enough data and are ready to present the report, include exactly one JSON code block in your response with this structure:

```report_spec
{{
  "title": "Report Title",
  "kpis": [
    {{ "label": "KPI Name", "value": 12345.67, "format": "currency" }},
    {{ "label": "Count", "value": 42, "format": "number" }}
  ],
  "table": {{
    "columns": [
      {{ "key": "col_key", "label": "Column Header", "type": "text" }},
      {{ "key": "amount", "label": "Amount (EUR)", "type": "currency" }}
    ],
    "rows": [ {{ "col_key": "value", "amount": 1234.56 }} ],
    "sort_by": "amount",
    "sort_dir": "desc"
  }},
  "charts": [
    {{
      "type": "bar",
      "title": "Chart Title",
      "data": [ {{ "name": "Category", "value": 1234 }} ],
      "data_key": "value",
      "category_key": "name"
    }}
  ]
}}
```

## Rules
- Column types: "text", "currency", "number", "percent", "date"
- Chart types: "bar", "line", "pie", "donut"
- KPI formats: "currency", "number", "percent", "text"
- Always include at least a table OR a chart
- Include KPIs when they add value (totals, counts, key metrics)
- For currency values, store raw numbers (not formatted strings) — the frontend handles formatting
- For percentages, store as decimal (e.g., 5.2 for 5.2%)
- Keep table rows reasonable (under 50 ideally, max 100)
- When the user asks for refinements to an existing report, return a complete new report_spec (not a diff)
"""

# ---------------------------------------------------------------------------
# Conversation state
# ---------------------------------------------------------------------------


@dataclass
class ConversationState:
    conversation_id: str
    user: CurrentUser
    messages: list[dict] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_active: datetime = field(default_factory=datetime.utcnow)
    report_spec: dict | None = None


# In-memory conversation store
_conversations: dict[str, ConversationState] = {}


def _cleanup_expired():
    """Remove conversations older than TTL."""
    cutoff = datetime.utcnow() - timedelta(minutes=CONVERSATION_TTL_MINUTES)
    expired = [cid for cid, c in _conversations.items() if c.last_active < cutoff]
    for cid in expired:
        del _conversations[cid]


# ---------------------------------------------------------------------------
# API key resolution
# ---------------------------------------------------------------------------


def get_api_key(db: Session) -> str | None:
    """Get Anthropic API key: DB parameter first, then env var fallback."""
    param = db.query(PlanningParameter).filter(PlanningParameter.key == "anthropic_api_key").first()
    if param and param.current_value and param.current_value.strip():
        return param.current_value.strip()
    env_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    return env_key if env_key else None


# ---------------------------------------------------------------------------
# Tool definitions for Claude
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "execute_sql",
        "description": (
            f"Execute a read-only SQL SELECT query against the {config.BRANDING['app_name']} SQLite database. "
            "Returns column names and rows as JSON. Maximum 500 rows returned."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "A SQLite SELECT query (or WITH ... SELECT).",
                },
                "description": {
                    "type": "string",
                    "description": "Brief description of what this query retrieves.",
                },
            },
            "required": ["sql"],
        },
    }
]


# ---------------------------------------------------------------------------
# Report spec extraction
# ---------------------------------------------------------------------------


def extract_report_spec(text: str) -> dict | None:
    """Extract report_spec JSON from Claude's response text."""
    # Look for ```report_spec ... ``` block
    pattern = r"```report_spec\s*\n(.*?)\n```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            return None
    return None


# ---------------------------------------------------------------------------
# Main conversation handler
# ---------------------------------------------------------------------------


def start_conversation(
    db: Session,
    user: CurrentUser,
    initial_message: str,
) -> ConversationState:
    """Create a new conversation and return its state."""
    _cleanup_expired()

    conv = ConversationState(
        conversation_id=str(uuid.uuid4()),
        user=user,
    )
    conv.messages.append({"role": "user", "content": initial_message})
    _conversations[conv.conversation_id] = conv
    return conv


def get_conversation(conversation_id: str) -> ConversationState | None:
    """Retrieve a conversation by ID, or None if not found/expired."""
    _cleanup_expired()
    return _conversations.get(conversation_id)


def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation. Returns True if it existed."""
    return _conversations.pop(conversation_id, None) is not None


def process_conversation(
    db: Session,
    conv: ConversationState,
    api_key: str,
) -> tuple[str, dict | None]:
    """Send conversation to Claude, handle tool use, return (reply_text, report_spec_or_none).

    This handles the full tool-use loop: Claude may call execute_sql one or more times
    before producing a final text response.
    """
    conv.last_active = datetime.utcnow()

    client = anthropic.Anthropic(api_key=api_key)

    system = SYSTEM_PROMPT.format(
        app_name=config.BRANDING["app_name"],
        company_name=config.BRANDING["company_name"],
        demo_date=DEMO_DATE,
        scoping_context=build_scoping_context(conv.user, db),
    )

    messages = list(conv.messages)

    # Tool-use loop
    for _ in range(10):  # safety cap on iterations
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=system,
            tools=TOOLS,
            messages=messages,
        )

        # Collect all content blocks
        assistant_content = response.content

        # Check if there are any tool_use blocks
        tool_uses = [b for b in assistant_content if b.type == "tool_use"]

        if not tool_uses:
            # No tool calls — this is the final response
            # Store the assistant message
            conv.messages.append({"role": "assistant", "content": assistant_content})

            # Extract text
            text_parts = [b.text for b in assistant_content if b.type == "text"]
            reply_text = "\n".join(text_parts)

            # Check for report spec
            report_spec = extract_report_spec(reply_text)
            if report_spec:
                conv.report_spec = report_spec

            return reply_text, report_spec

        # Handle tool calls
        conv.messages.append({"role": "assistant", "content": assistant_content})

        tool_results = []
        for tool_use in tool_uses:
            if tool_use.name == "execute_sql":
                sql = tool_use.input.get("sql", "")
                result = execute_sql(sql)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps(result, default=str),
                    "is_error": "error" in result,
                })
            else:
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps({"error": f"Unknown tool: {tool_use.name}"}),
                    "is_error": True,
                })

        messages = list(conv.messages)
        messages.append({"role": "user", "content": tool_results})
        conv.messages.append({"role": "user", "content": tool_results})

    # If we exhaust iterations, return what we have
    return "I encountered an issue generating your report. Please try a simpler request.", None


def continue_conversation(
    db: Session,
    conv: ConversationState,
    user_message: str,
    api_key: str,
) -> tuple[str, dict | None]:
    """Add a user message and process the conversation."""
    conv.messages.append({"role": "user", "content": user_message})
    return process_conversation(db, conv, api_key)
