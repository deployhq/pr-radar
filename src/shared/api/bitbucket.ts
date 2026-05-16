import type { PullRequest, CIStatus, ReviewStatus } from '../types';

const BASE_URL = 'https://api.bitbucket.org/2.0';

export class BitbucketAPIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'BitbucketAPIError';
  }
}

async function bbFetch<T>(path: string, token: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new BitbucketAPIError(res.status, `Bitbucket API error: ${res.status} ${res.statusText} ${body}`);
  }
  return res.json();
}

async function bbFetchPaginated<T>(path: string, token: string, maxPages = 10): Promise<T[]> {
  const allValues: T[] = [];
  let nextUrl: string | undefined = path;
  let page = 0;

  while (nextUrl && page < maxPages) {
    const result: { values: T[]; next?: string } = await bbFetch(nextUrl, token);
    allValues.push(...result.values);
    nextUrl = result.next;
    page++;
  }

  return allValues;
}

interface BBUser {
  uuid: string;
  display_name: string;
  nickname: string;
  links: { avatar: { href: string } };
}

interface BBPullRequest {
  id: number;
  title: string;
  description: string;
  state: string;
  links: { html: { href: string } };
  author: BBUser;
  created_on: string;
  updated_on: string;
  source: { branch: { name: string }; commit?: { hash: string }; repository: { full_name: string } };
  destination: { branch: { name: string }; repository: { full_name: string } };
  reviewers: BBUser[];
  participants: { user: BBUser; role: string; approved: boolean; state: string | null }[];
  task_count: number;
  comment_count: number;
}

interface BBPipelineStatus {
  state: { name: string; result?: { name: string } };
  duration_in_seconds?: number;
}

interface BBComment {
  id: number;
  inline?: { path: string };
  content: { raw: string };
  parent?: { id: number };
  resolved?: boolean;
  user?: { uuid?: string; nickname: string; display_name: string };
}

export async function getAuthenticatedUser(token: string): Promise<{ uuid: string; nickname: string; display_name: string; avatar: string }> {
  const user = await bbFetch<{ uuid: string; nickname: string; display_name: string; links: { avatar: { href: string } } }>('/user', token);
  return { uuid: user.uuid, nickname: user.nickname, display_name: user.display_name, avatar: user.links.avatar.href };
}

export async function getUserRepositories(token: string): Promise<{ full_name: string }[]> {
  // /2.0/workspaces was sunset on 2026-04-14 (CHANGE-2770).
  // Replacement: /2.0/user/workspaces returns workspace_access objects.
  const workspaces = await bbFetchPaginated<{ workspace: { slug: string } }>(
    '/user/workspaces?pagelen=100',
    token,
  );

  const allRepos: { full_name: string }[] = [];
  for (const membership of workspaces) {
    const slug = membership.workspace?.slug;
    if (!slug) continue;
    try {
      const repos = await bbFetchPaginated<{ full_name: string }>(
        `/repositories/${slug}?pagelen=100&sort=-updated_on&role=member`,
        token,
      );
      allRepos.push(...repos);
    } catch {
      // Workspace might not have repos or access — skip
    }
  }
  return allRepos;
}

export async function mergePullRequest(
  token: string,
  repoFullName: string,
  prId: number,
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${BASE_URL}/repositories/${repoFullName}/pullrequests/${prId}/merge`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      return { success: true, message: 'Pull request merged successfully' };
    }
    const body = await res.json().catch(() => ({}));
    return { success: false, message: body.error?.message || `Merge failed: ${res.status} ${res.statusText}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Merge failed' };
  }
}

export async function checkIfMerged(token: string, repoFullName: string, prId: number): Promise<boolean> {
  try {
    const pr = await bbFetch<{ state: string }>(`/repositories/${repoFullName}/pullrequests/${prId}`, token);
    return pr.state === 'MERGED';
  } catch {
    return false;
  }
}

export async function fetchPullRequests(
  token: string,
  repoFullName: string,
  username: string,
  userUuid?: string,
): Promise<PullRequest[]> {
  // Bitbucket's PR collection endpoint omits `reviewers` and `participants`
  // from each PR object by default — opt in via `?fields=` or every reviewer
  // assignment (default-reviewer rule or manual) silently looks unassigned.
  const result = await bbFetch<{ values: BBPullRequest[] }>(
    `/repositories/${repoFullName}/pullrequests?state=OPEN&pagelen=50&fields=%2Bvalues.reviewers,%2Bvalues.participants`,
    token,
  );

  const results = await Promise.all(
    result.values.map((pr) => hydratePR(token, repoFullName, pr, username, userUuid)),
  );

  return results;
}

// Bitbucket nicknames are user-editable and can drift out of sync between the
// /user endpoint and snapshots embedded in PR responses, causing reviewer
// matches to silently miss. Prefer uuid (immutable, set by Atlassian) and fall
// back to nickname only for accounts saved before 0.5.3 that haven't been
// backfilled yet.
function userMatches(
  user: { uuid?: string; nickname: string },
  username: string,
  userUuid: string | undefined,
): boolean {
  if (userUuid && user.uuid) return user.uuid === userUuid;
  return user.nickname === username;
}

async function hydratePR(
  token: string,
  repoFullName: string,
  pr: BBPullRequest,
  username: string,
  userUuid: string | undefined,
): Promise<PullRequest> {
  const [ciResult, commentsResult, diffStats] = await Promise.all([
    fetchCIStatus(token, repoFullName, pr),
    fetchComments(token, repoFullName, pr.id),
    fetchDiffStats(token, repoFullName, pr.id),
  ]);
  const { comments, available: commentsAvailable } = commentsResult;

  const participants = pr.participants ?? [];
  const reviewers = pr.reviewers ?? [];

  const reviewStatus = deriveBBReviewStatus(participants);
  const approvalCount = participants.filter((p) => p.approved).length;
  const changesRequestedBy = [...new Set(
    participants
      .filter((p) => p.role === 'REVIEWER' && p.state === 'changes_requested')
      .map((p) => p.user.nickname),
  )];
  const unresolvedComments = comments.filter((c) => c.inline && !c.resolved);
  const unresolvedCommentCount = unresolvedComments.length;
  const unresolvedCommentAuthors = [...new Set(
    unresolvedComments.map((c) => c.user?.nickname).filter((n): n is string => !!n),
  )];
  const isReviewRequested = reviewers.some((r) => userMatches(r, username, userUuid));
  const hasReviewed = participants.some(
    (p) => userMatches(p.user, username, userUuid) && p.role === 'REVIEWER' && p.state !== null,
  );
  const pendingReviewers = participants
    .filter((p) => p.role === 'REVIEWER' && p.state === null && !p.approved)
    .map((p) => p.user.nickname);

  return {
    id: `bitbucket-${repoFullName}-${pr.id}`,
    platform: 'bitbucket',
    repo: repoFullName.split('/')[1],
    repoFullName,
    number: pr.id,
    title: pr.title,
    url: pr.links.html.href,
    author: pr.author.nickname,
    authorAvatarUrl: pr.author.links.avatar.href,
    isDraft: false, // Bitbucket doesn't have draft PRs
    createdAt: pr.created_on,
    updatedAt: pr.updated_on,
    ciStatus: ciResult.status,
    ciDurationMs: ciResult.durationMs,
    reviewStatus,
    approvalCount,
    changesRequestedBy: changesRequestedBy.length > 0 ? changesRequestedBy : undefined,
    unresolvedCommentCount,
    unresolvedCommentCountKnown: commentsAvailable,
    unresolvedCommentAuthors: unresolvedCommentAuthors.length > 0 ? unresolvedCommentAuthors : undefined,
    additions: diffStats?.additions,
    deletions: diffStats?.deletions,
    description: pr.description || undefined,
    hasConflicts: false, // Would need separate merge check
    isAuthor: userMatches(pr.author, username, userUuid),
    isBot: false,
    isReviewRequested,
    hasReviewed,
    pendingReviewers: pendingReviewers.length > 0 ? pendingReviewers : undefined,
    headSha: pr.source.commit?.hash,
    headRef: pr.source.branch.name,
    baseBranch: pr.destination.branch.name,
  };
}

async function fetchDiffStats(
  token: string,
  repoFullName: string,
  prId: number,
): Promise<{ additions: number; deletions: number } | undefined> {
  try {
    const files = await bbFetchPaginated<{ lines_added: number; lines_removed: number }>(
      `/repositories/${repoFullName}/pullrequests/${prId}/diffstat?pagelen=100`,
      token,
      100,
    );
    let additions = 0;
    let deletions = 0;
    for (const file of files) {
      additions += file.lines_added;
      deletions += file.lines_removed;
    }
    return { additions, deletions };
  } catch {
    return undefined;
  }
}

interface BBCIResult {
  status: CIStatus;
  durationMs?: number;
}

async function fetchCIStatus(token: string, repoFullName: string, pr: BBPullRequest): Promise<BBCIResult> {
  try {
    const result = await bbFetch<{ values: BBPipelineStatus[] }>(
      `/repositories/${repoFullName}/pipelines/?sort=-created_on&pagelen=1&target.branch=${pr.source.branch.name}`,
      token,
    );

    if (!result.values.length) return { status: 'unknown' };
    const pipeline = result.values[0];
    const durationMs = pipeline.duration_in_seconds ? pipeline.duration_in_seconds * 1000 : undefined;

    switch (pipeline.state.name) {
      case 'COMPLETED':
        return { status: pipeline.state.result?.name === 'SUCCESSFUL' ? 'passed' : 'failed', durationMs };
      case 'IN_PROGRESS': case 'RUNNING':
        return { status: 'running', durationMs };
      case 'PENDING':
        return { status: 'pending', durationMs };
      default:
        return { status: 'unknown', durationMs };
    }
  } catch {
    return { status: 'unknown' };
  }
}

async function fetchComments(
  token: string,
  repoFullName: string,
  prId: number,
): Promise<{ comments: BBComment[]; available: boolean }> {
  try {
    const result = await bbFetch<{ values: BBComment[] }>(
      `/repositories/${repoFullName}/pullrequests/${prId}/comments?pagelen=100`,
      token,
    );
    return { comments: result.values, available: true };
  } catch {
    return { comments: [], available: false };
  }
}

export function deriveBBReviewStatus(participants: { user: { display_name: string; nickname: string; links: { avatar: { href: string } } }; role: string; approved: boolean; state: string | null }[]): ReviewStatus {
  if (!participants?.length) return 'none';
  const reviewers = participants.filter((p) => p.role === 'REVIEWER');
  if (!reviewers.length) return 'none';

  if (reviewers.some((r) => r.state === 'changes_requested')) return 'changes_requested';
  if (reviewers.some((r) => r.approved)) return 'approved';
  return 'pending';
}
