import type { SortMode, UrgencyCategory } from '@/shared/types';
import { URGENCY_META } from '../utils/urgency';

interface TriageSummaryProps {
  total: number;
  counts: Map<UrgencyCategory, number>;
  activeFilter: UrgencyCategory | null;
  onToggleFilter: (category: UrgencyCategory | null) => void;
  sortMode: SortMode;
  onCycleSort: () => void;
}

const SORT_META: Record<SortMode, { icon: string; label: string }> = {
  default: { icon: '\u21C5', label: 'Sort: Default' },
  recent: { icon: '\u2193', label: 'Sort: Recently updated' },
  oldest: { icon: '\u2191', label: 'Sort: Oldest updated' },
};

export default function TriageSummary({
  total,
  counts,
  activeFilter,
  onToggleFilter,
  sortMode,
  onCycleSort,
}: TriageSummaryProps) {
  const hasAny = Array.from(counts.values()).some((c) => c > 0);
  if (!hasAny && total === 0) return null;

  const isAllActive = activeFilter === null;
  const sortMeta = SORT_META[sortMode];
  const sortActive = sortMode !== 'default';

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-gray-200 dark:border-gray-800">
      {/* All chip */}
      <button
        onClick={() => onToggleFilter(null)}
        title="All"
        aria-label={`All: ${total} pull requests`}
        aria-pressed={isAllActive}
        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-semibold border cursor-pointer transition-colors ${
          isAllActive
            ? 'bg-radar-100 dark:bg-radar-900/25 text-radar-700 dark:text-radar-300 border-radar-300 dark:border-radar-500/50 ring-1 ring-radar-300/30 dark:ring-radar-500/15'
            : 'bg-radar-50 dark:bg-radar-900/10 text-radar-600 dark:text-radar-400 border-radar-200 dark:border-radar-800/20'
        }`}
      >
        <span className="text-[11px] leading-none" aria-hidden="true">&#x2630;</span>
        <span className="font-bold">{total}</span>
      </button>

      {Array.from(counts.entries()).map(([category, count]) => {
        if (count === 0) return null;
        const meta = URGENCY_META[category];
        const isActive = activeFilter === category;
        return (
          <button
            key={category}
            onClick={() => onToggleFilter(isActive ? null : category)}
            title={meta.label}
            aria-label={`${meta.label}: ${count}`}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-semibold border cursor-pointer transition-colors ${
              isActive ? meta.activeColorClasses : meta.colorClasses
            }`}
          >
            <span className="text-[11px] leading-none" aria-hidden="true">{meta.icon}</span>
            <span className="font-bold">{count}</span>
          </button>
        );
      })}

      {/* Sort chip */}
      <button
        onClick={onCycleSort}
        title={sortMeta.label}
        aria-label={sortMeta.label}
        aria-pressed={sortActive}
        className={`ml-auto inline-flex items-center text-[11px] px-2 py-0.5 rounded-md font-semibold border cursor-pointer transition-colors ${
          sortActive
            ? 'bg-radar-100 dark:bg-radar-900/25 text-radar-700 dark:text-radar-300 border-radar-300 dark:border-radar-500/50 ring-1 ring-radar-300/30 dark:ring-radar-500/15'
            : 'bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700/40'
        }`}
      >
        <span className="text-[11px] leading-none" aria-hidden="true">{sortMeta.icon}</span>
      </button>
    </div>
  );
}
