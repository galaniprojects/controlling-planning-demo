"""
Generate notifications, system suggestions, and audit log entries.
"""
from .config import sql_str


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- Notifications, System Suggestions, Audit Log")
    parts.append("-- =============================================================================")

    # --- Notifications ---
    # Priya (PL) — p-sharma
    # Thomas (CC Owner) — p-brenner
    # Anna (Controller) — p-meier
    # Attila (Executive) — p-biber
    parts.append("""
-- Notifications
INSERT INTO notifications (user_person_id, message, severity, deep_link_module, deep_link_entity_id, is_read, created_at) VALUES
-- Priya (PL) notifications
('p-sharma', 'Forecast overdue: ERP Integration Phase 2 — February 2026 forecast has not been submitted', 'action', 'workbench', 'proj-erp2', 0, '2026-03-01 08:00:00'),
('p-sharma', 'Forecast due: Sensor Data Pipeline — March 2026 forecast is pending submission', 'action', 'workbench', 'proj-sensor', 0, '2026-03-01 08:00:00'),
('p-sharma', 'Forecast due: Predictive Maintenance PoC — March 2026 forecast is pending submission', 'action', 'workbench', 'proj-predmaint', 0, '2026-03-01 08:00:00'),
('p-sharma', 'Change request returned: CR #27 for Predictive Maintenance PoC sent back by Controller with feedback', 'action', 'workbench', 'proj-predmaint', 0, '2026-02-25 14:00:00'),
('p-sharma', 'Change request approved: CR #28 for Fleet Portal v2 has been approved by Controller', 'info', 'workbench', 'proj-fleet', 0, '2026-03-10 11:00:00'),
('p-sharma', 'Project approved: Fleet Portal v2 has been approved and is now active', 'info', 'workbench', 'proj-fleet', 0, '2026-02-15 10:00:00'),
-- Thomas (CC Owner) notifications
('p-brenner', 'CR pending confirmation: CR #9 for ERP Integration Phase 2 requires your review', 'action', 'portfolio', 'proj-erp2', 0, '2026-03-05 09:00:00'),
('p-brenner', 'CR pending confirmation: CR #15 for Sensor Data Pipeline requires your review', 'action', 'portfolio', 'proj-sensor', 0, '2026-03-08 09:30:00'),
('p-brenner', 'Resource request: Predictive Maintenance PoC is requesting a Senior Developer from your cost centre', 'action', 'capacity', 'proj-predmaint', 0, '2026-02-20 10:00:00'),
-- Anna (Controller) notifications
('p-meier', 'CR pending approval: CR #12 for SAP S/4HANA Migration is ready for your review', 'action', 'portfolio', 'proj-sap', 0, '2026-03-02 11:00:00'),
('p-meier', 'CR pending approval: CR #19 for IAM Overhaul is ready for your review', 'action', 'portfolio', 'proj-iam', 0, '2026-03-04 11:00:00'),
('p-meier', 'New project pending review: Autonomous Braking Prototype submitted for approval', 'action', 'portfolio', 'proj-autobrake', 0, '2026-02-28 10:00:00'),
('p-meier', 'Forecast overdue: ERP Integration Phase 2 — February 2026 forecast has not been submitted by Project Lead', 'info', 'workbench', 'proj-erp2', 0, '2026-03-01 08:00:00'),
-- Attila (Executive) notifications
('p-biber', 'Scenario published: Budget Pressure: 15% Reduction has been published by Anna Meier', 'info', 'whatif', NULL, 0, '2026-03-07 10:00:00'),
('p-biber', 'Scenario published: Conservative: Freeze New Starts has been published by you', 'info', 'whatif', NULL, 1, '2026-03-01 09:00:00');""")

    # --- System Suggestions ---
    parts.append("""
-- System Suggestions
INSERT INTO system_suggestions (project_id, suggestion_type, observation, recommendation, impact_description, pre_filled_changes_json, created_at) VALUES
('proj-erp2', 'trend_based', 'Consulting costs have exceeded forecast by 15-20% for the past 6 months. The trend suggests continued overrun through project end.', 'Consider renegotiating the Deloitte advisory scope or capping monthly consulting spend at current forecast levels.', 'Potential savings of EUR 18,000-25,000 over remaining project months if consulting costs are capped.', '{"changes": [{"type": "external", "line": "SAP Implementation Support", "action": "cap_at_forecast"}]}', '2026-03-01 08:00:00'),
('proj-sensor', 'burn_rate', 'External costs (consulting + cloud) are running 25% above baseline. At current burn rate, the project will exceed its approved budget by EUR 45,000.', 'Submit a change request to formally adjust the external cost forecast, or identify areas where internal effort can replace external consulting.', 'Without intervention, projected budget overrun of EUR 45,000 by project end (December 2026).', '{"changes": [{"type": "external", "line": "Data Engineering Consulting", "action": "reduce_by_pct", "pct": 15}]}', '2026-03-01 08:00:00'),
('proj-iam', 'actuals_correction', 'ServiceNow licensing costs increased 40% after vendor pricing change. Current forecast may not fully reflect the compounding impact over remaining months.', 'Review forecast for ServiceNow ITSM Licenses line item and ensure all remaining months reflect the updated pricing.', 'Forecast accuracy improvement: ensures remaining 6 months correctly reflect EUR 5,600/month vs potential underestimate.', '{"changes": [{"type": "external", "line": "ServiceNow ITSM Licenses", "action": "update_forecast", "amount": 5600}]}', '2026-03-01 08:00:00'),
('proj-telematics', 'burn_rate', 'Project is behind schedule by approximately 1 month. Current resource allocation may not be sufficient to recover the timeline slip.', 'Consider increasing developer allocation for Q2 2026 or further reducing scope to meet the revised delivery date.', 'Additional 20 developer hours/month for 3 months could recover 2-3 weeks of schedule slip.', '{"changes": [{"type": "internal", "role": "role-dev", "action": "increase_hours", "delta": 20}]}', '2026-03-01 08:00:00');""")

    # --- Audit Log ---
    parts.append("""
-- Audit Log
INSERT INTO audit_log (timestamp, user_person_id, entity_type, entity_id, entity_name, action, field_changed, old_value, new_value) VALUES
('2026-02-15 10:00:00', 'p-meier', 'project', 'proj-fleet', 'Fleet Portal v2', 'update', 'status', 'pending_approval', 'active'),
('2026-02-20 10:00:00', 'p-sharma', 'change_request', '27', 'CR #27 - Predictive Maintenance PoC', 'create', NULL, NULL, NULL),
('2026-02-25 14:00:00', 'p-meier', 'change_request', '27', 'CR #27 - Predictive Maintenance PoC', 'update', 'status', 'pending_controller_approval', 'sent_back_by_controller'),
('2026-02-28 10:00:00', 'p-sharma', 'project', 'proj-autobrake', 'Autonomous Braking Prototype', 'create', NULL, NULL, NULL),
('2026-03-01 09:00:00', 'p-biber', 'scenario', '3', 'Conservative: Freeze New Starts', 'update', 'status', 'private', 'published'),
('2026-03-02 11:00:00', 'p-brenner', 'change_request', '12', 'CR #12 - SAP S/4HANA Migration', 'update', 'cc_status', 'pending', 'confirmed'),
('2026-03-04 11:00:00', 'p-brenner', 'change_request', '19', 'CR #19 - IAM Overhaul', 'update', 'cc_status', 'pending', 'confirmed'),
('2026-03-05 09:00:00', 'p-sharma', 'change_request', '9', 'CR #9 - ERP Integration Phase 2', 'create', NULL, NULL, NULL),
('2026-03-07 09:00:00', 'p-sharma', 'change_request', '28', 'CR #28 - Fleet Portal v2', 'create', NULL, NULL, NULL),
('2026-03-07 10:00:00', 'p-meier', 'scenario', '1', 'Budget Pressure: 15% Reduction', 'update', 'status', 'private', 'published'),
('2026-03-08 09:30:00', 'p-sharma', 'change_request', '15', 'CR #15 - Sensor Data Pipeline', 'create', NULL, NULL, NULL),
('2026-03-08 10:00:00', 'p-brenner', 'change_request', '28', 'CR #28 - Fleet Portal v2', 'update', 'cc_status', 'pending', 'confirmed'),
('2026-03-10 11:00:00', 'p-meier', 'change_request', '28', 'CR #28 - Fleet Portal v2', 'update', 'controller_status', 'pending', 'approved');""")

    return "\n".join(parts)
