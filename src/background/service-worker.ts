import type { PullRequest, CIStatus, Message } from '@/shared/types';
import { CI_STATUS_LABELS } from '@/shared/constants';
import { getSettings, getAccounts, getWatchedRepos, getCachedPRs, saveCachedPRs, setInstallDate, getDeployHQAccount, saveDeployHQAccount, getDeployHQRepoMapping, saveDeployHQRepoMapping } from '@/shared/storage';
import * as github from '@/shared/api/github';
import * as gitlab from '@/shared/api/gitlab';
import * as bitbucket from '@/shared/api/bitbucket';
import * as deployhq from '@/shared/api/deployhq';

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
  setInstallDate();
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
  } else if (message.type === 'MERGE_PR') {
    const { platform, repoFullName, prNumber } = message.payload;
    (async () => {
      const accounts = await getAccounts();
      const account = accounts.find((a) => a.platform === platform);
      if (!account) {
        sendResponse({ success: false, message: 'Account not found' });
        return;
      }
      let result: { success: boolean; message: string };
      if (platform === 'github') {
        result = await github.mergePullRequest(account.token, repoFullName, prNumber);
      } else if (platform === 'gitlab') {
        result = await gitlab.mergeMergeRequest(account.token, repoFullName, prNumber);
      } else {
        result = await bitbucket.mergePullRequest(account.token, repoFullName, prNumber);
      }
      sendResponse(result);
      if (result.success) pollPRs(); // refresh data
    })();
    return true;
  } else if (message.type === 'DELETE_BRANCH') {
    const { platform, repoFullName, branch } = message.payload;
    (async () => {
      const accounts = await getAccounts();
      const account = accounts.find((a) => a.platform === platform);
      if (!account) {
        sendResponse({ success: false, message: 'Account not found' });
        return;
      }
      if (platform === 'github') {
        const result = await github.deleteBranch(account.token, repoFullName, branch);
        sendResponse(result);
      } else {
        sendResponse({ success: false, message: 'Not supported for this platform' });
      }
    })();
    return true;
  } else if (message.type === 'TEST_NOTIFICATION') {
    chrome.notifications.create(
      `pr-radar-test-${Date.now()}`,
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
        title: '\u2705 CI passed',
        message: 'deployhq/pr-radar #1 — This is a test notification',
      },
      (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error('[PR Radar] Notification error:', chrome.runtime.lastError.message);
        } else {
          console.log('[PR Radar] Notification created:', notificationId);
        }
      },
    );
    const settings = getSettings();
    settings.then((s) => {
      if (s.soundEnabled) playSound(s.soundId, s.soundVolume);
    });
  } else if (message.type === 'TEST_DEPLOYHQ') {
    const { slug, email, apiKey } = message.payload;
    (async () => {
      const result = await deployhq.testConnection(slug, email, apiKey);
      if (result.success) {
        await saveDeployHQAccount({
          slug,
          email,
          apiKey,
          connected: true,
          accountName: result.accountName,
        });
      }
      sendResponse(result);
    })();
    return true;
  } else if (message.type === 'GET_DEPLOYHQ_SERVERS') {
    const { repoFullName } = message.payload;
    (async () => {
      const dhqAccount = await getDeployHQAccount();
      if (!dhqAccount?.connected) {
        sendResponse({ success: false, servers: [], message: 'DeployHQ not connected' });
        return;
      }
      const mapping = await getDeployHQRepoMapping();
      const permalink = mapping[repoFullName];
      if (!permalink) {
        sendResponse({ success: false, servers: [], message: 'No matching project' });
        return;
      }
      try {
        const servers = await deployhq.fetchServers(
          dhqAccount.slug, dhqAccount.email, dhqAccount.apiKey, permalink,
        );
        sendResponse({ success: true, servers });
      } catch (err) {
        sendResponse({ success: false, servers: [], message: err instanceof Error ? err.message : 'Failed to fetch servers' });
      }
    })();
    return true;
  } else if (message.type === 'CREATE_DEPLOYHQ_DEPLOYMENT') {
    const { repoFullName, serverIdentifier } = message.payload;
    (async () => {
      const dhqAccount = await getDeployHQAccount();
      if (!dhqAccount?.connected) {
        sendResponse({ success: false, message: 'DeployHQ not connected' });
        return;
      }
      const mapping = await getDeployHQRepoMapping();
      const permalink = mapping[repoFullName];
      if (!permalink) {
        sendResponse({ success: false, message: 'No matching project' });
        return;
      }
      const result = await deployhq.createDeployment(
        dhqAccount.slug, dhqAccount.email, dhqAccount.apiKey, permalink, serverIdentifier,
      );
      sendResponse(result);
      if (result.success) pollPRs();
    })();
    return true;
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
    await saveCachedPRs([]);
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
        const account = accounts.find((a) => a.platform === pr.platform);
        if (!account) continue;

        try {
          let merged = false;
          if (pr.platform === 'github') {
            merged = await github.checkIfMerged(account.token, pr.repoFullName, pr.number);
          } else if (pr.platform === 'gitlab') {
            merged = await gitlab.checkIfMerged(account.token, pr.repoFullName, pr.number);
          } else if (pr.platform === 'bitbucket') {
            merged = await bitbucket.checkIfMerged(account.token, pr.repoFullName, pr.number);
          }
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

        // Refresh CI status — GitHub has a dedicated endpoint; GitLab/Bitbucket keep last-known status
        const account = accounts.find((a) => a.platform === pr.platform);
        if (pr.platform === 'github' && pr.headSha && account) {
          try {
            const ciResult = await github.refreshCIStatus(account.token, pr.repoFullName, pr.headSha);
            allPRs.push({ ...pr, ciStatus: ciResult.status, ciFailedChecks: ciResult.failedChecks.length > 0 ? ciResult.failedChecks : undefined });
          } catch {
            allPRs.push(pr); // keep with old status
          }
        } else {
          // GitLab/Bitbucket: keep merged PR with last-known CI status during TTL
          allPRs.push(pr);
        }
      }
    }

    // Cache PRs and update badge immediately — don't wait for DeployHQ
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

    // Enrich PRs with DeployHQ data asynchronously — updates cache when done
    enrichWithDeployHQ(allPRs);
  } catch (err) {
    console.error('Poll error:', err);
    updateBadge('error');
  }
}

// === DeployHQ background enrichment ===

async function enrichWithDeployHQ(prs: PullRequest[]) {
  const dhqAccount = await getDeployHQAccount();
  if (!dhqAccount?.connected) return;

  try {
    const projects = await deployhq.fetchProjects(
      dhqAccount.slug, dhqAccount.email, dhqAccount.apiKey,
    );
    const mapping: Record<string, string> = {};
    let changed = false;

    for (const pr of prs) {
      const project = deployhq.matchRepoToProject(pr.repoFullName, pr.platform, projects);
      if (project) {
        pr.deployhqProjectId = project.permalink;
        mapping[pr.repoFullName] = project.permalink;
        changed = true;
      }
    }

    await saveDeployHQRepoMapping(mapping);

    // Fetch latest deployments for matched projects
    const checkedPermalinks = new Set<string>();
    const deploymentsByPermalink: Record<string, Array<{ endRevision: string; serverName: string; url: string }>> = {};

    for (const pr of prs) {
      if (!pr.deployhqProjectId || !pr.headSha) continue;
      const permalink = pr.deployhqProjectId;
      if (!checkedPermalinks.has(permalink)) {
        checkedPermalinks.add(permalink);
        deploymentsByPermalink[permalink] = await deployhq.fetchLatestDeployments(
          dhqAccount.slug, dhqAccount.email, dhqAccount.apiKey, permalink,
        );
      }
      const deployments = deploymentsByPermalink[permalink] || [];
      const match = deployments.find((d) => d.endRevision === pr.headSha);
      if (match) {
        pr.deployhqDeployment = { serverName: match.serverName, url: match.url };
        changed = true;
      }
    }

    // Update cache with enriched data if anything changed
    if (changed) {
      await saveCachedPRs(prs);
    }
  } catch (err) {
    console.error('[PR Radar] DeployHQ enrichment failed:', err);
  }
}

// === Notifications ===

async function notifyCIChange(pr: PullRequest) {
  const settings = await getSettings();

  if (settings.notificationsEnabled) {
    const statusEmoji =
      pr.ciStatus === 'passed' ? '\u2705'
        : pr.ciStatus === 'failed' ? '\u274C'
          : pr.ciStatus === 'running' ? '\uD83D\uDD35'
            : '\u26A0\uFE0F';
    const title = `${statusEmoji} ${CI_STATUS_LABELS[pr.ciStatus]}`;

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

// === Sound ===

// Chrome: offscreen document (service workers can't play audio)
// Firefox: Web Audio API (no offscreen API, but background supports AudioContext)

async function playSound(soundId: string, volume?: number) {
  try {
    if (__BROWSER__ === 'firefox') {
      await playSoundWebAudio(soundId, volume ?? 0.7);
    } else {
      await playSoundOffscreen(soundId, volume ?? 0.7);
    }
  } catch {
    // Audio playback not available — ignore
  }
}

// Chrome path: offscreen document
async function playSoundOffscreen(soundId: string, volume: number) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen.html'),
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Play notification sounds',
    });
  }
  await new Promise((r) => setTimeout(r, 100));
  await chrome.runtime.sendMessage({ type: 'PLAY_SOUND', soundId, volume });
}

// Firefox path: Web Audio API in background script
async function playSoundWebAudio(soundId: string, volume: number) {
  const src = `sounds/${soundId}.mp3`;
  const url = chrome.runtime.getURL(src);
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const ctx = new AudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  const gainNode = ctx.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start();
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
