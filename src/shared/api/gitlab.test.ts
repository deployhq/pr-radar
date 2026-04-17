import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mapGLPipelineStatus,
  deriveGLReviewStatus,
  getUserProjects,
  fetchMergeRequests,
  checkIfMerged,
  mergeMergeRequest,
} from './gitlab';

// === Pure function tests ===

describe('mapGLPipelineStatus', () => {
  it('maps "success" to "passed"', () => {
    expect(mapGLPipelineStatus('success')).toBe('passed');
  });

  it('maps "failed" to "failed"', () => {
    expect(mapGLPipelineStatus('failed')).toBe('failed');
  });

  it('maps "running" to "running"', () => {
    expect(mapGLPipelineStatus('running')).toBe('running');
  });

  it('maps "pending" to "running"', () => {
    expect(mapGLPipelineStatus('pending')).toBe('running');
  });

  it('maps "created" to "pending"', () => {
    expect(mapGLPipelineStatus('created')).toBe('pending');
  });

  it('maps "waiting_for_resource" to "pending"', () => {
    expect(mapGLPipelineStatus('waiting_for_resource')).toBe('pending');
  });

  it('maps "preparing" to "pending"', () => {
    expect(mapGLPipelineStatus('preparing')).toBe('pending');
  });

  it('maps "canceled" to "unknown"', () => {
    expect(mapGLPipelineStatus('canceled')).toBe('unknown');
  });

  it('maps "skipped" to "unknown"', () => {
    expect(mapGLPipelineStatus('skipped')).toBe('unknown');
  });

  it('returns "unknown" for undefined', () => {
    expect(mapGLPipelineStatus(undefined)).toBe('unknown');
  });

  it('returns "unknown" for unrecognized status', () => {
    expect(mapGLPipelineStatus('something_else')).toBe('unknown');
  });
});

describe('deriveGLReviewStatus', () => {
  it('returns "approved" when there are approvers', () => {
    expect(deriveGLReviewStatus({
      approved: false,
      approved_by: [{ user: { username: 'alice', avatar_url: '' } }],
    })).toBe('approved');
  });

  it('returns "approved" when approved flag is true', () => {
    expect(deriveGLReviewStatus({
      approved: true,
      approved_by: [],
    })).toBe('approved');
  });

  it('returns "none" when no approvals', () => {
    expect(deriveGLReviewStatus({
      approved: false,
      approved_by: [],
    })).toBe('none');
  });
});

// === API integration tests (fetch mocked) ===

describe('getUserProjects', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches a single page of projects', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(glResponse(
      [{ path_with_namespace: 'user/project-a' }],
      null,
    ));

    const projects = await getUserProjects('token');

    expect(projects).toEqual([{ path_with_namespace: 'user/project-a' }]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('paginates through multiple pages', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(glResponse(
        Array.from({ length: 100 }, (_, i) => ({ path_with_namespace: `user/project-${i}` })),
        '2',
      ))
      .mockResolvedValueOnce(glResponse(
        [{ path_with_namespace: 'user/project-100' }],
        null,
      ));

    const projects = await getUserProjects('token');

    expect(projects).toHaveLength(101);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('fetchMergeRequests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches and hydrates merge requests', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    // MR list
    fetchMock.mockResolvedValueOnce(glJsonResponse([{
      id: 1, iid: 42, title: 'Fix bug', web_url: 'https://gitlab.com/mr/42',
      author: { username: 'alice', avatar_url: 'https://avatar' },
      work_in_progress: false, draft: false,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
      source_branch: 'fix-bug', sha: 'abc123', has_conflicts: false,
      reviewers: [{ username: 'bob', avatar_url: '' }],
      head_pipeline: { status: 'success', web_url: 'https://pipeline' },
    }]));

    // Discussions
    fetchMock.mockResolvedValueOnce(glJsonResponse([{
      id: 'd1',
      notes: [{ resolvable: true, resolved: false, author: { username: 'bob' } }],
    }]));

    // Approvals
    fetchMock.mockResolvedValueOnce(glJsonResponse({
      approved: true,
      approved_by: [{ user: { username: 'bob', avatar_url: '' } }],
    }));

    // Deployments
    fetchMock.mockResolvedValueOnce(glJsonResponse([]));

    const prs = await fetchMergeRequests('token', 'user/project', 'bob');

    expect(prs).toHaveLength(1);
    expect(prs[0].title).toBe('Fix bug');
    expect(prs[0].platform).toBe('gitlab');
    expect(prs[0].ciStatus).toBe('passed');
    expect(prs[0].unresolvedCommentCount).toBe(1);
    expect(prs[0].hasReviewed).toBe(true);
    expect(prs[0].isReviewRequested).toBe(true);
    expect(prs[0].reviewStatus).toBe('approved');
    expect(prs[0].headSha).toBe('abc123');
  });
});

describe('checkIfMerged', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns true when MR state is merged', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(glJsonResponse({ state: 'merged' }));
    expect(await checkIfMerged('token', 'user/project', 1)).toBe(true);
  });

  it('returns false when MR state is opened', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(glJsonResponse({ state: 'opened' }));
    expect(await checkIfMerged('token', 'user/project', 1)).toBe(false);
  });

  it('returns false on API error', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('fail'));
    expect(await checkIfMerged('token', 'user/project', 1)).toBe(false);
  });
});

describe('mergeMergeRequest', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success on 200', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true } as Response);
    const result = await mergeMergeRequest('token', 'user/project', 1);
    expect(result.success).toBe(true);
  });

  it('returns failure message on error response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false, status: 405, statusText: 'Method Not Allowed',
      json: async () => ({ message: 'Cannot merge' }),
    } as Response);
    const result = await mergeMergeRequest('token', 'user/project', 1);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Cannot merge');
  });
});

// === Helpers ===

function glResponse(body: unknown, nextPage: string | null): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-next-page' ? nextPage : null),
    },
  } as unknown as Response;
}

function glJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}
