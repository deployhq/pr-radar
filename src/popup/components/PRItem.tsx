import type { PullRequest } from '@/shared/types';
import { PLATFORM_SHORT, PLATFORM_COLORS } from '@/shared/constants';
import CIBadge from './CIBadge';

interface PRItemProps {
  pr: PullRequest;
  stalePRDays: number;
}

export default function PRItem({ pr, stalePRDays }: PRItemProps) {
  const platformStyle = PLATFORM_COLORS[pr.platform];
  const timeAgo = getTimeAgo(pr.updatedAt);
  const isStale = stalePRDays > 0 && (Date.now() - new Date(pr.updatedAt).getTime()) > stalePRDays * 86400000;
  const isDimmed = (pr.hasReviewed && !pr.isAuthor) || isStale || pr.isBot || pr.isMerged;

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block px-4 py-3 border-b border-gray-800 hover:bg-gray-800/30 transition-colors cursor-pointer ${isDimmed ? 'opacity-50' : ''}`}
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
          <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
            <span>{pr.repoFullName} #{pr.number}</span>
            {pr.isAuthor && (
              <span className="text-[9px] px-1.5 py-px rounded bg-radar-900/50 text-radar-400 font-medium">
                Author
              </span>
            )}
            {pr.isReviewRequested && !pr.hasReviewed && (
              <span className="text-[9px] px-1.5 py-px rounded bg-amber-900/50 text-amber-400 font-medium">
                Review
              </span>
            )}
            {pr.hasReviewed && !pr.isAuthor && (
              <span className="text-[9px] px-1.5 py-px rounded bg-gray-700/50 text-gray-400 font-medium">
                Reviewed
              </span>
            )}
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

        {pr.deployment && pr.deployment.status !== 'inactive' && (
          <Badge className={
            pr.deployment.status === 'success' ? 'bg-emerald-900/50 text-emerald-400'
              : pr.deployment.status === 'failure' ? 'bg-red-900/50 text-red-400'
                : 'bg-blue-900/50 text-blue-400'
          }>
            &#x1F680; {pr.deployment.environment}
          </Badge>
        )}

        <span
          className="text-[10px] text-gray-600 ml-auto"
          title={pr.isMerged ? 'This PR was merged — tracking CI' : isStale ? 'This PR is stale — consider closing it' : pr.isBot ? 'This PR was created by a bot' : undefined}
        >
          {pr.isMerged && <span className="mr-1">&#x1F500;</span>}
          {pr.isBot && !pr.isMerged && <span className="mr-1">&#x1F916;</span>}
          {isStale && !pr.isMerged && <span className="mr-1">&#x1F4A4;</span>}
          {timeAgo}
        </span>
      </div>

      {pr.deployment?.url && pr.deployment.status === 'success' && (
        <div className="ml-[30px] mt-1 flex items-center gap-1">
          <span
            className="text-[10px] text-radar-400 hover:underline truncate"
            onClick={(e) => { e.preventDefault(); window.open(pr.deployment!.url, '_blank'); }}
          >
            &#x1F517; {pr.deployment.url.replace(/^https?:\/\//, '')}
          </span>
        </div>
      )}
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
