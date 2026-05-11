import type { PullRequest } from '@/shared/types';

export interface StackInfo {
  stackId: string;
  parentId?: string;
  parentNumber?: number;
  childIds: string[];
  rootId: string;
  depth: number;
  total: number;
  position: number;
}

function stackKey(pr: PullRequest): string {
  return `${pr.platform}:${pr.repoFullName}`;
}

export function detectStacks(prs: PullRequest[]): Map<string, StackInfo> {
  // Index PRs by repo+platform key, then by head branch.
  // Used to resolve a PR's parent (the PR whose head is this PR's base).
  const byHead = new Map<string, Map<string, PullRequest>>();
  for (const pr of prs) {
    if (!pr.headRef) continue;
    const key = stackKey(pr);
    let inner = byHead.get(key);
    if (!inner) {
      inner = new Map();
      byHead.set(key, inner);
    }
    if (!inner.has(pr.headRef)) inner.set(pr.headRef, pr);
  }

  // Compute parent and children for each PR.
  const parentOf = new Map<string, PullRequest>();
  const childrenOf = new Map<string, PullRequest[]>();
  for (const pr of prs) {
    if (!pr.baseBranch) continue;
    const parent = byHead.get(stackKey(pr))?.get(pr.baseBranch);
    if (!parent || parent.id === pr.id) continue;
    parentOf.set(pr.id, parent);
    const list = childrenOf.get(parent.id) ?? [];
    list.push(pr);
    childrenOf.set(parent.id, list);
  }

  // Walk each PR to its root and collect connected component members.
  const result = new Map<string, StackInfo>();
  const componentOf = new Map<string, string[]>(); // rootId -> all PR ids in component

  function findRoot(pr: PullRequest): PullRequest {
    let cur = pr;
    const seen = new Set<string>([cur.id]);
    while (true) {
      const parent = parentOf.get(cur.id);
      if (!parent || seen.has(parent.id)) return cur;
      seen.add(parent.id);
      cur = parent;
    }
  }

  function collectComponent(root: PullRequest): string[] {
    const ids: string[] = [];
    const queue: PullRequest[] = [root];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      ids.push(node.id);
      for (const child of childrenOf.get(node.id) ?? []) {
        if (!seen.has(child.id)) queue.push(child);
      }
    }
    return ids;
  }

  for (const pr of prs) {
    const hasParent = parentOf.has(pr.id);
    const hasChildren = (childrenOf.get(pr.id)?.length ?? 0) > 0;
    if (!hasParent && !hasChildren) continue;

    const root = findRoot(pr);
    let memberIds = componentOf.get(root.id);
    if (!memberIds) {
      memberIds = collectComponent(root);
      componentOf.set(root.id, memberIds);
    }

    const parent = parentOf.get(pr.id);
    const depth = computeDepth(pr, parentOf);

    result.set(pr.id, {
      stackId: root.id,
      parentId: parent?.id,
      parentNumber: parent?.number,
      childIds: (childrenOf.get(pr.id) ?? []).map((c) => c.id),
      rootId: root.id,
      depth,
      total: memberIds.length,
      position: depth + 1,
    });
  }

  return result;
}

function computeDepth(pr: PullRequest, parentOf: Map<string, PullRequest>): number {
  let depth = 0;
  let cur: PullRequest | undefined = parentOf.get(pr.id);
  const seen = new Set<string>([pr.id]);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    depth++;
    cur = parentOf.get(cur.id);
  }
  return depth;
}

// True if any ancestor of this PR is open and unmerged.
// A PR is "blocked" when it depends on a parent that hasn't landed yet.
export function isStackBlocked(prId: string, stacks: Map<string, StackInfo>, prById: Map<string, PullRequest>): boolean {
  const info = stacks.get(prId);
  if (!info?.parentId) return false;
  let cursorId: string | undefined = info.parentId;
  const seen = new Set<string>([prId]);
  while (cursorId && !seen.has(cursorId)) {
    seen.add(cursorId);
    const parent = prById.get(cursorId);
    if (!parent) return false;
    if (!parent.isMerged) return true;
    cursorId = stacks.get(cursorId)?.parentId;
  }
  return false;
}

// Sort PRs to keep stack members adjacent, with parents before children.
// Returns a comparator-friendly index for each PR.
export function buildStackOrder(prs: PullRequest[], stacks: Map<string, StackInfo>): Map<string, number> {
  const order = new Map<string, number>();
  const prById = new Map(prs.map((p) => [p.id, p]));
  const visited = new Set<string>();
  let counter = 0;

  function visit(prId: string) {
    if (visited.has(prId)) return;
    visited.add(prId);
    order.set(prId, counter++);
    const info = stacks.get(prId);
    if (!info) return;
    // Visit children in deterministic order (by PR number).
    const childPrs = info.childIds
      .map((id) => prById.get(id))
      .filter((p): p is PullRequest => Boolean(p))
      .sort((a, b) => a.number - b.number);
    for (const child of childPrs) visit(child.id);
  }

  // Seed with root PRs first.
  const roots = prs.filter((p) => {
    const info = stacks.get(p.id);
    return info && info.rootId === p.id;
  });
  for (const root of roots) visit(root.id);

  return order;
}
