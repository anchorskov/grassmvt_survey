// scripts/upsert-race-candidates-from-sos.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const defaultSource = 'races/source/2026_WY_Primary_Election_Candidates.csv';
const defaultReviewFile = 'races/generated/2026_sos_race_candidates.jsonc';
const officialSourceUrl = 'https://sos.wyo.gov/Elections/2026ElectionInformation.aspx';
const sourceLabel = 'Imported from Wyoming Secretary of State 2026 Unofficial Primary Election Candidates roster';

const expectedHeaders = [
  'Election',
  'Office Sought',
  'Party Affiliation',
  'Candidate Last Name',
  'Candidate First Name',
  'Candidate Middle Name',
  'Candidate Suffix',
  'Mailing Address',
  'Mailing City State & Zip',
  'Campaign Telephone',
  'Email Address',
  'Web Address',
  'Date Filed',
  'Date Withdrawn',
  'Ballot Name',
];

const parseArgs = (argv) => {
  const args = {};
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) {
      return;
    }
    const [key, ...rest] = arg.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  });
  return args;
};

const trim = (value) => String(value || '').trim();

const nullIfBlank = (value) => {
  const trimmed = trim(value);
  return trimmed ? trimmed : null;
};

const sqlValue = (value) => {
  if (value === null || typeof value === 'undefined') {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

const slugify = (value) =>
  trim(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/u\.?s\.?/g, 'us')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

const parseCsv = (input) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const nextChar = input[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map(trim);
  const missing = expectedHeaders.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`CSV is missing expected columns: ${missing.join(', ')}`);
  }

  return rows.slice(1).filter((values) => values.some((value) => trim(value))).map((values, rowIndex) => {
    const record = { rowNumber: rowIndex + 2 };
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    return record;
  });
};

const normalizeOffice = (officeSought) =>
  trim(officeSought)
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s+[^-]+$/i, '')
    .trim();

const districtNumber = (value) => {
  const match = trim(value).match(/(\d{1,2})$/);
  return match ? match[1].padStart(2, '0') : null;
};

const officeInfo = (officeSought) => {
  const office = normalizeOffice(officeSought).toUpperCase();
  const district = districtNumber(office);

  if (office === 'UNITED STATES SENATOR') {
    return {
      raceSlug: 'us-senate-2026',
      raceTitle: 'U.S. Senate, Wyoming, 2026',
      officeName: 'U.S. Senator',
      raceCategory: 'Federal',
      jurisdiction: 'Wyoming',
      districtType: null,
      districtNumber: null,
    };
  }
  if (office === 'UNITED STATES REPRESENTATIVE') {
    return {
      raceSlug: 'us-house-2026',
      raceTitle: 'U.S. House, Wyoming, 2026',
      officeName: 'U.S. Representative',
      raceCategory: 'Federal',
      jurisdiction: 'Wyoming',
      districtType: null,
      districtNumber: null,
    };
  }
  if (office === 'GOVERNOR') {
    return statewide('governor-2026', 'Governor, Wyoming, 2026', 'Governor');
  }
  if (office === 'SECRETARY OF STATE') {
    return statewide('secretary-of-state-2026', 'Secretary of State, Wyoming, 2026', 'Secretary of State');
  }
  if (office === 'STATE TREASURER') {
    return statewide('state-treasurer-2026', 'State Treasurer, Wyoming, 2026', 'State Treasurer');
  }
  if (office === 'STATE AUDITOR') {
    return statewide('state-auditor-2026', 'State Auditor, Wyoming, 2026', 'State Auditor');
  }
  if (office === 'SUPERINTENDENT OF PUBLIC INSTRUCTION') {
    return statewide(
      'superintendent-of-public-instruction-2026',
      'Superintendent of Public Instruction, Wyoming, 2026',
      'Superintendent of Public Instruction'
    );
  }
  if (office.startsWith('STATE SENATOR ') && district) {
    return {
      raceSlug: `state-senate-${district}-2026`,
      raceTitle: `Wyoming State Senate District ${district}, 2026`,
      officeName: 'State Senator',
      raceCategory: 'State Legislature',
      jurisdiction: 'Wyoming',
      districtType: 'state_senate',
      districtNumber: district,
    };
  }
  if (office.startsWith('STATE REPRESENTATIVE ') && district) {
    return {
      raceSlug: `state-house-${district}-2026`,
      raceTitle: `Wyoming State House District ${district}, 2026`,
      officeName: 'State Representative',
      raceCategory: 'State Legislature',
      jurisdiction: 'Wyoming',
      districtType: 'state_house',
      districtNumber: district,
    };
  }

  const safeOffice = normalizeOffice(officeSought);
  return {
    raceSlug: `${slugify(safeOffice)}-2026`,
    raceTitle: `${safeOffice}, Wyoming, 2026`,
    officeName: titleCase(safeOffice),
    raceCategory: 'County',
    jurisdiction: 'Wyoming',
    districtType: null,
    districtNumber: null,
  };
};

const statewide = (raceSlug, raceTitle, officeName) => ({
  raceSlug,
  raceTitle,
  officeName,
  raceCategory: 'Statewide',
  jurisdiction: 'Wyoming',
  districtType: null,
  districtNumber: null,
});

const titleCase = (value) =>
  trim(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

const candidateName = (record) => {
  const ballotName = trim(record['Ballot Name']);
  if (ballotName) {
    return ballotName.replace(/\s+/g, ' ');
  }
  return [
    record['Candidate First Name'],
    record['Candidate Middle Name'],
    record['Candidate Last Name'],
    record['Candidate Suffix'],
  ]
    .map(trim)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
};

const NON_URL_VALUES = new Set([
  'none', 'n/a', 'na', 'no', 'no website', 'not applicable', '-', 'n', 'tbd', 'no web', 'no site',
]);

const normalizeUrl = (value) => {
  const raw = trim(value);
  if (!raw) return null;
  if (NON_URL_VALUES.has(raw.toLowerCase())) return null;
  const schemeMatch = raw.match(/^(https?):\/\/(.+)$/i);
  if (schemeMatch) {
    return `${schemeMatch[1].toLowerCase()}://${schemeMatch[2].toLowerCase()}`;
  }
  return `https://${raw.toLowerCase()}`;
};

const sourceNote = (record, importDate) => {
  const parts = [
    sourceLabel,
    `Office Sought: ${trim(record['Office Sought']) || 'Unknown'}`,
    `Party Affiliation: ${trim(record['Party Affiliation']) || 'Unknown'}`,
    `Date Filed: ${trim(record['Date Filed']) || 'Unknown'}`,
  ];
  const withdrawn = trim(record['Date Withdrawn']);
  if (withdrawn) {
    parts.push(`Date Withdrawn: ${withdrawn}`);
  }
  parts.push(`Import date: ${importDate}`);
  return parts.join('; ');
};

const transformRows = (records, importDate) => {
  const rows = records.map((record) => {
    const info = officeInfo(record['Office Sought']);
    const name = candidateName(record);
    const withdrawn = Boolean(trim(record['Date Withdrawn']));
    return {
      row_number: record.rowNumber,
      race_slug: info.raceSlug,
      race_title: info.raceTitle,
      election_year: 2026,
      office_name: info.officeName,
      race_category: info.raceCategory,
      jurisdiction: info.jurisdiction,
      district_type: info.districtType,
      district_number: info.districtNumber,
      candidate_name: name,
      candidate_slug: slugify(name),
      filing_status: withdrawn ? 'withdrawn' : 'filed',
      campaign_website: normalizeUrl(record['Web Address']),
      public_email: nullIfBlank(record['Email Address'])?.toLowerCase() || null,
      public_phone: nullIfBlank(record['Campaign Telephone']),
      source_url: officialSourceUrl,
      source_note: sourceNote(record, importDate),
      survey_slug: null,
      wy_legislator_name: null,
      display_order: 0,
      is_active: withdrawn ? 0 : 1,
      last_reviewed_at: importDate,
      party_affiliation: trim(record['Party Affiliation']),
      original_office_sought: trim(record['Office Sought']),
      date_filed: trim(record['Date Filed']) || null,
      date_withdrawn: trim(record['Date Withdrawn']) || null,
    };
  });

  rows.sort((a, b) =>
    a.race_slug.localeCompare(b.race_slug) ||
    a.party_affiliation.localeCompare(b.party_affiliation) ||
    a.candidate_name.localeCompare(b.candidate_name) ||
    a.row_number - b.row_number
  );

  const seenSlugs = new Map();
  rows.forEach((row) => {
    const key = `${row.race_slug}:${row.candidate_slug}`;
    const count = seenSlugs.get(key) || 0;
    seenSlugs.set(key, count + 1);
    if (count > 0) {
      const suffix = slugify(row.party_affiliation) || `row-${row.row_number}`;
      row.candidate_slug = `${row.candidate_slug}-${suffix}`;
      const secondKey = `${row.race_slug}:${row.candidate_slug}`;
      if (seenSlugs.has(secondKey)) {
        row.candidate_slug = `${row.candidate_slug}-${row.row_number}`;
      }
    }
  });

  const raceOrders = new Map();
  rows.forEach((row) => {
    const next = (raceOrders.get(row.race_slug) || 0) + 1;
    raceOrders.set(row.race_slug, next);
    row.display_order = next;
  });

  return rows;
};

const groupByRace = (rows) => {
  const grouped = {};
  rows.forEach((row) => {
    if (!grouped[row.race_slug]) {
      grouped[row.race_slug] = {
        race_slug: row.race_slug,
        race_title: row.race_title,
        office_name: row.office_name,
        race_category: row.race_category,
        jurisdiction: row.jurisdiction,
        district_type: row.district_type,
        district_number: row.district_number,
        survey_slug: row.survey_slug,
        candidates: [],
      };
    }
    grouped[row.race_slug].candidates.push({ ...row });
  });
  return grouped;
};

const summarize = (records, rows) => {
  const races = groupByRace(rows);
  const candidatesByRace = Object.fromEntries(
    Object.entries(races).map(([raceSlug, race]) => [raceSlug, race.candidates.length])
  );
  return {
    totalRowsRead: records.length,
    rowsTransformed: rows.length,
    rowsSkipped: records.length - rows.length,
    racesFound: Object.keys(races).length,
    candidatesByRace,
    missingWebsiteCount: rows.filter((row) => !row.campaign_website).length,
    missingPhoneCount: rows.filter((row) => !row.public_phone).length,
    missingEmailCount: rows.filter((row) => !row.public_email).length,
    withdrawnCount: rows.filter((row) => row.filing_status === 'withdrawn').length,
  };
};

const writeReviewFile = (reviewFile, rows, summary) => {
  const target = path.join(rootDir, reviewFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const payload = {
    source_file: defaultSource,
    source_url: officialSourceUrl,
    generated_at: new Date().toISOString(),
    note: 'Transformed SOS candidate rows for review. Mailing address fields are intentionally omitted.',
    summary,
    races: groupByRace(rows),
  };
  fs.writeFileSync(target, `// ${reviewFile}\n${JSON.stringify(payload, null, 2)}\n`);
};

const legislatorExpression = (row) => {
  if (!row.district_type || !row.district_number) {
    return 'NULL';
  }
  const chamber = row.district_type === 'state_house' ? 'House' : 'Senate';
  return `(SELECT name FROM wy_legislators WHERE lower(name) = lower(${sqlValue(row.candidate_name)}) AND chamber = ${sqlValue(chamber)} AND district = ${sqlValue(row.district_number)} LIMIT 1)`;
};

const buildSql = (rows, { useTransaction = true } = {}) => {
  let sql = '-- scripts/upsert-race-candidates-from-sos.mjs generated SQL\n';
  if (useTransaction) sql += 'BEGIN TRANSACTION;\n';
  rows.forEach((row) => {
    const legislator = legislatorExpression(row);
    sql += `
UPDATE race_candidates
SET race_title = ${sqlValue(row.race_title)},
    election_year = ${sqlValue(row.election_year)},
    office_name = ${sqlValue(row.office_name)},
    race_category = ${sqlValue(row.race_category)},
    jurisdiction = ${sqlValue(row.jurisdiction)},
    district_type = ${sqlValue(row.district_type)},
    district_number = ${sqlValue(row.district_number)},
    candidate_name = ${sqlValue(row.candidate_name)},
    filing_status = ${sqlValue(row.filing_status)},
    campaign_website = ${sqlValue(row.campaign_website)},
    public_email = ${sqlValue(row.public_email)},
    public_phone = ${sqlValue(row.public_phone)},
    source_url = ${sqlValue(row.source_url)},
    source_note = ${sqlValue(row.source_note)},
    wy_legislator_name = ${legislator},
    survey_slug = ${sqlValue(row.survey_slug)},
    display_order = ${sqlValue(row.display_order)},
    is_active = ${sqlValue(row.is_active)},
    last_reviewed_at = ${sqlValue(row.last_reviewed_at)},
    updated_at = CURRENT_TIMESTAMP
WHERE race_slug = ${sqlValue(row.race_slug)}
  AND candidate_slug = ${sqlValue(row.candidate_slug)};

INSERT INTO race_candidates (
  race_slug,
  race_title,
  election_year,
  office_name,
  race_category,
  jurisdiction,
  district_type,
  district_number,
  candidate_name,
  candidate_slug,
  filing_status,
  campaign_website,
  public_email,
  public_phone,
  source_url,
  source_note,
  wy_legislator_name,
  survey_slug,
  display_order,
  is_active,
  last_reviewed_at,
  created_at,
  updated_at
)
SELECT
  ${sqlValue(row.race_slug)},
  ${sqlValue(row.race_title)},
  ${sqlValue(row.election_year)},
  ${sqlValue(row.office_name)},
  ${sqlValue(row.race_category)},
  ${sqlValue(row.jurisdiction)},
  ${sqlValue(row.district_type)},
  ${sqlValue(row.district_number)},
  ${sqlValue(row.candidate_name)},
  ${sqlValue(row.candidate_slug)},
  ${sqlValue(row.filing_status)},
  ${sqlValue(row.campaign_website)},
  ${sqlValue(row.public_email)},
  ${sqlValue(row.public_phone)},
  ${sqlValue(row.source_url)},
  ${sqlValue(row.source_note)},
  ${legislator},
  ${sqlValue(row.survey_slug)},
  ${sqlValue(row.display_order)},
  ${sqlValue(row.is_active)},
  ${sqlValue(row.last_reviewed_at)},
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM race_candidates
  WHERE race_slug = ${sqlValue(row.race_slug)}
    AND candidate_slug = ${sqlValue(row.candidate_slug)}
);
`;
  });
  if (useTransaction) sql += '\nCOMMIT;\n';
  return sql;
};

const runWranglerSql = ({ dbTarget, sql }) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'race-candidates-'));
  const sqlFile = path.join(tempDir, `upsert-race-candidates-${Date.now()}.sql`);
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

const printSummary = (summary) => {
  console.log('SOS race candidate import summary');
  console.log(`Rows read: ${summary.totalRowsRead}`);
  console.log(`Rows transformed: ${summary.rowsTransformed}`);
  console.log(`Rows skipped: ${summary.rowsSkipped}`);
  console.log(`Races found: ${summary.racesFound}`);
  console.log(`Missing website: ${summary.missingWebsiteCount}`);
  console.log(`Missing phone: ${summary.missingPhoneCount}`);
  console.log(`Missing email: ${summary.missingEmailCount}`);
  console.log(`Withdrawn: ${summary.withdrawnCount}`);
  console.log('Candidates by race:');
  Object.entries(summary.candidatesByRace)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([raceSlug, count]) => {
      console.log(`  ${raceSlug}: ${count}`);
    });
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const source = args.source || defaultSource;
  const dbTarget = args.db || 'local';
  const apply = Boolean(args.apply);
  const dryRun = !apply || Boolean(args['dry-run']);

  if (!['local', 'remote'].includes(dbTarget)) {
    throw new Error('Invalid --db. Use --db=local or --db=remote.');
  }
  if (dbTarget === 'remote' && (!apply || !args['remote-confirm'])) {
    throw new Error('Remote import requires --apply and --remote-confirm.');
  }

  const sourcePath = path.join(rootDir, source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source CSV not found: ${source}`);
  }

  const importDate = new Date().toISOString().slice(0, 10);
  const records = parseCsv(fs.readFileSync(sourcePath, 'utf8'));
  const rows = transformRows(records, importDate);
  const summary = summarize(records, rows);
  writeReviewFile(defaultReviewFile, rows, summary);
  printSummary(summary);
  console.log(`Review file written: ${defaultReviewFile}`);

  if (dryRun) {
    console.log('Dry run only. Re-run with --apply to write local D1.');
    return;
  }

  console.log(`Applying upsert to ${dbTarget} D1...`);
  runWranglerSql({ dbTarget, sql: buildSql(rows, { useTransaction: dbTarget === 'local' }) });
  console.log('Race candidate upsert complete.');
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
