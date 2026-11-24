import { describe, it, expect } from 'vitest';
import type { PullRequest } from './types';
import { isInReviewTab, matchesReviewScope } from './review';

function pr(overrides: Partial<PullRequest>): PullRequest {
  return {
    id: 'github-o/r-1', platform: 'github', repo: 'r', repoFullName: 'o/r', number: 1,
    title: 't', url: '', author: 'alice', isDraft: false,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ciStatus: 'passed', reviewStatus: 'none', approvalCount: 0, unresolvedCommentCount: 0,
    hasConflicts: false, isAuthor: false, isBot: false, isReviewRequested: false, hasReviewed: false,
    ...overrides,
  };
}

describe('isInReviewTab', () => {
  it('keeps an assigned PR after the review request is cleared', () => {
    expect(isInReviewTab(pr({ isReviewRequested: false, hasReviewed: true, isAssignedToMe: true, assignees: ['me'] }))).toBe(true);
  });

  it('excludes my own PR that I self-assigned', () => {
    expect(isInReviewTab(pr({ isAuthor: true, isAssignedToMe: true, assignees: ['me'] }))).toBe(false);
  });

  it('excludes drafts even when assigned or requested', () => {
    expect(isInReviewTab(pr({ isDraft: true, isReviewRequested: true, isAssignedToMe: true }))).toBe(false);
  });
});

describe('matchesReviewScope', () => {
  const claimedByOther = pr({ isReviewRequested: true, assignees: ['bob'], isAssignedToMe: false });
  const unclaimed = pr({ isReviewRequested: true, assignees: [], isAssignedToMe: false });

  it('splits PRs claimed by someone else from unclaimed ones', () => {
    expect(matchesReviewScope(claimedByOther, 'assigned')).toBe(false);
    expect(matchesReviewScope(claimedByOther, 'unassigned')).toBe(false);
    expect(matchesReviewScope(unclaimed, 'unassigned')).toBe(true);
  });

  it('treats PRs cached before assignees were fetched (or Bitbucket) as unassigned', () => {
    const legacy = pr({ isReviewRequested: true });
    expect(matchesReviewScope(legacy, 'unassigned')).toBe(true);
    expect(matchesReviewScope(legacy, 'assigned')).toBe(false);
  });
});
