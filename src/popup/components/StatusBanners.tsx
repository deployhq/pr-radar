import { useEffect, useState, useMemo } from 'react';
import type { PollError, PollErrorKind, RateLimitInfo, Platform } from '@/shared/types';
import {
  POLL_ERRORS_KEY,
  RATE_LIMITS_KEY,
  getPollErrors,
  getRateLimits,
  getPollErrorsDismissedAt,
  getRateLimitDismissedAt,
  dismissPollErrors,
  dismissRateLimitWarning,
} from '@/shared/storage';
import { PLATFORM_LABELS } from '@/shared/constants';

const RATE_LIMIT_THRESHOLD = 0.1; // warn when remaining < 10%

const KIND_LABEL: Record<PollErrorKind, string> = {
  rate_limit: 'Rate limit hit',
  auth: 'Token rejected',
  forbidden: 'Permission denied',
  not_found: 'Repo not found',
  timeout: 'API is slow',
  server: 'Server error',
  network: 'Network error',
  unknown: 'Failed to load',
};

const KIND_HINT: Record<PollErrorKind, string> = {
  rate_limit: 'API rate limit reached. Will retry once it resets.',
  auth: 'Token may be expired or revoked. Re-authenticate in Settings.',
  forbidden: 'Token lacks permission for this repo.',
  not_found: 'Repo may have been renamed, deleted, or moved.',
  timeout: 'Provider is slow or temporarily unavailable. Will retry next poll.',
  server: 'Provider is having issues. Will retry next poll.',
  network: 'Browser couldn\u2019t reach the API. Check your connection.',
  unknown: 'See console for details. Will retry next poll.',
};

// Errors that resolve themselves on retry — auto-dismiss when the underlying
// error clears, so the user doesn't have to acknowledge a transient blip.
const TRANSIENT_KINDS = new Set<PollErrorKind>(['timeout', 'server', 'network']);

export default function StatusBanners() {
  const [errors, setErrors] = useState<PollError[]>([]);
  const [rateLimits, setRateLimits] = useState<Record<Platform, RateLimitInfo | undefined>>({
    github: undefined, gitlab: undefined, bitbucket: undefined,
  });
  const [errorsDismissedAt, setErrorsDismissedAt] = useState(0);
  const [rateLimitDismissedAt, setRateLimitDismissedAt] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      const [e, r, ed, rd] = await Promise.all([
        getPollErrors(),
        getRateLimits(),
        getPollErrorsDismissedAt(),
        getRateLimitDismissedAt(),
      ]);
      setErrors(e);
      setRateLimits(r);
      setErrorsDismissedAt(ed);
      setRateLimitDismissedAt(rd);
    }
    load();
  }, []);

  useEffect(() => {
    function onChange(changes: { [key: string]: chrome.storage.StorageChange }) {
      if (changes[POLL_ERRORS_KEY]) setErrors(changes[POLL_ERRORS_KEY].newValue ?? []);
      if (changes[RATE_LIMITS_KEY]) setRateLimits(changes[RATE_LIMITS_KEY].newValue ?? {});
    }
    chrome.storage.local.onChanged.addListener(onChange);
    return () => chrome.storage.local.onChanged.removeListener(onChange);
  }, []);

  // Filter errors by dismissal — only hide errors timestamped before dismissal
  const visibleErrors = useMemo(() => {
    return errors.filter((e) => e.timestamp > errorsDismissedAt);
  }, [errors, errorsDismissedAt]);

  // Find rate limits that are below threshold and not dismissed
  const lowRateLimits = useMemo(() => {
    const result: RateLimitInfo[] = [];
    for (const platform of ['github', 'gitlab'] as Platform[]) {
      const rl = rateLimits[platform];
      if (!rl) continue;
      if (rl.remaining / rl.limit >= RATE_LIMIT_THRESHOLD) continue;
      if (rl.capturedAt <= rateLimitDismissedAt) continue;
      // Reset window has passed — info is stale, ignore
      if (rl.resetAt < Date.now()) continue;
      result.push(rl);
    }
    return result;
  }, [rateLimits, rateLimitDismissedAt]);

  const handleDismissErrors = () => {
    dismissPollErrors();
    setErrorsDismissedAt(Date.now());
    setExpanded(false);
  };

  const handleDismissRateLimit = () => {
    dismissRateLimitWarning();
    setRateLimitDismissedAt(Date.now());
  };

  const errorSummary = useMemo(() => {
    if (visibleErrors.length === 0) return null;
    const kinds = new Set(visibleErrors.map((e) => e.kind));
    // If all the same kind, use specific label; otherwise generic
    if (kinds.size === 1) {
      const kind = visibleErrors[0].kind;
      return {
        title: visibleErrors.length === 1
          ? `${KIND_LABEL[kind]}: ${visibleErrors[0].repoFullName}`
          : `${KIND_LABEL[kind]} for ${visibleErrors.length} repos`,
        hint: KIND_HINT[kind],
        severity: kind === 'auth' || kind === 'forbidden' ? 'high' : 'medium',
        allTransient: TRANSIENT_KINDS.has(kind),
      };
    }
    return {
      title: `Couldn\u2019t refresh ${visibleErrors.length} repos`,
      hint: 'Mixed errors. Expand for details.',
      severity: 'medium' as const,
      allTransient: false,
    };
  }, [visibleErrors]);

  if (!errorSummary && lowRateLimits.length === 0) return null;

  return (
    <div className="border-b border-gray-200 dark:border-gray-800">
      {errorSummary && (
        <div
          className={
            errorSummary.severity === 'high'
              ? 'bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50'
              : 'bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50'
          }
          role="alert"
        >
          <div className="flex items-start gap-2 px-4 py-2">
            <span className="text-xs leading-5" aria-hidden="true">
              {errorSummary.severity === 'high' ? '\u26A0\uFE0F' : '\u26A0\uFE0F'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                {errorSummary.title}
              </div>
              <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                {errorSummary.hint}
                {visibleErrors.length > 1 && (
                  <button
                    onClick={() => setExpanded((s) => !s)}
                    className="ml-1 text-radar-600 dark:text-radar-400 hover:underline"
                    aria-expanded={expanded}
                  >
                    {expanded ? 'Hide' : 'Show details'}
                  </button>
                )}
              </div>
              {expanded && visibleErrors.length > 1 && (
                <ul className="mt-1.5 space-y-0.5 text-[10px] text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                  {visibleErrors.map((e, i) => (
                    <li key={`${e.platform}:${e.repoFullName}:${i}`} className="flex items-baseline gap-1.5">
                      <span className="text-gray-500 dark:text-gray-500">{PLATFORM_LABELS[e.platform]}</span>
                      <span className="font-mono truncate flex-1" title={e.repoFullName}>{e.repoFullName}</span>
                      <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
                        {e.status ? `${e.status} \u00B7 ` : ''}{KIND_LABEL[e.kind]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!errorSummary.allTransient && (
              <button
                onClick={handleDismissErrors}
                className="text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 text-xs leading-none flex-shrink-0 mt-0.5"
                title="Dismiss"
                aria-label="Dismiss error banner"
              >
                &#10005;
              </button>
            )}
          </div>
        </div>
      )}

      {lowRateLimits.map((rl) => (
        <div
          key={rl.platform}
          className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 last:border-b-0"
          role="status"
        >
          <div className="flex items-start gap-2 px-4 py-2">
            <span className="text-xs leading-5" aria-hidden="true">&#x23F1;</span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-800 dark:text-gray-200">
                {PLATFORM_LABELS[rl.platform]} rate limit low: {rl.remaining}/{rl.limit}
              </div>
              <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                Resets at {formatResetTime(rl.resetAt)}. Polling may pause until then.
              </div>
            </div>
            <button
              onClick={handleDismissRateLimit}
              className="text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 text-xs leading-none flex-shrink-0 mt-0.5"
              title="Dismiss"
              aria-label="Dismiss rate limit warning"
            >
              &#10005;
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatResetTime(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
