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
  ciDurationMs?: number;
  ciUrl?: string;
  reviewStatus: ReviewStatus;
  approvalCount: number;
  approvedBy?: string[];
  changesRequestedBy?: string[];
  unresolvedCommentCount: number;
  unresolvedCommentAuthors?: string[];
  additions?: number;
  deletions?: number;
  description?: string;
  hasConflicts: boolean;
  isAuthor: boolean;
  isBot: boolean;
  isReviewRequested: boolean;
  hasReviewed: boolean;
  pendingReviewers?: string[];
  isMerged?: boolean;
  mergedAt?: number;
  headSha?: string;
  headRef?: string;
  deployment?: {
    environment: string;
    status: 'success' | 'failure' | 'pending' | 'inactive';
    url?: string;
  };
  deployhqProjectId?: string;
  deployhqDeployment?: {
    serverName: string;
    url: string;
  };
}

// === DeployHQ ===

export interface DeployHQAccount {
  slug: string;
  email: string;
  apiKey: string;
  connected: boolean;
  accountName?: string;
}

export interface DeployHQProject {
  identifier: string;
  name: string;
  permalink: string;
  repoUrl: string;
}

export interface DeployHQServer {
  identifier: string;
  name: string;
  serverType: 'server' | 'server_group';
}

// === Poll errors & rate limits ===

export type PollErrorKind =
  | 'rate_limit'
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'timeout'
  | 'server'
  | 'network'
  | 'unknown';

export interface PollError {
  platform: Platform;
  repoFullName: string;
  kind: PollErrorKind;
  status?: number;
  message: string;
  timestamp: number;
}

export interface RateLimitInfo {
  platform: Platform;
  limit: number;
  remaining: number;
  resetAt: number; // ms epoch
  capturedAt: number;
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

export type UrgencyCategory = 'ci_failed' | 'changes_requested' | 'review_requested' | 'conflicts' | 'stale' | 'long_wait';

// === Messages (popup <-> service worker) ===

export type Message =
  | { type: 'POLL_NOW' }
  | { type: 'REFRESH_SETTINGS' }
  | { type: 'GET_PRS'; payload: { tab: DashboardTab } }
  | { type: 'TEST_NOTIFICATION' }
  | { type: 'MERGE_PR'; payload: { platform: Platform; repoFullName: string; prNumber: number } }
  | { type: 'DELETE_BRANCH'; payload: { platform: Platform; repoFullName: string; branch: string } }
  | { type: 'TEST_DEPLOYHQ'; payload: { slug: string; email: string; apiKey: string } }
  | { type: 'GET_DEPLOYHQ_SERVERS'; payload: { repoFullName: string } }
  | { type: 'CREATE_DEPLOYHQ_DEPLOYMENT'; payload: { repoFullName: string; serverIdentifier: string } };
