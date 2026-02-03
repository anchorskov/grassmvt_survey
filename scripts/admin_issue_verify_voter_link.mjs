// scripts/admin_issue_verify_voter_link.mjs
//
// Usage:
//   # Set the environment (preview or production) and run:
//   VERIFY_VOTER_BASE_URL=https://grassmvtsurvey-preview.anchorskov.workers.dev \
//     node scripts/admin_issue_verify_voter_link.mjs --email user@example.com --session <session-id>
//
//   - Replace user@example.com with the user's email (account must exist)
//   - Use your admin session id for --session (or use --cookie "session=..." if preferred)
//   - For production, set VERIFY_VOTER_BASE_URL to the production URL
//   - Optional: --notes "reason or context" --expires <minutes>
//
// Example:
//   VERIFY_VOTER_BASE_URL=https://grassmvtsurvey-preview.anchorskov.workers.dev \
//     node scripts/admin_issue_verify_voter_link.mjs --email pamela@pamelafaganhutchins.com --session abcd1234

import process from 'node:process';

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) {
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key.replace(/^--/, '')] = next;
      i += 1;
    } else {
      out[key.replace(/^--/, '')] = true;
    }
  }
  return out;
};

const args = parseArgs(process.argv.slice(2));
const email = args.email || '';
const notes = args.notes || '';
const expires = args.expires ? Number(args.expires) : undefined;
const baseUrl = process.env.VERIFY_VOTER_BASE_URL || 'http://localhost:8787';
const session = args.session || process.env.VERIFY_VOTER_SESSION || '';
const cookieHeader = args.cookie || (session ? `session=${session}` : '');

if (!email) {
  console.error('Missing required --email argument.');
  process.exit(1);
}

if (!cookieHeader) {
  console.error('Missing admin session. Use --cookie "session=..." or set VERIFY_VOTER_SESSION.');
  process.exit(1);
}

const payload = {
  target_email: email,
};
if (notes) {
  payload.notes = notes;
}
if (Number.isFinite(expires)) {
  payload.expires_minutes = expires;
}

const url = new URL('/api/admin/verify-voter/issue', baseUrl);

const run = async () => {
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    console.error(data.error || data.message || 'Request failed.');
    process.exit(1);
  }
  if (data.status === 'EMAIL_SENT') {
    console.log('Email sent');
    return;
  }
  if (data.link) {
    console.log('Email not configured, link is:');
    console.log(data.link);
    return;
  }
  console.log('Request completed');
};

run().catch((error) => {
  console.error(error.message || 'Request failed.');
  process.exit(1);
});
