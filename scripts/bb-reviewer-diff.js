#!/usr/bin/env node
// Diagnostic for the Bitbucket "default reviewer is missed by Review tab" bug.
//
// Compares the PR list endpoint (what PR Radar currently uses) against the
// individual PR endpoint, for the same PRs, and reports whether the reviewers
// arrays differ in shape or contents — specifically whether default reviewers
// come back with a stripped user object (no uuid) or are missing entirely.
//
// Usage:
//   BB_EMAIL=you@example.com BB_TOKEN=ATATT... \
//     node scripts/bb-reviewer-diff.js <workspace>/<repo> [pr-id]
//
// Requires Node 18+ (native fetch).

const [, , repoArg, prIdArg] = process.argv;

if (!repoArg || !repoArg.includes('/')) {
  console.error('Usage: BB_EMAIL=... BB_TOKEN=... node scripts/bb-reviewer-diff.js <workspace>/<repo> [pr-id]');
  process.exit(1);
}

const email = process.env.BB_EMAIL;
const token = process.env.BB_TOKEN;
const auth = email && token ? Buffer.from(`${email}:${token}`).toString('base64') : null;
if (!auth) {
  console.error('(no BB_EMAIL/BB_TOKEN provided — running unauthenticated; only works on public repos)');
}

async function bb(path) {
  const url = path.startsWith('http') ? path : `https://api.bitbucket.org/2.0${path}`;
  const headers = { Accept: 'application/json' };
  if (auth) headers.Authorization = `Basic ${auth}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} on ${path}\n${body.slice(0, 300)}`);
  }
  return res.json();
}

function userOf(reviewerEntry) {
  // Bitbucket's reviewer entries are sometimes the user object itself,
  // sometimes wrapped in { user: {...} }. Normalise.
  return reviewerEntry?.user ?? reviewerEntry ?? null;
}

function summarise(user) {
  if (!user) return '(null)';
  return {
    uuid: user.uuid ?? '(missing)',
    nickname: user.nickname ?? '(missing)',
    display_name: user.display_name ?? '(missing)',
    keys: Object.keys(user).sort().join(','),
  };
}

function printReviewers(label, list) {
  console.log(`  ${label} (count=${list.length})`);
  list.forEach((r, i) => {
    const u = summarise(userOf(r));
    console.log(`    [${i}] uuid=${u.uuid}  nickname=${u.nickname}  keys=[${u.keys}]`);
  });
}

async function diffPr(summaryPr) {
  console.log(`\n=== PR #${summaryPr.id}: ${summaryPr.title} ===`);

  const summaryReviewers = summaryPr.reviewers ?? [];
  const summaryParticipants = summaryPr.participants ?? [];

  printReviewers('LIST endpoint  reviewers', summaryReviewers);
  console.log(`    participants count=${summaryParticipants.length}`);

  const detail = await bb(`/repositories/${repoArg}/pullrequests/${summaryPr.id}`);
  const detailReviewers = detail.reviewers ?? [];
  const detailParticipants = detail.participants ?? [];

  printReviewers('DETAIL endpoint reviewers', detailReviewers);
  console.log(`    participants count=${detailParticipants.length}`);

  // Diff by uuid
  const summaryUuids = new Set(summaryReviewers.map((r) => userOf(r)?.uuid).filter(Boolean));
  const detailUuids = new Set(detailReviewers.map((r) => userOf(r)?.uuid).filter(Boolean));
  const inDetailOnly = [...detailUuids].filter((u) => !summaryUuids.has(u));
  const inListOnly = [...summaryUuids].filter((u) => !detailUuids.has(u));
  const listReviewersWithoutUuid = summaryReviewers.filter((r) => !userOf(r)?.uuid).length;

  console.log('  --- DIFF ---');
  console.log(`    Reviewer UUIDs present in DETAIL but missing from LIST: ${inDetailOnly.length ? inDetailOnly.join(', ') : 'none'}`);
  console.log(`    Reviewer UUIDs present in LIST but missing from DETAIL: ${inListOnly.length ? inListOnly.join(', ') : 'none'}`);
  console.log(`    Reviewers in LIST with NO uuid field:                   ${listReviewersWithoutUuid}`);

  if (inDetailOnly.length || listReviewersWithoutUuid) {
    console.log('  >>> Hypothesis confirmed: list endpoint is dropping/stripping reviewers.');
  } else {
    console.log('  Hypothesis NOT confirmed for this PR: list and detail agree.');
  }
}

async function main() {
  console.log(`\nFetching open PRs from ${repoArg}...`);
  const list = await bb(`/repositories/${repoArg}/pullrequests?state=OPEN&pagelen=50`);

  const candidates = prIdArg
    ? list.values.filter((p) => String(p.id) === String(prIdArg))
    : list.values.slice(0, 5);

  if (!candidates.length) {
    console.log(prIdArg
      ? `PR #${prIdArg} not in the first page of open PRs.`
      : 'No open PRs found.');
    return;
  }

  console.log(`Inspecting ${candidates.length} PR(s)...`);
  for (const pr of candidates) {
    try {
      await diffPr(pr);
    } catch (err) {
      console.error(`  Error inspecting PR #${pr.id}: ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
