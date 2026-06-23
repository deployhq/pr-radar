// On-device summaries via Chrome's built-in Summarizer API.
//
//   - TL;DR of a PR description (generateSummary)
//   - "What's blocking this" digest of unresolved review threads
//     (generateThreadSummary)
//
// Everything here is a progressive enhancement: the API only exists on capable
// Chrome installs (≥138, sufficient hardware, model downloaded). Callers must
// gate on isSummarizerSupported() — on Firefox, Edge, or unsupported hardware
// the global is absent and these helpers no-op.
//
// Summaries run entirely locally; no PR content leaves the browser.

import type { PullRequest, UnresolvedThread } from '../types';

export const AI_SUMMARY_CACHE_KEY = 'pr_radar_ai_summaries';

// Output language: Chrome warns (and degrades safety attestation) when this is
// unset. Supported set is currently ['en', 'es', 'ja'].
const OUTPUT_LANGUAGE = 'en';
// Cap how much text we feed the model — keeps latency bounded and avoids
// overrunning the model's context on very long inputs.
const MAX_INPUT_CHARS = 4000;
// Bound the stored cache so it can't grow without limit across many repos.
const CACHE_LIMIT = 300;

interface CachedSummary {
  summary: string;
  createdAt: number;
}

type SummaryCache = Record<string, CachedSummary>;

/** True only where Chrome exposes the built-in Summarizer API. */
export function isSummarizerSupported(): boolean {
  return typeof Summarizer !== 'undefined';
}

/**
 * Cache key for a PR's description TL;DR. Tied to headSha so a new push
 * invalidates the old summary; falls back to a hash of the description.
 */
export function summaryCacheKey(pr: Pick<PullRequest, 'id' | 'headSha' | 'description'>): string {
  const version = pr.headSha || hashString(pr.description ?? '');
  return `${pr.id}@${version}`;
}

/**
 * Cache key for a PR's unresolved-thread digest. Keyed on headSha and the
 * unresolved count so it regenerates when code is pushed or threads are
 * added/resolved.
 */
export function threadSummaryCacheKey(
  pr: Pick<PullRequest, 'id' | 'headSha' | 'unresolvedCommentCount'>,
): string {
  return `thread:${pr.id}@${pr.headSha || '?'}#${pr.unresolvedCommentCount}`;
}

async function readCache(): Promise<SummaryCache> {
  const result = await chrome.storage.local.get(AI_SUMMARY_CACHE_KEY);
  return result[AI_SUMMARY_CACHE_KEY] ?? {};
}

export async function getCachedSummary(key: string): Promise<string | null> {
  const cache = await readCache();
  return cache[key]?.summary ?? null;
}

async function writeCached(key: string, summary: string): Promise<void> {
  const cache = await readCache();
  cache[key] = { summary, createdAt: Date.now() };

  const keys = Object.keys(cache);
  if (keys.length > CACHE_LIMIT) {
    // Drop the oldest entries down to the limit.
    const sorted = keys.sort((a, b) => cache[a].createdAt - cache[b].createdAt);
    for (const stale of sorted.slice(0, keys.length - CACHE_LIMIT)) {
      delete cache[stale];
    }
  }
  await chrome.storage.local.set({ [AI_SUMMARY_CACHE_KEY]: cache });
}

// Sessions are reused across PRs (cheaper than create/destroy per row) and kept
// per config — the TL;DR and key-points modes need different create options.
const sessions = new Map<string, Promise<Summarizer>>();
// Serialize summarize() calls across all sessions; the on-device model serves
// requests sequentially, and a stampede on dashboard open would just thrash it.
let queue: Promise<unknown> = Promise.resolve();

function getSession(key: string, options: SummarizerCreateOptions): Promise<Summarizer> {
  let session = sessions.get(key);
  if (!session) {
    // typeof guard in isSummarizerSupported() — callers must check first.
    session = Summarizer!.create(options).catch((err) => {
      // Reset so a later call can retry (e.g. transient download failure).
      sessions.delete(key);
      throw err;
    });
    sessions.set(key, session);
  }
  return session;
}

function runQueued<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  // Keep the chain alive even if this run rejects.
  queue = run.catch(() => undefined);
  return run;
}

/** 'unavailable' | 'downloadable' | 'downloading' | 'available'. */
export async function summarizerAvailability(): Promise<SummarizerAvailability> {
  if (!isSummarizerSupported()) return 'unavailable';
  return Summarizer!.availability({ type: 'tldr', format: 'plain-text', length: 'short', outputLanguage: OUTPUT_LANGUAGE });
}

/**
 * One-line TL;DR for a PR, cache-first. Returns '' when there's no meaningful
 * description. Throws if the model is unavailable — callers degrade silently.
 */
export async function generateSummary(
  pr: Pick<PullRequest, 'id' | 'headSha' | 'description'>,
): Promise<string> {
  const key = summaryCacheKey(pr);
  const cached = await getCachedSummary(key);
  if (cached !== null) return cached;

  const text = (pr.description ?? '').trim().slice(0, MAX_INPUT_CHARS);
  if (!text) return '';

  const summary = await runQueued(async () => {
    const session = await getSession('tldr', {
      type: 'tldr',
      format: 'plain-text',
      length: 'short',
      outputLanguage: OUTPUT_LANGUAGE,
      sharedContext:
        'Concise, factual one-line summaries of pull request descriptions for a developer dashboard.',
    });
    return (await session.summarize(text)).trim();
  });

  if (summary) await writeCached(key, summary);
  return summary;
}

/**
 * Key-points digest of a PR's unresolved review threads ("what's blocking
 * this"), cache-first. Returns '' when there's nothing to summarize. Throws if
 * the model is unavailable — callers degrade silently.
 */
export async function generateThreadSummary(
  cacheKey: string,
  threads: UnresolvedThread[],
): Promise<string> {
  const cached = await getCachedSummary(cacheKey);
  if (cached !== null) return cached;

  const text = threads
    .map((t) => `${t.author}${t.path ? ` on ${t.path}` : ''}: ${t.body}`)
    .join('\n\n')
    .trim()
    .slice(0, MAX_INPUT_CHARS);
  if (!text) return '';

  const summary = await runQueued(async () => {
    const session = await getSession('key-points', {
      type: 'key-points',
      format: 'markdown',
      length: 'short',
      outputLanguage: OUTPUT_LANGUAGE,
      sharedContext:
        'Unresolved code-review comments on a pull request. Summarize what reviewers are asking for as a short bullet list of concrete action items.',
    });
    return (await session.summarize(text)).trim();
  });

  if (summary) await writeCached(cacheKey, summary);
  return summary;
}

// Small, stable string hash (djb2) for cache-key versioning.
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
