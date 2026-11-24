import type { PullRequest, ReviewScope } from './types';

// Review tab membership: someone asked for my review, or I'm an assignee on a
// PR I didn't author. Assignment keeps a PR here after GitHub drops me from
// requested_reviewers on submitting a review (issue #31: teams that "claim" a
// PR by self-assigning).
export function isInReviewTab(pr: PullRequest): boolean {
  if (pr.isDraft) return false;
  return pr.isReviewRequested || (!!pr.isAssignedToMe && !pr.isAuthor);
}

// Bitbucket has no assignees (`assignees` undefined), so its PRs only ever
// count as unassigned.
export function matchesReviewScope(pr: PullRequest, scope: ReviewScope): boolean {
  if (scope === 'assigned') return !!pr.isAssignedToMe;
  if (scope === 'unassigned') return !pr.assignees?.length;
  return true;
}
