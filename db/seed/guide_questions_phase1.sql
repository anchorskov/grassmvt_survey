-- db/seed/guide_questions_phase1.sql
-- Starting question set for statewide and legislative races (Phase 1).
-- Every candidate at the applicable office level receives the same questions.

INSERT INTO guide_questions (question_text, issue_category, applicable_to, display_order) VALUES

-- Economy (statewide + federal)
('Wyoming should reduce its dependence on mineral extraction revenue by diversifying the state tax base.',
 'economy', 'all', 10),

('The state legislature should be prohibited from spending more than it collects in a given fiscal year except during declared emergencies.',
 'economy', 'all', 20),

('Wyoming should prioritize reducing property taxes for owner-occupied primary residences.',
 'economy', 'statewide', 30),

-- Land & energy
('Federal management of Wyoming public lands should be reduced in favor of state or county control.',
 'land_use', 'all', 40),

('Wyoming should actively promote development of nuclear, wind, and solar energy alongside its coal and oil industries.',
 'energy', 'all', 50),

('Wyoming should oppose any federal carbon tax or cap-and-trade system that would increase costs for Wyoming energy producers.',
 'energy', 'federal', 60),

-- Constitutional & governance
('Wyoming officials should refuse to implement federal mandates that in their judgment conflict with the Wyoming Constitution.',
 'constitutional', 'all', 70),

('Changes to Wyoming constitutional rights should be placed directly before Wyoming voters rather than decided by the legislature alone.',
 'constitutional', 'statewide', 80),

-- Health care
('Wyoming should expand Medicaid eligibility to cover more low-income adults.',
 'health_care', 'statewide', 90),

('Decisions about abortion policy in Wyoming should be placed before Wyoming voters in a direct ballot measure.',
 'health_care', 'statewide', 100),

-- Education
('Wyoming should expand school choice options, including funding that follows students to approved non-public schools.',
 'education', 'statewide', 110),

('Local school boards should have final authority over curriculum decisions without legislative override.',
 'education', 'state_house', 120);
