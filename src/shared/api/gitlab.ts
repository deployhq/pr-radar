import type { PullRequest, CIStatus, ReviewStatus } from '../types';

const BASE_URL = 'https://gitlab.com/api/v4';

async function glFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'PRIVATE-TOKEN': token,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitLab API error: ${res.status} ${body}`);
  }
  return res.json();
}

interface GLUser {
  username: string;
  avatar_url: string;
}

interface GLMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  web_url: string;
  author: GLUser;
  work_in_progress: boolean;
  draft: boolean;
  created_at: string;
  updated_at: string;
  source_branch: string;
  sha: string;
  has_conflicts: boolean;
  reviewers?: GLUser[];
  head_pipeline?: {
    status: string;
    web_url: string;
  } | null;
}

interface GLDiscussion {
  id: string;
  notes: {
    resolvable: boolean;
    resolved?: boolean;
    author: { username: string };
  }[];
}

interface GLApproval {
  approved: boolean;
  approved_by: { user: GLUser }[];
}

interface GLDeployment {
  id: number;
  status: string;
  environment: { name: string; external_url?: string };
}

export async function getAuthenticatedUser(token: string): Promise<{ username: string; avatar_url: string }> {
  return glFetch('/user', token);
}

export async function getUserProjects(token: string): Promise<{ path_with_namespace: string }[]> {
  // Paginate through all projects (GitLab returns x-next-page header)
  const allProjects: { path_with_namespace: string }[] = [];
  let page = 1;
  const maxPages = 10; // safety limit: 1000 projects

  while (page <= maxPages) {
    const res = await fetch(`${BASE_URL}/projects?membership=true&order_by=last_activity_at&per_page=100&page=${page}`, {
      headers: { 'PRIVATE-TOKEN': token },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitLab API error: ${res.status} ${body}`);
    }
    const projects = await res.json() as { path_with_namespace: string }[];
    allProjects.push(...projects);

    const nextPage = res.headers.get('x-next-page');
    if (!nextPage || projects.length < 100) break;
    page++;
  }

  return allProjects;
}

export async function mergeMergeRequest(
  token: string,
  projectPath: string,
  mrIid: number,
): Promise<{ success: boolean; message: string }> {
  const encodedPath = encodeURIComponent(projectPath);
  try {
    const res = await fetch(`${BASE_URL}/projects/${encodedPath}/merge_requests/${mrIid}/merge`, {
      method: 'PUT',
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      return { success: true, message: 'Merge request merged successfully' };
    }
    const body = await res.json().catch(() => ({}));
    return { success: false, message: body.message || `Merge failed: ${res.status} ${res.statusText}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Merge failed' };
  }
}

export async function checkIfMerged(token: string, projectPath: string, mrIid: number): Promise<boolean> {
  try {
    const encodedPath = encodeURIComponent(projectPath);
    const mr = await glFetch<{ state: string }>(`/projects/${encodedPath}/merge_requests/${mrIid}`, token);
    return mr.state === 'merged';
  } catch {
    return false;
  }
}

export async function fetchMergeRequests(
  token: string,
  projectPath: string,
  username: string,
): Promise<PullRequest[]> {
  const encodedPath = encodeURIComponent(projectPath);

  const mrs = await glFetch<GLMergeRequest[]>(
    `/projects/${encodedPath}/merge_requests?state=opened&per_page=50`,
    token,
  );

  const results = await Promise.all(
    mrs.map((mr) => hydrateMR(token, encodedPath, projectPath, mr, username)),
  );

  return results;
}

async function hydrateMR(
  token: string,
  encodedPath: string,
  projectPath: string,
  mr: GLMergeRequest,
  username: string,
): Promise<PullRequest> {
  const [discussions, approvals, deployment, diffStats] = await Promise.all([
    glFetch<GLDiscussion[]>(
      `/projects/${encodedPath}/merge_requests/${mr.iid}/discussions`,
      token,
    ),
    glFetch<GLApproval>(
      `/projects/${encodedPath}/merge_requests/${mr.iid}/approvals`,
      token,
    ),
    fetchDeployment(token, encodedPath, mr.sha),
    fetchDiffStats(token, encodedPath, mr.iid),
  ]);

  const unresolvedNotes = discussions.flatMap((d) =>
    d.notes.filter((n) => n.resolvable && !n.resolved),
  );
  const unresolvedCommentCount = unresolvedNotes.length;
  const unresolvedCommentAuthors = [...new Set(unresolvedNotes.map((n) => n.author.username))];

  const hasReviewed = discussions.some((d) =>
    d.notes.some((n) => n.author.username === username && n.resolvable),
  );

  const ciStatus = mapGLPipelineStatus(mr.head_pipeline?.status);
  const reviewStatus = deriveGLReviewStatus(approvals);
  const isReviewRequested = mr.reviewers?.some((r) => r.username === username) ?? false;
  const approvedUsernames = new Set(approvals.approved_by.map((a) => a.user.username));
  const pendingReviewers = (mr.reviewers ?? [])
    .filter((r) => !approvedUsernames.has(r.username))
    .map((r) => r.username);

  return {
    id: `gitlab-${projectPath}-${mr.iid}`,
    platform: 'gitlab',
    repo: projectPath.split('/').pop() ?? projectPath,
    repoFullName: projectPath,
    number: mr.iid,
    title: mr.title,
    url: mr.web_url,
    author: mr.author.username,
    authorAvatarUrl: mr.author.avatar_url,
    isDraft: mr.draft || mr.work_in_progress,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    ciStatus,
    ciUrl: mr.head_pipeline?.web_url,
    reviewStatus,
    approvalCount: approvals.approved_by.length,
    unresolvedCommentCount,
    unresolvedCommentAuthors: unresolvedCommentAuthors.length > 0 ? unresolvedCommentAuthors : undefined,
    additions: diffStats.additions || undefined,
    deletions: diffStats.deletions || undefined,
    description: mr.description || undefined,
    hasConflicts: mr.has_conflicts,
    isAuthor: mr.author.username === username,
    isBot: false,
    isReviewRequested,
    hasReviewed,
    pendingReviewers: pendingReviewers.length > 0 ? pendingReviewers : undefined,
    headSha: mr.sha,
    deployment,
  };
}

async function fetchDiffStats(
  token: string,
  encodedPath: string,
  mrIid: number,
): Promise<{ additions: number; deletions: number }> {
  try {
    const changes = await glFetch<{ changes: { diff: string; new_path: string; old_path: string }[] }>(
      `/projects/${encodedPath}/merge_requests/${mrIid}/changes?access_raw_diffs=false`,
      token,
    );
    let additions = 0;
    let deletions = 0;
    for (const change of changes.changes ?? []) {
      for (const line of change.diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }
    }
    return { additions, deletions };
  } catch {
    return { additions: 0, deletions: 0 };
  }
}

async function fetchDeployment(
  token: string,
  encodedPath: string,
  sha: string,
): Promise<PullRequest['deployment']> {
  try {
    const deployments = await glFetch<GLDeployment[]>(
      `/projects/${encodedPath}/deployments?order_by=created_at&sort=desc&per_page=1&sha=${sha}`,
      token,
    );

    if (!deployments.length) return undefined;

    const dep = deployments[0];
    const status = dep.status === 'success' ? 'success'
      : dep.status === 'failed' ? 'failure'
        : dep.status === 'canceled' ? 'inactive'
          : 'pending';

    return {
      environment: dep.environment.name,
      status,
      url: dep.environment.external_url || undefined,
    };
  } catch {
    return undefined;
  }
}

export function mapGLPipelineStatus(status?: string): CIStatus {
  if (!status) return 'unknown';
  switch (status) {
    case 'success': return 'passed';
    case 'failed': return 'failed';
    case 'running': case 'pending': return 'running';
    case 'created': case 'waiting_for_resource': case 'preparing': return 'pending';
    case 'canceled': case 'skipped': return 'unknown';
    default: return 'unknown';
  }
}

export function deriveGLReviewStatus(approvals: GLApproval): ReviewStatus {
  if (approvals.approved_by.length > 0) return 'approved';
  if (approvals.approved) return 'approved';
  return 'none';
}
