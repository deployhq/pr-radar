// Minimal ambient types for Chrome's built-in Summarizer API (Gemini Nano,
// on-device). Stable in Chrome 138+ including the extensions context. Not yet
// part of the TS DOM lib, so we declare the slice we use.
// https://developer.chrome.com/docs/ai/summarizer-api

type SummarizerAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface SummarizerCreateOptions {
  type?: 'tldr' | 'key-points' | 'teaser' | 'headline';
  format?: 'plain-text' | 'markdown';
  length?: 'short' | 'medium' | 'long';
  sharedContext?: string;
  // BCP-47 codes. Chrome warns when output language is unspecified; setting it
  // also attests output safety. Supported set is currently ['en', 'es', 'ja'].
  outputLanguage?: string;
  expectedInputLanguages?: string[];
  monitor?: (monitor: SummarizerMonitor) => void;
}

interface SummarizerMonitor extends EventTarget {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: { loaded: number }) => void,
  ): void;
}

interface SummarizerSummarizeOptions {
  context?: string;
}

// Instance type.
interface Summarizer {
  summarize(input: string, options?: SummarizerSummarizeOptions): Promise<string>;
  destroy(): void;
}

interface SummarizerFactory {
  availability(options?: Partial<SummarizerCreateOptions>): Promise<SummarizerAvailability>;
  create(options?: SummarizerCreateOptions): Promise<Summarizer>;
}

// Global value — `undefined` on browsers/contexts without the API, so callers
// must feature-detect with `typeof Summarizer !== 'undefined'`.
declare const Summarizer: SummarizerFactory | undefined;
