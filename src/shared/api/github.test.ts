import { describe, it, expect } from 'vitest';
import { deriveReviewStatus, checkHasReviewed, type GHReview } from './github';

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
