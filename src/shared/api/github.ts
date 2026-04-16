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
  type?: string;
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

export interface GHReview {
  state: string;
  user: GHUser;
  commit_id: string;
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

export async function mergePullRequest(
  token: string,
  repoFullName: string,
  prNumber: number,
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${BASE_URL}/repos/${repoFullName}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      return { success: true, message: 'Pull request merged successfully' };
    }
    const body = await res.json().catch(() => ({}));
    return { success: false, message: body.message || `Merge failed: ${res.status} ${res.statusText}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Merge failed' };
  }
}

export async function checkIfMerged(token: string, repoFullName: string, prNumber: number): Promise<boolean> {
  try {
    const pr = await ghFetch<{ merged: boolean }>(`/repos/${repoFullName}/pulls/${prNumber}`, token);
    return pr.merged;
  } catch {
    return false;
  }
}

export async function refreshCIStatus(token: string, repoFullName: string, headSha: string): Promise<{ status: CIStatus; failedChecks: string[] }> {
  return fetchCIStatus(token, repoFullName, headSha);
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
  // Fetch CI status, reviews, unresolved threads, and deployments in parallel
  const [ciResult, reviews, graphqlDetails, deployment] = await Promise.all([
    fetchCIStatus(token, repoFullName, pr.head.sha),
    ghFetch<GHReview[]>(`/repos/${repoFullName}/pulls/${pr.number}/reviews`, token),
    fetchGraphQLDetails(token, repoFullName, pr.number),
    fetchDeployment(token, repoFullName, pr.head.sha),
  ]);

  const reviewStatus = deriveReviewStatus(reviews);
  const approvals = reviews.filter((r) => r.state === 'APPROVED');
  const approvalCount = approvals.length;
  const approvedBy = [...new Set(approvals.map((r) => r.user.login))];
  const isReviewRequested = pr.requested_reviewers?.some((r) => r.login === username) ?? false;
  const hasReviewed = checkHasReviewed(reviews, username, pr.head.sha);

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
    ciStatus: ciResult.status,
    ciFailedChecks: ciResult.failedChecks.length > 0 ? ciResult.failedChecks : undefined,
    reviewStatus,
    approvalCount,
    approvedBy: approvedBy.length > 0 ? approvedBy : undefined,
    unresolvedCommentCount: graphqlDetails.unresolvedCommentCount,
    hasConflicts: graphqlDetails.hasConflicts,
    isAuthor: pr.user.login === username,
    isBot: pr.user.type === 'Bot',
    isReviewRequested,
    hasReviewed,
    headSha: pr.head.sha,
    deployment,
  };
}

interface CIResult {
  status: CIStatus;
  failedChecks: string[];
}

async function fetchCIStatus(token: string, repoFullName: string, headSha: string): Promise<CIResult> {
  try {
    // Use the combined status endpoint for the PR's head commit
    const [combinedStatus, checkRuns] = await Promise.all([
      ghFetch<{ state: string }>(
        `/repos/${repoFullName}/commits/${headSha}/status`,
        token,
      ),
      ghFetch<{ total_count: number; check_runs: { name: string; status: string; conclusion: string | null }[] }>(
        `/repos/${repoFullName}/commits/${headSha}/check-runs`,
        token,
      ),
    ]);

    // Check runs (GitHub Actions, etc.)
    if (checkRuns.total_count > 0) {
      const runs = checkRuns.check_runs;

      const failedRuns = runs.filter(
        (r) => r.conclusion === 'failure' || r.conclusion === 'timed_out',
      );
      if (failedRuns.length > 0) {
        return { status: 'failed', failedChecks: failedRuns.map((r) => r.name) };
      }

      const hasRunning = runs.some(
        (r) => r.status === 'in_progress' || r.status === 'queued',
      );
      if (hasRunning) return { status: 'running', failedChecks: [] };

      const allDone = runs.every((r) => r.status === 'completed');
      if (allDone) {
        const nonSuccess = runs.filter(
          (r) => r.conclusion !== 'success' && r.conclusion !== 'neutral' && r.conclusion !== 'skipped',
        );
        if (nonSuccess.length > 0) {
          return { status: 'failed', failedChecks: nonSuccess.map((r) => r.name) };
        }
        return { status: 'passed', failedChecks: [] };
      }

      return { status: 'pending', failedChecks: [] };
    }

    // Fall back to legacy commit status API
    switch (combinedStatus.state) {
      case 'success': return { status: 'passed', failedChecks: [] };
      case 'failure': case 'error': return { status: 'failed', failedChecks: [] };
      case 'pending': return { status: 'running', failedChecks: [] };
      default: return { status: 'unknown', failedChecks: [] };
    }
  } catch {
    return { status: 'unknown', failedChecks: [] };
  }
}

/** Only count reviews on the current head commit — stale reviews on older commits don't count. */
export function checkHasReviewed(reviews: GHReview[], username: string, headSha: string): boolean {
  return reviews.some(
    (r) => r.user.login === username
      && r.commit_id === headSha
      && (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED' || r.state === 'COMMENTED'),
  );
}

export function deriveReviewStatus(reviews: GHReview[]): ReviewStatus {
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

async function fetchDeployment(
  token: string,
  repoFullName: string,
  headSha: string,
): Promise<PullRequest['deployment']> {
  try {
    // Get deployments for this specific SHA
    const deployments = await ghFetch<{ id: number; environment: string }[]>(
      `/repos/${repoFullName}/deployments?sha=${headSha}&per_page=1`,
      token,
    );

    if (!deployments.length) return undefined;

    const deployment = deployments[0];
    const statuses = await ghFetch<{ state: string; environment_url?: string }[]>(
      `/repos/${repoFullName}/deployments/${deployment.id}/statuses?per_page=1`,
      token,
    );

    if (!statuses.length) {
      return { environment: deployment.environment, status: 'pending' };
    }

    const latest = statuses[0];
    const status = latest.state === 'success' ? 'success'
      : latest.state === 'failure' || latest.state === 'error' ? 'failure'
        : latest.state === 'inactive' ? 'inactive'
          : 'pending';

    return {
      environment: deployment.environment,
      status,
      url: latest.environment_url || undefined,
    };
  } catch {
    return undefined;
  }
}

interface GraphQLPRDetails {
  unresolvedCommentCount: number;
  hasConflicts: boolean;
}

async function fetchGraphQLDetails(token: string, repoFullName: string, prNumber: number): Promise<GraphQLPRDetails> {
  // GitHub REST API doesn't expose resolved/unresolved state or mergeable status reliably.
  // Use GraphQL which has isResolved on reviewThreads and mergeable on pullRequest.
  const [owner, repo] = repoFullName.split('/');
  const query = `query {
    repository(owner: "${owner}", name: "${repo}") {
      pullRequest(number: ${prNumber}) {
        mergeable
        reviewThreads(first: 100) {
          nodes { isResolved }
        }
      }
    }
  }`;

  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return { unresolvedCommentCount: 0, hasConflicts: false };
    const data = await res.json();
    const pr = data?.data?.repository?.pullRequest;
    const threads = pr?.reviewThreads?.nodes ?? [];
    const unresolvedCommentCount = threads.filter((t: { isResolved: boolean }) => !t.isResolved).length;
    const hasConflicts = pr?.mergeable === 'CONFLICTING';
    return { unresolvedCommentCount, hasConflicts };
  } catch {
    return { unresolvedCommentCount: 0, hasConflicts: false };
  }
}
