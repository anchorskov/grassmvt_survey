// scripts/backfill-townhall-topics.mjs
/* scripts/backfill-townhall-topics.mjs */
import crypto from 'crypto';
import { spawnSync } from 'child_process';

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

const getDbTarget = (dbTarget) => {
  if (dbTarget === 'preview') {
    return { dbName: 'wy_preview', envName: 'preview', remote: true };
  }
  if (dbTarget === 'prod') {
    return { dbName: 'wy', envName: 'production', remote: true };
  }
  return { dbName: 'wy_local', envName: '', remote: false };
};

const runWranglerJson = ({ dbName, envName, remote, sql }) => {
  const args = ['wrangler', 'd1', 'execute', dbName, '--json', '--command', sql, '--config', 'wrangler.jsonc'];
  if (envName) {
    args.push('--env', envName);
  }
  args.push(remote ? '--remote' : '--local');

  const result = spawnSync('npx', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: process.env.HOME || '/tmp',
    },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'wrangler d1 execute failed');
  }

  const stdout = (result.stdout || '').trim();
  if (!stdout) {
    return [];
  }
  return JSON.parse(stdout);
};

const readResults = (payload) => {
  if (Array.isArray(payload) && payload[0] && Array.isArray(payload[0].results)) {
    return payload[0].results;
  }
  if (Array.isArray(payload.results)) {
    return payload.results;
  }
  return [];
};

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

const listMissingSql = `
SELECT
  s.id,
  s.slug,
  s.title
FROM surveys s
LEFT JOIN townhall_topics t
  ON t.survey_id = s.id
  OR (t.survey_id IS NULL AND t.survey_slug = s.slug)
WHERE s.status = 'active'
  AND t.id IS NULL
ORDER BY s.slug;
`;

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const dbTarget = args.db || 'local';
  const dryRun = args['dry-run'] !== 'false';

  if (!['local', 'preview', 'prod'].includes(dbTarget)) {
    throw new Error('Invalid --db, use local, preview, or prod');
  }

  const { dbName, envName, remote } = getDbTarget(dbTarget);
  const missingPayload = runWranglerJson({
    dbName,
    envName,
    remote,
    sql: listMissingSql,
  });
  const missing = readResults(missingPayload);

  if (!missing.length) {
    console.log(`No missing Town Hall topics found for ${dbTarget}.`);
    return;
  }

  console.log(`Missing Town Hall topics for ${dbTarget}:`);
  missing.forEach((row) => {
    console.log(`- ${row.slug}: ${row.title}`);
  });

  if (dryRun) {
    console.log('Dry run only. Re-run with --dry-run=false to create missing topics.');
    return;
  }

  const statements = missing.map((row) => {
    const topicId = crypto.randomUUID();
    return `
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
) VALUES (
  ${quote(topicId)},
  ${Number(row.id)},
  ${quote(row.slug)},
  ${quote(row.slug)},
  ${quote(row.title)},
  '',
  'active',
  datetime('now'),
  datetime('now')
);
`;
  });

  const insertSql = `BEGIN TRANSACTION;\n${statements.join('\n')}COMMIT;`;
  runWranglerJson({
    dbName,
    envName,
    remote,
    sql: insertSql,
  });

  console.log(`Created ${missing.length} Town Hall topic(s) for ${dbTarget}.`);
};

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
