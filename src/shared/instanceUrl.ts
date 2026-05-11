import type { Platform, PlatformAccount } from './types';

/** User-facing root URL of the canonical hosted service for each platform. */
export const CANONICAL_INSTANCE_URLS: Record<Platform, string> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
  bitbucket: 'https://bitbucket.org',
};

/** Resolve the user-facing instance URL for an account (canonical default if not self-hosted). */
export function getInstanceUrl(account: { platform: Platform; instanceUrl?: string }): string {
  return normalizeInstanceUrl(account.instanceUrl) ?? CANONICAL_INSTANCE_URLS[account.platform];
}

/** True when the account points at something other than the canonical service. */
export function isSelfHosted(account: { platform: Platform; instanceUrl?: string }): boolean {
  const normalized = normalizeInstanceUrl(account.instanceUrl);
  return !!normalized && normalized !== CANONICAL_INSTANCE_URLS[account.platform];
}

/** Platform-specific API path suffixes to strip when a user pastes an API endpoint. */
const API_PATH_SUFFIXES: Record<Platform, RegExp> = {
  github: /\/api\/(?:v3|graphql)$/i,
  gitlab: /\/api\/v4$/i,
  bitbucket: /\/2\.0$/, // not used today (Phase 3 deferred) but harmless to define
};

/**
 * Normalize a user-entered instance URL: trim whitespace, drop trailing slash,
 * require https. Returns null if the input is empty or invalid.
 *
 * When `platform` is provided:
 *   - strips well-known API path suffixes (e.g. `/api/v4`, `/api/v3`, `/api/graphql`)
 *     so users can paste an API endpoint by mistake without breaking us;
 *   - returns null when the cleaned result matches the canonical service URL,
 *     so the caller can treat that case as "use cloud" rather than persisting
 *     a bogus self-hosted instance.
 */
export function normalizeInstanceUrl(input: string | undefined | null, platform?: Platform): string | null {
  if (!input) return null;
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    let normalized = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
    if (platform) {
      normalized = normalized.replace(API_PATH_SUFFIXES[platform], '');
      if (normalized === CANONICAL_INSTANCE_URLS[platform]) return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

/** Convenience: short host display for UI subtitles. Returns null when canonical. */
export function getDisplayHost(account: PlatformAccount): string | null {
  if (!isSelfHosted(account)) return null;
  try {
    return new URL(getInstanceUrl(account)).host;
  } catch {
    return null;
  }
}

/**
 * Request runtime host permission for a self-hosted instance. Must be invoked
 * from a user-gesture handler (e.g. the Connect button click). Returns true
 * when the user grants access.
 */
export async function requestInstanceHostPermission(instanceUrl: string): Promise<boolean> {
  const normalized = normalizeInstanceUrl(instanceUrl);
  if (!normalized) return false;
  const origin = `${normalized}/*`;
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: [origin] }, (granted) => {
      resolve(!!granted);
    });
  });
}

/** Check whether host permission has already been granted for an instance URL. */
export async function hasInstanceHostPermission(instanceUrl: string): Promise<boolean> {
  const normalized = normalizeInstanceUrl(instanceUrl);
  if (!normalized) return false;
  const origin = `${normalized}/*`;
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [origin] }, (granted) => {
      resolve(!!granted);
    });
  });
}
