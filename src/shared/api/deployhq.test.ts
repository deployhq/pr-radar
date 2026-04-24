import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractRepoPath, extractRepoHost, matchRepoToProject, testConnection, fetchServers } from './deployhq';
import type { DeployHQProject } from '../types';

function project(name: string, repoUrl: string): DeployHQProject {
  return { identifier: name, name, permalink: name, repoUrl };
}

describe('extractRepoPath', () => {
  it('extracts path from HTTPS URLs', () => {
    expect(extractRepoPath('https://github.com/deployhq/pr-radar.git')).toBe('deployhq/pr-radar');
  });

  it('extracts path from SSH URLs', () => {
    expect(extractRepoPath('git@github.com:deployhq/pr-radar.git')).toBe('deployhq/pr-radar');
  });

  it('handles URLs without .git suffix', () => {
    expect(extractRepoPath('https://github.com/deployhq/pr-radar')).toBe('deployhq/pr-radar');
  });

  it('handles SSH URLs without .git suffix', () => {
    expect(extractRepoPath('git@github.com:deployhq/pr-radar')).toBe('deployhq/pr-radar');
  });

  it('handles GitLab SSH URLs with nested groups', () => {
    expect(extractRepoPath('git@gitlab.com:org/subgroup/project.git')).toBe('org/subgroup/project');
  });

  it('handles Codebase HQ URLs', () => {
    expect(extractRepoPath('git@codebasehq.com:awesome/project/example.git')).toBe('awesome/project/example');
  });

  it('handles HTTPS URLs with trailing slash', () => {
    expect(extractRepoPath('https://github.com/deployhq/pr-radar/')).toBe('deployhq/pr-radar');
  });

  it('handles SSH protocol URLs', () => {
    expect(extractRepoPath('ssh://git@github.com/deployhq/pr-radar.git')).toBe('deployhq/pr-radar');
  });

  it('is case-insensitive', () => {
    expect(extractRepoPath('https://github.com/DeployHQ/PR-Radar.git')).toBe('deployhq/pr-radar');
  });
});

describe('extractRepoHost', () => {
  it('extracts host from HTTPS URLs', () => {
    expect(extractRepoHost('https://github.com/deployhq/pr-radar.git')).toBe('github.com');
  });

  it('extracts host from SSH URLs', () => {
    expect(extractRepoHost('git@github.com:deployhq/pr-radar.git')).toBe('github.com');
  });

  it('extracts host from GitLab URLs', () => {
    expect(extractRepoHost('git@gitlab.com:org/project.git')).toBe('gitlab.com');
  });

  it('extracts host from Bitbucket URLs', () => {
    expect(extractRepoHost('https://bitbucket.org/team/repo.git')).toBe('bitbucket.org');
  });
});

describe('matchRepoToProject', () => {
  const projects = [
    project('pr-radar', 'git@github.com:deployhq/pr-radar.git'),
    project('website', 'https://github.com/deployhq/website.git'),
    project('billy', 'git@gitlab.com:deployhq/billy.git'),
  ];

  it('matches SSH URL to repoFullName', () => {
    const result = matchRepoToProject('deployhq/pr-radar', 'github', projects);
    expect(result).not.toBeNull();
    expect(result!.permalink).toBe('pr-radar');
  });

  it('matches HTTPS URL to repoFullName', () => {
    const result = matchRepoToProject('deployhq/website', 'github', projects);
    expect(result).not.toBeNull();
    expect(result!.permalink).toBe('website');
  });

  it('matches case-insensitively', () => {
    const result = matchRepoToProject('DeployHQ/PR-Radar', 'github', projects);
    expect(result).not.toBeNull();
    expect(result!.permalink).toBe('pr-radar');
  });

  it('returns null when no project matches', () => {
    expect(matchRepoToProject('deployhq/unknown-repo', 'github', projects)).toBeNull();
  });

  it('returns null for empty project list', () => {
    expect(matchRepoToProject('deployhq/pr-radar', 'github', [])).toBeNull();
  });

  it('matches GitLab repos against GitLab projects', () => {
    const result = matchRepoToProject('deployhq/billy', 'gitlab', projects);
    expect(result).not.toBeNull();
    expect(result!.permalink).toBe('billy');
  });

  it('prevents cross-provider collision (same owner/repo on different hosts)', () => {
    const mixedProjects = [
      project('gh-app', 'git@github.com:acme/app.git'),
      project('gl-app', 'git@gitlab.com:acme/app.git'),
    ];

    const ghResult = matchRepoToProject('acme/app', 'github', mixedProjects);
    expect(ghResult).not.toBeNull();
    expect(ghResult!.permalink).toBe('gh-app');

    const glResult = matchRepoToProject('acme/app', 'gitlab', mixedProjects);
    expect(glResult).not.toBeNull();
    expect(glResult!.permalink).toBe('gl-app');
  });

  it('does not match GitHub repo against GitLab project', () => {
    const result = matchRepoToProject('deployhq/billy', 'github', projects);
    expect(result).toBeNull();
  });
});

describe('testConnection', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success with account name on valid credentials', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ company_name: 'Acme Corp' }));

    const result = await testConnection('acme', 'user@acme.com', 'key123');

    expect(result.success).toBe(true);
    expect(result.accountName).toBe('Acme Corp');
  });

  it('returns failure on 401', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Unauthorized',
    } as Response);

    const result = await testConnection('acme', 'wrong@acme.com', 'badkey');

    expect(result.success).toBe(false);
    expect(result.message).toContain('401');
  });

  it('sends correct auth header', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ company_name: 'Test' }));

    await testConnection('myslug', 'me@test.com', 'apikey');

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      'https://myslug.deployhq.com/account',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${btoa('me@test.com:apikey')}`,
        }),
      }),
    );
  });
});

describe('fetchServers', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('combines servers and server groups', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    // First call: servers
    fetchMock.mockResolvedValueOnce(jsonResponse([
      { identifier: 's1', name: 'Production' },
      { identifier: 's2', name: 'Staging' },
    ]));
    // Second call: server groups
    fetchMock.mockResolvedValueOnce(jsonResponse([
      { identifier: 'g1', name: 'All Servers' },
    ]));

    const result = await fetchServers('acme', 'user@acme.com', 'key', 'my-project');

    expect(result).toEqual([
      { identifier: 'g1', name: 'All Servers', serverType: 'server_group' },
      { identifier: 's1', name: 'Production', serverType: 'server' },
      { identifier: 's2', name: 'Staging', serverType: 'server' },
    ]);
  });

  it('returns empty array when both endpoints fail', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockRejectedValueOnce(new Error('fail'));
    fetchMock.mockRejectedValueOnce(new Error('fail'));

    const result = await fetchServers('acme', 'user@acme.com', 'key', 'my-project');

    expect(result).toEqual([]);
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    headers: {
      get: () => null,
    },
  } as unknown as Response;
}
