import { describe, expect, it } from 'vitest';
import {
  CANONICAL_INSTANCE_URLS,
  getDisplayHost,
  getInstanceUrl,
  isSelfHosted,
  normalizeInstanceUrl,
} from './instanceUrl';

describe('normalizeInstanceUrl', () => {
  it('returns null for empty / whitespace / nullish inputs', () => {
    expect(normalizeInstanceUrl(null)).toBeNull();
    expect(normalizeInstanceUrl(undefined)).toBeNull();
    expect(normalizeInstanceUrl('')).toBeNull();
    expect(normalizeInstanceUrl('   ')).toBeNull();
  });

  it('strips trailing slashes', () => {
    expect(normalizeInstanceUrl('https://gitlab.example.com/')).toBe('https://gitlab.example.com');
    expect(normalizeInstanceUrl('https://gitlab.example.com///')).toBe('https://gitlab.example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeInstanceUrl('  https://gitlab.example.com  ')).toBe('https://gitlab.example.com');
  });

  it('rejects non-https URLs', () => {
    expect(normalizeInstanceUrl('http://gitlab.example.com')).toBeNull();
    expect(normalizeInstanceUrl('ftp://gitlab.example.com')).toBeNull();
  });

  it('rejects malformed URLs', () => {
    expect(normalizeInstanceUrl('not a url')).toBeNull();
    expect(normalizeInstanceUrl('gitlab.example.com')).toBeNull(); // missing scheme
    expect(normalizeInstanceUrl('https://')).toBeNull();
  });

  it('preserves a non-trivial path', () => {
    expect(normalizeInstanceUrl('https://example.com/gitlab')).toBe('https://example.com/gitlab');
  });

  it('preserves port', () => {
    expect(normalizeInstanceUrl('https://gitlab.example.com:8443')).toBe('https://gitlab.example.com:8443');
  });

  describe('with platform argument', () => {
    it('strips a trailing /api/v4 for GitLab', () => {
      expect(normalizeInstanceUrl('https://gitlab.example.com/api/v4', 'gitlab'))
        .toBe('https://gitlab.example.com');
    });

    it('strips a trailing /api/v3 for GitHub', () => {
      expect(normalizeInstanceUrl('https://github.example.com/api/v3', 'github'))
        .toBe('https://github.example.com');
    });

    it('strips a trailing /api/graphql for GitHub', () => {
      expect(normalizeInstanceUrl('https://github.example.com/api/graphql', 'github'))
        .toBe('https://github.example.com');
    });

    it('returns null when the cleaned URL matches the canonical service (GitHub)', () => {
      expect(normalizeInstanceUrl('https://github.com', 'github')).toBeNull();
      expect(normalizeInstanceUrl('https://github.com/', 'github')).toBeNull();
    });

    it('returns null when the cleaned URL matches the canonical service (GitLab)', () => {
      expect(normalizeInstanceUrl('https://gitlab.com', 'gitlab')).toBeNull();
      expect(normalizeInstanceUrl('https://gitlab.com/', 'gitlab')).toBeNull();
    });

    it('returns null when stripping an API suffix lands on the canonical', () => {
      expect(normalizeInstanceUrl('https://gitlab.com/api/v4', 'gitlab')).toBeNull();
      expect(normalizeInstanceUrl('https://github.com/api/v3', 'github')).toBeNull();
    });

    it('keeps a real self-hosted URL untouched when there is no API suffix', () => {
      expect(normalizeInstanceUrl('https://gitlab.example.com', 'gitlab'))
        .toBe('https://gitlab.example.com');
      expect(normalizeInstanceUrl('https://github.acme.com', 'github'))
        .toBe('https://github.acme.com');
    });
  });
});

describe('getInstanceUrl', () => {
  it('returns the canonical service URL when no instanceUrl is set', () => {
    expect(getInstanceUrl({ platform: 'github' })).toBe(CANONICAL_INSTANCE_URLS.github);
    expect(getInstanceUrl({ platform: 'gitlab' })).toBe(CANONICAL_INSTANCE_URLS.gitlab);
    expect(getInstanceUrl({ platform: 'bitbucket' })).toBe(CANONICAL_INSTANCE_URLS.bitbucket);
  });

  it('returns the configured instance URL when present', () => {
    expect(getInstanceUrl({ platform: 'github', instanceUrl: 'https://github.example.com' }))
      .toBe('https://github.example.com');
  });

  it('normalizes the configured URL', () => {
    expect(getInstanceUrl({ platform: 'gitlab', instanceUrl: 'https://gitlab.example.com/' }))
      .toBe('https://gitlab.example.com');
  });

  it('falls back to canonical when configured URL is invalid', () => {
    expect(getInstanceUrl({ platform: 'github', instanceUrl: 'not-a-url' }))
      .toBe(CANONICAL_INSTANCE_URLS.github);
  });
});

describe('isSelfHosted', () => {
  it('returns false when no instanceUrl is set', () => {
    expect(isSelfHosted({ platform: 'github' })).toBe(false);
  });

  it('returns false when instanceUrl matches the canonical service', () => {
    expect(isSelfHosted({ platform: 'gitlab', instanceUrl: 'https://gitlab.com' })).toBe(false);
    expect(isSelfHosted({ platform: 'gitlab', instanceUrl: 'https://gitlab.com/' })).toBe(false);
  });

  it('returns true for a different host', () => {
    expect(isSelfHosted({ platform: 'gitlab', instanceUrl: 'https://gitlab.example.com' })).toBe(true);
    expect(isSelfHosted({ platform: 'github', instanceUrl: 'https://github.acme.com' })).toBe(true);
  });

  it('returns false when instanceUrl is invalid (treated as canonical)', () => {
    expect(isSelfHosted({ platform: 'github', instanceUrl: 'invalid' })).toBe(false);
  });
});

describe('getDisplayHost', () => {
  it('returns null for canonical accounts', () => {
    expect(getDisplayHost({
      platform: 'github',
      token: 't',
      username: 'u',
    })).toBeNull();
  });

  it('returns the host for self-hosted accounts', () => {
    expect(getDisplayHost({
      platform: 'gitlab',
      token: 't',
      username: 'u',
      instanceUrl: 'https://gitlab.example.com',
    })).toBe('gitlab.example.com');
  });

  it('includes port in host when present', () => {
    expect(getDisplayHost({
      platform: 'github',
      token: 't',
      username: 'u',
      instanceUrl: 'https://github.example.com:8443',
    })).toBe('github.example.com:8443');
  });
});
