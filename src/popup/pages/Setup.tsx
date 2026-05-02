import { useState, useEffect } from 'react';
import type { Platform, PlatformAccount } from '@/shared/types';
import { PLATFORM_LABELS } from '@/shared/constants';
import { getAccounts, saveAccount } from '@/shared/storage';
import { normalizeInstanceUrl, requestInstanceHostPermission } from '@/shared/instanceUrl';
import PlatformIcon from '../components/PlatformIcon';
import * as github from '@/shared/api/github';
import * as gitlab from '@/shared/api/gitlab';
import * as bitbucket from '@/shared/api/bitbucket';

interface SetupProps {
  onComplete: () => void;
}

interface ScopeInfo {
  name: string;
  reason: string;
}

interface PlatformConfig {
  platform: Platform;
  placeholder: string;
  helpUrl: string;
  helpLabel: string;
  comingSoon: boolean;
  scopes: ScopeInfo[];
  note?: string;
  /** Whether the self-hosted instance toggle is offered for this platform. */
  supportsSelfHosted: boolean;
  /** Build a token-creation URL for the user's instance (canonical or self-hosted). */
  buildTokenUrl?: (instanceUrl: string) => string;
  /** Placeholder shown in the Instance URL input. */
  instancePlaceholder?: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    platform: 'github',
    placeholder: 'ghp_xxxxxxxxxxxx',
    helpUrl: 'https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR Radar',
    helpLabel: 'Create a classic token (scopes pre-filled)',
    comingSoon: false,
    scopes: [
      { name: 'repo', reason: 'Access PRs, CI status, and merge' },
      { name: 'read:org', reason: 'List organization repositories' },
    ],
    note: 'If your org uses SSO, authorize the token for that org after creating it.',
    supportsSelfHosted: true,
    buildTokenUrl: (instanceUrl) =>
      `${instanceUrl.replace(/\/+$/, '')}/settings/tokens/new?scopes=repo,read:org&description=PR%20Radar`,
    instancePlaceholder: 'https://github.example.com',
  },
  {
    platform: 'gitlab',
    placeholder: 'glpat-xxxxxxxxxxxx',
    helpUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens?name=PR+Radar&scopes=api,read_user',
    helpLabel: 'Create a token (scopes pre-filled)',
    comingSoon: false,
    scopes: [
      { name: 'api', reason: 'Access projects, merge requests, and CI pipelines' },
      { name: 'read_user', reason: 'Identify your account' },
    ],
    note: 'The api scope is needed to merge MRs. read_api is sufficient if you don\'t need merge.',
    supportsSelfHosted: true,
    buildTokenUrl: (instanceUrl) =>
      `${instanceUrl.replace(/\/+$/, '')}/-/user_settings/personal_access_tokens?name=PR+Radar&scopes=api,read_user`,
    instancePlaceholder: 'https://gitlab.example.com',
  },
  {
    platform: 'bitbucket',
    placeholder: 'API token',
    helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    helpLabel: 'Create an API token',
    comingSoon: false,
    scopes: [
      { name: 'read:user:bitbucket', reason: 'Identify your account' },
      { name: 'read:workspace:bitbucket', reason: 'List your workspaces' },
      { name: 'read:repository:bitbucket', reason: 'List repositories' },
      { name: 'read:pullrequest:bitbucket', reason: 'View pull requests and CI' },
      { name: 'write:pullrequest:bitbucket', reason: 'Merge pull requests' },
    ],
    supportsSelfHosted: false,
  },
];

const ICON_COLORS: Record<Platform, string> = {
  github: 'text-gray-900 dark:text-white',
  gitlab: 'text-orange-500',
  bitbucket: 'text-blue-500',
};

export default function Setup({ onComplete }: SetupProps) {
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [token, setToken] = useState('');
  const [bbEmail, setBbEmail] = useState('');
  const [selfHosted, setSelfHosted] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Map<Platform, string>>(new Map());

  useEffect(() => {
    getAccounts().then((accounts) => {
      setConnectedPlatforms(new Map(accounts.map((a) => [a.platform, a.username])));
    });
  }, []);

  function resetForm() {
    setToken('');
    setBbEmail('');
    setSelfHosted(false);
    setInstanceUrl('');
    setError('');
  }

  async function handleConnect(platform: Platform) {
    if (!token.trim()) return;

    let normalizedInstance: string | undefined;
    if (selfHosted) {
      const trimmed = instanceUrl.trim();
      if (!trimmed) {
        setError('Enter a valid HTTPS instance URL (e.g. https://gitlab.example.com).');
        return;
      }
      const normalized = normalizeInstanceUrl(trimmed, platform);
      if (!normalized) {
        // Distinguish "this is just the canonical" from "this is invalid"
        const isCanonical = normalizeInstanceUrl(trimmed) !== null;
        setError(isCanonical
          ? `That's the public ${PLATFORM_LABELS[platform]} URL — untoggle "Self-hosted instance" to use the public service.`
          : 'Enter a valid HTTPS instance URL (e.g. https://gitlab.example.com).');
        return;
      }
      normalizedInstance = normalized;
    }

    setLoading(true);
    setError('');

    try {
      // Request runtime host permission for self-hosted instances before any API call.
      if (normalizedInstance) {
        const granted = await requestInstanceHostPermission(normalizedInstance);
        if (!granted) {
          setError('Permission to access this instance was denied. Connection cancelled.');
          setLoading(false);
          return;
        }
      }

      let account: PlatformAccount;

      if (platform === 'github') {
        const user = await github.getAuthenticatedUser(token.trim(), normalizedInstance);
        account = { platform, token: token.trim(), username: user.login, avatarUrl: user.avatar_url, instanceUrl: normalizedInstance };
      } else if (platform === 'gitlab') {
        const user = await gitlab.getAuthenticatedUser(token.trim(), normalizedInstance);
        account = { platform, token: token.trim(), username: user.username, avatarUrl: user.avatar_url, instanceUrl: normalizedInstance };
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">&#x1F4E1;</span>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">PR Radar</h1>
      </div>
      <p className="text-[13px] text-gray-500 mb-6 leading-relaxed">
        Connect your accounts to see all PRs in one place. Your tokens stay on your device.
      </p>

      <div className="space-y-3">
        {PLATFORMS.map((cfg) => {
          const isExpanded = connectingPlatform === cfg.platform;
          const connectedUser = connectedPlatforms.get(cfg.platform);
          const isConnected = !!connectedUser;
          const normalizedInstance = selfHosted ? normalizeInstanceUrl(instanceUrl) : null;
          const helpUrl = isExpanded && cfg.supportsSelfHosted && cfg.buildTokenUrl && normalizedInstance
            ? cfg.buildTokenUrl(normalizedInstance)
            : cfg.helpUrl;

          return (
            <div
              key={cfg.platform}
              className={`rounded-xl border transition-colors ${
                cfg.comingSoon
                  ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30 opacity-60'
                  : isConnected
                    ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <button
                className="flex items-center gap-3 w-full px-4 py-3.5"
                onClick={() => {
                  if (cfg.comingSoon || isConnected) return;
                  setConnectingPlatform(isExpanded ? null : cfg.platform);
                  resetForm();
                }}
                disabled={cfg.comingSoon || isConnected}
              >
                <span className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg">
                  <PlatformIcon platform={cfg.platform} size={20} className={ICON_COLORS[cfg.platform]} />
                </span>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                    {PLATFORM_LABELS[cfg.platform]}
                  </div>
                  {cfg.comingSoon ? (
                    <div className="text-[11px] text-gray-400 dark:text-gray-600">Coming soon</div>
                  ) : isConnected ? (
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400">Connected as @{connectedUser}</div>
                  ) : (
                    <div className="text-[11px] text-gray-500">Not connected</div>
                  )}
                </div>
                {cfg.comingSoon ? (
                  <span className="text-[11px] px-3 py-1 rounded-md border border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-600">
                    Soon
                  </span>
                ) : isConnected ? (
                  <span className="text-[11px] px-3 py-1 rounded-md border border-emerald-300 dark:border-emerald-700/50 text-emerald-600 dark:text-emerald-400">
                    &#10003;
                  </span>
                ) : (
                  <span className="text-[11px] px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
                    Connect
                  </span>
                )}
              </button>

              {isExpanded && !cfg.comingSoon && (
                <div className="px-4 pb-4 space-y-2">
                  {cfg.supportsSelfHosted && (
                    <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                      <input
                        type="checkbox"
                        checked={selfHosted}
                        onChange={(e) => {
                          setSelfHosted(e.target.checked);
                          setError('');
                          if (!e.target.checked) setInstanceUrl('');
                        }}
                        className="rounded border-gray-300 dark:border-gray-700 text-radar-600 focus:ring-radar-500"
                      />
                      <span className="text-[12px] text-gray-700 dark:text-gray-300">
                        Self-hosted instance
                      </span>
                    </label>
                  )}
                  {cfg.supportsSelfHosted && selfHosted && (
                    <input
                      type="url"
                      value={instanceUrl}
                      onChange={(e) => setInstanceUrl(e.target.value)}
                      placeholder={cfg.instancePlaceholder ?? 'https://your-instance.example.com'}
                      aria-label="Instance URL"
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-radar-500"
                      autoFocus
                    />
                  )}
                  {cfg.platform === 'bitbucket' && (
                    <input
                      type="email"
                      value={bbEmail}
                      onChange={(e) => setBbEmail(e.target.value)}
                      placeholder="Bitbucket email address"
                      aria-label="Bitbucket email address"
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-radar-500"
                      autoFocus
                    />
                  )}
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={cfg.placeholder}
                    aria-label={`${PLATFORM_LABELS[cfg.platform]} personal access token`}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-radar-500"
                    autoFocus={cfg.platform !== 'bitbucket' && !(cfg.supportsSelfHosted && selfHosted)}
                  />
                  <a
                    href={helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-radar-400 hover:underline block"
                  >
                    {cfg.helpLabel} &rarr;
                  </a>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-2.5">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mb-1.5">Required scopes</p>
                    {cfg.scopes.map((scope) => (
                      <div key={scope.name} className="py-0.5">
                        <code className="text-[10px] text-radar-600 dark:text-radar-400 bg-gray-100 dark:bg-gray-800 px-1 py-px rounded">
                          {scope.name}
                        </code>
                      </div>
                    ))}
                    {cfg.note && (
                      <p className="text-[10px] text-amber-400/80 mt-1.5 leading-relaxed">
                        {cfg.note}
                      </p>
                    )}
                  </div>
                  {error && <p className="text-[11px] text-red-400" role="alert">{error}</p>}
                  <button
                    onClick={() => handleConnect(cfg.platform)}
                    disabled={loading || !token.trim() || (cfg.platform === 'bitbucket' && !bbEmail.trim()) || (selfHosted && !instanceUrl.trim())}
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
