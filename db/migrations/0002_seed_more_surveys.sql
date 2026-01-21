-- Migration: 0002_seed_more_surveys.sql
-- Purpose: Seed four additional Wyoming policy surveys with neutral, balanced questions
-- Note: Extends the existing surveys and survey_questions tables

-- ============================================================================
-- SEED DATA: Insert four new surveys
-- ============================================================================

INSERT INTO surveys (slug, scope, title, status, created_at)
VALUES
  ('property-taxes-services', 'wy', 'Property Taxes and Local Services', 'active', CURRENT_TIMESTAMP),
  ('cost-of-living', 'wy', 'Cost of Living: Inflation, Wages, and Housing', 'active', CURRENT_TIMESTAMP),
  ('immigration-priorities', 'wy', 'Immigration and Enforcement Priorities', 'active', CURRENT_TIMESTAMP),
  ('water-security-growth', 'wy', 'Water Security and Growth Pressure', 'active', CURRENT_TIMESTAMP);

-- ============================================================================
-- SEED DATA: Insert survey questions for property-taxes-services
-- ============================================================================
INSERT INTO survey_questions (survey_id, question_key, question_json, created_at)
SELECT
  s.id,
  'main_question_01',
  json('{"prompt":"Which approach to property taxes and local services do you most support?","policy_1":"Reduce property taxes substantially, even if it requires cutting local services.","policy_2":"Reduce property taxes modestly, with targeted service reductions where needed.","policy_3":"Keep property taxes steady and prioritize maintaining current service levels.","policy_4":"Increase relief for primary residences, keep funding stable by shifting costs to other property types.","policy_5":"Reform assessments and spending transparency first, then adjust taxes based on verified savings."}'),
  CURRENT_TIMESTAMP
FROM surveys s
WHERE s.slug = 'property-taxes-services';

-- ============================================================================
-- SEED DATA: Insert survey questions for cost-of-living
-- ============================================================================
INSERT INTO survey_questions (survey_id, question_key, question_json, created_at)
SELECT
  s.id,
  'main_question_01',
  json('{"prompt":"What policy approach would help most with cost of living pressures?","policy_1":"Focus on lowering prices through regulation rollbacks and reduced fees.","policy_2":"Increase wages through workforce development and targeted support for employers.","policy_3":"Expand housing supply by streamlining permits and zoning where communities approve.","policy_4":"Provide targeted household relief, such as tax credits or rebates for essentials.","policy_5":"Combine housing supply reforms with targeted relief and accountability for results."}'),
  CURRENT_TIMESTAMP
FROM surveys s
WHERE s.slug = 'cost-of-living';

-- ============================================================================
-- SEED DATA: Insert survey questions for immigration-priorities
-- ============================================================================
INSERT INTO survey_questions (survey_id, question_key, question_json, created_at)
SELECT
  s.id,
  'main_question_01',
  json('{"prompt":"Which immigration and enforcement priority approach do you most support?","policy_1":"Prioritize strict enforcement and faster removals for all unlawful entry.","policy_2":"Prioritize enforcement for serious crimes, with clearer rules for work authorization.","policy_3":"Strengthen border and hiring enforcement while protecting agriculture and essential workforce needs.","policy_4":"Expand legal pathways for workers and families, paired with strong verification and enforcement.","policy_5":"Focus on practical enforcement, faster legal processing, and employer accountability."}'),
  CURRENT_TIMESTAMP
FROM surveys s
WHERE s.slug = 'immigration-priorities';

-- ============================================================================
-- SEED DATA: Insert survey questions for water-security-growth
-- ============================================================================
INSERT INTO survey_questions (survey_id, question_key, question_json, created_at)
SELECT
  s.id,
  'main_question_01',
  json('{"prompt":"What standards should guide growth and water use in Wyoming?","policy_1":"Approve growth only when water supplies are proven sustainable long-term.","policy_2":"Require new industry to fully fund water infrastructure and conservation offsets.","policy_3":"Balance growth with conservation, using local control and clear water-use reporting.","policy_4":"Prioritize community needs first, limit large new water users unless benefits are exceptional.","policy_5":"Set statewide water standards for major projects, with transparent monitoring and enforcement."}'),
  CURRENT_TIMESTAMP
FROM surveys s
WHERE s.slug = 'water-security-growth';
