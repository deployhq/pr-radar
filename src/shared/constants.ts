import type { CIStatus, Platform } from './types';

export const CI_STATUS_COLORS: Record<CIStatus, string> = {
  passed: '#22c55e',
  failed: '#ef4444',
  running: '#3b82f6',
  pending: '#f59e0b',
  unknown: '#6b7280',
};

export const CI_STATUS_LABELS: Record<CIStatus, string> = {
  passed: 'CI passed',
  failed: 'CI failed',
  running: 'CI running',
  pending: 'CI pending',
  unknown: 'CI unknown',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

export const PLATFORM_SHORT: Record<Platform, string> = {
  github: 'GH',
  gitlab: 'GL',
  bitbucket: 'BB',
};

export const PLATFORM_COLORS: Record<Platform, { bg: string; text: string }> = {
  github: { bg: '#21262d', text: '#f0f6fc' },
  gitlab: { bg: '#2a1a3e', text: '#fc6d26' },
  bitbucket: { bg: '#1a2744', text: '#2684ff' },
};

export const DEFAULT_POLL_INTERVAL_SECONDS = 60;

export const SOUND_OPTIONS = [
  { id: 'ding', label: 'Ding' },
  { id: 'bell', label: 'Bell' },
  { id: 'chime', label: 'Chime' },
] as const;

export type SoundId = typeof SOUND_OPTIONS[number]['id'];

export const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/hkombgibegjffiadmekpiabdakkoidmh';

export const FIREFOX_ADDON_URL =
  'https://addons.mozilla.org/en-US/firefox/addon/pr-radar/';

export const STORE_URL = __BROWSER__ === 'firefox' ? FIREFOX_ADDON_URL : CHROME_WEB_STORE_URL;

export const GITHUB_REPO_URL = 'https://github.com/deployhq/pr-radar';
export const GITHUB_ISSUES_URL = 'https://github.com/deployhq/pr-radar/issues';
