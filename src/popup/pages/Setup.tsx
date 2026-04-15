import { useState } from 'react';
import type { Platform, PlatformAccount } from '@/shared/types';
import { PLATFORM_LABELS } from '@/shared/constants';
import { saveAccount } from '@/shared/storage';
import PlatformIcon from '../components/PlatformIcon';
import * as github from '@/shared/api/github';

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
    helpUrl: 'https://github.com/settings/tokens/new?scopes=repo,read:org&description=PRBell',
    helpLabel: 'Create a token (pre-filled with the right scopes)',
    comingSoon: false,
  },
  {
    platform: 'gitlab',
    placeholder: 'glpat-xxxxxxxxxxxx',
    helpUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    helpLabel: 'Create a token with read_api scope',
    comingSoon: true,
  },
  {
    platform: 'bitbucket',
    placeholder: 'App password',
    helpUrl: 'https://bitbucket.org/account/settings/app-passwords/',
    helpLabel: 'Create an app password with read permissions',
    comingSoon: true,
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
      } else {
        // GitLab/Bitbucket coming soon
        return;
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
        <span className="text-2xl">&#x1F514;</span>
        <h1 className="text-lg font-bold text-gray-100">PRBell</h1>
      </div>
      <p className="text-[13px] text-gray-500 mb-6 leading-relaxed">
        Connect your accounts to see all PRs in one place. Your tokens stay on your device.
      </p>

      <div className="space-y-3">
        {PLATFORMS.map((cfg) => {
          const isExpanded = connectingPlatform === cfg.platform;

          return (
            <div
              key={cfg.platform}
              className={`rounded-xl border transition-colors ${
                cfg.comingSoon
                  ? 'border-gray-800 bg-gray-800/30 opacity-60'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <button
                className="flex items-center gap-3 w-full px-4 py-3.5"
                onClick={() => {
                  if (cfg.comingSoon) return;
                  setConnectingPlatform(isExpanded ? null : cfg.platform);
                  setToken('');
                  setError('');
                }}
                disabled={cfg.comingSoon}
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
                  ) : (
                    <div className="text-[11px] text-gray-500">Not connected</div>
                  )}
                </div>
                {cfg.comingSoon ? (
                  <span className="text-[11px] px-3 py-1 rounded-md border border-gray-700 text-gray-600">
                    Soon
                  </span>
                ) : (
                  <span className="text-[11px] px-3 py-1 rounded-md border border-gray-600 text-gray-400">
                    Connect
                  </span>
                )}
              </button>

              {isExpanded && !cfg.comingSoon && (
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

    </div>
  );
}
