import type { PullRequest, CIStatus, Message } from '@/shared/types';
import { CI_STATUS_LABELS } from '@/shared/constants';
import { getSettings, getAccounts, getWatchedRepos, getCachedPRs, saveCachedPRs } from '@/shared/storage';
import * as github from '@/shared/api/github';
import * as gitlab from '@/shared/api/gitlab';
import * as bitbucket from '@/shared/api/bitbucket';

const ALARM_NAME = 'pr-radar-poll';
const STATUS_CACHE_KEY = 'pr_radar_last_statuses';
const COMMENT_CACHE_KEY = 'pr_radar_last_comments';

// === Persisted status tracking ===
// Service workers get killed by Chrome — in-memory maps don't survive.
// Persist to chrome.storage so we can detect changes across restarts.

async function getLastStatuses(): Promise<Record<string, CIStatus>> {
  const result = await chrome.storage.local.get(STATUS_CACHE_KEY);
  return result[STATUS_CACHE_KEY] ?? {};
}

async function saveLastStatuses(statuses: Record<string, CIStatus>): Promise<void> {
  await chrome.storage.local.set({ [STATUS_CACHE_KEY]: statuses });
}

async function getLastCommentCounts(): Promise<Record<string, number>> {
  const result = await chrome.storage.local.get(COMMENT_CACHE_KEY);
  return result[COMMENT_CACHE_KEY] ?? {};
}

async function saveLastCommentCounts(counts: Record<string, number>): Promise<void> {
  await chrome.storage.local.set({ [COMMENT_CACHE_KEY]: counts });
}

// === Lifecycle ===

chrome.runtime.onInstalled.addListener(() => {
  setupPolling();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollPRs();
  }
});

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'POLL_NOW') {
    pollPRs().then(() => sendResponse({ done: true }));
    return true; // keep channel open for async sendResponse
  } else if (message.type === 'REFRESH_SETTINGS') {
    setupPolling();
  } else if (message.type === 'TEST_NOTIFICATION') {
    chrome.notifications.create(`pr-radar-test-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: 'CI Passed',
      message: 'deployhq/pr-radar #1\nThis is a test notification',
    });
    const settings = getSettings();
    settings.then((s) => {
      if (s.soundEnabled) playSound(s.soundId, s.soundVolume);
    });
  }
});

// === Polling setup ===

async function setupPolling() {
  const settings = await getSettings();
  const periodInMinutes = Math.max(settings.pollIntervalSeconds / 60, 0.5);

  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes });
}

// === Main poll loop ===

async function pollPRs() {
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    updateBadge('disconnected');
    return;
  }

  const watchedRepos = await getWatchedRepos();
  const enabledRepos = watchedRepos.filter((r) => r.enabled);

  if (enabledRepos.length === 0) {
    updateBadge('ok');
    return;
  }

  try {
    const allPRs: PullRequest[] = [];

    for (const account of accounts) {
      const repos = enabledRepos.filter((r) => r.platform === account.platform);

      for (const repo of repos) {
        try {
          if (account.platform === 'github') {
            const prs = await github.fetchPullRequests(account.token, repo.fullName, account.username);
            allPRs.push(...prs);
          } else if (account.platform === 'gitlab') {
            const prs = await gitlab.fetchMergeRequests(account.token, repo.fullName, account.username);
            allPRs.push(...prs);
          } else if (account.platform === 'bitbucket') {
            const prs = await bitbucket.fetchPullRequests(account.token, repo.fullName, account.username);
            allPRs.push(...prs);
          }
        } catch (err) {
          console.error(`Failed to poll ${repo.fullName}:`, err);
        }
      }
    }

    // Check for CI status changes on the user's PRs (skip stale)
    const staleDays = (await getSettings()).stalePRDays;
    const staleThreshold = staleDays > 0 ? staleDays * 86400000 : 0;
    const lastStatuses = await getLastStatuses();
    const newStatuses: Record<string, CIStatus> = {};

    for (const pr of allPRs) {
      if (!pr.isAuthor) continue;
      if (staleThreshold && (Date.now() - new Date(pr.updatedAt).getTime()) > staleThreshold) continue;

      const prevStatus = lastStatuses[pr.id];
      if (prevStatus && prevStatus !== pr.ciStatus) {
        notifyCIChange(pr);
      }
      newStatuses[pr.id] = pr.ciStatus;
    }

    await saveLastStatuses(newStatuses);

    // Check for new unresolved comments on the user's PRs
    const settings0 = await getSettings();
    if (settings0.notifyOnComments) {
      const lastComments = await getLastCommentCounts();
      const newComments: Record<string, number> = {};

      for (const pr of allPRs) {
        if (!pr.isAuthor) continue;
        if (staleThreshold && (Date.now() - new Date(pr.updatedAt).getTime()) > staleThreshold) continue;

        const prevCount = lastComments[pr.id];
        if (prevCount !== undefined && pr.unresolvedCommentCount > prevCount) {
          notifyNewComments(pr, pr.unresolvedCommentCount - prevCount);
        }
        newComments[pr.id] = pr.unresolvedCommentCount;
      }

      await saveLastCommentCounts(newComments);
    }

    // Track recently merged PRs — keep them visible while CI runs
    const MERGED_TTL = 30 * 60 * 1000; // 30 minutes
    const cached = await getCachedPRs();
    const openIds = new Set(allPRs.map((pr) => pr.id));

    if (cached) {
      // Find PRs that disappeared from the open list (authored, reviewed, or review-requested)
      const disappeared = cached.prs.filter(
        (pr) => !pr.isMerged && !openIds.has(pr.id)
          && (pr.isAuthor || pr.isReviewRequested || pr.hasReviewed),
      );

      for (const pr of disappeared) {
        if (pr.platform !== 'github' || !pr.headSha) continue;
        const account = accounts.find((a) => a.platform === 'github');
        if (!account) continue;

        try {
          const merged = await github.checkIfMerged(account.token, pr.repoFullName, pr.number);
          if (merged) {
            allPRs.push({ ...pr, isMerged: true, mergedAt: Date.now() });
          }
        } catch {
          // PR might have been deleted — skip it
        }
      }

      // Keep existing merged PRs that haven't expired and whose CI hasn't settled
      const existingMerged = cached.prs.filter((pr) => pr.isMerged && pr.mergedAt);
      for (const pr of existingMerged) {
        if (openIds.has(pr.id)) continue; // reopened
        if (allPRs.some((p) => p.id === pr.id)) continue; // already re-added above

        const elapsed = Date.now() - (pr.mergedAt ?? 0);
        if (elapsed > MERGED_TTL) continue; // expired

        // Refresh CI status
        if (pr.platform === 'github' && pr.headSha) {
          const account = accounts.find((a) => a.platform === 'github');
          if (account) {
            try {
              const ciStatus = await github.refreshCIStatus(account.token, pr.repoFullName, pr.headSha);
              allPRs.push({ ...pr, ciStatus });
            } catch {
              allPRs.push(pr); // keep with old status
            }
          }
        }
      }
    }

    // Cache PRs for instant popup load
    allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    await saveCachedPRs(allPRs);

    // Update badge based on aggregate state (exclude stale PRs)
    const settings = await getSettings();
    const staleMs = settings.stalePRDays > 0 ? settings.stalePRDays * 86400000 : 0;
    const now = Date.now();
    const myPRs = allPRs.filter((pr) =>
      pr.isAuthor && !pr.isMerged && !pr.isDraft && (!staleMs || (now - new Date(pr.updatedAt).getTime()) < staleMs),
    );
    const failedCount = myPRs.filter((pr) => pr.ciStatus === 'failed').length;
    const passedCount = myPRs.filter((pr) => pr.ciStatus === 'passed').length;
    if (failedCount > 0) {
      updateBadge('failed', failedCount);
    } else if (myPRs.some((pr) => pr.ciStatus === 'running')) {
      updateBadge('running');
    } else if (passedCount > 0) {
      updateBadge('passed', passedCount);
    } else {
      updateBadge('ok');
    }
  } catch (err) {
    console.error('Poll error:', err);
    updateBadge('error');
  }
}

// === Notifications ===

async function notifyCIChange(pr: PullRequest) {
  const settings = await getSettings();

  if (settings.notificationsEnabled) {
    const title =
      pr.ciStatus === 'passed' ? 'CI Passed'
        : pr.ciStatus === 'failed' ? 'CI Failed'
          : `CI ${CI_STATUS_LABELS[pr.ciStatus]}`;

    chrome.notifications.create(`pr-radar-${pr.id}-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message: `${pr.repoFullName} #${pr.number}\n${pr.title}`,
    });
  }

  if (settings.soundEnabled && (pr.ciStatus === 'passed' || pr.ciStatus === 'failed')) {
    playSound(settings.soundId, settings.soundVolume);
  }
}

async function notifyNewComments(pr: PullRequest, newCount: number) {
  const settings = await getSettings();

  if (settings.notificationsEnabled) {
    chrome.notifications.create(`pr-radar-comment-${pr.id}-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: `${newCount} new unresolved comment${newCount > 1 ? 's' : ''}`,
      message: `${pr.repoFullName} #${pr.number}\n${pr.title}`,
    });
  }

  if (settings.soundEnabled) {
    playSound(settings.soundId, settings.soundVolume);
  }
}

// === Sound (via offscreen document) ===

async function ensureOffscreen() {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('offscreen.html'),
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: 'Play notification sounds',
  });
}

async function playSound(soundId: string, volume?: number) {
  try {
    await ensureOffscreen();
    // Small delay to let the offscreen document initialize its listener
    await new Promise((r) => setTimeout(r, 100));
    await chrome.runtime.sendMessage({ type: 'PLAY_SOUND', soundId, volume: volume ?? 0.7 });
  } catch {
    // Offscreen document not ready — ignore
  }
}

// === Badge ===

type BadgeState = 'running' | 'failed' | 'passed' | 'ok' | 'error' | 'disconnected';

function updateBadge(state: BadgeState, count?: number) {
  switch (state) {
    case 'running':
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
      break;
    case 'failed':
      chrome.action.setBadgeText({ text: count ? String(count) : '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      break;
    case 'passed':
      chrome.action.setBadgeText({ text: count ? String(count) : '\u2713' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
      break;
    case 'error':
      chrome.action.setBadgeText({ text: '?' });
      chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
      break;
    case 'ok':
    case 'disconnected':
      chrome.action.setBadgeText({ text: '' });
      break;
  }
}
