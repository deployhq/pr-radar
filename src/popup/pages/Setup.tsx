import { useState, useEffect } from 'react';
import type { Platform, PlatformAccount } from '@/shared/types';
import { PLATFORM_LABELS } from '@/shared/constants';
import { getAccounts, saveAccount } from '@/shared/storage';
import PlatformIcon from '../components/PlatformIcon';
import * as github from '@/shared/api/github';
import * as gitlab from '@/shared/api/gitlab';
import * as bitbucket from '@/shared/api/bitbucket';

interface SetupProps {
  onComplete: () => void;
}

interface PlatformConfig {
  platform: Platform;
  placeholder: string;
  helpUrl: string;
  helpLabel: string;
  comingSoon: boolean;
}

const PLATFORMS: PlatformConfig[] = [
  {
    platform: 'github',
    placeholder: 'ghp_xxxxxxxxxxxx',
    helpUrl: 'https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR Radar',
    helpLabel: 'Create a token (pre-filled with the right scopes)',
    comingSoon: false,
  },
  {
    platform: 'gitlab',
    placeholder: 'glpat-xxxxxxxxxxxx',
    helpUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens?scopes=read_api',
    helpLabel: 'Create a token with read_api scope',
    comingSoon: false,
  },
  {
    platform: 'bitbucket',
    placeholder: 'API token',
    helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    helpLabel: 'Create an API token with repository and pull request read scopes',
    comingSoon: false,
  },
];

const ICON_COLORS: Record<Platform, string> = {
  github: 'text-white',
  gitlab: 'text-orange-500',
  bitbucket: 'text-blue-500',
};

export default function Setup({ onComplete }: SetupProps) {
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [token, setToken] = useState('');
  const [bbEmail, setBbEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Map<Platform, string>>(new Map());

  useEffect(() => {
    getAccounts().then((accounts) => {
      setConnectedPlatforms(new Map(accounts.map((a) => [a.platform, a.username])));
    });
  }, []);

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
        if (!bbEmail.trim()) {
          setError('Email is required for Bitbucket.');
          setLoading(false);
          return;
        }
        const encodedToken = btoa(`${bbEmail.trim()}:${token.trim()}`);
        const user = await bitbucket.getAuthenticatedUser(encodedToken);
        account = { platform, token: encodedToken, username: user.nickname, avatarUrl: user.avatar };
      }

      await saveAccount(account);
      onComplete();
    } catch {
      setError('Invalid token. Please check and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">&#x1F4E1;</span>
        <h1 className="text-lg font-bold text-gray-100">PR Radar</h1>
      </div>
      <p className="text-[13px] text-gray-500 mb-6 leading-relaxed">
        Connect your accounts to see all PRs in one place. Your tokens stay on your device.
      </p>

      <div className="space-y-3">
        {PLATFORMS.map((cfg) => {
          const isExpanded = connectingPlatform === cfg.platform;
          const connectedUser = connectedPlatforms.get(cfg.platform);
          const isConnected = !!connectedUser;

          return (
            <div
              key={cfg.platform}
              className={`rounded-xl border transition-colors ${
                cfg.comingSoon
                  ? 'border-gray-800 bg-gray-800/30 opacity-60'
                  : isConnected
                    ? 'border-emerald-800/50 bg-emerald-900/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <button
                className="flex items-center gap-3 w-full px-4 py-3.5"
                onClick={() => {
                  if (cfg.comingSoon || isConnected) return;
                  setConnectingPlatform(isExpanded ? null : cfg.platform);
                  setToken('');
                  setBbEmail('');
                  setError('');
                }}
                disabled={cfg.comingSoon || isConnected}
              >
                <span className="w-9 h-9 flex items-center justify-center bg-gray-900 rounded-lg">
                  <PlatformIcon platform={cfg.platform} size={20} className={ICON_COLORS[cfg.platform]} />
                </span>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-gray-200">
                    {PLATFORM_LABELS[cfg.platform]}
                  </div>
                  {cfg.comingSoon ? (
                    <div className="text-[11px] text-gray-600">Coming soon</div>
                  ) : isConnected ? (
                    <div className="text-[11px] text-emerald-400">Connected as @{connectedUser}</div>
                  ) : (
                    <div className="text-[11px] text-gray-500">Not connected</div>
                  )}
                </div>
                {cfg.comingSoon ? (
                  <span className="text-[11px] px-3 py-1 rounded-md border border-gray-700 text-gray-600">
                    Soon
                  </span>
                ) : isConnected ? (
                  <span className="text-[11px] px-3 py-1 rounded-md border border-emerald-700/50 text-emerald-400">
                    &#10003;
                  </span>
                ) : (
                  <span className="text-[11px] px-3 py-1 rounded-md border border-gray-600 text-gray-400">
                    Connect
                  </span>
                )}
              </button>

              {isExpanded && !cfg.comingSoon && (
                <div className="px-4 pb-4 space-y-2">
                  {cfg.platform === 'bitbucket' && (
                    <input
                      type="email"
                      value={bbEmail}
                      onChange={(e) => setBbEmail(e.target.value)}
                      placeholder="Bitbucket email address"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-radar-500"
                      autoFocus
                    />
                  )}
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={cfg.placeholder}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-radar-500"
                    autoFocus={cfg.platform !== 'bitbucket'}
                  />
                  <a
                    href={cfg.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-radar-400 hover:underline block"
                  >
                    {cfg.helpLabel} &rarr;
                  </a>
                  {error && <p className="text-[11px] text-red-400">{error}</p>}
                  <button
                    onClick={() => handleConnect(cfg.platform)}
                    disabled={loading || !token.trim() || (cfg.platform === 'bitbucket' && !bbEmail.trim())}
                    className="w-full py-2 bg-radar-600 hover:bg-radar-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {loading ? 'Verifying...' : 'Connect'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
