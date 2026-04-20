import type { UrgencyCategory } from '@/shared/types';
import { URGENCY_META } from '../utils/urgency';

interface TriageSummaryProps {
  total: number;
  counts: Map<UrgencyCategory, number>;
  activeFilter: UrgencyCategory | null;
  onToggleFilter: (category: UrgencyCategory | null) => void;
}

export default function TriageSummary({ total, counts, activeFilter, onToggleFilter }: TriageSummaryProps) {
  const hasAny = Array.from(counts.values()).some((c) => c > 0);
  if (!hasAny) return null;

  const isAllActive = activeFilter === null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-gray-800">
      {/* All chip */}
      <button
        onClick={() => onToggleFilter(null)}
        title="All"
        aria-label={`All: ${total} pull requests`}
        aria-pressed={isAllActive}
        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-semibold border cursor-pointer transition-colors ${
          isAllActive
            ? 'bg-radar-900/25 text-radar-300 border-radar-500/50 ring-1 ring-radar-500/15'
            : 'bg-radar-900/10 text-radar-400 border-radar-800/20'
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
    </div>
  );
}
