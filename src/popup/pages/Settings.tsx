import { useState, useEffect } from 'react';
import type { AppView, Platform, DeployHQAccount } from '@/shared/types';
import { PLATFORM_LABELS, SOUND_OPTIONS } from '@/shared/constants';
import { getSettings, saveSettings, getAccounts, removeAccount, getDeployHQAccount, removeDeployHQAccount, type Settings as SettingsType, type ThemeMode } from '@/shared/storage';
import { STORE_URL, GITHUB_REPO_URL, GITHUB_ISSUES_URL } from '@/shared/constants';

interface SettingsProps {
  onNavigate: (view: AppView) => void;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export default function Settings({ onNavigate, theme, onThemeChange }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<{ platform: Platform; username: string }[]>([]);

  // DeployHQ state
  const [dhqAccount, setDhqAccount] = useState<DeployHQAccount | null>(null);
  const [dhqSlug, setDhqSlug] = useState('');
  const [dhqEmail, setDhqEmail] = useState('');
  const [dhqApiKey, setDhqApiKey] = useState('');
  const [dhqTesting, setDhqTesting] = useState(false);
  const [dhqError, setDhqError] = useState('');
  const [dhqExpanded, setDhqExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      const [s, accounts, dhq] = await Promise.all([getSettings(), getAccounts(), getDeployHQAccount()]);
      setSettings(s);
      setConnectedPlatforms(accounts.map((a) => ({ platform: a.platform, username: a.username })));
      if (dhq) {
        setDhqAccount(dhq);
        setDhqSlug(dhq.slug);
        setDhqEmail(dhq.email);
        setDhqApiKey(dhq.apiKey);
      }
    }
    load();
  }, []);

  async function handleToggle(key: keyof SettingsType, value: boolean) {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveSettings({ [key]: value });
    chrome.runtime.sendMessage({ type: 'REFRESH_SETTINGS' });
  }

  async function handleChange<K extends keyof SettingsType>(key: K, value: SettingsType[K]) {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveSettings({ [key]: value });
    if (key === 'pollIntervalSeconds') {
      chrome.runtime.sendMessage({ type: 'REFRESH_SETTINGS' });
    }
  }

  async function handleDisconnect(platform: Platform) {
    await removeAccount(platform);
    setConnectedPlatforms((prev) => prev.filter((p) => p.platform !== platform));

    // If no accounts left, go to setup
    if (connectedPlatforms.length <= 1) {
      onNavigate({ type: 'setup' });
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-label="Loading settings">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-radar-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Notifications */}
      <Section title="Notifications">
        <SettingRow
          label="Desktop notifications"
          description="When CI status changes on your PRs"
        >
          <Toggle checked={settings.notificationsEnabled} onChange={(v) => handleToggle('notificationsEnabled', v)} label="Desktop notifications" />
        </SettingRow>
        <SettingRow
          label="Sound alerts"
          description="Play a sound on CI pass or fail"
        >
          <Toggle checked={settings.soundEnabled} onChange={(v) => handleToggle('soundEnabled', v)} label="Sound alerts" />
        </SettingRow>
        {settings.soundEnabled && (
          <SettingRow label="Sound">
            <div className="flex items-center gap-2">
              <select
                value={settings.soundId}
                onChange={(e) => handleChange('soundId', e.target.value as SettingsType['soundId'])}
                aria-label="Notification sound"
                className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-600 dark:text-gray-400"
              >
                {SOUND_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          </SettingRow>
        )}
        <SettingRow
          label="New comments"
          description="Notify when new comments appear"
        >
          <Toggle checked={settings.notifyOnComments} onChange={(v) => handleToggle('notifyOnComments', v)} label="New comment notifications" />
        </SettingRow>
        <SettingRow
          label="Test"
          description="Send a test notification"
        >
          <button
            onClick={() => {
              chrome.runtime.sendMessage({ type: 'TEST_NOTIFICATION' });
            }}
            className="text-[11px] px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Test
          </button>
        </SettingRow>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <SettingRow
          label="Theme"
          description="Switch between light and dark mode"
        >
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
            {(['light', 'system', 'dark'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                onClick={async () => {
                  onThemeChange(mode);
                  await saveSettings({ theme: mode });
                }}
                className={`text-[11px] px-2.5 py-1 rounded transition-colors capitalize ${
                  theme === mode
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      {/* Display */}
      <Section title="Display">
        <SettingRow
          label="Dim stale PRs after"
          description="Older PRs appear faded"
        >
          <select
            value={settings.stalePRDays}
            onChange={(e) => handleChange('stalePRDays', Number(e.target.value))}
            aria-label="Stale PR threshold"
            className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-600 dark:text-gray-400"
          >
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={45}>45 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={0}>Never</option>
          </select>
        </SettingRow>
      </Section>

      {/* Polling */}
      <Section title="Polling">
        <SettingRow label="Check interval">
          <select
            value={settings.pollIntervalSeconds}
            onChange={(e) => handleChange('pollIntervalSeconds', Number(e.target.value))}
            aria-label="Polling interval"
            className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-600 dark:text-gray-400"
          >
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={120}>2 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
        </SettingRow>
      </Section>

      {/* Accounts */}
      <Section title="Accounts">
        {connectedPlatforms.map(({ platform, username }) => (
          <SettingRow
            key={platform}
            label={PLATFORM_LABELS[platform]}
            description={`@${username}`}
          >
            <button
              onClick={() => handleDisconnect(platform)}
              className="text-[11px] text-gray-500 hover:text-red-400 transition-colors"
            >
              Disconnect
            </button>
          </SettingRow>
        ))}
        {(['github', 'gitlab', 'bitbucket'] as Platform[])
          .filter((p) => !connectedPlatforms.find((c) => c.platform === p))
          .map((platform) => (
            <SettingRow
              key={platform}
              label={PLATFORM_LABELS[platform]}
              description="Not connected"
            >
              <button
                onClick={() => onNavigate({ type: 'setup' })}
                className="text-[11px] text-radar-400 hover:underline"
              >
                Connect
              </button>
            </SettingRow>
          ))}
        {dhqAccount?.connected ? (
          <SettingRow
            label="DeployHQ"
            description={`${dhqAccount.slug}.deployhq.com`}
          >
            <button
              onClick={async () => {
                await removeDeployHQAccount();
                setDhqAccount(null);
                setDhqSlug('');
                setDhqEmail('');
                setDhqApiKey('');
                setDhqError('');
                setDhqExpanded(false);
              }}
              className="text-[11px] text-gray-500 hover:text-red-400 transition-colors"
            >
              Disconnect
            </button>
          </SettingRow>
        ) : (
          <>
            <SettingRow
              label="DeployHQ"
              description="Not connected"
            >
              <button
                onClick={() => setDhqExpanded(!dhqExpanded)}
                className="text-[11px] text-radar-400 hover:underline"
              >
                {dhqExpanded ? 'Cancel' : 'Connect'}
              </button>
            </SettingRow>
            {dhqExpanded && (
              <div className="py-3 border-b border-gray-200 dark:border-gray-800">
                <div className="space-y-2.5">
                  <div>
                    <label htmlFor="dhq-slug" className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">Account</label>
                    <div className="flex items-center gap-1">
                      <input
                        id="dhq-slug"
                        type="text"
                        value={dhqSlug}
                        onChange={(e) => { setDhqSlug(e.target.value); setDhqError(''); }}
                        placeholder="my-company"
                        disabled={dhqTesting}
                        className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-800 dark:text-gray-200 w-[130px] disabled:opacity-50"
                      />
                      <span className="text-[11px] text-gray-500">.deployhq.com</span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="dhq-email" className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">Email</label>
                    <input
                      id="dhq-email"
                      type="email"
                      value={dhqEmail}
                      onChange={(e) => { setDhqEmail(e.target.value); setDhqError(''); }}
                      placeholder="you@company.com"
                      disabled={dhqTesting}
                      className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-800 dark:text-gray-200 w-full disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="dhq-api-key" className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">API key</label>
                    <input
                      id="dhq-api-key"
                      type="password"
                      value={dhqApiKey}
                      onChange={(e) => { setDhqApiKey(e.target.value); setDhqError(''); }}
                      placeholder="Your API key"
                      disabled={dhqTesting}
                      className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-800 dark:text-gray-200 w-full disabled:opacity-50"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">
                  Find your API key in{' '}
                  <span className="text-radar-400">Settings &#8594; Security</span>
                  {' '}in DeployHQ
                </p>
                {dhqError && (
                  <p className="text-[11px] text-red-400 mt-1.5">{dhqError}</p>
                )}
                <button
                  onClick={async () => {
                    if (!dhqSlug || !dhqEmail || !dhqApiKey) {
                      setDhqError('All fields are required');
                      return;
                    }
                    setDhqTesting(true);
                    setDhqError('');
                    try {
                      const result = await chrome.runtime.sendMessage({
                        type: 'TEST_DEPLOYHQ',
                        payload: { slug: dhqSlug, email: dhqEmail, apiKey: dhqApiKey },
                      }) as { success: boolean; accountName?: string; message?: string };
                      if (result.success) {
                        setDhqAccount({
                          slug: dhqSlug,
                          email: dhqEmail,
                          apiKey: dhqApiKey,
                          connected: true,
                          accountName: result.accountName,
                        });
                        setDhqExpanded(false);
                      } else {
                        setDhqError(result.message || 'Connection failed');
                      }
                    } catch (err) {
                      setDhqError(err instanceof Error ? err.message : 'Failed to connect');
                    }
                    setDhqTesting(false);
                  }}
                  disabled={dhqTesting}
                  className="mt-3 text-[11px] px-3 py-1.5 rounded-md font-semibold bg-[#5740cf] text-white border border-[#6b54d9] hover:bg-[#6b54d9] transition-colors disabled:opacity-60 disabled:cursor-wait flex items-center gap-1.5"
                >
                  {dhqTesting && (
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {dhqTesting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Community */}
      <div className="mb-5 space-y-2">
        <a
          href={STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg bg-radar-50 dark:bg-radar-950/50 border border-radar-200 dark:border-radar-900/50 px-4 py-3 hover:border-radar-300 dark:hover:border-radar-700/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-gray-800 dark:text-gray-200 font-medium">&#128229; Share with your team</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Works best when your whole team uses it</div>
            </div>
            <span className="text-gray-400 dark:text-gray-600 text-xs">&#8594;</span>
          </div>
        </a>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg bg-radar-50 dark:bg-radar-950/50 border border-radar-200 dark:border-radar-900/50 px-4 py-3 hover:border-radar-300 dark:hover:border-radar-700/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-gray-800 dark:text-gray-200 font-medium">&#9733; Star us on GitHub</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Help others discover PR Radar</div>
            </div>
            <span className="text-gray-400 dark:text-gray-600 text-xs">&#8594;</span>
          </div>
        </a>
        <a
          href={GITHUB_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg bg-radar-50 dark:bg-radar-950/50 border border-radar-200 dark:border-radar-900/50 px-4 py-3 hover:border-radar-300 dark:hover:border-radar-700/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-gray-800 dark:text-gray-200 font-medium">&#128172; Feedback &amp; Ideas</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Report bugs or suggest features</div>
            </div>
            <span className="text-gray-400 dark:text-gray-600 text-xs">&#8594;</span>
          </div>
        </a>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
        {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-200 dark:border-gray-800">
      <div>
        <div className="text-[13px] text-gray-800 dark:text-gray-200">{label}</div>
        {description && <div className="text-[11px] text-gray-500 mt-0.5">{description}</div>}
      </div>
      {children}
    </div>
  );
}


function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        checked ? 'bg-radar-600' : 'bg-gray-300 dark:bg-gray-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}
