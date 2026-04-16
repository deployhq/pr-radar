// === Platform accounts ===

export type Platform = 'github' | 'gitlab' | 'bitbucket';

export interface PlatformAccount {
  platform: Platform;
  token: string;
  username: string;
  avatarUrl?: string;
}

// === Pull Requests ===

export type CIStatus = 'passed' | 'failed' | 'running' | 'pending' | 'unknown';
export type ReviewStatus = 'approved' | 'changes_requested' | 'pending' | 'none';

export interface PullRequest {
  id: string;
  platform: Platform;
  repo: string;
  repoFullName: string;
  number: number;
  title: string;
  url: string;
  author: string;
  authorAvatarUrl?: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  ciStatus: CIStatus;
  ciFailedChecks?: string[];
  ciUrl?: string;
  reviewStatus: ReviewStatus;
  approvalCount: number;
  approvedBy?: string[];
  unresolvedCommentCount: number;
  hasConflicts: boolean;
  isAuthor: boolean;
  isBot: boolean;
  isReviewRequested: boolean;
  hasReviewed: boolean;
  isMerged?: boolean;
  mergedAt?: number;
  headSha?: string;
  deployment?: {
    environment: string;
    status: 'success' | 'failure' | 'pending' | 'inactive';
    url?: string;
  };
}

// === Watched repos ===

export interface WatchedRepo {
  platform: Platform;
  fullName: string;
  enabled: boolean;
  pinned?: boolean;
}

// === Navigation ===

export type AppView =
  | { type: 'setup' }
  | { type: 'dashboard'; tab?: DashboardTab }
  | { type: 'settings' }
  | { type: 'repos' };

export type DashboardTab = 'mine' | 'review' | 'all';

// === Messages (popup <-> service worker) ===

export type Message =
  | { type: 'POLL_NOW' }
  | { type: 'REFRESH_SETTINGS' }
  | { type: 'GET_PRS'; payload: { tab: DashboardTab } }
  | { type: 'TEST_NOTIFICATION' }
  | { type: 'MERGE_PR'; payload: { platform: Platform; repoFullName: string; prNumber: number } };
