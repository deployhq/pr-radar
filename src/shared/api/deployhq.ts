import type { DeployHQProject, DeployHQServer, Platform } from '../types';

// === Base fetch helper ===

async function dhqFetch<T>(
  slug: string,
  path: string,
  email: string,
  apiKey: string,
  options?: RequestInit,
): Promise<T> {
  const url = `https://${slug}.deployhq.com${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${email}:${apiKey}`)}`,
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`DeployHQ API ${response.status}: ${text || response.statusText}`);
  }
  return response.json();
}

// === Connection test ===

export async function testConnection(
  slug: string,
  email: string,
  apiKey: string,
): Promise<{ success: boolean; accountName?: string; message?: string }> {
  try {
    const account = await dhqFetch<{ company_name?: string; name?: string }>(
      slug, '/account', email, apiKey,
    );
    return {
      success: true,
      accountName: account.company_name || account.name || slug,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

// === Projects ===

// GET /projects returns basic fields: name, permalink, last_deployed_at
interface RawProjectBasic {
  name: string;
  permalink: string;
}

// GET /projects/{permalink} returns full fields including nested repository
interface RawProjectFull {
  name: string;
  permalink: string;
  repository?: {
    url?: string;
    scm_type?: string;
    branch?: string;
  };
}

export async function fetchProjects(
  slug: string,
  email: string,
  apiKey: string,
): Promise<DeployHQProject[]> {
  const projects = await dhqFetch<RawProjectBasic[]>(slug, '/projects', email, apiKey);
  const results: DeployHQProject[] = [];

  // Fetch full project details to get repository URL
  for (const project of projects) {
    try {
      const full = await dhqFetch<RawProjectFull>(
        slug, `/projects/${project.permalink}`, email, apiKey,
      );
      const repoUrl = full.repository?.url || '';
      if (repoUrl) {
        results.push({
          identifier: project.permalink,
          name: full.name,
          permalink: project.permalink,
          repoUrl,
        });
      }
    } catch {
      // Project may not have a repository configured — skip
    }
  }

  return results;
}

// === Repo matching ===

export function extractRepoHost(url: string): string {
  let cleaned = url;

  // Handle SSH URLs: git@github.com:owner/repo → github.com
  if (cleaned.includes('@') && cleaned.includes(':') && !cleaned.includes('://')) {
    cleaned = cleaned.replace(/^.*@/, '').replace(/:.*$/, '');
    return cleaned.toLowerCase();
  }

  // Strip protocol
  cleaned = cleaned.replace(/^(https?:\/\/|ssh:\/\/)/, '');

  // Extract host (everything before first /)
  const slashIdx = cleaned.indexOf('/');
  if (slashIdx > 0) {
    return cleaned.substring(0, slashIdx).toLowerCase();
  }

  return cleaned.toLowerCase();
}

export function extractRepoPath(url: string): string {
  let path = url;

  // Handle SSH URLs: git@github.com:owner/repo.git → github.com/owner/repo
  if (path.includes('@') && path.includes(':') && !path.includes('://')) {
    path = path.replace(/^.*@/, '').replace(':', '/');
  }

  // Strip protocol
  path = path.replace(/^(https?:\/\/|ssh:\/\/)/, '');

  // Strip .git suffix and trailing slashes
  path = path.replace(/\.git\/?$/, '').replace(/\/$/, '');

  // Remove host portion (e.g., "github.com/owner/repo" → "owner/repo")
  const slashIdx = path.indexOf('/');
  if (slashIdx > 0) {
    path = path.substring(slashIdx + 1);
  }

  return path.toLowerCase();
}

const PLATFORM_HOSTS: Record<Platform, string[]> = {
  github: ['github.com'],
  gitlab: ['gitlab.com'],
  bitbucket: ['bitbucket.org'],
};

export function matchRepoToProject(
  repoFullName: string,
  platform: Platform,
  projects: DeployHQProject[],
): DeployHQProject | null {
  const normalizedRepo = repoFullName.toLowerCase();
  const platformHosts = PLATFORM_HOSTS[platform];

  for (const project of projects) {
    const projectPath = extractRepoPath(project.repoUrl);
    if (projectPath !== normalizedRepo) continue;

    // Verify the host matches the platform to avoid cross-provider collisions
    const projectHost = extractRepoHost(project.repoUrl);
    if (platformHosts.some((h) => projectHost.includes(h))) {
      return project;
    }
  }

  return null;
}

// === Servers ===

interface RawServer {
  identifier: string;
  name: string;
}

interface RawServerGroup {
  identifier: string;
  name: string;
}

export async function fetchServers(
  slug: string,
  email: string,
  apiKey: string,
  projectPermalink: string,
): Promise<DeployHQServer[]> {
  const [servers, groups] = await Promise.all([
    dhqFetch<RawServer[]>(slug, `/projects/${projectPermalink}/servers`, email, apiKey)
      .catch(() => [] as RawServer[]),
    dhqFetch<RawServerGroup[]>(slug, `/projects/${projectPermalink}/server_groups`, email, apiKey)
      .catch(() => [] as RawServerGroup[]),
  ]);

  const result: DeployHQServer[] = [];

  for (const group of groups) {
    result.push({
      identifier: group.identifier,
      name: group.name,
      serverType: 'server_group',
    });
  }

  for (const server of servers) {
    result.push({
      identifier: server.identifier,
      name: server.name,
      serverType: 'server',
    });
  }

  return result;
}

// === Deployments ===

interface RawDeployment {
  identifier: string;
  status: string;
  end_revision?: string;
}

export async function createDeployment(
  slug: string,
  email: string,
  apiKey: string,
  projectPermalink: string,
  parentIdentifier: string,
): Promise<{ success: boolean; message: string }> {
  try {
    await dhqFetch<RawDeployment>(
      slug,
      `/projects/${projectPermalink}/deployments`,
      email,
      apiKey,
      {
        method: 'POST',
        body: JSON.stringify({
          deployment: {
            parent_identifier: parentIdentifier,
            mode: 'queue',
          },
        }),
      },
    );
    return { success: true, message: 'Deployment queued' };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to create deployment',
    };
  }
}

// Deployment list returns basic fields only (no nested server/target info).
// We match by server's last_revision instead.
export async function fetchLatestDeployments(
  slug: string,
  email: string,
  apiKey: string,
  projectPermalink: string,
): Promise<Array<{ endRevision: string; serverName: string; url: string }>> {
  try {
    // Fetch servers to get last_revision per server
    const servers = await dhqFetch<Array<{ identifier: string; name: string; last_revision?: string }>>(
      slug, `/projects/${projectPermalink}/servers`, email, apiKey,
    ).catch(() => []);

    return servers
      .filter((s) => s.last_revision)
      .map((s) => ({
        endRevision: s.last_revision!,
        serverName: s.name,
        url: `https://${slug}.deployhq.com/projects/${projectPermalink}`,
      }));
  } catch {
    return [];
  }
}
