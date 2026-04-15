import { useState } from 'react';
import type { Platform, PlatformAccount } from '@/shared/types';
import { PLATFORM_LABELS } from '@/shared/constants';
import { saveAccount, getAccounts } from '@/shared/storage';
import * as github from '@/shared/api/github';
import * as gitlab from '@/shared/api/gitlab';
import * as bitbucket from '@/shared/api/bitbucket';

interface SetupProps {
  onComplete: () => void;
}

interface PlatformConfig {
  platform: Platform;
  icon: string;
  placeholder: string;
  helpUrl: string;
  helpLabel: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    platform: 'github',
    icon: '\u25CF',
    placeholder: 'ghp_xxxxxxxxxxxx',
    helpUrl: 'https://github.com/settings/tokens',
    helpLabel: 'Create a token with repo scope',
  },
  {
    platform: 'gitlab',
    icon: '\u25B2',
    placeholder: 'glpat-xxxxxxxxxxxx',
    helpUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    helpLabel: 'Create a token with read_api scope',
  },
  {
    platform: 'bitbucket',
    icon: '\u25C8',
    placeholder: 'App password',
    helpUrl: 'https://bitbucket.org/account/settings/app-passwords/',
    helpLabel: 'Create an app password with read permissions',
  },
];

export default function Setup({ onComplete }: SetupProps) {
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<Platform>>(new Set());
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConnect(platform: Platform) {
    if (!token.trim()) return;

    setLoading(true);
    setError('');

    try {
      let account: PlatformAccount;

      if (platform === 'github') {
        const user = await github.getAuthenticatedUser(token.trim());
        account = { platform, token: token.trim(), username: user.login, avatarUrl: user.avatar_url };
      } else if (platform === 'gitlab') {
        const user = await gitlab.getAuthenticatedUser(token.trim());
        account = { platform, token: token.trim(), username: user.username, avatarUrl: user.avatar_url };
      } else {
        const user = await bitbucket.getAuthenticatedUser(token.trim());
        account = { platform, token: token.trim(), username: user.nickname, avatarUrl: user.avatar };
      }

      await saveAccount(account);
      setConnectedPlatforms((prev) => new Set([...prev, platform]));
      setConnectingPlatform(null);
      setToken('');
    } catch {
      setError('Invalid token. Please check and try again.');
    } finally {
      setLoading(false);
    }
  }

  const hasAnyConnection = connectedPlatforms.size > 0;

  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">&#x1F514;</span>
        <h1 className="text-lg font-bold text-gray-100">PRBell</h1>
      </div>
      <p className="text-[13px] text-gray-500 mb-6 leading-relaxed">
        Connect your accounts to see all PRs in one place. Your tokens stay on your device.
      </p>

      <div className="space-y-3">
        {PLATFORMS.map((cfg) => {
          const isConnected = connectedPlatforms.has(cfg.platform);
          const isExpanded = connectingPlatform === cfg.platform;

          return (
            <div
              key={cfg.platform}
              className={`rounded-xl border transition-colors ${
                isConnected
                  ? 'border-emerald-800 bg-emerald-950/30'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <button
                className="flex items-center gap-3 w-full px-4 py-3.5"
                onClick={() => {
                  if (isConnected) return;
                  setConnectingPlatform(isExpanded ? null : cfg.platform);
                  setToken('');
                  setError('');
                }}
                disabled={isConnected}
              >
                <span className="text-xl w-9 h-9 flex items-center justify-center bg-gray-900 rounded-lg">
                  {cfg.icon}
                </span>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-gray-200">
                    {PLATFORM_LABELS[cfg.platform]}
                  </div>
                  {isConnected ? (
                    <div className="text-[11px] text-emerald-400">Connected</div>
                  ) : (
                    <div className="text-[11px] text-gray-500">Not connected</div>
                  )}
                </div>
                {isConnected ? (
                  <span className="text-emerald-400 text-sm">&#10003;</span>
                ) : (
                  <span className="text-[11px] px-3 py-1 rounded-md border border-gray-600 text-gray-400">
                    Connect
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={cfg.placeholder}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-prbell-500"
                    autoFocus
                  />
                  <a
                    href={cfg.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-prbell-400 hover:underline block"
                  >
                    {cfg.helpLabel} &rarr;
                  </a>
                  {error && <p className="text-[11px] text-red-400">{error}</p>}
                  <button
                    onClick={() => handleConnect(cfg.platform)}
                    disabled={loading || !token.trim()}
                    className="w-full py-2 bg-prbell-600 hover:bg-prbell-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {loading ? 'Verifying...' : 'Connect'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasAnyConnection && (
        <button
          onClick={async () => {
            const accounts = await getAccounts();
            if (accounts.length > 0) onComplete();
          }}
          className="w-full mt-6 py-2.5 bg-prbell-600 hover:bg-prbell-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Continue &rarr;
        </button>
      )}
    </div>
  );
}
