import { useState, useEffect, useCallback } from 'react';
import type { AppView, DashboardTab, PullRequest } from '@/shared/types';
import { getAccounts, getWatchedRepos, getCachedPRs, saveCachedPRs, getSettings } from '@/shared/storage';
import * as github from '@/shared/api/github';
import * as gitlab from '@/shared/api/gitlab';
import * as bitbucket from '@/shared/api/bitbucket';
import PRItem from '../components/PRItem';

interface DashboardProps {
  tab: DashboardTab;
  onNavigate: (view: AppView) => void;
}

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'mine', label: 'Mine' },
  { id: 'review', label: 'Review' },
  { id: 'all', label: 'All' },
];

export default function Dashboard({ tab, onNavigate }: DashboardProps) {
  const [prs, setPRs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [hasWatchedRepos, setHasWatchedRepos] = useState(true);
  const [stalePRDays, setStalePRDays] = useState(45);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchFromAPI = useCallback(async () => {
    const accounts = await getAccounts();
    const watchedRepos = await getWatchedRepos();
    const enabledRepos = watchedRepos.filter((r) => r.enabled);

    setHasWatchedRepos(enabledRepos.length > 0);

    if (enabledRepos.length === 0) {
      setPRs([]);
      await saveCachedPRs([]);
      return;
    }

    const allPRs: PullRequest[] = [];

    for (const account of accounts) {
      const repos = enabledRepos.filter((r) => r.platform === account.platform);

      if (repos.length === 0) continue;

      try {
        if (account.platform === 'github') {
          for (const repo of repos) {
            const repoPRs = await github.fetchPullRequests(account.token, repo.fullName, account.username);
            allPRs.push(...repoPRs);
          }
        } else if (account.platform === 'gitlab') {
          for (const repo of repos) {
            const repoPRs = await gitlab.fetchMergeRequests(account.token, repo.fullName, account.username);
            allPRs.push(...repoPRs);
          }
        } else if (account.platform === 'bitbucket') {
          for (const repo of repos) {
            const repoPRs = await bitbucket.fetchPullRequests(account.token, repo.fullName, account.username);
            allPRs.push(...repoPRs);
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('401') || errMsg.includes('403')) {
          setError(`${account.platform} token expired or invalid. Reconnect in Settings.`);
        }
        console.error(`Failed to fetch PRs from ${account.platform}:`, err);
      }
    }

    allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setPRs(allPRs);
    setLastUpdated(Date.now());
    await saveCachedPRs(allPRs);
  }, []);

  useEffect(() => {
    async function init() {
      // Load settings
      const settings = await getSettings();
      setStalePRDays(settings.stalePRDays);

      // 1. Show cached data instantly
      const cached = await getCachedPRs();
      if (cached && cached.prs.length > 0) {
        setPRs(cached.prs);
        setLastUpdated(cached.updatedAt);
        setHasWatchedRepos(true);
        setLoading(false);

        // 2. Refresh from API in background
        setRefreshing(true);
        try {
          await fetchFromAPI();
        } catch {
          // Keep showing cached data
        } finally {
          setRefreshing(false);
        }
      } else {
        // No cache — full load
        try {
          await fetchFromAPI();
        } catch {
          setError('Failed to fetch pull requests');
        } finally {
          setLoading(false);
        }
      }
    }
    init();
  }, [fetchFromAPI]);

  // Filter PRs by tab
  const filteredByTab = prs.filter((pr) => {
    if (tab === 'mine') return pr.isAuthor;
    if (tab === 'review') return pr.isReviewRequested;
    return true;
  });

  // Filter by search
  const filtered = search.trim()
    ? filteredByTab.filter(
        (pr) =>
          pr.title.toLowerCase().includes(search.toLowerCase()) ||
          pr.repoFullName.toLowerCase().includes(search.toLowerCase()),
      )
    : filteredByTab;

  const tabCounts: Record<DashboardTab, number> = {
    mine: prs.filter((pr) => pr.isAuthor).length,
    review: prs.filter((pr) => pr.isReviewRequested).length,
    all: prs.length,
  };

  return (
    <div className="flex flex-col flex-1">
      {/* Tabs */}
      <div className="flex border-b border-gray-800 bg-gray-900">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onNavigate({ type: 'dashboard', tab: t.id })}
            className={`flex-1 py-2.5 text-center text-xs border-b-2 transition-colors ${
              tab === t.id
                ? 'text-radar-400 border-radar-400'
                : 'text-gray-500 border-transparent hover:text-gray-400'
            }`}
          >
            {t.label}
            <span
              className={`ml-1 px-1.5 py-px rounded-full text-[11px] ${
                tab === t.id ? 'bg-radar-900 text-radar-400' : 'bg-gray-800 text-gray-500'
              }`}
            >
              {tabCounts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800">
        <input
          type="text"
          placeholder="Search PRs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-radar-500"
        />
        {/* Refresh button */}
        <button
          onClick={() => { setRefreshing(true); fetchFromAPI().finally(() => setRefreshing(false)); }}
          disabled={refreshing}
          className="text-[11px] px-2 py-1 rounded-full border border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors disabled:opacity-50"
          title="Refresh now"
        >
          &#x21BB;
        </button>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-center gap-2 py-1 border-b border-gray-800 min-h-[24px]">
        {refreshing ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border border-radar-400 border-t-transparent" />
            <span className="text-[10px] text-radar-400">Updating...</span>
          </>
        ) : lastUpdated ? (
          <span className="text-[10px] text-gray-600">
            Updated {getTimeAgoShort(lastUpdated)}
          </span>
        ) : null}
      </div>

      {/* PR list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-radar-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => { setError(''); setRefreshing(true); fetchFromAPI().finally(() => setRefreshing(false)); }}
              className="mt-2 text-xs text-radar-400 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : !hasWatchedRepos ? (
          <div className="px-5 py-12 text-center">
            <div className="text-3xl mb-3">&#x1F4E1;</div>
            <p className="text-sm font-medium text-gray-200">No repos selected</p>
            <p className="text-xs text-gray-500 mt-1">
              Choose which repos to watch to see their PRs here
            </p>
            <button
              onClick={() => onNavigate({ type: 'repos' })}
              className="mt-3 text-xs bg-radar-600 hover:bg-radar-700 text-white px-4 py-1.5 rounded-md transition-colors"
            >
              Select repos
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="text-3xl mb-3">
              {tab === 'review' ? '\u{1F440}' : '\u{1F389}'}
            </div>
            <p className="text-sm font-medium text-gray-200">
              {tab === 'review' ? 'No reviews requested' : 'No open PRs'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {tab === 'review'
                ? "You're all caught up!"
                : search
                  ? 'Try a different search'
                  : "You're all clear — no open PRs on your watched repos"}
            </p>
          </div>
        ) : (
          filtered.map((pr) => <PRItem key={pr.id} pr={pr} stalePRDays={stalePRDays} />)
        )}
      </div>
    </div>
  );
}

function getTimeAgoShort(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
