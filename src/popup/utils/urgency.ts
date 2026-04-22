import type { PullRequest, UrgencyCategory } from '@/shared/types';

export function getUrgencyCategories(
  pr: PullRequest,
  stalePRDays: number,
): Set<UrgencyCategory> {
  const categories = new Set<UrgencyCategory>();

  if (pr.isMerged || pr.isDraft || pr.isBot) return categories;

  const isStale =
    stalePRDays > 0 &&
    Date.now() - new Date(pr.updatedAt).getTime() > stalePRDays * 86400000;

  if (isStale) {
    categories.add('stale');
    return categories;
  }

  if (pr.ciStatus === 'failed') categories.add('ci_failed');
  if (pr.reviewStatus === 'changes_requested') categories.add('changes_requested');
  if (pr.isReviewRequested && !pr.hasReviewed) categories.add('review_requested');
  if (pr.hasConflicts) categories.add('conflicts');

  return categories;
}

export function matchesUrgencyFilter(
  pr: PullRequest,
  filter: UrgencyCategory,
  stalePRDays: number,
): boolean {
  return getUrgencyCategories(pr, stalePRDays).has(filter);
}

const CATEGORY_ORDER: UrgencyCategory[] = [
  'ci_failed',
  'changes_requested',
  'review_requested',
  'conflicts',
  'stale',
];

export function computeUrgencyCounts(
  prs: PullRequest[],
  stalePRDays: number,
): Map<UrgencyCategory, number> {
  const counts = new Map<UrgencyCategory, number>(
    CATEGORY_ORDER.map((c) => [c, 0]),
  );

  for (const pr of prs) {
    const cats = getUrgencyCategories(pr, stalePRDays);
    for (const cat of cats) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }

  return counts;
}

export const URGENCY_META: Record<
  UrgencyCategory,
  { label: string; icon: string; colorClasses: string; activeColorClasses: string }
> = {
  ci_failed: {
    label: 'CI failing',
    icon: '\u2717',
    colorClasses: 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/20',
    activeColorClasses: 'bg-red-100 dark:bg-red-900/25 text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/50 ring-1 ring-red-300/30 dark:ring-red-500/15',
  },
  changes_requested: {
    label: 'Changes requested',
    icon: '\u21BB',
    colorClasses: 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/20',
    activeColorClasses: 'bg-red-100 dark:bg-red-900/25 text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/50 ring-1 ring-red-300/30 dark:ring-red-500/15',
  },
  review_requested: {
    label: 'Review requested',
    icon: '\uD83D\uDC41',
    colorClasses: 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/20',
    activeColorClasses: 'bg-amber-100 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/50 ring-1 ring-amber-300/30 dark:ring-amber-500/15',
  },
  conflicts: {
    label: 'Conflicts',
    icon: '\u26A0',
    colorClasses: 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/20',
    activeColorClasses: 'bg-red-100 dark:bg-red-900/25 text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/50 ring-1 ring-red-300/30 dark:ring-red-500/15',
  },
  stale: {
    label: 'Stale',
    icon: '\uD83D\uDCA4',
    colorClasses: 'bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700/50',
    activeColorClasses: 'bg-gray-200 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-500/50 ring-1 ring-gray-300/30 dark:ring-gray-500/15',
  },
};
