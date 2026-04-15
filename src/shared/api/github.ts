import type { PullRequest, CIStatus, ReviewStatus } from '../types';

const BASE_URL = 'https://api.github.com';

async function ghFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

interface GHUser {
  login: string;
  avatar_url: string;
}

interface GHPullRequest {
  id: number;
  number: number;
  title: string;
  html_url: string;
  user: GHUser;
  draft: boolean;
  created_at: string;
  updated_at: string;
  head: { sha: string; repo: { full_name: string } | null };
  base: { repo: { full_name: string } };
  mergeable_state?: string;
  requested_reviewers?: GHUser[];
}

interface GHReview {
  state: string;
  user: GHUser;
}

interface GHComment {
  id: number;
  in_reply_to_id?: number;
  body: string;
  user: GHUser;
}

export async function getAuthenticatedUser(token: string): Promise<{ login: string; avatar_url: string }> {
  return ghFetch('/user', token);
}

export async function getUserRepos(token: string): Promise<{ full_name: string }[]> {
  // Fetch personal repos
  const userRepos = await ghFetch<{ full_name: string }[]>(
    '/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member',
    token,
  );

  // Fetch orgs the user belongs to, then fetch repos from each org
  // Use type=member to include private repos the user has access to
  try {
    const orgs = await ghFetch<{ login: string }[]>('/user/orgs?per_page=100', token);
    const orgRepoLists = await Promise.all(
      orgs.flatMap((org) => [
        // type=member: repos the user is a member of (includes private)
        ghFetch<{ full_name: string }[]>(
          `/orgs/${org.login}/repos?sort=pushed&per_page=100&type=member`,
          token,
        ).catch(() => [] as { full_name: string }[]),
        // type=all: public repos in the org (in case membership is implicit)
        ghFetch<{ full_name: string }[]>(
          `/orgs/${org.login}/repos?sort=pushed&per_page=100&type=all`,
          token,
        ).catch(() => [] as { full_name: string }[]),
      ]),
    );

    // Merge and deduplicate
    const seen = new Set(userRepos.map((r) => r.full_name));
    const allRepos = [...userRepos];
    for (const orgRepos of orgRepoLists) {
      for (const repo of orgRepos) {
        if (!seen.has(repo.full_name)) {
          seen.add(repo.full_name);
          allRepos.push(repo);
        }
      }
    }
    return allRepos;
  } catch {
    // If org fetch fails (e.g. scope issue), return what we have
    return userRepos;
  }
}

export async function fetchPullRequests(
  token: string,
  repoFullName: string,
  username: string,
): Promise<PullRequest[]> {
  const prs = await ghFetch<GHPullRequest[]>(
    `/repos/${repoFullName}/pulls?state=open&per_page=50`,
    token,
  );

  const results = await Promise.all(
    prs.map((pr) => hydratePR(token, repoFullName, pr, username)),
  );

  return results;
}

async function hydratePR(
  token: string,
  repoFullName: string,
  pr: GHPullRequest,
  username: string,
): Promise<PullRequest> {
  // Fetch CI status, reviews, and comments in parallel
  const [ciStatus, reviews, comments] = await Promise.all([
    fetchCIStatus(token, repoFullName, pr.head.sha),
    ghFetch<GHReview[]>(`/repos/${repoFullName}/pulls/${pr.number}/reviews`, token),
    ghFetch<GHComment[]>(`/repos/${repoFullName}/pulls/${pr.number}/comments`, token),
  ]);

  const reviewStatus = deriveReviewStatus(reviews);
  const approvalCount = reviews.filter((r) => r.state === 'APPROVED').length;
  const unresolvedCommentCount = countUnresolvedComments(comments);
  const isReviewRequested = pr.requested_reviewers?.some((r) => r.login === username) ?? false;

  return {
    id: `github-${repoFullName}-${pr.number}`,
    platform: 'github',
    repo: repoFullName.split('/')[1],
    repoFullName,
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    author: pr.user.login,
    authorAvatarUrl: pr.user.avatar_url,
    isDraft: pr.draft,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    ciStatus,
    reviewStatus,
    approvalCount,
    unresolvedCommentCount,
    hasConflicts: pr.mergeable_state === 'dirty',
    isAuthor: pr.user.login === username,
    isReviewRequested,
  };
}

async function fetchCIStatus(token: string, repoFullName: string, headSha: string): Promise<CIStatus> {
  try {
    // Use the combined status endpoint for the PR's head commit
    const [combinedStatus, checkRuns] = await Promise.all([
      ghFetch<{ state: string }>(
        `/repos/${repoFullName}/commits/${headSha}/status`,
        token,
      ),
      ghFetch<{ total_count: number; check_runs: { status: string; conclusion: string | null }[] }>(
        `/repos/${repoFullName}/commits/${headSha}/check-runs`,
        token,
      ),
    ]);

    // Check runs (GitHub Actions, etc.)
    if (checkRuns.total_count > 0) {
      const runs = checkRuns.check_runs;

      const hasFailure = runs.some(
        (r) => r.conclusion === 'failure' || r.conclusion === 'timed_out',
      );
      if (hasFailure) return 'failed';

      const hasRunning = runs.some(
        (r) => r.status === 'in_progress' || r.status === 'queued',
      );
      if (hasRunning) return 'running';

      const allDone = runs.every((r) => r.status === 'completed');
      if (allDone) {
        const allSuccess = runs.every(
          (r) => r.conclusion === 'success' || r.conclusion === 'neutral' || r.conclusion === 'skipped',
        );
        return allSuccess ? 'passed' : 'failed';
      }

      return 'pending';
    }

    // Fall back to legacy commit status API
    switch (combinedStatus.state) {
      case 'success': return 'passed';
      case 'failure': case 'error': return 'failed';
      case 'pending': return 'running';
      default: return 'unknown';
    }
  } catch {
    return 'unknown';
  }
}

function deriveReviewStatus(reviews: GHReview[]): ReviewStatus {
  if (!reviews.length) return 'none';

  // Get latest review per user
  const latestByUser = new Map<string, string>();
  for (const r of reviews) {
    if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED') {
      latestByUser.set(r.user.login, r.state);
    }
  }

  const states = [...latestByUser.values()];
  if (states.includes('CHANGES_REQUESTED')) return 'changes_requested';
  if (states.includes('APPROVED')) return 'approved';
  return 'pending';
}

function countUnresolvedComments(comments: GHComment[]): number {
  // PR review comments that haven't been replied to are considered "unresolved"
  // GitHub doesn't have native resolved/unresolved tracking in the API,
  // so we count top-level review comments (those without in_reply_to_id)
  return comments.filter((c) => !c.in_reply_to_id).length;
}
