import { useState, useEffect, useCallback } from 'react';
import type { AppView, DashboardTab, PullRequest, Platform } from '@/shared/types';
import { getAccounts, getWatchedRepos } from '@/shared/storage';
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
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');

  const fetchPRs = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const accounts = await getAccounts();
      const watchedRepos = await getWatchedRepos();
      const enabledRepos = watchedRepos.filter((r) => r.enabled);

      const allPRs: PullRequest[] = [];

      for (const account of accounts) {
        const repos = enabledRepos.filter((r) => r.platform === account.platform);

        if (repos.length === 0) continue;

        try {
          if (account.platform === 'github') {
            for (const repo of repos) {
              const prs = await github.fetchPullRequests(account.token, repo.fullName, account.username);
              allPRs.push(...prs);
            }
          } else if (account.platform === 'gitlab') {
            for (const repo of repos) {
              const prs = await gitlab.fetchMergeRequests(account.token, repo.fullName, account.username);
              allPRs.push(...prs);
            }
          } else if (account.platform === 'bitbucket') {
            for (const repo of repos) {
              const prs = await bitbucket.fetchPullRequests(account.token, repo.fullName, account.username);
              allPRs.push(...prs);
            }
          }
        } catch (err) {
          console.error(`Failed to fetch PRs from ${account.platform}:`, err);
        }
      }

      // Sort by most recently updated
      allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setPRs(allPRs);
    } catch {
      setError('Failed to fetch pull requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPRs();
  }, [fetchPRs]);

  // Filter PRs by tab
  const filteredByTab = prs.filter((pr) => {
    if (tab === 'mine') return pr.isAuthor;
    if (tab === 'review') return pr.isReviewRequested;
    return true;
  });

  // Filter by platform
  const filteredByPlatform = platformFilter === 'all'
    ? filteredByTab
    : filteredByTab.filter((pr) => pr.platform === platformFilter);

  // Filter by search
  const filtered = search.trim()
    ? filteredByPlatform.filter(
        (pr) =>
          pr.title.toLowerCase().includes(search.toLowerCase()) ||
          pr.repoFullName.toLowerCase().includes(search.toLowerCase()),
      )
    : filteredByPlatform;

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
                ? 'text-prbell-400 border-prbell-400'
                : 'text-gray-500 border-transparent hover:text-gray-400'
            }`}
          >
            {t.label}
            <span
              className={`ml-1 px-1.5 py-px rounded-full text-[11px] ${
                tab === t.id ? 'bg-prbell-900 text-prbell-400' : 'bg-gray-800 text-gray-500'
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
          className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-prbell-500"
        />
        {(['all', 'github', 'gitlab', 'bitbucket'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
              platformFilter === p
                ? 'bg-prbell-900 text-prbell-400 border-prbell-600'
                : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600'
            }`}
          >
            {p === 'all' ? 'All' : p === 'github' ? 'GH' : p === 'gitlab' ? 'GL' : 'BB'}
          </button>
        ))}
      </div>

      {/* PR list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-prbell-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={fetchPRs}
              className="mt-2 text-xs text-prbell-400 hover:underline"
            >
              Retry
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
                  : 'PRs from your watched repos will appear here'}
            </p>
          </div>
        ) : (
          filtered.map((pr) => <PRItem key={pr.id} pr={pr} />)
        )}
      </div>
    </div>
  );
}
