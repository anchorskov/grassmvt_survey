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
  },
  'wy-public-school-funding-2026-v2': {
    slug: 'wy-public-school-funding-2026',
    file: 'surveys/surveys_wy_public_school_funding_2026_v2.jsonc',
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
    title: parsed.title || source.slug,
    flowType,
    flowMeta,
    jsonText,
    jsonHash,
  };
};

const buildSql = ({ slug, title, version, flowType, flowMeta, jsonText, jsonHash, publish, changelog }) => {
  const publishedAt = publish ? "datetime('now')" : 'NULL';
  const flowMetaValue = flowMeta ? `'${flowMeta.replace(/'/g, "''")}'` : 'NULL';
  return `
-- Seed survey ${slug} version ${version}
INSERT OR IGNORE INTO surveys (slug, scope, title, status, flow_type, flow_meta, created_at)
VALUES ('${slug.replace(/'/g, "''")}', 'public', '${title.replace(/'/g, "''")}', 'active', '${flowType}', ${flowMetaValue}, datetime('now'));

UPDATE surveys
SET title = '${title.replace(/'/g, "''")}',
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

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const dbTarget = args.db || 'local';
  const slugArg = args.slug || 'all';
  const version = Number(args.version || '1');
  const publish = args.publish !== 'false';
  const changelog = args.changelog || 'Seeded from JSONC source';

  if (!['local', 'preview', 'prod'].includes(dbTarget)) {
    throw new Error('Invalid --db, use local, preview, or prod');
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Invalid --version, must be a positive integer');
  }

  const targets =
    slugArg === 'all'
      ? Object.values(surveySources)
      : [surveySources[slugArg]].filter(Boolean);

  if (!targets.length) {
    throw new Error('Invalid --slug, use abortion, survey-process, security, or all');
  }

  const dbName = dbTarget === 'local' ? 'wy_local' : dbTarget === 'preview' ? 'wy_preview' : 'wy';
  const envName = dbTarget === 'preview' ? 'preview' : dbTarget === 'prod' ? 'production' : '';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'survey-seed-'));
  const sqlFile = path.join(tempDir, `seed-surveys-${Date.now()}.sql`);

  let sql = '-- Auto-generated seed file from JSONC sources\n';

  targets.forEach((source) => {
    const survey = loadSurvey(source);
    sql += buildSql({
      slug: survey.slug,
      title: survey.title,
      version,
      flowType: survey.flowType,
      flowMeta: survey.flowMeta,
      jsonText: survey.jsonText,
      jsonHash: survey.jsonHash,
      publish,
      changelog,
    });
    console.log(
      `Prepared ${survey.slug} v${version} hash ${survey.jsonHash} length ${survey.jsonText.length}`
    );
  });

  fs.writeFileSync(sqlFile, sql);
  runWrangler({ dbName, local: dbTarget === 'local', sqlFile, envName });
  fs.rmSync(sqlFile, { force: true });
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
