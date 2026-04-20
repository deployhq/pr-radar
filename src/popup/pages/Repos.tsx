import { useState, useEffect } from 'react';
import type { Platform, WatchedRepo } from '@/shared/types';
import { getAccounts, getWatchedRepos, saveWatchedRepos } from '@/shared/storage';
import * as github from '@/shared/api/github';
import * as gitlab from '@/shared/api/gitlab';
import * as bitbucket from '@/shared/api/bitbucket';
import PlatformIcon from '../components/PlatformIcon';

export default function Repos() {
  const [repos, setRepos] = useState<WatchedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<Platform>>(new Set());

  useEffect(() => {
    async function load() {
      const [accounts, watched] = await Promise.all([getAccounts(), getWatchedRepos()]);
      const watchedMap = new Map(watched.map((r) => [`${r.platform}:${r.fullName}`, r]));

      const allRepos: WatchedRepo[] = [];

      for (const account of accounts) {
        try {
          if (account.platform === 'github') {
            const ghRepos = await github.getUserRepos(account.token);
            for (const r of ghRepos) {
              const key = `github:${r.full_name}`;
              const saved = watchedMap.get(key);
              allRepos.push({
                platform: 'github',
                fullName: r.full_name,
                enabled: saved?.enabled ?? false,
                pinned: saved?.pinned ?? false,
              });
            }
          } else if (account.platform === 'gitlab') {
            const glRepos = await gitlab.getUserProjects(account.token);
            for (const r of glRepos) {
              const key = `gitlab:${r.path_with_namespace}`;
              const saved = watchedMap.get(key);
              allRepos.push({
                platform: 'gitlab',
                fullName: r.path_with_namespace,
                enabled: saved?.enabled ?? false,
                pinned: saved?.pinned ?? false,
              });
            }
          } else if (account.platform === 'bitbucket') {
            const bbRepos = await bitbucket.getUserRepositories(account.token);
            for (const r of bbRepos) {
              const key = `bitbucket:${r.full_name}`;
              const saved = watchedMap.get(key);
              allRepos.push({
                platform: 'bitbucket',
                fullName: r.full_name,
                enabled: saved?.enabled ?? false,
                pinned: saved?.pinned ?? false,
              });
            }
          }
        } catch (err) {
          console.error(`Failed to fetch repos for ${account.platform}:`, err);
        }
      }

      // Sort: pinned+enabled first, then enabled, then disabled — alphabetical within each group
      allRepos.sort((a, b) => {
        const aRank = a.enabled && a.pinned ? 0 : a.enabled ? 1 : 2;
        const bRank = b.enabled && b.pinned ? 0 : b.enabled ? 1 : 2;
        if (aRank !== bRank) return aRank - bRank;
        return a.fullName.localeCompare(b.fullName);
      });

      setRepos(allRepos);
      setConnectedPlatforms(new Set(accounts.map((a) => a.platform)));
      setLoading(false);
    }
    load();
  }, []);

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
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter repos..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter repositories"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-radar-500"
          />
        </div>
        {connectedPlatforms.size > 1 && (
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={() => setPlatformFilter('all')}
              className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                platformFilter === 'all'
                  ? 'border-radar-600 text-radar-400 bg-radar-900/30'
                  : 'border-gray-700 text-gray-500 hover:text-gray-400'
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
                        ? 'border-radar-600 bg-radar-900/30'
                        : 'border-gray-700 text-gray-500 hover:text-gray-400'
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
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16" role="status" aria-label="Loading repositories">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-radar-500 border-t-transparent" />
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
                className="flex items-center gap-3 py-2 border-b border-gray-800 w-full text-left hover:bg-gray-800/30 transition-colors"
              >
                <span
                  aria-hidden="true"
                  className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[10px] border transition-colors ${
                    repo.enabled
                      ? 'bg-radar-600 border-radar-600 text-white'
                      : 'bg-gray-800 border-gray-600'
                  }`}
                >
                  {repo.enabled ? '\u2713' : ''}
                </span>
                <span className="flex-1 text-[13px] text-gray-200 truncate">
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
                        ? 'text-yellow-400'
                        : 'text-gray-700 hover:text-gray-500'
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
              <div className="mt-4 mb-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  <span className="text-gray-300 font-medium">Missing GitHub repos?</span>{' '}
                  We recommend using a <span className="text-gray-300">classic token</span> with
                  the <code className="text-radar-400 bg-gray-900 px-1 py-0.5 rounded text-[10px]">repo</code> scope.
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
              <div className="mt-4 mb-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  <span className="text-gray-300 font-medium">Missing GitLab projects?</span>{' '}
                  Your token needs the <code className="text-radar-400 bg-gray-900 px-1 py-0.5 rounded text-[10px]">read_api</code> scope
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
              <div className="mt-4 mb-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  <span className="text-gray-300 font-medium">Missing Bitbucket repos?</span>{' '}
                  Your API token needs <span className="text-gray-300">Account: Read</span>,{' '}
                  <span className="text-gray-300">Repositories: Read</span>, and{' '}
                  <span className="text-gray-300">Pull requests: Read</span> scopes.
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
