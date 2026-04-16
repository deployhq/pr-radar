import type { PullRequest, CIStatus, ReviewStatus } from '../types';

const BASE_URL = 'https://api.github.com';
const HYDRATE_CONCURRENCY = 5;
const ORG_FETCH_CONCURRENCY = 4;
const MAX_PAGINATED_PAGES = 20;

async function ghFetchRaw(path: string, token: string): Promise<Response> {
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
  return res;
}

async function ghFetch<T>(path: string, token: string): Promise<T> {
  const res = await ghFetchRaw(path, token);
  return res.json();
}

export function getNextPagePath(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(',')) {
    const match = part.trim().match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (!match || match[2] !== 'next') continue;

    const url = new URL(match[1]);
    if (url.origin !== BASE_URL) return null;
    return `${url.pathname}${url.search}`;
  }

  return null;
}

async function ghPaginate<T>(path: string, token: string, maxPages = MAX_PAGINATED_PAGES): Promise<T[]> {
  const results: T[] = [];
  const seenPaths = new Set<string>();
  let nextPath: string | null = path;
  let pageCount = 0;

  while (nextPath && pageCount < maxPages && !seenPaths.has(nextPath)) {
    seenPaths.add(nextPath);
    const res = await ghFetchRaw(nextPath, token);
    const page = await res.json() as T[];
    results.push(...page);
    nextPath = getNextPagePath(res.headers.get('link'));
    pageCount += 1;
  }

  return results;
}

export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  mapItem: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapItem(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
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
  const userRepos = await ghPaginate<{ full_name: string }>(
    '/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member',
    token,
  );

  // Fetch orgs the user belongs to, then fetch repos from each org
  // Use type=member to include private repos the user has access to
  try {
    const orgs = await ghFetch<{ login: string }[]>('/user/orgs?per_page=100', token);
    const orgRepoLists = await mapWithConcurrencyLimit(
      orgs,
      ORG_FETCH_CONCURRENCY,
      async (org) => {
        const [memberRepos, publicRepos] = await Promise.all([
          ghPaginate<{ full_name: string }>(
            `/orgs/${org.login}/repos?sort=pushed&per_page=100&type=member`,
            token,
          ).catch(() => [] as { full_name: string }[]),
          ghPaginate<{ full_name: string }>(
            `/orgs/${org.login}/repos?sort=pushed&per_page=100&type=all`,
            token,
          ).catch(() => [] as { full_name: string }[]),
        ]);

        return [...memberRepos, ...publicRepos];
      },
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
  const prs = await ghPaginate<GHPullRequest>(
    `/repos/${repoFullName}/pulls?state=open&per_page=100`,
    token,
  );

  const results = await mapWithConcurrencyLimit(
    prs,
    HYDRATE_CONCURRENCY,
    (pr) => hydratePR(token, repoFullName, pr, username),
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

interface GraphQLResponse<T> {
  data?: T;
}

interface ReviewThreadConnection {
  nodes?: Array<{ isResolved: boolean }>;
  pageInfo?: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

interface GraphQLPullRequestData {
  repository?: {
    pullRequest?: {
      mergeable?: string;
      reviewThreads?: ReviewThreadConnection;
    };
  };
}

type GraphQLPullRequest = NonNullable<NonNullable<GraphQLPullRequestData['repository']>['pullRequest']>;

async function ghGraphQL<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) return null;

  const data = await res.json() as GraphQLResponse<T>;
  return data.data ?? null;
}

async function fetchGraphQLDetails(token: string, repoFullName: string, prNumber: number): Promise<GraphQLPRDetails> {
  // GitHub REST API doesn't expose resolved/unresolved state or mergeable status reliably.
  // Use GraphQL which has isResolved on reviewThreads and mergeable on pullRequest.
  const [owner, repo] = repoFullName.split('/');
  const query = `query PullRequestDetails($owner: String!, $repo: String!, $prNumber: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        mergeable
        reviewThreads(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes { isResolved }
        }
      }
    }
  }`;

  try {
    let unresolvedCommentCount = 0;
    let hasConflicts = false;
    let after: string | null = null;
    let pageCount = 0;

    while (pageCount < MAX_PAGINATED_PAGES) {
      const data: GraphQLPullRequestData | null = await ghGraphQL<GraphQLPullRequestData>(token, query, {
        owner,
        repo,
        prNumber,
        after,
      });

      const pr: GraphQLPullRequest | undefined = data?.repository?.pullRequest;
      if (!pr) return { unresolvedCommentCount: 0, hasConflicts: false };

      const threads = pr.reviewThreads?.nodes ?? [];
      unresolvedCommentCount += threads.filter((t: { isResolved: boolean }) => !t.isResolved).length;
      hasConflicts = pr.mergeable === 'CONFLICTING';

      const pageInfo: ReviewThreadConnection['pageInfo'] = pr.reviewThreads?.pageInfo;
      if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;

      after = pageInfo.endCursor;
      pageCount += 1;
    }

    return { unresolvedCommentCount, hasConflicts };
  } catch {
    return { unresolvedCommentCount: 0, hasConflicts: false };
  }
}
