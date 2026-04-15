import type { PullRequest } from '@/shared/types';
import { PLATFORM_SHORT, PLATFORM_COLORS } from '@/shared/constants';
import CIBadge from './CIBadge';

interface PRItemProps {
  pr: PullRequest;
}

export default function PRItem({ pr }: PRItemProps) {
  const platformStyle = PLATFORM_COLORS[pr.platform];
  const timeAgo = getTimeAgo(pr.updatedAt);

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-4 py-3 border-b border-gray-800 hover:bg-gray-800/30 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-2.5">
        <span
          className="flex-shrink-0 mt-0.5 w-5 h-5 rounded text-[11px] font-semibold flex items-center justify-center"
          style={{ backgroundColor: platformStyle.bg, color: platformStyle.text }}
        >
          {PLATFORM_SHORT[pr.platform]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-gray-200 font-medium leading-tight truncate">
            {pr.title}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {pr.repoFullName} #{pr.number}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-1.5 ml-[30px] flex-wrap">
        {pr.isDraft && <Badge className="bg-gray-800 text-gray-500">Draft</Badge>}

        <CIBadge status={pr.ciStatus} />

        {pr.approvalCount > 0 && (
          <Badge className="bg-emerald-900/50 text-emerald-400">
            &#10003; {pr.approvalCount} approved
          </Badge>
        )}

        {pr.reviewStatus === 'changes_requested' && (
          <Badge className="bg-red-900/50 text-red-400">
            &#x21BB; Changes requested
          </Badge>
        )}

        {pr.unresolvedCommentCount > 0 && (
          <Badge className="bg-gray-800 text-amber-400">
            &#x1F4AC; {pr.unresolvedCommentCount} unresolved
          </Badge>
        )}

        {pr.hasConflicts && (
          <Badge className="bg-red-900/50 text-red-400">
            Conflicts
          </Badge>
        )}

        <span className="text-[10px] text-gray-600 ml-auto">{timeAgo}</span>
      </div>
    </a>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1 ${className}`}>
      {children}
    </span>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
