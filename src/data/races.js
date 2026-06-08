// src/data/races.js
// Shared constants and placeholder data for all race pages.
// Real candidate data will come from race_candidates via the Worker API.

export const SUPPORT_CHOICES = [
  'Strongly support',
  'Lean support',
  'Neutral or undecided',
  'Lean oppose',
  'Strongly oppose',
  'I need more information',
  'I am unfamiliar with this candidate',
];

export const RETENTION_CHOICES = [
  'Strongly support retention',
  'Lean support retention',
  'Neutral or undecided',
  'Lean oppose retention',
  'Strongly oppose retention',
  'I need more information',
  'I am unfamiliar with this person',
];

export const SUPPORT_QUESTION = 'Based on what you know today, do you support this candidate for this office?';
export const RETENTION_QUESTION = 'Based on what you know today, do you support retaining this person in this role?';

export const RACE_POLL_QUESTIONS = [
  { name: 'issue-most', label: 'Which issue matters most in this race?', type: 'text' },
  { name: 'quality-most', label: 'What quality matters most in a candidate for this office?', type: 'text' },
  { name: 'candidate-question', label: 'What question should every candidate in this race answer?', type: 'text' },
  {
    name: 'wyoming-comment',
    label: 'Optional comment: What should candidates in this race understand about Wyoming?',
    type: 'textarea',
  },
];

export const RESULT_ROWS = [
  ['Support', 'Pending'],
  ['Oppose', 'Pending'],
  ['Undecided', 'Pending'],
  ['Need more information', 'Pending'],
  ['Unfamiliar with candidate', 'Pending'],
  ['Total responses', '0'],
  ['Verified Wyoming voter responses', '0'],
  ['Last updated', 'Not yet collected'],
];

export const RETENTION_RESULT_ROWS = [
  ['Support retention', 'Pending'],
  ['Oppose retention', 'Pending'],
  ['Undecided', 'Pending'],
  ['Need more information', 'Pending'],
  ['Unfamiliar with this person', 'Pending'],
  ['Total responses', '0'],
  ['Verified Wyoming voter responses', '0'],
  ['Last updated', 'Not yet collected'],
];

const PLACEHOLDER_NOTE = 'Placeholder data. Pending verified public-source review before publishing.';

// ── U.S. Senate ──────────────────────────────────────────────────────────────

export const US_SENATE_2026_CANDIDATES = [
  {
    name: 'Candidate A',
    slug: 'candidate-a',
    office: 'U.S. Senate, Wyoming, 2026',
    status: 'Placeholder — pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidate statement will be added when verified public information is available.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Candidate B',
    slug: 'candidate-b',
    office: 'U.S. Senate, Wyoming, 2026',
    status: 'Placeholder — pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidate statement will be added when verified public information is available.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Candidate C',
    slug: 'candidate-c',
    office: 'U.S. Senate, Wyoming, 2026',
    status: 'Placeholder — pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidate statement will be added when verified public information is available.',
    sourceNote: PLACEHOLDER_NOTE,
  },
];

// ── U.S. House ───────────────────────────────────────────────────────────────

export const US_HOUSE_2026_CANDIDATES = [
  {
    name: 'Candidate A',
    slug: 'candidate-a',
    office: 'U.S. House, Wyoming At-Large, 2026',
    status: 'Placeholder — pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidate statement will be added when verified public information is available.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Candidate B',
    slug: 'candidate-b',
    office: 'U.S. House, Wyoming At-Large, 2026',
    status: 'Placeholder — pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidate statement will be added when verified public information is available.',
    sourceNote: PLACEHOLDER_NOTE,
  },
];

// ── Governor ─────────────────────────────────────────────────────────────────

export const GOVERNOR_2026_CANDIDATES = [
  {
    name: 'Candidate A',
    slug: 'candidate-a',
    office: 'Governor, Wyoming, 2026',
    status: 'Placeholder — pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidate statement will be added when verified public information is available.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Candidate B',
    slug: 'candidate-b',
    office: 'Governor, Wyoming, 2026',
    status: 'Placeholder — pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidate statement will be added when verified public information is available.',
    sourceNote: PLACEHOLDER_NOTE,
  },
];

// ── Statewide Offices ─────────────────────────────────────────────────────────
// Office-level cards. Candidates will be added after public-source review.

export const STATEWIDE_OFFICES_2026_CARDS = [
  {
    name: 'Secretary of State',
    slug: 'secretary-of-state',
    office: 'Statewide, Wyoming, 2026',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: 'The Secretary of State oversees elections, business filings, and government records. Candidates for this office will be listed after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'State Treasurer',
    slug: 'state-treasurer',
    office: 'Statewide, Wyoming, 2026',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: "The State Treasurer manages Wyoming's financial assets and investment programs. Candidates will be listed after verified public-source review.",
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'State Auditor',
    slug: 'state-auditor',
    office: 'Statewide, Wyoming, 2026',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: "The State Auditor maintains Wyoming's financial accounts and official records. Candidates will be listed after verified public-source review.",
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Superintendent of Public Instruction',
    slug: 'superintendent',
    office: 'Statewide, Wyoming, 2026',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: "The Superintendent of Public Instruction leads Wyoming's public school system. Candidates will be listed after verified public-source review.",
    sourceNote: PLACEHOLDER_NOTE,
  },
];

// ── State Legislature ─────────────────────────────────────────────────────────
// Sample district cards. All 60 House and 30 Senate districts will be added
// as candidates are confirmed from verified public sources.

export const STATE_LEGISLATURE_2026_CARDS = [
  {
    name: 'House District 01',
    slug: 'house-district-01',
    office: 'Wyoming State House, District 1',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidates for this district will be added after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'House District 02',
    slug: 'house-district-02',
    office: 'Wyoming State House, District 2',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidates for this district will be added after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Senate District 01',
    slug: 'senate-district-01',
    office: 'Wyoming State Senate, District 1',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidates for this district will be added after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Senate District 02',
    slug: 'senate-district-02',
    office: 'Wyoming State Senate, District 2',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: 'Candidates for this district will be added after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
];

// ── County Offices ────────────────────────────────────────────────────────────
// Office-level cards for Wyoming's 23 counties. Candidates listed by county
// after verified public-source review.

export const COUNTY_OFFICES_2026_CARDS = [
  {
    name: 'County Commission',
    slug: 'county-commission',
    office: 'County Office, Wyoming',
    status: 'Candidates pending public-source review by county',
    website: null,
    contact: null,
    statement: "County commissioners govern local services, budgets, and land use. Candidates for each of Wyoming's 23 counties will be listed after verified public-source review.",
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'County Clerk',
    slug: 'county-clerk',
    office: 'County Office, Wyoming',
    status: 'Candidates pending public-source review by county',
    website: null,
    contact: null,
    statement: 'County clerks manage elections, records, and licenses at the local level. Candidates will be listed after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'County Sheriff',
    slug: 'county-sheriff',
    office: 'County Office, Wyoming',
    status: 'Candidates pending public-source review by county',
    website: null,
    contact: null,
    statement: 'County sheriffs lead local law enforcement. Candidates will be listed after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'County Treasurer',
    slug: 'county-treasurer',
    office: 'County Office, Wyoming',
    status: 'Candidates pending public-source review by county',
    website: null,
    contact: null,
    statement: 'County treasurers manage local tax collection and financial accounts. Candidates will be listed after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'County Attorney',
    slug: 'county-attorney',
    office: 'County Office, Wyoming',
    status: 'Candidates pending public-source review by county',
    website: null,
    contact: null,
    statement: 'County attorneys represent the county in legal matters and prosecute local cases. Candidates will be listed after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
];

// ── Local Boards ──────────────────────────────────────────────────────────────
// Office-level cards for school boards, councils, and special districts.

export const LOCAL_BOARDS_2026_CARDS = [
  {
    name: 'School Board',
    slug: 'school-board',
    office: 'Local Board, Wyoming',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: 'School board members set local education policy and oversee district budgets. Candidates will be listed after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'City or Town Council',
    slug: 'city-or-town-council',
    office: 'Local Board, Wyoming',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: 'City and town council members govern local ordinances, services, and budgets. Candidates will be listed after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Special Districts',
    slug: 'special-districts',
    office: 'Local Board, Wyoming',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: 'Special districts cover water, fire, recreation, and other local services. Candidates will be listed after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Other Local Boards',
    slug: 'other-local-boards',
    office: 'Local Board, Wyoming',
    status: 'Candidates pending public-source review',
    website: null,
    contact: null,
    statement: 'Additional local boards cover community-level services and governance. Candidates will be listed after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
];

// ── Judicial Retention ────────────────────────────────────────────────────────
// Person-level cards. Retention polls collect sentiment on whether each
// justice should continue to serve, not support for a candidate.

export const JUDICIAL_RETENTION_2026_PERSONS = [
  {
    name: 'Justice Placeholder A',
    slug: 'justice-placeholder-a',
    office: 'Wyoming Supreme Court',
    status: 'Pending verified public-source review',
    website: null,
    contact: null,
    statement: 'Judicial retention polls collect public sentiment on whether a justice should continue to serve. Person details will be added after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
  {
    name: 'Justice Placeholder B',
    slug: 'justice-placeholder-b',
    office: 'Wyoming Supreme Court',
    status: 'Pending verified public-source review',
    website: null,
    contact: null,
    statement: 'Judicial retention polls collect public sentiment on whether a justice should continue to serve. Person details will be added after verified public-source review.',
    sourceNote: PLACEHOLDER_NOTE,
  },
];
