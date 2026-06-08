// scripts/seed-legislative-polls.mjs
// Generates and seeds one SurveyJS support poll per State Legislature race.
// Reads candidate data from races/generated/2026_sos_race_candidates.jsonc.
// Does NOT write individual JSONC files — builds survey JSON in memory.
// Does NOT create townhall_topics rows for legislative district polls.
//
// Usage:
//   node scripts/seed-legislative-polls.mjs --db=local --dry-run
//   node scripts/seed-legislative-polls.mjs --db=local --apply
//   node scripts/seed-legislative-polls.mjs --db=local --apply --race-slug=state-house-01-2026
//   node scripts/seed-legislative-polls.mjs --db=remote --apply --remote-confirm

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const reviewSourceFile = 'races/generated/2026_sos_race_candidates.jsonc';
const reviewSqlFile = 'races/generated/legislative_polls_seed.sql';

const SUPPORT_CHOICES = [
  'Strongly support',
  'Lean support',
  'Neutral or undecided',
  'Lean oppose',
  'Strongly oppose',
  'I need more information',
  'I am unfamiliar with this candidate',
];

const RACE_QUESTIONS = [
  { name: 'issue_most', type: 'text', title: 'Which issue matters most in this race?' },
  { name: 'quality_most', type: 'text', title: 'What quality matters most in a candidate for this office?' },
  { name: 'candidate_question', type: 'text', title: 'What question should every candidate in this race answer?' },
  {
    name: 'wyoming_comment',
    type: 'comment',
    title: 'Optional comment: What should candidates in this race understand about Wyoming?',
  },
];

const parseArgs = (argv) => {
  const args = {};
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, ...rest] = arg.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  });
  return args;
};

const loadReviewFile = () => {
  const filePath = path.join(rootDir, reviewSourceFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Review file not found: ${reviewSourceFile}. Run upsert-race-candidates-from-sos.mjs first.`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  // Strip leading // comment line
  const jsonStart = raw.indexOf('\n');
  return JSON.parse(raw.slice(jsonStart));
};

const slugToQuestionName = (candidateSlug) =>
  'support_' + candidateSlug.replace(/-/g, '_');

const buildSurveyJson = (race) => {
  const activeCandidates = race.candidates.filter((c) => c.filing_status !== 'withdrawn' && c.is_active !== 0);
  const candidateElements = activeCandidates.map((c) => ({
    type: 'radiogroup',
    name: slugToQuestionName(c.candidate_slug),
    title: `${c.candidate_name} — ${race.race_title}\n\nBased on what you know today, do you support this candidate for this office?`,
    choices: SUPPORT_CHOICES,
  }));

  const raceElements = RACE_QUESTIONS.map((q) => ({
    type: q.type,
    name: q.name,
    title: q.title,
  }));

  const estimatedMinutes = activeCandidates.length <= 2 ? 2 : 3;

  const survey = {
    title: `${race.race_title} — Candidate Support Poll`,
    description:
      `Share public sentiment on each candidate for the ${race.race_title}. ` +
      'This is a public sentiment poll, not an election prediction. Results are reported in aggregate only.',
    completedHtml: '<p>Thank you. Your response has been recorded as public sentiment for this race.</p>',
    showQuestionNumbers: 'off',
    questionTitleLocation: 'top',
    completeText: 'Submit',
    x_meta: {
      flow: 'standard',
      path: null,
      category_slug: `race-${race.race_slug}`,
      estimated_minutes: estimatedMinutes,
      featured: false,
      race_slug: race.race_slug,
    },
    pages: [
      {
        name: 'candidate_support',
        title: 'Candidate support',
        description: activeCandidates.length > 1
          ? 'Answer for each candidate you know. If you are unfamiliar with a candidate, select "I am unfamiliar with this candidate."'
          : undefined,
        elements: candidateElements,
      },
      {
        name: 'race_questions',
        title: 'Race questions',
        description: 'These questions are optional. Your answers help show what issues and qualities matter most in this race.',
        elements: raceElements,
      },
    ],
  };

  // Remove undefined description on candidate_support page for single-candidate races
  if (!survey.pages[0].description) {
    delete survey.pages[0].description;
  }

  return { survey, activeCandidates };
};

const jsonHash = (jsonText) =>
  crypto.createHash('sha256').update(jsonText).digest('hex');

const sqlEsc = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
};

const buildSqlForRace = (race, { version, publish, changelog }) => {
  const surveySlug = `race-${race.race_slug}`;
  const { survey, activeCandidates } = buildSurveyJson(race);
  const jsonText = JSON.stringify(survey);
  const hash = jsonHash(jsonText);
  const publishedAt = publish ? "datetime('now')" : 'NULL';
  const flowMeta = sqlEsc(JSON.stringify(survey.x_meta));

  let sql = `\n-- ${race.race_title} (${surveySlug})\n`;

  sql += `INSERT OR IGNORE INTO surveys (slug, scope, title, status, flow_type, flow_meta, created_at)
VALUES (${sqlEsc(surveySlug)}, 'wy', ${sqlEsc(survey.title)}, 'active', 'standard', ${flowMeta}, datetime('now'));

UPDATE surveys SET title = ${sqlEsc(survey.title)}, scope = 'wy', flow_type = 'standard', flow_meta = ${flowMeta}
WHERE slug = ${sqlEsc(surveySlug)};

INSERT INTO survey_versions (survey_id, version, json_text, json_hash, changelog, created_at, published_at)
SELECT id, ${version}, ${sqlEsc(jsonText)}, ${sqlEsc(hash)}, ${sqlEsc(changelog)}, datetime('now'), ${publishedAt}
FROM surveys WHERE slug = ${sqlEsc(surveySlug)}
ON CONFLICT(survey_id, version) DO UPDATE SET
  json_text = excluded.json_text,
  json_hash = excluded.json_hash,
  changelog = excluded.changelog,
  published_at = ${publishedAt};

UPDATE race_candidates
SET survey_slug = ${sqlEsc(surveySlug)}, updated_at = CURRENT_TIMESTAMP
WHERE race_slug = ${sqlEsc(race.race_slug)};
`;

  return { sql, surveySlug, hash, candidateCount: activeCandidates.length };
};

const runWranglerSql = ({ dbTarget, sql }) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legislative-polls-'));
  const sqlFile = path.join(tempDir, `legislative-polls-${Date.now()}.sql`);
  fs.writeFileSync(sqlFile, sql);

  const dbName = dbTarget === 'local' ? 'wy_local' : 'wy';
  const args = ['wrangler', 'd1', 'execute', dbName, '--file', sqlFile, '--config', 'wrangler.jsonc'];
  if (dbTarget === 'local') {
    args.push('--local');
  } else {
    args.push('--remote', '--env', 'production');
  }

  const result = spawnSync('npx', args, { stdio: 'inherit' });
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error('wrangler d1 execute failed');
  }
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const dbTarget = args.db || 'local';
  const apply = Boolean(args.apply);
  const dryRun = !apply || Boolean(args['dry-run']);
  const filterSlug = args['race-slug'] || null;
  const version = parseInt(args.version || '1', 10);
  const publish = args.publish !== 'false';
  const changelog = args.changelog || 'Add legislative district race poll';

  if (!['local', 'remote'].includes(dbTarget)) {
    throw new Error('Invalid --db. Use --db=local or --db=remote.');
  }
  if (dbTarget === 'remote' && (!apply || !args['remote-confirm'])) {
    throw new Error('Remote seeding requires --apply and --remote-confirm.');
  }

  const data = loadReviewFile();
  const allRaces = Object.values(data.races).filter((r) => r.race_category === 'State Legislature');

  const races = filterSlug ? allRaces.filter((r) => r.race_slug === filterSlug) : allRaces;

  if (races.length === 0) {
    console.log(filterSlug ? `No State Legislature race found with slug: ${filterSlug}` : 'No State Legislature races found.');
    return;
  }

  let fullSql = '-- scripts/seed-legislative-polls.mjs generated SQL\n';
  const useTransaction = dbTarget === 'local';
  if (useTransaction) fullSql += 'BEGIN TRANSACTION;\n';

  const summary = { total: races.length, totalCandidates: 0, skippedWithdrawn: 0, races: [] };

  races.forEach((race) => {
    const withdrawn = race.candidates.filter((c) => c.filing_status === 'withdrawn').length;
    const { sql, surveySlug, hash, candidateCount } = buildSqlForRace(race, { version, publish, changelog });
    fullSql += sql;
    summary.totalCandidates += candidateCount;
    summary.skippedWithdrawn += withdrawn;
    summary.races.push({ race_slug: race.race_slug, survey_slug: surveySlug, candidates: candidateCount, withdrawn, hash });
  });

  if (useTransaction) fullSql += '\nCOMMIT;\n';

  // Always write review SQL file
  const reviewPath = path.join(rootDir, reviewSqlFile);
  fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
  fs.writeFileSync(reviewPath, fullSql);
  console.log(`SQL written to ${reviewSqlFile}`);

  console.log('\nSummary:');
  console.log(`  Races: ${summary.total}`);
  console.log(`  Active candidates included: ${summary.totalCandidates}`);
  console.log(`  Withdrawn candidates skipped: ${summary.skippedWithdrawn}`);
  if (filterSlug) {
    console.log(`  Filter: ${filterSlug}`);
    summary.races.forEach((r) => {
      console.log(`  ${r.race_slug}: ${r.candidates} candidates, survey_slug=${r.survey_slug}`);
    });
  }

  if (dryRun) {
    console.log('\nDry run complete. Re-run with --apply to seed local D1.');
    return;
  }

  console.log(`\nApplying to ${dbTarget} D1...`);
  runWranglerSql({ dbTarget, sql: fullSql });
  console.log('Legislative poll seed complete.');
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
