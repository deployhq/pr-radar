import type { CIStatus } from '@/shared/types';
import { CI_STATUS_LABELS } from '@/shared/constants';

const BADGE_STYLES: Record<CIStatus, string> = {
  passed: 'bg-emerald-900/50 text-emerald-400',
  failed: 'bg-red-900/50 text-red-400',
  running: 'bg-blue-900/50 text-blue-400',
  pending: 'bg-amber-900/50 text-amber-400',
  unknown: 'bg-gray-800 text-gray-500',
};

const BADGE_ICONS: Record<CIStatus, string> = {
  passed: '\u2713',
  failed: '\u2717',
  running: '\u25CF',
  pending: '\u25CB',
  unknown: '?',
};

interface CIBadgeProps {
  status: CIStatus;
  failedChecks?: string[];
}

export default function CIBadge({ status, failedChecks }: CIBadgeProps) {
  if (status === 'unknown') return null;

  const label = CI_STATUS_LABELS[status];
  const tooltip = status === 'failed' && failedChecks && failedChecks.length > 0
    ? `${label}: ${failedChecks.join(', ')}`
    : label;

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1 ${BADGE_STYLES[status]}`}
      title={tooltip}
    >
      {BADGE_ICONS[status]}
    </span>
  );
}
