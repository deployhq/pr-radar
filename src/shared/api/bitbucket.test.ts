import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveBBReviewStatus,
  getUserRepositories,
  checkIfMerged,
  mergePullRequest,
  fetchPullRequests,
} from './bitbucket';

// === Pure function tests ===

function participant(overrides: Partial<{ nickname: string; role: string; approved: boolean; state: string | null }> = {}) {
  const { nickname = 'user', role = 'REVIEWER', approved = false, state = null } = overrides;
  return {
    user: { display_name: nickname, nickname, links: { avatar: { href: '' } } },
    role,
    approved,
    state,
  };
}

describe('deriveBBReviewStatus', () => {
  it('returns "none" when there are no reviewers', () => {
    expect(deriveBBReviewStatus([])).toBe('none');
  });

  it('returns "none" when no participants have REVIEWER role', () => {
    expect(deriveBBReviewStatus([participant({ role: 'PARTICIPANT' })])).toBe('none');
  });

  it('returns "approved" when a reviewer approved', () => {
    expect(deriveBBReviewStatus([
      participant({ approved: true }),
    ])).toBe('approved');
  });

  it('returns "changes_requested" when a reviewer requested changes', () => {
    expect(deriveBBReviewStatus([
      participant({ state: 'changes_requested' }),
    ])).toBe('changes_requested');
  });

  it('returns "changes_requested" even if another reviewer approved', () => {
    expect(deriveBBReviewStatus([
      participant({ nickname: 'alice', approved: true }),
      participant({ nickname: 'bob', state: 'changes_requested' }),
    ])).toBe('changes_requested');
  });

  it('returns "pending" when reviewers exist but none approved or requested changes', () => {
    expect(deriveBBReviewStatus([
      participant({ state: null }),
    ])).toBe('pending');
  });
});

// === API integration tests (fetch mocked) ===

describe('getUserRepositories', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches workspaces then repos from each', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    // Workspaces
    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [{ workspace: { slug: 'myteam' } }],
    }));

    // Repos for workspace
    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [{ full_name: 'myteam/repo-a' }, { full_name: 'myteam/repo-b' }],
    }));

    const repos = await getUserRepositories('token');

    expect(repos).toEqual([
      { full_name: 'myteam/repo-a' },
      { full_name: 'myteam/repo-b' },
    ]);
  });

  it('paginates workspace repos when next link is present', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    // Workspaces
    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [{ workspace: { slug: 'myteam' } }],
    }));

    // Repos page 1
    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [{ full_name: 'myteam/repo-a' }],
      next: 'https://api.bitbucket.org/2.0/repositories/myteam?page=2',
    }));

    // Repos page 2
    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [{ full_name: 'myteam/repo-b' }],
    }));

    const repos = await getUserRepositories('token');

    expect(repos).toEqual([
      { full_name: 'myteam/repo-a' },
      { full_name: 'myteam/repo-b' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('skips workspaces without a slug', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [{ workspace: {} }, { workspace: { slug: 'valid' } }],
    }));

    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [{ full_name: 'valid/repo' }],
    }));

    const repos = await getUserRepositories('token');
    expect(repos).toEqual([{ full_name: 'valid/repo' }]);
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

  it('returns true when PR state is MERGED', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(bbJsonResponse({ state: 'MERGED' }));
    expect(await checkIfMerged('token', 'team/repo', 1)).toBe(true);
  });

  it('returns false when PR state is OPEN', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(bbJsonResponse({ state: 'OPEN' }));
    expect(await checkIfMerged('token', 'team/repo', 1)).toBe(false);
  });

  it('returns false on API error', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('fail'));
    expect(await checkIfMerged('token', 'team/repo', 1)).toBe(false);
  });
});

describe('mergePullRequest', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success on 200', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true } as Response);
    const result = await mergePullRequest('token', 'team/repo', 1);
    expect(result.success).toBe(true);
  });

  it('returns failure with error message', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false, status: 400, statusText: 'Bad Request',
      json: async () => ({ error: { message: 'Cannot merge' } }),
    } as Response);
    const result = await mergePullRequest('token', 'team/repo', 1);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Cannot merge');
  });
});

describe('fetchPullRequests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches and hydrates pull requests', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    // PR list
    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [{
        id: 1, title: 'Add feature', state: 'OPEN',
        links: { html: { href: 'https://bitbucket.org/pr/1' } },
        author: { display_name: 'Alice', nickname: 'alice', links: { avatar: { href: 'https://avatar' } } },
        created_on: '2026-01-01T00:00:00Z', updated_on: '2026-01-02T00:00:00Z',
        source: { branch: { name: 'feature' }, commit: { hash: 'abc123' }, repository: { full_name: 'team/repo' } },
        destination: { branch: { name: 'main' }, repository: { full_name: 'team/repo' } },
        reviewers: [{ display_name: 'Bob', nickname: 'bob', links: { avatar: { href: '' } } }],
        participants: [
          { user: { display_name: 'Bob', nickname: 'bob', links: { avatar: { href: '' } } }, role: 'REVIEWER', approved: true, state: 'approved' },
        ],
        task_count: 0, comment_count: 2,
      }],
    }));

    // CI status (pipeline)
    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [{ state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } }],
    }));

    // Comments
    fetchMock.mockResolvedValueOnce(bbJsonResponse({
      values: [
        { id: 1, inline: { path: 'src/index.ts' }, content: { raw: 'fix this' }, resolved: false },
        { id: 2, inline: { path: 'src/index.ts' }, content: { raw: 'looks good' }, resolved: true },
      ],
    }));

    const prs = await fetchPullRequests('token', 'team/repo', 'bob');

    expect(prs).toHaveLength(1);
    expect(prs[0].title).toBe('Add feature');
    expect(prs[0].platform).toBe('bitbucket');
    expect(prs[0].ciStatus).toBe('passed');
    expect(prs[0].unresolvedCommentCount).toBe(1);
    expect(prs[0].reviewStatus).toBe('approved');
    expect(prs[0].approvalCount).toBe(1);
    expect(prs[0].isReviewRequested).toBe(true);
    expect(prs[0].hasReviewed).toBe(true);
    expect(prs[0].headSha).toBe('abc123');
    expect(prs[0].isDraft).toBe(false);
  });
});

// === Helpers ===

function bbJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as Response;
}
