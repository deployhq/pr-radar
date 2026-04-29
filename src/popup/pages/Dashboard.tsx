import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { AppView, DashboardTab, PullRequest, UrgencyCategory } from '@/shared/types';
import { getWatchedRepos, getCachedPRs, getSettings, getInstallDate, isStarPromptDismissed, dismissStarPrompt } from '@/shared/storage';
import { STORE_URL, GITHUB_REPO_URL } from '@/shared/constants';
import { matchesUrgencyFilter, computeUrgencyCounts } from '../utils/urgency';
import PRItem from '../components/PRItem';
import TriageSummary from '../components/TriageSummary';
import KeyboardShortcuts from '../components/KeyboardShortcuts';
import StatusBanners from '../components/StatusBanners';

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
  const [pinnedRepos, setPinnedRepos] = useState<Set<string>>(new Set());
  const [stalePRDays, setStalePRDays] = useState(45);
  const [longWaitDays, setLongWaitDays] = useState(2);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyCategory | null>(null);
  const [showStarBanner, setShowStarBanner] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadPinnedRepos = useCallback(async () => {
    const watchedRepos = await getWatchedRepos();
    const pinned = new Set(
      watchedRepos
        .filter((r) => r.enabled && r.pinned)
        .map((r) => `${r.platform}:${r.fullName}`),
    );
    setPinnedRepos(pinned);
    return watchedRepos;
  }, []);

  const loadFromCache = useCallback(async () => {
    const watchedRepos = await getWatchedRepos();
    const enabledRepos = watchedRepos.filter((r) => r.enabled);
    setHasWatchedRepos(enabledRepos.length > 0);

    const cached = await getCachedPRs();
    if (cached && cached.prs.length > 0 && enabledRepos.length > 0) {
      setPRs(cached.prs);
      setLastUpdated(cached.updatedAt);
      return true;
    }
    return false;
  }, []);

  const triggerBackgroundRefresh = useCallback(() => {
    setRefreshing(true);
    // The service worker responds when pollPRs() finishes — this covers
    // early-return paths (no accounts, no repos, errors) that don't write
    // to the PR cache and therefore wouldn't trigger onChanged.
    chrome.runtime.sendMessage({ type: 'POLL_NOW' }, () => {
      setRefreshing(false);
      loadFromCache();
    });
  }, [loadFromCache]);

  useEffect(() => {
    async function init() {
      const [settings] = await Promise.all([getSettings(), loadPinnedRepos()]);
      setStalePRDays(settings.stalePRDays);
      setLongWaitDays(settings.longWaitDays);

      const hadCache = await loadFromCache();
      setLoading(false);

      // Ask the service worker to refresh — it will update chrome.storage
      if (hadCache) {
        triggerBackgroundRefresh();
      } else {
        // No cache — trigger poll and wait for result
        triggerBackgroundRefresh();
      }
    }
    init();
  }, [loadFromCache, loadPinnedRepos, triggerBackgroundRefresh]);

  // Listen for storage changes from the service worker's poll
  useEffect(() => {
    function onStorageChange(changes: { [key: string]: chrome.storage.StorageChange }) {
      if (changes['pr_radar_pr_cache']) {
        const newCache = changes['pr_radar_pr_cache'].newValue;
        if (newCache && newCache.prs) {
          setPRs(newCache.prs);
          setLastUpdated(newCache.updatedAt);
          setHasWatchedRepos(true);
        }
        setRefreshing(false);
        setLoading(false);
        setError('');
      }
      if (changes['pr_radar_repos']) {
        loadPinnedRepos();
      }
    }

    chrome.storage.local.onChanged.addListener(onStorageChange);
    return () => chrome.storage.local.onChanged.removeListener(onStorageChange);
  }, [loadPinnedRepos]);

  // Check if star banner should show (7+ days since install, not dismissed)
  useEffect(() => {
    async function checkStarBanner() {
      const [installDate, dismissed] = await Promise.all([getInstallDate(), isStarPromptDismissed()]);
      if (dismissed || !installDate) return;
      const daysSinceInstall = (Date.now() - installDate) / 86400000;
      if (daysSinceInstall >= 7) setShowStarBanner(true);
    }
    checkStarBanner();
  }, []);

  // Reset urgency filter on tab change
  useEffect(() => { setUrgencyFilter(null); }, [tab]);

  const handleToggleUrgencyFilter = useCallback((category: UrgencyCategory | null) => {
    setUrgencyFilter(category);
  }, []);

  // Reset focused index when list changes
  useEffect(() => { setFocusedIndex(-1); }, [tab, urgencyFilter, search]);

  // Filter PRs by tab
  const filteredByTab = prs.filter((pr) => {
    if (tab === 'mine') return pr.isAuthor;
    if (tab === 'review') return pr.isReviewRequested && !pr.isDraft;
    return true;
  });

  // Compute urgency counts from tab-filtered list (before urgency filter)
  const urgencyCounts = useMemo(
    () => computeUrgencyCounts(filteredByTab, stalePRDays, longWaitDays),
    [filteredByTab, stalePRDays, longWaitDays],
  );

  // Filter by urgency
  const filteredByUrgency = urgencyFilter
    ? filteredByTab.filter((pr) => matchesUrgencyFilter(pr, urgencyFilter, stalePRDays, longWaitDays))
    : filteredByTab;

  // Filter by search
  const searched = search.trim()
    ? filteredByUrgency.filter(
        (pr) =>
          pr.title.toLowerCase().includes(search.toLowerCase()) ||
          pr.repoFullName.toLowerCase().includes(search.toLowerCase()),
      )
    : filteredByUrgency;

  // Sort by priority first, then pinned within same priority tier, then date
  // When long_wait filter is active, sort by longest waiting first
  const filtered = [...searched].sort((a, b) => {
    if (urgencyFilter === 'long_wait') {
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }
    const pa = prPriority(a, stalePRDays);
    const pb = prPriority(b, stalePRDays);
    if (pa !== pb) return pa - pb;
    const aPinned = pinnedRepos.has(`${a.platform}:${a.repoFullName}`) ? 0 : 1;
    const bPinned = pinnedRepos.has(`${b.platform}:${b.repoFullName}`) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  // Keyboard navigation
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      if (e.key === '?' && !inInput) {
        e.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }

      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (inInput) { (target as HTMLInputElement).blur(); return; }
        if (search) { setSearch(''); return; }
        if (urgencyFilter) { setUrgencyFilter(null); return; }
        if (focusedIndex >= 0) { setFocusedIndex(-1); return; }
        return;
      }

      if (inInput) return;

      const list = filteredRef.current;
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, list.length - 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'o':
        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < list.length) {
            e.preventDefault();
            window.open(list[focusedIndex].url, '_blank');
          }
          break;
        case '1':
          e.preventDefault();
          onNavigate({ type: 'dashboard', tab: 'mine' });
          break;
        case '2':
          e.preventDefault();
          onNavigate({ type: 'dashboard', tab: 'review' });
          break;
        case '3':
          e.preventDefault();
          onNavigate({ type: 'dashboard', tab: 'all' });
          break;
        case 'r':
          e.preventDefault();
          triggerBackgroundRefresh();
          break;
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, search, urgencyFilter, showShortcuts, onNavigate, triggerBackgroundRefresh]);

  // Scroll focused PR into view
  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return;
    const items = listRef.current.children;
    if (items[focusedIndex]) {
      items[focusedIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  const tabCounts: Record<DashboardTab, number> = {
    mine: prs.filter((pr) => pr.isAuthor).length,
    review: prs.filter((pr) => pr.isReviewRequested && !pr.isDraft).length,
    all: prs.length,
  };

  return (
    <div className="flex flex-col flex-1 relative">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900" role="tablist" aria-label="Pull request filters">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => onNavigate({ type: 'dashboard', tab: t.id })}
            className={`flex-1 py-2.5 text-center text-xs border-b-2 transition-colors ${
              tab === t.id
                ? 'text-radar-600 dark:text-radar-400 border-radar-600 dark:border-radar-400'
                : 'text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-400'
            }`}
          >
            {t.label}
            <span
              className={`ml-1 px-1.5 py-px rounded-full text-[11px] ${
                tab === t.id ? 'bg-radar-100 dark:bg-radar-900 text-radar-600 dark:text-radar-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
              }`}
            >
              {tabCounts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800">
        <input
          ref={searchRef}
          type="text"
          placeholder="Search PRs...  (/ to focus)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search pull requests"
          className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-radar-500"
        />
        {/* Refresh button */}
        <button
          onClick={() => triggerBackgroundRefresh()}
          disabled={refreshing}
          className="text-[11px] px-2 py-1 rounded-full border border-gray-300 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors disabled:opacity-50"
          title="Refresh now"
          aria-label="Refresh pull requests"
        >
          &#x21BB;
        </button>
      </div>

      {/* Poll errors & rate limit warnings */}
      <StatusBanners />

      {/* Triage summary */}
      <TriageSummary
        total={filteredByTab.length}
        counts={urgencyCounts}
        activeFilter={urgencyFilter}
        onToggleFilter={handleToggleUrgencyFilter}
      />

      {/* Status bar */}
      <div className="flex items-center justify-center gap-2 py-1 border-b border-gray-200 dark:border-gray-800 min-h-[24px]" role="status" aria-live="polite">
        {refreshing ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border border-radar-400 border-t-transparent" aria-hidden="true" />
            <span className="text-[10px] text-radar-400">Updating...</span>
          </>
        ) : lastUpdated ? (
          <span className="text-[10px] text-gray-400 dark:text-gray-600">
            Updated {getTimeAgoShort(lastUpdated)}
          </span>
        ) : null}
      </div>

      {/* Star banner */}
      {showStarBanner && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-radar-200 dark:border-radar-900/50 bg-radar-50 dark:bg-radar-950/30">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-radar-600 dark:hover:text-radar-400 transition-colors"
          >
            &#9733; Enjoying PR Radar? <span className="text-radar-400">Star us on GitHub</span> to help others discover it
          </a>
          <button
            onClick={() => { setShowStarBanner(false); dismissStarPrompt(); }}
            className="text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 text-xs leading-none flex-shrink-0"
            title="Dismiss"
            aria-label="Dismiss star banner"
          >
            &#10005;
          </button>
        </div>
      )}

      {/* PR list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16" role="status" aria-label="Loading pull requests">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-radar-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-400" role="alert">{error}</p>
            <button
              onClick={() => { setError(''); triggerBackgroundRefresh(); }}
              className="mt-2 text-xs text-radar-400 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : !hasWatchedRepos ? (
          <div className="px-5 py-12 text-center">
            <div className="text-3xl mb-3" aria-hidden="true">&#x1F4E1;</div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">No repos selected</p>
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
        ) : urgencyFilter && filtered.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-xs text-gray-500">No PRs match this filter</p>
            <button
              onClick={() => setUrgencyFilter(null)}
              className="mt-1 text-xs text-radar-400 hover:underline"
            >
              Clear filter
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="text-3xl mb-3" aria-hidden="true">
              {tab === 'review' ? '\u{1F440}' : '\u{1F389}'}
            </div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {tab === 'review' ? 'No reviews requested' : 'No open PRs'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {tab === 'review'
                ? "You're all caught up!"
                : search
                  ? 'Try a different search'
                  : "You're all clear — no open PRs on your watched repos"}
            </p>
            {!search && (
              <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-4">
                Enjoying PR Radar?{' '}
                <a
                  href={STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-radar-400 hover:underline"
                >
                  Share it with your team
                </a>
                {' '}to keep everyone in sync.
              </p>
            )}
          </div>
        ) : (
          <div ref={listRef}>
            {filtered.map((pr, i) => (
              <PRItem
                key={pr.id}
                pr={pr}
                stalePRDays={stalePRDays}
                pinned={pinnedRepos.has(`${pr.platform}:${pr.repoFullName}`)}
                onMerged={triggerBackgroundRefresh}
                focused={i === focusedIndex}
              />
            ))}
          </div>
        )}
      </div>
      {showShortcuts && <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

function prPriority(pr: PullRequest, stalePRDays: number): number {
  const isStale = stalePRDays > 0 && (Date.now() - new Date(pr.updatedAt).getTime()) > stalePRDays * 86400000;
  if (pr.isMerged || pr.isDraft || isStale) return 90;
  if (pr.isBot) return 80;
  if (pr.ciStatus === 'failed') return 0;
  if (pr.reviewStatus === 'changes_requested') return 1;
  if (pr.unresolvedCommentCount > 0) return 2;
  if (pr.ciStatus === 'running') return 3;
  if (pr.ciStatus === 'pending') return 4;
  return 10;
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
