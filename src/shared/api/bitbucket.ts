import type { PullRequest, CIStatus, ReviewStatus } from '../types';

const BASE_URL = 'https://api.bitbucket.org/2.0';

async function bbFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Bitbucket API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

interface BBUser {
  display_name: string;
  nickname: string;
  links: { avatar: { href: string } };
}

interface BBPullRequest {
  id: number;
  title: string;
  state: string;
  links: { html: { href: string } };
  author: BBUser;
  created_on: string;
  updated_on: string;
  source: { branch: { name: string }; repository: { full_name: string } };
  destination: { branch: { name: string }; repository: { full_name: string } };
  reviewers: BBUser[];
  participants: { user: BBUser; role: string; approved: boolean; state: string }[];
  task_count: number;
  comment_count: number;
}

interface BBPipelineStatus {
  state: { name: string; result?: { name: string } };
}

interface BBComment {
  id: number;
  inline?: { path: string };
  content: { raw: string };
  parent?: { id: number };
  resolved?: boolean;
}

export async function getAuthenticatedUser(token: string): Promise<{ nickname: string; display_name: string; avatar: string }> {
  const user = await bbFetch<{ nickname: string; display_name: string; links: { avatar: { href: string } } }>('/user', token);
  return { nickname: user.nickname, display_name: user.display_name, avatar: user.links.avatar.href };
}

export async function getUserRepositories(token: string, username: string): Promise<{ full_name: string }[]> {
  const result = await bbFetch<{ values: { full_name: string }[] }>(
    `/repositories/${username}?pagelen=100&sort=-updated_on`,
    token,
  );
  return result.values;
}

export async function fetchPullRequests(
  token: string,
  repoFullName: string,
  username: string,
): Promise<PullRequest[]> {
  const result = await bbFetch<{ values: BBPullRequest[] }>(
    `/repositories/${repoFullName}/pullrequests?state=OPEN&pagelen=50`,
    token,
  );

  const results = await Promise.all(
    result.values.map((pr) => hydratePR(token, repoFullName, pr, username)),
  );

  return results;
}

async function hydratePR(
  token: string,
  repoFullName: string,
  pr: BBPullRequest,
  username: string,
): Promise<PullRequest> {
  const [ciStatus, comments] = await Promise.all([
    fetchCIStatus(token, repoFullName, pr),
    fetchComments(token, repoFullName, pr.id),
  ]);

  const reviewStatus = deriveBBReviewStatus(pr.participants);
  const approvalCount = pr.participants.filter((p) => p.approved).length;
  const unresolvedCommentCount = comments.filter((c) => c.inline && !c.resolved).length;
  const isReviewRequested = pr.reviewers.some((r) => r.nickname === username);

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
    ciStatus,
    reviewStatus,
    approvalCount,
    unresolvedCommentCount,
    hasConflicts: false, // Would need separate merge check
    isAuthor: pr.author.nickname === username,
    isReviewRequested,
    hasReviewed: false,
  };
}

async function fetchCIStatus(token: string, repoFullName: string, pr: BBPullRequest): Promise<CIStatus> {
  try {
    const result = await bbFetch<{ values: BBPipelineStatus[] }>(
      `/repositories/${repoFullName}/pipelines/?sort=-created_on&pagelen=1&target.branch=${pr.source.branch.name}`,
      token,
    );

    if (!result.values.length) return 'unknown';
    const pipeline = result.values[0];

    switch (pipeline.state.name) {
      case 'COMPLETED':
        return pipeline.state.result?.name === 'SUCCESSFUL' ? 'passed' : 'failed';
      case 'IN_PROGRESS': case 'RUNNING':
        return 'running';
      case 'PENDING':
        return 'pending';
      default:
        return 'unknown';
    }
  } catch {
    return 'unknown';
  }
}

async function fetchComments(token: string, repoFullName: string, prId: number): Promise<BBComment[]> {
  try {
    const result = await bbFetch<{ values: BBComment[] }>(
      `/repositories/${repoFullName}/pullrequests/${prId}/comments?pagelen=100`,
      token,
    );
    return result.values;
  } catch {
    return [];
  }
}

function deriveBBReviewStatus(participants: BBPullRequest['participants']): ReviewStatus {
  const reviewers = participants.filter((p) => p.role === 'REVIEWER');
  if (!reviewers.length) return 'none';

  if (reviewers.some((r) => r.state === 'changes_requested')) return 'changes_requested';
  if (reviewers.some((r) => r.approved)) return 'approved';
  return 'pending';
}
