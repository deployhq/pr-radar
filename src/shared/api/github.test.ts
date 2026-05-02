import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkHasReviewed,
  deriveReviewStatus,
  getAuthenticatedUser,
  getNextPagePath,
  getUserRepos,
  mapWithConcurrencyLimit,
  mergePullRequest,
  type GHReview,
} from './github';

function review(user: string, state: string, commit_id = 'abc123'): GHReview {
  return { state, user: { login: user, avatar_url: '' }, commit_id };
}

describe('deriveReviewStatus', () => {
  it('returns "none" when there are no reviews', () => {
    expect(deriveReviewStatus([])).toBe('none');
  });

  it('returns "approved" when only approvals exist', () => {
    expect(deriveReviewStatus([review('alice', 'APPROVED')])).toBe('approved');
  });

  it('returns "changes_requested" when any reviewer requested changes', () => {
    const reviews = [
      review('alice', 'APPROVED'),
      review('bob', 'CHANGES_REQUESTED'),
    ];
    expect(deriveReviewStatus(reviews)).toBe('changes_requested');
  });

  it('uses the latest review per user', () => {
    // Bob first requested changes, then approved
    const reviews = [
      review('bob', 'CHANGES_REQUESTED'),
      review('bob', 'APPROVED'),
    ];
    expect(deriveReviewStatus(reviews)).toBe('approved');
  });

  it('returns "pending" when only COMMENTED reviews exist', () => {
    expect(deriveReviewStatus([review('alice', 'COMMENTED')])).toBe('pending');
  });

  it('returns "changes_requested" even if another user approved', () => {
    const reviews = [
      review('alice', 'APPROVED'),
      review('bob', 'CHANGES_REQUESTED'),
      review('carol', 'APPROVED'),
    ];
    expect(deriveReviewStatus(reviews)).toBe('changes_requested');
  });
});

describe('checkHasReviewed', () => {
  const HEAD_SHA = 'current-head-sha';
  const OLD_SHA = 'old-commit-sha';

  it('returns true when user reviewed the current head commit', () => {
    const reviews = [review('me', 'APPROVED', HEAD_SHA)];
    expect(checkHasReviewed(reviews, 'me', HEAD_SHA)).toBe(true);
  });

  it('returns false when user reviewed an older commit (stale review)', () => {
    const reviews = [review('me', 'APPROVED', OLD_SHA)];
    expect(checkHasReviewed(reviews, 'me', HEAD_SHA)).toBe(false);
  });

  it('returns false when a different user reviewed', () => {
    const reviews = [review('alice', 'APPROVED', HEAD_SHA)];
    expect(checkHasReviewed(reviews, 'me', HEAD_SHA)).toBe(false);
  });

  it('returns false when there are no reviews', () => {
    expect(checkHasReviewed([], 'me', HEAD_SHA)).toBe(false);
  });

  it('returns true for CHANGES_REQUESTED on current commit', () => {
    const reviews = [review('me', 'CHANGES_REQUESTED', HEAD_SHA)];
    expect(checkHasReviewed(reviews, 'me', HEAD_SHA)).toBe(true);
  });

  it('returns true for COMMENTED on current commit', () => {
    const reviews = [review('me', 'COMMENTED', HEAD_SHA)];
    expect(checkHasReviewed(reviews, 'me', HEAD_SHA)).toBe(true);
  });

  it('ignores DISMISSED reviews', () => {
    const reviews = [review('me', 'DISMISSED', HEAD_SHA)];
    expect(checkHasReviewed(reviews, 'me', HEAD_SHA)).toBe(false);
  });

  it('returns true if at least one review on current commit matches', () => {
    const reviews = [
      review('me', 'APPROVED', OLD_SHA),  // stale
      review('me', 'COMMENTED', HEAD_SHA), // current
    ];
    expect(checkHasReviewed(reviews, 'me', HEAD_SHA)).toBe(true);
  });

  it('returns false when all user reviews are on old commits', () => {
    const reviews = [
      review('me', 'APPROVED', OLD_SHA),
      review('me', 'CHANGES_REQUESTED', OLD_SHA),
    ];
    expect(checkHasReviewed(reviews, 'me', HEAD_SHA)).toBe(false);
  });
});

describe('getNextPagePath', () => {
  it('returns the next API path from a link header', () => {
    const linkHeader = [
      '<https://api.github.com/resource?page=2>; rel="next"',
      '<https://api.github.com/resource?page=4>; rel="last"',
    ].join(', ');

    expect(getNextPagePath(linkHeader)).toBe('/resource?page=2');
  });

  it('returns null when there is no next page', () => {
    expect(getNextPagePath('<https://api.github.com/resource?page=4>; rel="last"')).toBeNull();
  });

  it('strips the /api/v3 prefix on GitHub Enterprise Server links', () => {
    const linkHeader = '<https://github.example.com/api/v3/user/repos?page=2>; rel="next"';
    expect(getNextPagePath(linkHeader, 'https://github.example.com/api/v3'))
      .toBe('/user/repos?page=2');
  });

  it('returns null when the link origin differs from the configured base URL', () => {
    // GHES base configured but the link points at api.github.com (mismatched origin)
    const linkHeader = '<https://api.github.com/resource?page=2>; rel="next"';
    expect(getNextPagePath(linkHeader, 'https://github.example.com/api/v3')).toBeNull();
  });
});

describe('mapWithConcurrencyLimit', () => {
  it('preserves order while limiting in-flight work', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await mapWithConcurrencyLimit([1, 2, 3, 4], 2, async (value) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});

describe('getUserRepos', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('follows pagination links and deduplicates org repos', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(jsonResponse(
      [{ full_name: 'deployhq/pr-radar' }],
      '<https://api.github.com/user/repos?sort=pushed&per_page=100&page=2>; rel="next"',
    ));
    fetchMock.mockResolvedValueOnce(jsonResponse([{ full_name: 'deployhq/shipit' }]));
    fetchMock.mockResolvedValueOnce(jsonResponse([{ login: 'deployhq' }]));
    fetchMock.mockResolvedValueOnce(jsonResponse(
      [{ full_name: 'deployhq/internal' }],
      '<https://api.github.com/orgs/deployhq/repos?sort=pushed&per_page=100&type=member&page=2>; rel="next"',
    ));
    fetchMock.mockResolvedValueOnce(jsonResponse([{ full_name: 'deployhq/launch' }]));
    fetchMock.mockResolvedValueOnce(jsonResponse([{ full_name: 'deployhq/launch' }]));

    const repos = await getUserRepos('token');

    expect(repos).toEqual([
      { full_name: 'deployhq/pr-radar' },
      { full_name: 'deployhq/shipit' },
      { full_name: 'deployhq/internal' },
      { full_name: 'deployhq/launch' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

function jsonResponse(body: unknown, linkHeader?: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'link' ? linkHeader ?? null : null),
    },
  } as unknown as Response;
}

describe('GitHub Enterprise Server URL routing', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getAuthenticatedUser hits api.github.com when no instanceUrl is provided', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ login: 'me', avatar_url: '' }));
    await getAuthenticatedUser('token');
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe('https://api.github.com/user');
  });

  it('getAuthenticatedUser routes to {instanceUrl}/api/v3 for GHES', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ login: 'me', avatar_url: '' }));
    await getAuthenticatedUser('token', 'https://github.example.com');
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0])
      .toBe('https://github.example.com/api/v3/user');
  });

  it('getAuthenticatedUser strips trailing slashes from instanceUrl', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ login: 'me', avatar_url: '' }));
    await getAuthenticatedUser('token', 'https://github.example.com/');
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0])
      .toBe('https://github.example.com/api/v3/user');
  });

  it('getUserRepos routes pagination to the GHES base', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    // Personal repos page 1 with link to page 2 on the GHES host. Real GitHub
    // URL-encodes commas in affiliation, so we mirror that here (literal commas
    // inside the URL would confuse the comma-delimited Link-header parser).
    fetchMock.mockResolvedValueOnce(jsonResponse(
      [{ full_name: 'acme/alpha' }],
      '<https://github.example.com/api/v3/user/repos?sort=pushed&per_page=100&affiliation=owner%2Ccollaborator%2Corganization_member&page=2>; rel="next"',
    ));
    fetchMock.mockResolvedValueOnce(jsonResponse([{ full_name: 'acme/beta' }]));
    // Orgs list (empty so we don't have to mock org repo fetches)
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    const repos = await getUserRepos('token', 'https://github.example.com');

    expect(repos).toEqual([
      { full_name: 'acme/alpha' },
      { full_name: 'acme/beta' },
    ]);
    // Every call should target the GHES /api/v3 base
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toMatch(/^https:\/\/github\.example\.com\/api\/v3\//);
    }
  });

  it('mergePullRequest routes to the GHES instance', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true } as Response);
    await mergePullRequest('token', 'acme/alpha', 7, 'https://github.example.com');
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0])
      .toBe('https://github.example.com/api/v3/repos/acme/alpha/pulls/7/merge');
  });
});
