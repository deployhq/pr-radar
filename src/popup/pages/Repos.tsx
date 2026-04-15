import { useState, useEffect } from 'react';
import type { WatchedRepo } from '@/shared/types';
import { PLATFORM_LABELS } from '@/shared/constants';
import { getAccounts, getWatchedRepos, saveWatchedRepos } from '@/shared/storage';
import * as github from '@/shared/api/github';
import * as gitlab from '@/shared/api/gitlab';
import * as bitbucket from '@/shared/api/bitbucket';

export default function Repos() {
  const [repos, setRepos] = useState<WatchedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    async function load() {
      const [accounts, watched] = await Promise.all([getAccounts(), getWatchedRepos()]);
      const watchedMap = new Map(watched.map((r) => [`${r.platform}:${r.fullName}`, r.enabled]));

      const allRepos: WatchedRepo[] = [];

      for (const account of accounts) {
        try {
          if (account.platform === 'github') {
            const ghRepos = await github.getUserRepos(account.token);
            for (const r of ghRepos) {
              const key = `github:${r.full_name}`;
              allRepos.push({
                platform: 'github',
                fullName: r.full_name,
                enabled: watchedMap.get(key) ?? false,
              });
            }
          } else if (account.platform === 'gitlab') {
            const glRepos = await gitlab.getUserProjects(account.token);
            for (const r of glRepos) {
              const key = `gitlab:${r.path_with_namespace}`;
              allRepos.push({
                platform: 'gitlab',
                fullName: r.path_with_namespace,
                enabled: watchedMap.get(key) ?? false,
              });
            }
          } else if (account.platform === 'bitbucket') {
            const bbRepos = await bitbucket.getUserRepositories(account.token, account.username);
            for (const r of bbRepos) {
              const key = `bitbucket:${r.full_name}`;
              allRepos.push({
                platform: 'bitbucket',
                fullName: r.full_name,
                enabled: watchedMap.get(key) ?? false,
              });
            }
          }
        } catch (err) {
          console.error(`Failed to fetch repos for ${account.platform}:`, err);
        }
      }

      // Sort: enabled first, then alphabetically
      allRepos.sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.fullName.localeCompare(b.fullName);
      });

      setRepos(allRepos);
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
  }

  const filtered = filter.trim()
    ? repos.filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()))
    : repos;

  const enabledCount = repos.filter((r) => r.enabled).length;

  return (
    <div className="flex flex-col flex-1">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter repos..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-prbell-500"
          />
        </div>
        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
          Select which repos to monitor ({enabledCount} watched). Fewer repos = faster updates.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-prbell-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-gray-500">
            {filter ? 'No repos match your filter' : 'No repos found'}
          </div>
        ) : (
          <div className="px-4">
            {filtered.map((repo) => (
              <div
                key={`${repo.platform}:${repo.fullName}`}
                className="flex items-center gap-3 py-2 border-b border-gray-800"
              >
                <button
                  onClick={() => handleToggle(repo.fullName, repo.platform)}
                  className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[10px] border transition-colors ${
                    repo.enabled
                      ? 'bg-prbell-600 border-prbell-600 text-white'
                      : 'bg-gray-800 border-gray-600'
                  }`}
                >
                  {repo.enabled ? '\u2713' : ''}
                </button>
                <span className="flex-1 text-[13px] text-gray-200 truncate">
                  {repo.fullName}
                </span>
                <span className="text-[10px] text-gray-600">
                  {PLATFORM_LABELS[repo.platform]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
