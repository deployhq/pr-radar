import { useState, useEffect } from 'react';
import type { Platform, WatchedRepo } from '@/shared/types';
import type { AvailableRepo, AvailableReposProgress } from '@/shared/storage';
import {
  getAccounts,
  getWatchedRepos,
  saveWatchedRepos,
  getCachedAvailableRepos,
  getAvailableReposProgress,
  AVAILABLE_REPOS_PROGRESS_KEY,
} from '@/shared/storage';
import PlatformIcon from '../components/PlatformIcon';

function formatProgress(p: AvailableReposProgress): string {
  const label = p.platform === 'github' ? 'GitHub' : p.platform === 'gitlab' ? 'GitLab' : 'Bitbucket';
  return p.detail ? `Loading ${label} repos… (${p.detail})` : `Loading ${label} repos…`;
}

// Merge the cached available-repo list with saved watch state, then sort:
// pinned+enabled first, then enabled, then the rest — alphabetical within each group.
function buildRepoList(available: AvailableRepo[], watched: WatchedRepo[]): WatchedRepo[] {
  const watchedMap = new Map(watched.map((r) => [`${r.platform}:${r.fullName}`, r]));
  const seen = new Set<string>();
  const list: WatchedRepo[] = [];

  for (const r of available) {
    const key = `${r.platform}:${r.fullName}`;
    seen.add(key);
    const saved = watchedMap.get(key);
    list.push({
      platform: r.platform,
      fullName: r.fullName,
      enabled: saved?.enabled ?? false,
      pinned: saved?.pinned ?? false,
    });
  }

  // Include watched repos missing from the available list — repos added by name,
  // or ones beyond the pagination cap in a very large org. Only surface enabled
  // or pinned ones so we don't resurrect stale, no-longer-accessible entries.
  for (const w of watched) {
    const key = `${w.platform}:${w.fullName}`;
    if (seen.has(key) || (!w.enabled && !w.pinned)) continue;
    seen.add(key);
    list.push({ platform: w.platform, fullName: w.fullName, enabled: w.enabled, pinned: w.pinned ?? false });
  }

  list.sort((a, b) => {
    const aRank = a.enabled && a.pinned ? 0 : a.enabled ? 1 : 2;
    const bRank = b.enabled && b.pinned ? 0 : b.enabled ? 1 : 2;
    if (aRank !== bRank) return aRank - bRank;
    return a.fullName.localeCompare(b.fullName);
  });
  return list;
}

// Accepts "owner/repo", a pasted web URL, or a ".git" clone URL and reduces it
// to the platform's path form (owner/repo, group/sub/project, workspace/repo).
function normalizeRepoInput(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, '') // scheme + host
    .replace(/^(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\//i, '') // bare host
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, ''); // stray slashes
}

export default function Repos() {
  const [repos, setRepos] = useState<WatchedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<AvailableReposProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<Platform>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addPlatform, setAddPlatform] = useState<Platform>('github');
  const [addValue, setAddValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Live progress from the background fetch ("Loading GitHub repos… (org)").
    function onStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) {
      if (area !== 'local' || !changes[AVAILABLE_REPOS_PROGRESS_KEY]) return;
      setProgress((changes[AVAILABLE_REPOS_PROGRESS_KEY].newValue as AvailableReposProgress) ?? null);
    }
    chrome.storage.onChanged.addListener(onStorageChange);

    async function run() {
      // Cache-first: render whatever we have instantly so reopening the popup is
      // never a blank spinner.
      const [accounts, cache, watched, initialProgress] = await Promise.all([
        getAccounts(),
        getCachedAvailableRepos(),
        getWatchedRepos(),
        getAvailableReposProgress(),
      ]);
      if (cancelled) return;
      setConnectedPlatforms(new Set(accounts.map((a) => a.platform)));
      setProgress(initialProgress);
      if (cache) {
        setRepos(buildRepoList(cache.repos, watched));
        setError(cache.error ?? null);
        setLoading(false);
      }

      // Refresh via the service worker so the (slow) fetch survives the popup
      // being closed — it keeps running in the background and writes to the
      // cache, which we re-read once it resolves. See issue #23.
      setRefreshing(true);
      try {
        await chrome.runtime.sendMessage({ type: 'FETCH_AVAILABLE_REPOS' });
      } catch {
        // Service worker unreachable; fall back to whatever cache we rendered.
      }
      if (cancelled) return;
      const [freshCache, freshWatched] = await Promise.all([
        getCachedAvailableRepos(),
        getWatchedRepos(),
      ]);
      if (cancelled) return;
      if (freshCache) {
        setRepos(buildRepoList(freshCache.repos, freshWatched));
        setError(freshCache.error ?? null);
      }
      setLoading(false);
      setRefreshing(false);
      setProgress(null);
    }

    run();
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onStorageChange);
    };
  }, []);

  // Keep the "add by name" platform pointed at a connected platform.
  useEffect(() => {
    const first = (['github', 'gitlab', 'bitbucket'] as Platform[]).find((p) =>
      connectedPlatforms.has(p),
    );
    if (first && !connectedPlatforms.has(addPlatform)) setAddPlatform(first);
  }, [connectedPlatforms, addPlatform]);

  async function handleAddRepo(e: React.FormEvent) {
    e.preventDefault();
    const fullName = normalizeRepoInput(addValue);
    if (!fullName.includes('/')) {
      setAddError('Enter a repo as owner/name');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'VERIFY_REPO',
        payload: { platform: addPlatform, fullName },
      });
      if (!res?.success) {
        setAddError(res?.message ?? 'Could not add repo');
        return;
      }
      const canonical: string = res.fullName;
      const key = `${addPlatform}:${canonical}`;
      const exists = repos.some((r) => `${r.platform}:${r.fullName}` === key);
      const updated = exists
        ? repos.map((r) => (`${r.platform}:${r.fullName}` === key ? { ...r, enabled: true } : r))
        : [
            { platform: addPlatform, fullName: canonical, enabled: true, pinned: false } satisfies WatchedRepo,
            ...repos,
          ];
      setRepos(updated);
      await saveWatchedRepos(updated);
      chrome.runtime.sendMessage({ type: 'POLL_NOW' });
      setAddValue('');
      setShowAdd(false);
    } catch {
      setAddError('Could not reach the extension background');
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(fullName: string, platform: string) {
    const updated = repos.map((r) =>
      r.fullName === fullName && r.platform === platform
        ? { ...r, enabled: !r.enabled }
        : r,
    );
    setRepos(updated);
    await saveWatchedRepos(updated);
    chrome.runtime.sendMessage({ type: 'POLL_NOW' });
  }

  async function handleTogglePin(e: React.MouseEvent, fullName: string, platform: string) {
    e.stopPropagation();
    const updated = repos.map((r) =>
      r.fullName === fullName && r.platform === platform
        ? { ...r, pinned: !r.pinned }
        : r,
    );
    setRepos(updated);
    await saveWatchedRepos(updated);
  }

  const filtered = repos.filter((r) => {
    if (platformFilter !== 'all' && r.platform !== platformFilter) return false;
    if (filter.trim() && !r.fullName.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const enabledCount = repos.filter((r) => r.enabled).length;
  const allFiltered = filtered.length > 0 && filtered.every((r) => r.enabled);

  async function handleSelectAll() {
    const filteredKeys = new Set(filtered.map((r) => `${r.platform}:${r.fullName}`));
    const updated = repos.map((r) =>
      filteredKeys.has(`${r.platform}:${r.fullName}`)
        ? { ...r, enabled: !allFiltered }
        : r,
    );
    setRepos(updated);
    await saveWatchedRepos(updated);
    chrome.runtime.sendMessage({ type: 'POLL_NOW' });
  }

  return (
    <div className="flex flex-col flex-1">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter repos..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter repositories"
            className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-radar-500"
          />
        </div>
        {connectedPlatforms.size > 1 && (
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={() => setPlatformFilter('all')}
              className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                platformFilter === 'all'
                  ? 'border-radar-600 text-radar-600 dark:text-radar-400 bg-radar-50 dark:bg-radar-900/30'
                  : 'border-gray-300 dark:border-gray-700 text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
              }`}
            >
              All
            </button>
            {(['github', 'gitlab', 'bitbucket'] as Platform[])
              .filter((p) => connectedPlatforms.has(p))
              .map((p) => {
                const iconColor = p === 'gitlab' ? 'text-orange-500' : p === 'bitbucket' ? 'text-blue-500' : '';
                return (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    aria-label={`Filter by ${p === 'github' ? 'GitHub' : p === 'gitlab' ? 'GitLab' : 'Bitbucket'}`}
                    aria-pressed={platformFilter === p}
                    className={`flex items-center justify-center w-7 h-6 text-[11px] rounded-md border transition-colors ${
                      platformFilter === p
                        ? 'border-radar-600 bg-radar-50 dark:bg-radar-900/30'
                        : 'border-gray-300 dark:border-gray-700 text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                    }`}
                  >
                    <PlatformIcon platform={p} size={12} className={iconColor} />
                  </button>
                );
              })}
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <p className="text-[11px] text-gray-500">
            {enabledCount} of {repos.length} repos watched
          </p>
          {filtered.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-[11px] text-radar-400 hover:underline"
            >
              {allFiltered ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>
        {refreshing && repos.length > 0 && (
          <p className="text-[11px] text-gray-400 mt-1 truncate" aria-live="polite">
            {progress ? formatProgress(progress) : 'Updating…'}
          </p>
        )}

        {connectedPlatforms.size > 0 && (
          <div className="mt-2">
            {!showAdd ? (
              <button
                onClick={() => {
                  setShowAdd(true);
                  setAddError(null);
                }}
                className="text-[11px] text-radar-400 hover:underline"
              >
                + Add a repo by name
              </button>
            ) : (
              <form onSubmit={handleAddRepo} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  {connectedPlatforms.size > 1 && (
                    <select
                      value={addPlatform}
                      onChange={(e) => setAddPlatform(e.target.value as Platform)}
                      aria-label="Platform for the repo to add"
                      className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-1.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 outline-none focus:border-radar-500"
                    >
                      {(['github', 'gitlab', 'bitbucket'] as Platform[])
                        .filter((p) => connectedPlatforms.has(p))
                        .map((p) => (
                          <option key={p} value={p}>
                            {p === 'github' ? 'GitHub' : p === 'gitlab' ? 'GitLab' : 'Bitbucket'}
                          </option>
                        ))}
                    </select>
                  )}
                  <input
                    type="text"
                    autoFocus
                    value={addValue}
                    onChange={(e) => setAddValue(e.target.value)}
                    placeholder={
                      addPlatform === 'bitbucket'
                        ? 'workspace/repo'
                        : addPlatform === 'gitlab'
                          ? 'group/project'
                          : 'owner/repo'
                    }
                    aria-label="Repository name to add"
                    className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-radar-500"
                  />
                  <button
                    type="submit"
                    disabled={adding || !addValue.trim()}
                    className="flex-shrink-0 text-[11px] px-2.5 py-1.5 rounded-md bg-radar-600 text-white disabled:opacity-50 hover:bg-radar-500 transition-colors"
                  >
                    {adding ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdd(false);
                      setAddValue('');
                      setAddError(null);
                    }}
                    className="flex-shrink-0 text-[11px] px-1.5 py-1.5 text-gray-500 hover:text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
                {addError && (
                  <p className="text-[11px] text-red-500 dark:text-red-400" role="alert">
                    {addError}
                  </p>
                )}
                <p className="text-[11px] text-gray-500">
                  For large orgs where a repo may not appear in the list above.
                </p>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16" role="status" aria-label="Loading repositories">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-radar-500 border-t-transparent" />
            <p className="text-[11px] text-gray-500 truncate max-w-[80%]" aria-live="polite">
              {progress ? formatProgress(progress) : 'Loading repositories…'}
            </p>
          </div>
        ) : error && repos.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-red-500 dark:text-red-400">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-gray-500">
            {filter ? 'No repos match your filter' : 'No repos found'}
          </div>
        ) : (
          <div className="px-4">
            {filtered.map((repo) => (
              <button
                key={`${repo.platform}:${repo.fullName}`}
                onClick={() => handleToggle(repo.fullName, repo.platform)}
                role="checkbox"
                aria-checked={repo.enabled}
                aria-label={`${repo.enabled ? 'Unwatch' : 'Watch'} ${repo.fullName}`}
                className="flex items-center gap-3 py-2 border-b border-gray-200 dark:border-gray-800 w-full text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
              >
                <span
                  aria-hidden="true"
                  className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[10px] border transition-colors ${
                    repo.enabled
                      ? 'bg-radar-600 border-radar-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {repo.enabled ? '\u2713' : ''}
                </span>
                <span className="flex-1 text-[13px] text-gray-900 dark:text-gray-200 truncate">
                  {repo.fullName}
                </span>
                <span className="flex-shrink-0 text-gray-600">
                  <PlatformIcon platform={repo.platform} size={14} />
                </span>
                {repo.enabled && (
                  <button
                    onClick={(e) => handleTogglePin(e, repo.fullName, repo.platform)}
                    className={`flex-shrink-0 text-sm transition-colors ${
                      repo.pinned
                        ? 'text-yellow-500 dark:text-yellow-400'
                        : 'text-gray-300 dark:text-gray-700 hover:text-gray-400 dark:hover:text-gray-500'
                    }`}
                    title={repo.pinned ? 'Unpin repo' : 'Pin to top'}
                    aria-label={repo.pinned ? `Unpin ${repo.fullName}` : `Pin ${repo.fullName} to top`}
                    aria-pressed={repo.pinned}
                  >
                    {repo.pinned ? '\u2605' : '\u2606'}
                  </button>
                )}
              </button>
            ))}

            {/* Token scope callouts */}
            {connectedPlatforms.has('github') && (
              <div className="mt-4 mb-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">Missing GitHub repos?</span>{' '}
                  We recommend using a <span className="text-gray-700 dark:text-gray-300">classic token</span> with
                  the <code className="text-radar-600 dark:text-radar-400 bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-[10px]">repo</code> scope.
                  Fine-grained tokens may not show all org repos.
                </p>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR+Radar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-[11px] text-radar-400 hover:underline"
                >
                  Create a classic token &rarr;
                </a>
              </div>
            )}
            {connectedPlatforms.has('gitlab') && (
              <div className="mt-4 mb-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">Missing GitLab projects?</span>{' '}
                  Your token needs the <code className="text-radar-600 dark:text-radar-400 bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-[10px]">read_api</code> scope
                  to access private projects and merge requests.
                </p>
                <a
                  href="https://gitlab.com/-/user_settings/personal_access_tokens?scopes=read_api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-[11px] text-radar-400 hover:underline"
                >
                  Create a GitLab token &rarr;
                </a>
              </div>
            )}
            {connectedPlatforms.has('bitbucket') && (
              <div className="mt-4 mb-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">Missing Bitbucket repos?</span>{' '}
                  Your API token needs <span className="text-gray-700 dark:text-gray-300">Account: Read</span>,{' '}
                  <span className="text-gray-700 dark:text-gray-300">Repositories: Read</span>, and{' '}
                  <span className="text-gray-700 dark:text-gray-300">Pull requests: Read</span> scopes.
                </p>
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-[11px] text-radar-400 hover:underline"
                >
                  Manage API tokens &rarr;
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
