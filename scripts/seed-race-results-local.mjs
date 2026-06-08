// scripts/seed-race-results-local.mjs
// Seeds fake aggregate results for local race polls so bar charts render.
// LOCAL ONLY — do not run against --db=prod.

import { execSync } from 'child_process';

const DB_FILE =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/99bdc0b8de231d05f2ac00926d893e11c30c6b7e8aabdfc46c1df46cb3adf846.sqlite';

const SUPPORT_CHOICES = [
  'Strongly support',
  'Lean support',
  'Neutral or undecided',
  'Lean oppose',
  'Strongly oppose',
  'I need more information',
  'I am unfamiliar with this candidate',
];

// Realistic-ish distribution weights per choice (will be randomised per candidate)
const BASE_WEIGHTS = [22, 18, 15, 12, 10, 13, 10];

function randomisedCounts(total, weights) {
  // Shuffle weights slightly so each candidate looks different
  const w = weights.map((v) => v + Math.floor(Math.random() * 8 - 4));
  const sum = w.reduce((a, b) => a + b, 0);
  const counts = w.map((v) => Math.max(1, Math.round((v / sum) * total)));
  // Correct rounding drift
  const diff = total - counts.reduce((a, b) => a + b, 0);
  counts[0] += diff;
  return counts;
}

function sqlEsc(s) {
  return s.replace(/'/g, "''");
}

function exec(sql) {
  try {
    execSync(`sqlite3 "${DB_FILE}" "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error('SQL error:', e.stderr?.toString()?.trim());
    throw e;
  }
}

function query(sql) {
  return execSync(`sqlite3 -json "${DB_FILE}" "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' })
    .toString()
    .trim();
}

// Surveys to seed: [survey_slug, survey_id, version_id]
const TARGETS = [
  { slug: 'race-us-senate-2026',  surveyId: 55, versionId: 50 },
  { slug: 'race-us-house-2026',   surveyId: 57, versionId: 52 },
  { slug: 'race-governor-2026',   surveyId: 56, versionId: 51 },
];

const GEO = { tier: 1, geo_type: 'all', geo_key: 'ALL' };
const RESPONSES_PER_CANDIDATE = 15;
const now = new Date().toISOString();

for (const t of TARGETS) {
  console.log(`\n── ${t.slug} (survey_id=${t.surveyId}, version_id=${t.versionId})`);

  // Load the survey JSON to find question names
  const raw = query(`SELECT json_text FROM survey_versions WHERE id=${t.versionId};`);
  const rows = JSON.parse(raw);
  if (!rows.length) { console.error('  version not found'); continue; }
  const surveyData = JSON.parse(rows[0].json_text);

  const questions = [];
  for (const page of surveyData.pages || []) {
    for (const el of page.elements || []) {
      if (el.type === 'radiogroup' && el.name?.startsWith('support_')) {
        questions.push(el.name);
      }
    }
  }
  console.log(`  Found ${questions.length} candidate questions: ${questions.join(', ')}`);

  const totalResponses = questions.length * RESPONSES_PER_CANDIDATE;

  // Upsert aggregate_rollups
  exec(
    `INSERT INTO aggregate_rollups (survey_id, survey_version_id, tier, geo_type, geo_key, response_count, updated_at)
     VALUES (${t.surveyId}, ${t.versionId}, ${GEO.tier}, '${GEO.geo_type}', '${GEO.geo_key}', ${totalResponses}, '${now}')
     ON CONFLICT(survey_id, survey_version_id, tier, geo_type, geo_key) DO UPDATE SET
       response_count = excluded.response_count,
       updated_at     = excluded.updated_at;`
  );
  console.log(`  Upserted rollup: ${totalResponses} responses`);

  // Delete old aggregates for this survey+version+geo
  exec(
    `DELETE FROM response_aggregates
     WHERE survey_id=${t.surveyId} AND survey_version_id=${t.versionId}
       AND tier=${GEO.tier} AND geo_type='${GEO.geo_type}' AND geo_key='${GEO.geo_key}';`
  );

  // Insert per-choice counts for each candidate question
  for (const qName of questions) {
    const counts = randomisedCounts(RESPONSES_PER_CANDIDATE, BASE_WEIGHTS);
    for (let i = 0; i < SUPPORT_CHOICES.length; i++) {
      const choice = sqlEsc(SUPPORT_CHOICES[i]);
      exec(
        `INSERT INTO response_aggregates
           (survey_id, survey_version_id, tier, geo_type, geo_key, question_name, choice_value, count, updated_at)
         VALUES (${t.surveyId}, ${t.versionId}, ${GEO.tier}, '${GEO.geo_type}', '${GEO.geo_key}',
                 '${qName}', '${choice}', ${counts[i]}, '${now}');`
      );
    }
    console.log(`  Seeded ${qName}: [${counts.join(', ')}]`);
  }
}

console.log('\nDone. Restart the local worker for results to appear.');
