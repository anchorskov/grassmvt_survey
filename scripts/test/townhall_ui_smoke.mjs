import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

const BASE = 'http://localhost:8787';
const tests = [];

async function fetchHtml(url) {
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, text };
}

async function fetchJson(url) {
  const res = await fetch(url);
  const json = await res.json();
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function resultRow(name, pass, details = '') {
  return { name, pass, details };
}

async function run() {

  // NOTE: UI visibility assertions skipped due to jsdom module execution limits.
  console.log('\nUI visibility assertions skipped due to jsdom module execution limits.');

  // 1. Seeded topic API check

  const seededSlug = 'wy-health-care-costs-access-options';
  const missingSlug = 'surveys-abortion-v2';

  // 1. Seeded topic API check
  const seededApiResult = await fetchJson(`${BASE}/api/townhall/topic/${seededSlug}`);
  try {
    assert(seededApiResult.status === 200, 'Seeded topic API should return 200');
    assert(seededApiResult.json.ok === true, 'Seeded topic API ok:true');
    assert(seededApiResult.json.data && seededApiResult.json.data.topic, 'Seeded topic API has data.topic');
    tests.push(resultRow('API seeded topic', true));
  } catch (e) {
    tests.push(resultRow('API seeded topic', false, e.message));
  }

  // 2. Missing topic API check
  const missingApiResult = await fetchJson(`${BASE}/api/townhall/topic/${missingSlug}`);
  try {
    assert(missingApiResult.status === 404 || missingApiResult.json.ok === false, 'Missing topic API should 404 or ok:false');
    assert(missingApiResult.json.error && missingApiResult.json.error.code === 'TOPIC_NOT_FOUND', 'Missing topic API error code');
    tests.push(resultRow('API missing topic', true));
  } catch (e) {
    tests.push(resultRow('API missing topic', false, e.message));
  }

  // 3. Optional static DOM checks
  const seededUrl = `${BASE}/townhall/topic.html?slug=${seededSlug}`;
  const { text: seededHtml } = await fetchHtml(seededUrl);
  const seededDom = new JSDOM(seededHtml);
  const seededDoc = seededDom.window.document;
  const seededCompose = seededDoc.querySelector('#compose-card');
  if (!seededCompose) {
    tests.push(resultRow('Seeded topic static DOM', false, 'Missing #compose-card in seeded topic HTML'));
  } else {
    tests.push(resultRow('Seeded topic static DOM', true));
  }

  const missingUrl = `${BASE}/townhall/topic.html?slug=${missingSlug}`;
  const { text: missingHtml } = await fetchHtml(missingUrl);
  const missingDom = new JSDOM(missingHtml);
  const missingDoc = missingDom.window.document;
  const missingMissing = missingDoc.querySelector('#topic-missing');
  if (!missingMissing) {
    tests.push(resultRow('Missing topic static DOM', false, 'Missing #topic-missing in missing topic HTML'));
  } else {
    tests.push(resultRow('Missing topic static DOM', true));
  }

  // 3. API seeded topic
  const apiSeeded = await fetchJson(`${BASE}/api/townhall/topic/${seededSlug}`);
  try {
    assert(apiSeeded.status === 200, 'Seeded topic API should return 200');
    assert(apiSeeded.json.ok === true, 'Seeded topic API ok:true');
    assert(apiSeeded.json.data && apiSeeded.json.data.topic, 'Seeded topic API has data.topic');
    tests.push(resultRow('API seeded topic', true));
  } catch (e) {
    tests.push(resultRow('API seeded topic', false, e.message));
  }

  // 4. API missing topic
  const apiMissing = await fetchJson(`${BASE}/api/townhall/topic/${missingSlug}`);
  try {
    assert(apiMissing.status === 404 || apiMissing.json.ok === false, 'Missing topic API should 404 or ok:false');
    assert(apiMissing.json.error && apiMissing.json.error.code === 'TOPIC_NOT_FOUND', 'Missing topic API error code');
    tests.push(resultRow('API missing topic', true));
  } catch (e) {
    tests.push(resultRow('API missing topic', false, e.message));
  }

  // Output results
  console.log('\nTown Hall UI Smoke Test Results:');
  console.table(tests);
  const failed = tests.filter(t => !t.pass);
  if (failed.length) {
    console.log('\nFAILURES:');
    failed.forEach(f => console.log(`- ${f.name}: ${f.details}`));
    process.exit(1);
  } else {
    console.log('\nALL TESTS PASSED');
    process.exit(0);
  }
}

run().catch(e => {
  console.error('Test script error:', e);
  process.exit(2);
});
