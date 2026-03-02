-- =============================================================================
-- SEED DATA for CPC Demo App
-- Generated: 2026-03-02
-- Demo date: February 2026
-- =============================================================================

-- =============================================================================
-- 1. lines_of_business
-- =============================================================================
INSERT INTO lines_of_business (id, name, description, is_active, created_at, modified_at) VALUES
('lob-ts', 'Truck Systems', 'Largest LoB by budget; mix of large programs and operational services', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('lob-rs', 'Rail Systems', 'Medium-sized; fewer but bigger projects, steady services', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('lob-cv', 'Commercial Vehicle', 'Smallest; newer initiatives, growing investment', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- =============================================================================
-- 2. locations
-- =============================================================================
INSERT INTO locations (id, city, country, is_active, created_at, modified_at) VALUES
('loc-muc', 'Munich', 'Germany', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('loc-bud', 'Budapest', 'Hungary', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('loc-pun', 'Pune', 'India', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- =============================================================================
-- 3. competence_centers
-- =============================================================================
INSERT INTO competence_centers (id, name, is_active, created_at, modified_at) VALUES
('cc-appdev', 'Application Development', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('cc-infra', 'Infrastructure & Cloud', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('cc-bizsol', 'Business Solutions', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- =============================================================================
-- 4. cost_centers
-- =============================================================================
INSERT INTO cost_centers (id, name, location_id, competence_center_id, is_active, created_at, modified_at) VALUES
('cc-muc-appdev', 'MUC Application Development', 'loc-muc', 'cc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('cc-muc-infra',  'MUC Infrastructure & Cloud',  'loc-muc', 'cc-infra',  1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('cc-bud-appdev', 'BUD Application Development', 'loc-bud', 'cc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('cc-bud-bizsol', 'BUD Business Solutions',      'loc-bud', 'cc-bizsol', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('cc-pun-appdev', 'PUN Application Development', 'loc-pun', 'cc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('cc-pun-infra',  'PUN Infrastructure & Cloud',  'loc-pun', 'cc-infra',  1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- =============================================================================
-- 5. role_types
-- =============================================================================
INSERT INTO role_types (id, name, created_at) VALUES
('role-sr-dev',   'Senior Developer',     '2026-01-15 10:00:00'),
('role-dev',      'Developer',            '2026-01-15 10:00:00'),
('role-ba',       'Business Analyst',     '2026-01-15 10:00:00'),
('role-pm',       'Project Manager',      '2026-01-15 10:00:00'),
('role-sa',       'Solution Architect',   '2026-01-15 10:00:00'),
('role-sysadmin', 'System Administrator', '2026-01-15 10:00:00'),
('role-cloud',    'Cloud Engineer',       '2026-01-15 10:00:00'),
('role-test',     'Test Engineer',        '2026-01-15 10:00:00');

-- =============================================================================
-- 6. rate_table
-- Application Development: Sr Dev €95, Dev €75, BA €85, PM €90, SA €105, Test €70
-- Infrastructure & Cloud:  SA €105, SysAdmin €70, Cloud €85
-- Business Solutions:      BA €88, PM €90, Dev €78
-- =============================================================================
INSERT INTO rate_table (role_type_id, competence_center_id, hourly_rate, effective_date, previous_rate, previous_effective_date, created_at) VALUES
('role-sr-dev',  'cc-appdev', 95.00,  '2026-01-01', 90.00,  '2025-01-01', '2026-01-15 10:00:00'),
('role-dev',     'cc-appdev', 75.00,  '2026-01-01', NULL,    NULL,         '2026-01-15 10:00:00'),
('role-ba',      'cc-appdev', 85.00,  '2026-01-01', 80.00,  '2025-01-01', '2026-01-15 10:00:00'),
('role-pm',      'cc-appdev', 90.00,  '2026-01-01', NULL,    NULL,         '2026-01-15 10:00:00'),
('role-sa',      'cc-appdev', 105.00, '2026-01-01', 100.00, '2025-01-01', '2026-01-15 10:00:00'),
('role-test',    'cc-appdev', 70.00,  '2026-01-01', NULL,    NULL,         '2026-01-15 10:00:00'),
('role-sa',      'cc-infra',  105.00, '2026-01-01', NULL,    NULL,         '2026-01-15 10:00:00'),
('role-sysadmin','cc-infra',  70.00,  '2026-01-01', NULL,    NULL,         '2026-01-15 10:00:00'),
('role-cloud',   'cc-infra',  85.00,  '2026-01-01', NULL,    NULL,         '2026-01-15 10:00:00'),
('role-ba',      'cc-bizsol', 88.00,  '2026-01-01', NULL,    NULL,         '2026-01-15 10:00:00'),
('role-pm',      'cc-bizsol', 90.00,  '2026-01-01', NULL,    NULL,         '2026-01-15 10:00:00'),
('role-dev',     'cc-bizsol', 78.00,  '2026-01-01', NULL,    NULL,         '2026-01-15 10:00:00');

-- =============================================================================
-- 7. external_cost_types
-- =============================================================================
INSERT INTO external_cost_types (id, name, created_at) VALUES
('ext-consulting',    'Consulting',        '2026-01-15 10:00:00'),
('ext-cloud',         'Cloud Services',    '2026-01-15 10:00:00'),
('ext-travel',        'Travel',            '2026-01-15 10:00:00'),
('ext-subscriptions', 'Subscriptions',     '2026-01-15 10:00:00'),
('ext-training',      'Training',          '2026-01-15 10:00:00'),
('ext-leased-staff',  'Leased Staff',      '2026-01-15 10:00:00'),
('ext-maint-sw',      'Maintenance SW',    '2026-01-15 10:00:00'),
('ext-maint-hw',      'Maintenance HW',    '2026-01-15 10:00:00'),
('ext-other',         'Other',             '2026-01-15 10:00:00');

-- =============================================================================
-- 8. people (~32 people)
-- =============================================================================

-- cc-muc-appdev (8 people, German names)
INSERT INTO people (id, name, role_type_id, cost_center_id, is_active, created_at, modified_at) VALUES
('p-brenner',  'Thomas Brenner',   'role-pm',     'cc-muc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-fischer',  'Lena Fischer',     'role-sr-dev', 'cc-muc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-wolf',     'Markus Wolf',      'role-dev',    'cc-muc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-bauer',    'Sophie Bauer',     'role-sa',     'cc-muc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-schmidt',  'Jan Schmidt',      'role-dev',    'cc-muc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-mueller',  'Eva Mueller',      'role-ba',     'cc-muc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-keller',   'Felix Keller',     'role-sr-dev', 'cc-muc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-hoffmann', 'Laura Hoffmann',   'role-test',   'cc-muc-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- cc-muc-infra (5 people, German names)
INSERT INTO people (id, name, role_type_id, cost_center_id, is_active, created_at, modified_at) VALUES
('p-wagner',  'Michael Wagner',    'role-sa',      'cc-muc-infra', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-braun',   'Stefan Braun',      'role-cloud',   'cc-muc-infra', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-richter', 'Katharina Richter', 'role-sysadmin','cc-muc-infra', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-lange',   'Peter Lange',       'role-cloud',   'cc-muc-infra', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-frank',   'Nina Frank',        'role-sysadmin','cc-muc-infra', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- cc-bud-appdev (6 people, Hungarian names)
INSERT INTO people (id, name, role_type_id, cost_center_id, is_active, created_at, modified_at) VALUES
('p-kovacs',  'Andras Kovacs',  'role-sr-dev', 'cc-bud-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-nagy',    'Zsolt Nagy',     'role-dev',    'cc-bud-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-szabo',   'Katalin Szabo',  'role-dev',    'cc-bud-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-varga',   'Peter Varga',    'role-test',   'cc-bud-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-toth',    'Maria Toth',     'role-sr-dev', 'cc-bud-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-horvath', 'Gabor Horvath',  'role-dev',    'cc-bud-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- cc-bud-bizsol (4 people, Hungarian names)
INSERT INTO people (id, name, role_type_id, cost_center_id, is_active, created_at, modified_at) VALUES
('p-kiss',    'Anna Kiss',      'role-ba',  'cc-bud-bizsol', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-molnar',  'Istvan Molnar',  'role-pm',  'cc-bud-bizsol', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-farkas',  'Eva Farkas',     'role-ba',  'cc-bud-bizsol', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-balogh',  'Tamas Balogh',   'role-dev', 'cc-bud-bizsol', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- cc-pun-appdev (4 people, Indian names — p-sharma is PL persona, cost_center NULL)
INSERT INTO people (id, name, role_type_id, cost_center_id, is_active, created_at, modified_at) VALUES
('p-sharma', 'Priya Sharma', 'role-pm',     NULL,            1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-patel',  'Rajesh Patel', 'role-sr-dev', 'cc-pun-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-kumar',  'Amit Kumar',   'role-dev',    'cc-pun-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-gupta',  'Neha Gupta',   'role-test',   'cc-pun-appdev', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- cc-pun-infra (3 people, Indian names)
INSERT INTO people (id, name, role_type_id, cost_center_id, is_active, created_at, modified_at) VALUES
('p-singh', 'Vikram Singh', 'role-sysadmin', 'cc-pun-infra', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-reddy', 'Deepa Reddy',  'role-cloud',    'cc-pun-infra', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-joshi', 'Arjun Joshi',  'role-sysadmin', 'cc-pun-infra', 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- Portfolio-level personas (no cost center)
INSERT INTO people (id, name, role_type_id, cost_center_id, is_active, created_at, modified_at) VALUES
('p-meier', 'Anna Meier',      'role-pm', NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('p-weber', 'Dr. Klaus Weber', 'role-pm', NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- =============================================================================
-- 9. programs
-- =============================================================================
INSERT INTO programs (id, name, lob_id, description, created_at) VALUES
('prog-dbp', 'Digital Braking Platform', 'lob-ts', 'Strategic program for next-gen braking systems', '2026-01-15 10:00:00'),
('prog-fms', 'Fleet Management Suite',   'lob-cv', 'Connected fleet management platform',            '2026-01-15 10:00:00');

-- =============================================================================
-- 10. projects (15 projects)
-- =============================================================================
INSERT INTO projects (id, name, description, lob_id, program_id, status, rag_status, capex_opex, start_month, end_month, projected_end_month, pl_person_id, is_service, annual_budget, total_budget, is_active, created_at, modified_at) VALUES
('proj-erp2',      'ERP Integration Phase 2',     'Enterprise ERP system integration — second phase with expanded scope',   'lob-ts', 'prog-dbp', 'active',           'red',   'capex', '2025-01', '2026-09', '2026-11', 'p-sharma',  0, NULL, 1200000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-sensor',    'Sensor Data Pipeline',         'Real-time sensor data ingestion and processing pipeline',               'lob-ts', 'prog-dbp', 'active',           'amber', 'capex', '2025-06', '2026-12', NULL,       'p-sharma',  0, NULL,  600000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-sap',       'SAP S/4HANA Migration',        'Enterprise-wide SAP platform migration to S/4HANA',                     'lob-ts', NULL,       'active',           'green', 'capex', '2024-01', '2026-06', NULL,       'p-molnar',  0, NULL, 2000000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-brake',     'Brake Control Unit Refresh',   'Hardware and software refresh of brake control unit systems',            'lob-ts', NULL,       'active',           'green', 'capex', '2025-03', '2026-03', NULL,       'p-kovacs',  0, NULL,  250000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-predmaint', 'Predictive Maintenance PoC',   'Proof of concept for ML-based predictive maintenance',                  'lob-rs', NULL,       'active',           'amber', 'capex', '2025-09', '2026-12', NULL,       'p-sharma',  0, NULL,  500000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-signal',    'Signaling System Upgrade',     'Upgrade rail signaling infrastructure to modern standard',              'lob-rs', NULL,       'active',           'green', 'capex', '2024-06', '2026-03', NULL,       'p-toth',    0, NULL, 1500000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-raildiag',  'Rail Diagnostics Platform',    'Platform for comprehensive rail system health diagnostics',             'lob-rs', NULL,       'active',           'green', 'capex', '2025-06', '2027-06', NULL,       'p-nagy',    0, NULL,  700000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-fleet',     'Fleet Portal v2',              'Next generation fleet management portal with real-time tracking',       'lob-cv', 'prog-fms', 'active',           'green', 'capex', '2025-01', '2026-06', NULL,       'p-horvath', 0, NULL,  450000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-telem',     'Telematics Dashboard',         'Connected vehicle telematics analytics dashboard',                      'lob-cv', 'prog-fms', 'active',           'amber', 'capex', '2025-09', '2026-09', '2026-10', 'p-balogh',  0, NULL,  300000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-cloud',     'Cloud Migration Wave 3',       'Third wave of on-premise workload migration to cloud',                  'lob-ts', NULL,       'active',           'green', 'opex',  '2025-06', '2026-06', NULL,       'p-braun',   0, NULL,  400000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-dwh',       'Data Warehouse Consolidation', 'Consolidate legacy data warehouse systems into unified platform',       'lob-rs', NULL,       'planned',          'green', 'capex', '2026-04', '2027-06', NULL,       NULL,        0, NULL,  550000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-aiml',      'AI/ML Experimentation Lab',    'Internal lab for AI/ML research and rapid prototyping',                 'lob-cv', NULL,       'planned',          'green', 'capex', '2026-06', '2027-03', NULL,       NULL,        0, NULL,  200000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-legacy',    'Legacy System Decommission',   'Decommission end-of-life legacy applications and data migration',      'lob-ts', NULL,       'completed',        'green', 'opex',  '2023-01', '2024-06', '2024-06', 'p-wagner',  0, NULL,  180000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-workshop',  'Workshop Management Tool',     'Digital tool for workshop scheduling and operations management',        'lob-rs', NULL,       'completed',        'green', 'capex', '2023-06', '2025-03', '2025-03', 'p-kiss',    0, NULL,  220000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('proj-autobrake', 'Autonomous Braking Prototype', 'Prototype autonomous emergency braking system for next-gen trucks',    'lob-ts', NULL,       'pending_approval', NULL,    'capex', '2026-06', '2027-12', NULL,       'p-sharma',  0, NULL,  900000.00, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- =============================================================================
-- 10b. services (8 operational services — is_service=1, no end_month)
-- =============================================================================
INSERT INTO projects (id, name, description, lob_id, program_id, status, rag_status, capex_opex, start_month, end_month, projected_end_month, pl_person_id, is_service, annual_budget, total_budget, is_active, created_at, modified_at) VALUES
('svc-sap-ops',   'SAP Basis Operations',          'Ongoing SAP Basis and platform operations',        'lob-ts', NULL, 'active', 'green', 'opex', '2020-01', NULL, NULL, NULL, 1, 400000.00, NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('svc-netsec',    'Network & Security Operations', 'Network infrastructure and security operations',   'lob-ts', NULL, 'active', 'green', 'opex', '2020-01', NULL, NULL, NULL, 1, 350000.00, NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('svc-euc',       'End User Computing Support',    'End user device and desktop support services',     'lob-ts', NULL, 'active', 'green', 'opex', '2020-01', NULL, NULL, NULL, 1, 200000.00, NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('svc-raildesk',  'Rail IT Service Desk',          'IT service desk for Rail Systems division',        'lob-rs', NULL, 'active', 'green', 'opex', '2020-01', NULL, NULL, NULL, 1, 250000.00, NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('svc-railmaint', 'Rail Application Maintenance',  'Application maintenance for Rail Systems apps',    'lob-rs', NULL, 'active', 'green', 'opex', '2020-01', NULL, NULL, NULL, 1, 300000.00, NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('svc-cvops',     'CV IT Operations',              'IT operations support for Commercial Vehicle LoB', 'lob-cv', NULL, 'active', 'green', 'opex', '2020-01', NULL, NULL, NULL, 1, 150000.00, NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('svc-middleware', 'Enterprise Middleware',         'Middleware integration platform operations',       'lob-ts', NULL, 'active', 'green', 'opex', '2020-01', NULL, NULL, NULL, 1, 280000.00, NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('svc-dba',       'Database Administration',        'Enterprise database administration services',     'lob-rs', NULL, 'active', 'green', 'opex', '2020-01', NULL, NULL, NULL, 1, 180000.00, NULL, 1, '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- =============================================================================
-- 11. demo_personas
-- =============================================================================
INSERT INTO demo_personas (id, person_id, role, display_name, title, default_module, managed_cost_center_id, owned_project_ids_json) VALUES
('persona-controller', 'p-meier',   'controller',        'Anna Meier',      'IT Financial Controller',             'portfolio', NULL,           NULL),
('persona-cc-owner',   'p-brenner', 'cost_center_owner', 'Thomas Brenner',  'Head of MUC Application Development', 'capacity',  'cc-muc-appdev', NULL),
('persona-pl',         'p-sharma',  'project_lead',      'Priya Sharma',    'Project Lead',                        'workbench', NULL,           '["proj-erp2","proj-sensor","proj-predmaint","proj-autobrake"]'),
('persona-exec',       'p-weber',   'executive',         'Dr. Klaus Weber', 'VP IT Strategy',                      'portfolio', NULL,           NULL);

-- =============================================================================
-- 12. planning_parameters
-- =============================================================================
INSERT INTO planning_parameters (key, name, description, current_value, default_value, data_type, param_group, created_at, modified_at) VALUES
('fiscal_year_start',   'Fiscal Year Start Month',    'The month in which the fiscal year begins',                'January', 'January', 'month',      'fiscal',     '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('planning_horizon',    'Planning Horizon (months)',   'Number of months in the forward planning window',         '24',      '24',      'integer',    'planning',   '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('rag_threshold_amber', 'RAG Amber Threshold (%)',     'Variance percentage at which status turns amber',         '5',       '5',       'percentage', 'thresholds', '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('rag_threshold_red',   'RAG Red Threshold (%)',       'Variance percentage at which status turns red',           '10',      '10',      'percentage', 'thresholds', '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('utilization_target',  'Target Utilization (%)',      'Target headcount utilization rate across cost centers',   '85',      '85',      'percentage', 'thresholds', '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
('scenario_cap',        'Maximum Scenarios per User',  'Maximum number of scenarios a user can maintain',         '10',      '10',      'integer',    'limits',     '2026-01-15 10:00:00', '2026-01-15 10:00:00');

-- =============================================================================
-- 13. kpi_definitions
-- =============================================================================
INSERT INTO kpi_definitions (name, description, formula, display_format, target_value, is_built_in, is_active, created_at) VALUES
('Total IT Budget',        'Sum of all project and service budgets',      'SUM(total_budget)',                'currency',   NULL, 1, 1, '2026-01-15 10:00:00'),
('YTD Spend',              'Actual spend year-to-date',                   'SUM(actuals WHERE year=current)',  'currency',   NULL, 1, 1, '2026-01-15 10:00:00'),
('Forecast at Completion', 'Total forecast across all active projects',   'SUM(forecasts)',                   'currency',   NULL, 1, 1, '2026-01-15 10:00:00'),
('Portfolio Variance',     'Aggregate variance percentage from baseline', '(forecast-baseline)/baseline*100', 'percentage', '5',  1, 1, '2026-01-15 10:00:00'),
('CapEx/OpEx Split',       'Ratio of CapEx to total budget',              'SUM(capex)/SUM(total)*100',        'percentage', '45', 1, 1, '2026-01-15 10:00:00'),
('Run/Change Ratio',       'Services vs Projects spending ratio',         'SUM(services)/SUM(total)*100',     'ratio',      '40', 1, 1, '2026-01-15 10:00:00'),
('Overall Utilization',    'Average utilization across all cost centers', 'AVG(utilization)',                 'percentage', '85', 1, 1, '2026-01-15 10:00:00');
