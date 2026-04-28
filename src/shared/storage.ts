import type { PlatformAccount, WatchedRepo, Platform, DeployHQAccount } from './types';
import type { SoundId } from './constants';

const ACCOUNTS_KEY = 'pr_radar_accounts';
const SETTINGS_KEY = 'pr_radar_settings';
const REPOS_KEY = 'pr_radar_repos';

// === Settings ===

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  pollIntervalSeconds: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  soundId: SoundId;
  soundVolume: number;
  notifyOnComments: boolean;
  notifyOnCommentsTabs: ('mine' | 'review' | 'all')[];
  stalePRDays: number;
  longWaitDays: number;
  theme: ThemeMode;
}

const DEFAULT_SETTINGS: Settings = {
  pollIntervalSeconds: 60,
  notificationsEnabled: true,
  soundEnabled: true,
  soundId: 'ding',
  soundVolume: 0.7,
  notifyOnComments: false,
  notifyOnCommentsTabs: ['mine'],
  stalePRDays: 45,
  longWaitDays: 2,
  theme: 'system',
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...current, ...settings },
  });
}

// === Accounts ===

export async function getAccounts(): Promise<PlatformAccount[]> {
  const result = await chrome.storage.local.get(ACCOUNTS_KEY);
  return result[ACCOUNTS_KEY] ?? [];
}

export async function saveAccount(account: PlatformAccount): Promise<void> {
  const accounts = await getAccounts();
  const idx = accounts.findIndex((a) => a.platform === account.platform);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  await chrome.storage.local.set({ [ACCOUNTS_KEY]: accounts });
}

export async function removeAccount(platform: Platform): Promise<void> {
  const accounts = await getAccounts();
  await chrome.storage.local.set({
    [ACCOUNTS_KEY]: accounts.filter((a) => a.platform !== platform),
  });
}

export async function getAccount(platform: Platform): Promise<PlatformAccount | null> {
  const accounts = await getAccounts();
  return accounts.find((a) => a.platform === platform) ?? null;
}

// === Watched repos ===

export async function getWatchedRepos(): Promise<WatchedRepo[]> {
  const result = await chrome.storage.local.get(REPOS_KEY);
  return result[REPOS_KEY] ?? [];
}

export async function saveWatchedRepos(repos: WatchedRepo[]): Promise<void> {
  await chrome.storage.local.set({ [REPOS_KEY]: repos });
}

// === PR cache ===

import type { PullRequest } from './types';

const PR_CACHE_KEY = 'pr_radar_pr_cache';

interface PRCache {
  prs: PullRequest[];
  updatedAt: number;
}

export async function getCachedPRs(): Promise<PRCache | null> {
  const result = await chrome.storage.local.get(PR_CACHE_KEY);
  return result[PR_CACHE_KEY] ?? null;
}

export async function saveCachedPRs(prs: PullRequest[]): Promise<void> {
  await chrome.storage.local.set({
    [PR_CACHE_KEY]: { prs, updatedAt: Date.now() } satisfies PRCache,
  });
}

// === DeployHQ ===

const DEPLOYHQ_ACCOUNT_KEY = 'pr_radar_deployhq';
const DEPLOYHQ_MAPPING_KEY = 'pr_radar_deployhq_mapping';

export async function getDeployHQAccount(): Promise<DeployHQAccount | null> {
  const result = await chrome.storage.local.get(DEPLOYHQ_ACCOUNT_KEY);
  return result[DEPLOYHQ_ACCOUNT_KEY] ?? null;
}

export async function saveDeployHQAccount(account: DeployHQAccount): Promise<void> {
  await chrome.storage.local.set({ [DEPLOYHQ_ACCOUNT_KEY]: account });
}

export async function removeDeployHQAccount(): Promise<void> {
  await chrome.storage.local.remove([DEPLOYHQ_ACCOUNT_KEY, DEPLOYHQ_MAPPING_KEY]);
}

export async function getDeployHQRepoMapping(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(DEPLOYHQ_MAPPING_KEY);
  return result[DEPLOYHQ_MAPPING_KEY] ?? {};
}

export async function saveDeployHQRepoMapping(mapping: Record<string, string>): Promise<void> {
  await chrome.storage.local.set({ [DEPLOYHQ_MAPPING_KEY]: mapping });
}

// === Install date & star prompt ===

const INSTALL_DATE_KEY = 'pr_radar_install_date';
const STAR_PROMPT_DISMISSED_KEY = 'pr_radar_star_dismissed';

export async function clearAll(): Promise<void> {
  await chrome.storage.local.remove([
    ACCOUNTS_KEY,
    SETTINGS_KEY,
    REPOS_KEY,
    PR_CACHE_KEY,
    INSTALL_DATE_KEY,
    STAR_PROMPT_DISMISSED_KEY,
    DEPLOYHQ_ACCOUNT_KEY,
    DEPLOYHQ_MAPPING_KEY,
  ]);
}

export async function getInstallDate(): Promise<number | null> {
  const result = await chrome.storage.local.get(INSTALL_DATE_KEY);
  return result[INSTALL_DATE_KEY] ?? null;
}

export async function setInstallDate(): Promise<void> {
  const existing = await getInstallDate();
  if (!existing) {
    await chrome.storage.local.set({ [INSTALL_DATE_KEY]: Date.now() });
  }
}

export async function isStarPromptDismissed(): Promise<boolean> {
  const result = await chrome.storage.local.get(STAR_PROMPT_DISMISSED_KEY);
  return result[STAR_PROMPT_DISMISSED_KEY] === true;
}

export async function dismissStarPrompt(): Promise<void> {
  await chrome.storage.local.set({ [STAR_PROMPT_DISMISSED_KEY]: true });
}
