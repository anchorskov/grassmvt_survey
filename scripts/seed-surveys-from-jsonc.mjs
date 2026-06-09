// scripts/seed-surveys-from-jsonc.mjs
/* scripts/seed-surveys-from-jsonc.mjs */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const surveySources = {
  'abortion-v2': {
    slug: 'abortion',
    file: 'surveys/surveys_abortion_v2.jsonc',
    scope: 'wy',
  },
  'wy-public-school-funding-2026-v2': {
    slug: 'wy-public-school-funding-2026',
    file: 'surveys/surveys_wy_public_school_funding_2026_v2.jsonc',
    scope: 'wy',
  },
  'wy-household-economic-outlook-v1': {
    slug: 'wy-household-economic-outlook',
    file: 'surveys/surveys_wy_household_economic_outlook_v1.jsonc',
    scope: 'wy',
  },
  'wy-health-care-costs-access-options-v1': {
    slug: 'wy-health-care-costs-access-options',
    file: 'surveys/surveys_wy_health_care_costs_access_options_v1.jsonc',
    scope: 'wy',
  },
  'cowboy-care-v1': {
    slug: 'cowboy-care',
    file: 'surveys/surveys_cowboy_care_v1.jsonc',
    scope: 'wy',
  },
  'wy-public-land-sales-v1': {
    slug: 'wy-public-land-sales',
    file: 'surveys/surveys_wy_public_land_sales_v1.jsonc',
    scope: 'wy',
  },
  'wy-roadless-areas-v1': {
    slug: 'wy-roadless-areas',
    file: 'surveys/surveys_wy_roadless_areas_v1.jsonc',
    scope: 'wy',
  },
  'grizzly-bear-delisting-v1': {
    slug: 'grizzly-bear-delisting',
    file: 'surveys/surveys_grizzly_bear_delisting_v1.jsonc',
    scope: 'wy',
  },
  'wy-marijuana-policy-v1': {
    slug: 'wy-marijuana-policy',
    file: 'surveys/surveys_wy_marijuana_policy_v1.jsonc',
    scope: 'wy',
  },
  'wy-time-change-v1': {
    slug: 'wy-time-change',
    file: 'surveys/surveys_wy_time_change_v1.jsonc',
    scope: 'wy',
  },
  'wy-voter-access-v1': {
    slug: 'wy-voter-access',
    file: 'surveys/surveys_wy_voter_access_v1.jsonc',
    scope: 'wy',
  },
  'wy-primary-elections-party-preselection-v1': {
    slug: 'wy-primary-elections-party-preselection',
    file: 'surveys/surveys_wy_primary_elections_party_preselection_v1.jsonc',
    scope: 'wy',
  },
  'wy-primary-election-participation-v1': {
    slug: 'wy-primary-election-participation',
    file: 'surveys/surveys_wy_primary_election_participation_v1.jsonc',
    scope: 'wy',
  },
  'wy-data-centers-v1': {
    slug: 'wy-data-centers',
    file: 'surveys/surveys_wy_data_centers_v1.jsonc',
    scope: 'wy',
  },
  'wy-family-four-pillars-v1': {
    slug: 'wy-family-four-pillars',
    file: 'surveys/surveys_wy_family_four_pillars_v1.jsonc',
    scope: 'wy',
  },
  'cost-of-living-v1': {
    slug: 'cost-of-living',
    file: 'surveys/surveys_cost_of_living_v1.jsonc',
  },
  'housing-v1': {
    slug: 'housing',
    file: 'surveys/surveys_housing_v1.jsonc',
  },
  'work-and-wages-v1': {
    slug: 'work-and-wages',
    file: 'surveys/surveys_work_and_wages_v1.jsonc',
  },
  'health-and-care-access-v1': {
    slug: 'health-and-care-access',
    file: 'surveys/surveys_health_and_care_access_v1.jsonc',
  },
  'education-and-opportunity-v1': {
    slug: 'education-and-opportunity',
    file: 'surveys/surveys_education_and_opportunity_v1.jsonc',
  },
  'local-economy-v1': {
    slug: 'local-economy',
    file: 'surveys/surveys_local_economy_v1.jsonc',
  },
  'public-safety-and-stability-v1': {
    slug: 'public-safety-and-stability',
    file: 'surveys/surveys_public_safety_and_stability_v1.jsonc',
  },
  'infrastructure-and-daily-systems-v1': {
    slug: 'infrastructure-and-daily-systems',
    file: 'surveys/surveys_infrastructure_and_daily_systems_v1.jsonc',
  },
  'trust-in-local-governance-v1': {
    slug: 'trust-in-local-governance',
    file: 'surveys/surveys_trust_in_local_governance_v1.jsonc',
  },
  'community-and-belonging-v1': {
    slug: 'community-and-belonging',
    file: 'surveys/surveys_community_and_belonging_v1.jsonc',
  },
  'military-force-ai-v1': {
    slug: 'military-force-ai',
    file: 'surveys/surveys_military_force_ai_v1.jsonc',
  },
  'digital-privacy-identity-v1': {
    slug: 'digital-privacy-identity',
    file: 'surveys/surveys_digital_privacy_identity_v1.jsonc',
  },
  'immigration-border-v1': {
    slug: 'immigration-border',
    file: 'surveys/surveys_immigration_border_v1.jsonc',
  },
  'energy-public-lands-v1': {
    slug: 'energy-public-lands',
    file: 'surveys/surveys_energy_public_lands_v1.jsonc',
  },
  'trust-institutions-shared-truth-v1': {
    slug: 'trust-institutions-shared-truth',
    file: 'surveys/surveys_trust-institutions-shared-truth_v1.jsonc',
  },
  'security-feedback-v1': {
    slug: 'security-feedback',
    file: 'surveys/surveys_security_feedback_v1.jsonc',
    scope: 'public',
  },
  // Race polls — skipTownhall: true prevents Town Hall topic creation.
  // Race polls are candidate support polls, not community issue discussions.
  'race-us-senate-2026-v1': {
    slug: 'race-us-senate-2026',
    file: 'surveys/race_us-senate-2026_v1.jsonc',
    scope: 'wy',
    skipTownhall: true,
  },
  'race-us-house-2026-v1': {
    slug: 'race-us-house-2026',
    file: 'surveys/race_us-house-2026_v1.jsonc',
    scope: 'wy',
    skipTownhall: true,
  },
  'race-governor-2026-v1': {
    slug: 'race-governor-2026',
    file: 'surveys/race_governor-2026_v1.jsonc',
    scope: 'wy',
    skipTownhall: true,
  },
  'race-secretary-of-state-2026-v1': {
    slug: 'race-secretary-of-state-2026',
    file: 'surveys/race_secretary-of-state-2026_v1.jsonc',
    scope: 'wy',
    skipTownhall: true,
  },
  'race-state-treasurer-2026-v1': {
    slug: 'race-state-treasurer-2026',
    file: 'surveys/race_state-treasurer-2026_v1.jsonc',
    scope: 'wy',
    skipTownhall: true,
  },
  'race-state-auditor-2026-v1': {
    slug: 'race-state-auditor-2026',
    file: 'surveys/race_state-auditor-2026_v1.jsonc',
    scope: 'wy',
    skipTownhall: true,
  },
  'race-superintendent-2026-v1': {
    slug: 'race-superintendent-2026',
    file: 'surveys/race_superintendent-2026_v1.jsonc',
    scope: 'wy',
    skipTownhall: true,
  },
};

const parseArgs = (argv) => {
  const args = {};
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) {
      return;
    }
    const [key, ...rest] = arg.slice(2).split('=');
    args[key] = rest.join('=');
  });
  return args;
};

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const stripJsonc = (input) => {
  let output = '';
  let inString = false;
  let stringChar = '';
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const nextChar = input[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === '\\') {
        escaping = true;
        continue;
      }
      if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      output += char;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    output += char;
  }

  return output;
};

const stableStringify = (value) => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'undefined') {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
};

const sha256Hex = (text) =>
  crypto.createHash('sha256').update(text).digest('hex');

const loadSurvey = (source) => {
  const filePath = path.join(rootDir, source.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Survey file not found: ${source.file}`);
  }
  const jsoncText = fs.readFileSync(filePath, 'utf8');
  const stripped = stripJsonc(jsoncText);
  const parsed = JSON.parse(stripped);
  const meta = parsed.x_meta || {};
  const flowType = meta.flow === 'sectioned' || meta.sectionExitEnabled ? 'sectioned' : 'standard';
  const flowMeta = Object.keys(meta).length ? JSON.stringify(meta) : null;
  const jsonText = stableStringify(parsed);
  const jsonHash = sha256Hex(jsonText);
  return {
    slug: source.slug,
    scope: source.scope || 'public',
    title: parsed.title || source.slug,
    flowType,
    flowMeta,
    jsonText,
    jsonHash,
  };
};

const buildSql = ({
  slug,
  scope,
  title,
  version,
  flowType,
  flowMeta,
  jsonText,
  jsonHash,
  publish,
  changelog,
  topicId,
  skipTownhall,
}) => {
  const publishedAt = publish ? "datetime('now')" : 'NULL';
  const flowMetaValue = flowMeta ? `'${flowMeta.replace(/'/g, "''")}'` : 'NULL';
  const safeScope = scope === 'wy' ? 'wy' : 'public';
  return `
-- Seed survey ${slug} version ${version}
INSERT OR IGNORE INTO surveys (slug, scope, title, status, flow_type, flow_meta, created_at)
VALUES ('${slug.replace(/'/g, "''")}', '${safeScope}', '${title.replace(/'/g, "''")}', 'active', '${flowType}', ${flowMetaValue}, datetime('now'));

UPDATE surveys
SET title = '${title.replace(/'/g, "''")}',
    scope = '${safeScope}',
    flow_type = '${flowType}',
    flow_meta = ${flowMetaValue}
WHERE slug = '${slug.replace(/'/g, "''")}';

INSERT INTO survey_versions (
  survey_id,
  version,
  json_text,
  json_hash,
  changelog,
  created_at,
  published_at
)
SELECT
  id,
  ${version},
  '${jsonText.replace(/'/g, "''")}',
  '${jsonHash}',
  '${changelog.replace(/'/g, "''")}',
  datetime('now'),
  ${publishedAt}
FROM surveys
WHERE slug = '${slug.replace(/'/g, "''")}'
ON CONFLICT(survey_id, version) DO UPDATE SET
  json_text = excluded.json_text,
  json_hash = excluded.json_hash,
  changelog = excluded.changelog,
  published_at = ${publishedAt};

${skipTownhall ? '' : `
INSERT OR IGNORE INTO townhall_topics (
  id,
  survey_id,
  survey_slug,
  slug,
  title,
  description,
  status,
  created_at,
  updated_at
)
SELECT
  '${topicId}',
  id,
  slug,
  slug,
  title,
  '',
  'active',
  datetime('now'),
  datetime('now')
FROM surveys
WHERE slug = '${slug.replace(/'/g, "''")}';

UPDATE townhall_topics
SET survey_id = (SELECT id FROM surveys WHERE slug = '${slug.replace(/'/g, "''")}'),
    survey_slug = '${slug.replace(/'/g, "''")}',
    slug = '${slug.replace(/'/g, "''")}',
    title = '${title.replace(/'/g, "''")}',
    status = 'active',
    updated_at = datetime('now')
WHERE survey_slug = '${slug.replace(/'/g, "''")}'
   OR survey_id = (SELECT id FROM surveys WHERE slug = '${slug.replace(/'/g, "''")}');
`}
`;
};

const runWrangler = ({ dbName, local, sqlFile, envName }) => {
  const args = [
    'd1',
    'execute',
    dbName,
    '--file',
    sqlFile,
    '--config',
    'wrangler.jsonc',
  ];
  if (envName) {
    args.push('--env', envName);
  }
  if (local) {
    args.push('--local');
  } else {
    args.push('--remote');
  }
  const result = spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('wrangler d1 execute failed');
  }
};

const buildSeedCommand = ({
  dbTarget,
  slug,
  version,
  publish,
  changelog,
}) =>
  [
    'node',
    'scripts/seed-surveys-from-jsonc.mjs',
    `--db=${dbTarget}`,
    `--slug=${slug}`,
    `--version=${version}`,
    `--publish=${publish ? 'true' : 'false'}`,
    `--changelog=${shellQuote(changelog)}`,
  ].join(' ');

const logProductionReminder = ({
  dbTarget,
  slugArg,
  targets,
  version,
  publish,
  changelog,
  remindProd,
}) => {
  if (dbTarget === 'prod' || !remindProd) {
    return;
  }

  console.log('');
  console.log('Production follow-up required if these surveys should be live on production.');
  console.log('Deploying code does not seed production D1 survey rows.');

  if (slugArg === 'all') {
    console.log('This run targeted all registered survey sources.');
    console.log('After local verification, seed production explicitly for the source keys you changed.');
    console.log(
      `Example: ${buildSeedCommand({
        dbTarget: 'prod',
        slug: '<source-key>',
        version,
        publish,
        changelog,
      })}`
    );
    console.log('Avoid using --slug=all on production unless you intentionally want one shared DB version across every selected survey.');
    return;
  }

  console.log('After local verification, run:');
  targets.forEach((source) => {
    console.log(
      `  ${buildSeedCommand({
        dbTarget: 'prod',
        slug: source.key,
        version,
        publish,
        changelog,
      })}`
    );
  });
  console.log(
    'Then verify the remote rows with: npx wrangler d1 execute wy --remote --env production --config wrangler.jsonc --command "SELECT s.slug, v.version, v.json_hash FROM survey_versions v JOIN surveys s ON s.id = v.survey_id ORDER BY s.slug, v.version"'
  );
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const dbTarget = args.db || 'local';
  const slugArg = args.slug || 'all';
  const version = Number(args.version || '1');
  const publish = args.publish !== 'false';
  const changelog = args.changelog || 'Seeded from JSONC source';
  const remindProd = args['remind-prod'] !== 'false';

  if (!['local', 'preview', 'prod'].includes(dbTarget)) {
    throw new Error('Invalid --db, use local, preview, or prod');
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Invalid --version, must be a positive integer');
  }

  const targets =
    slugArg === 'all'
      ? Object.entries(surveySources).map(([key, source]) => ({ key, ...source }))
      : [[slugArg, surveySources[slugArg]]]
          .filter(([, source]) => Boolean(source))
          .map(([key, source]) => ({ key, ...source }));

  if (!targets.length) {
    throw new Error(`Invalid --slug, use one of: ${Object.keys(surveySources).join(', ')}, or all`);
  }

  const dbName = dbTarget === 'local' ? 'wy_local' : dbTarget === 'preview' ? 'wy_preview' : 'wy';
  const envName = dbTarget === 'preview' ? 'preview' : dbTarget === 'prod' ? 'production' : '';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'survey-seed-'));
  const sqlFile = path.join(tempDir, `seed-surveys-${Date.now()}.sql`);

  const useTransaction = dbTarget === 'local';
  let sql = '-- Auto-generated seed file from JSONC sources\n';
  if (useTransaction) {
    sql += 'BEGIN TRANSACTION;\n';
  }

  targets.forEach((source) => {
    const survey = loadSurvey(source);
    sql += buildSql({
      slug: survey.slug,
      scope: survey.scope,
      title: survey.title,
      version,
      flowType: survey.flowType,
      flowMeta: survey.flowMeta,
      jsonText: survey.jsonText,
      jsonHash: survey.jsonHash,
      publish,
      changelog,
      topicId: crypto.randomUUID(),
      skipTownhall: Boolean(source.skipTownhall),
    });
    console.log(
      `Prepared ${survey.slug} v${version} hash ${survey.jsonHash} length ${survey.jsonText.length}`
    );
  });

  if (useTransaction) {
    sql += '\nCOMMIT;\n';
  }

  fs.writeFileSync(sqlFile, sql);
  runWrangler({ dbName, local: dbTarget === 'local', sqlFile, envName });
  fs.rmSync(sqlFile, { force: true });
  logProductionReminder({
    dbTarget,
    slugArg,
    targets,
    version,
    publish,
    changelog,
    remindProd,
  });
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
