import { useState } from 'react';
import type { PullRequest, Message } from '@/shared/types';
import CIBadge from './CIBadge';
import PlatformIcon from './PlatformIcon';

interface PRItemProps {
  pr: PullRequest;
  stalePRDays: number;
  pinned?: boolean;
  onMerged?: () => void;
  focused?: boolean;
}

export default function PRItem({ pr, stalePRDays, pinned, onMerged, focused }: PRItemProps) {
  const [mergeState, setMergeState] = useState<'idle' | 'confirm' | 'merging' | 'merged' | 'error'>('idle');
  const [mergeError, setMergeError] = useState('');
  const [branchState, setBranchState] = useState<'idle' | 'confirm' | 'deleting' | 'deleted' | 'error'>('idle');
  const [branchError, setBranchError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const description = pr.description?.trim();
  const timeAgo = getTimeAgo(pr.updatedAt);
  const isStale = stalePRDays > 0 && (Date.now() - new Date(pr.updatedAt).getTime()) > stalePRDays * 86400000;
  const isDimmed = (pr.hasReviewed && !pr.isAuthor) || isStale || pr.isBot || pr.isMerged || pr.isDraft;
  const isMergeable = !pr.isDraft && !pr.isMerged && !pr.hasConflicts && pr.ciStatus !== 'failed';

  async function handleMerge() {
    setMergeState('merging');
    setMergeError('');
    try {
      const msg: Message = { type: 'MERGE_PR', payload: { platform: pr.platform, repoFullName: pr.repoFullName, prNumber: pr.number } };
      const result = await chrome.runtime.sendMessage(msg) as { success: boolean; message: string };
      if (result.success) {
        setMergeState('merged');
        onMerged?.();
      } else {
        setMergeError(result.message);
        setMergeState('error');
      }
    } catch {
      setMergeError('Failed to send merge request');
      setMergeState('error');
    }
  }

  async function handleDeleteBranch() {
    if (!pr.headRef) return;
    setBranchState('deleting');
    setBranchError('');
    try {
      const msg: Message = { type: 'DELETE_BRANCH', payload: { platform: pr.platform, repoFullName: pr.repoFullName, branch: pr.headRef } };
      const result = await chrome.runtime.sendMessage(msg) as { success: boolean; message: string };
      if (result.success) {
        setBranchState('deleted');
      } else {
        setBranchError(result.message);
        setBranchState('error');
      }
    } catch {
      setBranchError('Failed to delete branch');
      setBranchState('error');
    }
  }

  return (
    <div className={`px-4 py-3 border-b border-gray-800 hover:bg-gray-800/30 transition-colors ${isDimmed ? 'opacity-50' : ''} ${focused ? 'ring-1 ring-inset ring-radar-500/60 bg-gray-800/40' : ''}`}>
      <a
        href={pr.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block cursor-pointer"
      >
        <div className="flex items-start gap-2.5">
          <span className="flex-shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center text-gray-400">
            <PlatformIcon platform={pr.platform} size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-gray-200 font-medium leading-tight truncate flex-1 min-w-0">
                {pr.title}
              </span>
              {!pr.isMerged && mergeState === 'idle' && (
                <button
                  disabled={!isMergeable}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMergeState('confirm'); }}
                  title={!isMergeable
                    ? [pr.isDraft && 'Draft PR', pr.hasConflicts && 'Has conflicts', pr.ciStatus === 'failed' && 'CI is failing'].filter(Boolean).join(', ')
                    : 'Merge pull request'}
                  className={`flex-shrink-0 text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border transition-colors ${
                    isMergeable
                      ? 'bg-[#238636] text-white border-[#2ea043] hover:bg-[#2ea043] cursor-pointer'
                      : 'bg-[#21262d] text-[#484f58] border-[#30363d] cursor-not-allowed'
                  }`}
                >
                  Merge
                </button>
              )}
              {!pr.isMerged && mergeState === 'confirm' && (
                <span className="flex-shrink-0 flex items-center gap-1">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMerge(); }}
                    className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#238636] text-white border-[#2ea043] hover:bg-[#2ea043] cursor-pointer transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMergeState('idle'); }}
                    className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#21262d] text-[#c9d1d9] border-[#30363d] hover:bg-[#30363d] cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </span>
              )}
              {!pr.isMerged && mergeState === 'merging' && (
                <span className="flex-shrink-0 text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#21262d] text-[#58a6ff] border-[#30363d]" role="status" aria-label="Merging pull request">
                  Merging...
                </span>
              )}
              {!pr.isMerged && mergeState === 'merged' && (
                <span className="flex-shrink-0 flex items-center gap-1">
                  <span className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#8957e5] text-white border-[#8957e5]">
                    Merged
                  </span>
                  {pr.headRef && branchState === 'idle' && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBranchState('confirm'); }}
                      title={`Delete branch ${pr.headRef}`}
                      className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#21262d] text-[#c9d1d9] border-[#30363d] hover:bg-[#30363d] hover:border-[#8b949e] cursor-pointer transition-colors"
                    >
                      Delete branch
                    </button>
                  )}
                  {pr.headRef && branchState === 'confirm' && (
                    <>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteBranch(); }}
                        className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#da3633] text-white border-[#f85149] hover:bg-[#f85149] cursor-pointer transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBranchState('idle'); }}
                        className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#21262d] text-[#c9d1d9] border-[#30363d] hover:bg-[#30363d] cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {branchState === 'deleting' && (
                    <span className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#21262d] text-[#58a6ff] border-[#30363d]">
                      Deleting...
                    </span>
                  )}
                  {branchState === 'deleted' && (
                    <span className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold text-gray-500">
                      Branch deleted
                    </span>
                  )}
                  {branchState === 'error' && (
                    <>
                      <span className="text-[10px] text-red-400 truncate max-w-[100px]" title={branchError}>{branchError}</span>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBranchState('idle'); }}
                        className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#21262d] text-[#c9d1d9] border-[#30363d] hover:bg-[#30363d] cursor-pointer transition-colors"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                </span>
              )}
              {!pr.isMerged && mergeState === 'error' && (
                <span className="flex-shrink-0 flex items-center gap-1">
                  <span className="text-[10px] text-red-400 truncate max-w-[100px]" title={mergeError}>{mergeError}</span>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMergeState('idle'); }}
                    className="text-[10px] leading-none px-2 py-0.5 rounded-md font-semibold border bg-[#21262d] text-[#c9d1d9] border-[#30363d] hover:bg-[#30363d] cursor-pointer transition-colors"
                  >
                    Dismiss
                  </button>
                </span>
              )}
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

          <CIBadge status={pr.ciStatus} failedChecks={pr.ciFailedChecks} author={pr.author} durationMs={pr.ciDurationMs} />

          {pr.approvalCount > 0 && (
            <span title={pr.approvedBy ? `Approved by: ${pr.approvedBy.join(', ')}` : undefined}
              aria-label={`${pr.approvalCount} approval${pr.approvalCount > 1 ? 's' : ''}${pr.approvedBy ? ` by ${pr.approvedBy.join(', ')}` : ''}`}>
              <Badge className="bg-emerald-900/50 text-emerald-400">
                <span aria-hidden="true">&#x1F464;</span> {pr.approvalCount}
              </Badge>
            </span>
          )}

          {pr.reviewStatus === 'changes_requested' && (
            <span title={pr.changesRequestedBy ? `Changes requested by: ${pr.changesRequestedBy.join(', ')}` : undefined}
              aria-label={`Changes requested${pr.changesRequestedBy ? ` by ${pr.changesRequestedBy.join(', ')}` : ''}`}>
              <Badge className="bg-red-900/50 text-red-400">
                <span aria-hidden="true">&#x21BB;</span>
              </Badge>
            </span>
          )}

          {pr.unresolvedCommentCount > 0 && (
            <span title={pr.unresolvedCommentAuthors ? `Unresolved from: ${pr.unresolvedCommentAuthors.join(', ')}` : undefined}
              aria-label={`${pr.unresolvedCommentCount} unresolved comment${pr.unresolvedCommentCount > 1 ? 's' : ''}${pr.unresolvedCommentAuthors ? ` from ${pr.unresolvedCommentAuthors.join(', ')}` : ''}`}>
              <Badge className="bg-gray-800 text-amber-400">
                <span aria-hidden="true">&#x1F4AC;</span> {pr.unresolvedCommentCount}
              </Badge>
            </span>
          )}

          {pr.pendingReviewers && pr.pendingReviewers.length > 0 && (
            <span title={`Pending review from: ${pr.pendingReviewers.join(', ')}`}
              aria-label={`${pr.pendingReviewers.length} pending reviewer${pr.pendingReviewers.length > 1 ? 's' : ''}: ${pr.pendingReviewers.join(', ')}`}>
              <Badge className="bg-blue-900/50 text-blue-400">
                <span aria-hidden="true">&#x23F3;</span> {pr.pendingReviewers.length}
              </Badge>
            </span>
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
              <span aria-hidden="true">&#x1F680;</span> <span aria-label={`Deployment ${pr.deployment.status}: ${pr.deployment.environment}`}>{pr.deployment.environment}</span>
            </Badge>
          )}

          {(pr.additions !== undefined || pr.deletions !== undefined) && (
            <Badge className="bg-gray-800 text-gray-400">
              <span className="text-emerald-400">+{pr.additions ?? 0}</span>
              {' '}
              <span className="text-red-400">-{pr.deletions ?? 0}</span>
            </Badge>
          )}

          <span
            className="text-[10px] text-gray-600 ml-auto"
            title={[
              pinned && 'Pinned repo',
              pr.isMerged && 'This PR was merged — tracking CI',
              pr.isBot && !pr.isMerged && 'This PR was created by a bot',
              isStale && !pr.isMerged && 'This PR is stale — consider closing it',
            ].filter(Boolean).join(' · ') || undefined}
          >
            {pinned && <span className="mr-1 text-yellow-400" aria-label="Pinned repo">{'\u2605'}</span>}
            {pr.isMerged && <span className="mr-1" aria-label="Merged">&#x1F500;</span>}
            {pr.isBot && !pr.isMerged && <span className="mr-1" aria-label="Bot PR">&#x1F916;</span>}
            {isStale && !pr.isMerged && <span className="mr-1" aria-label="Stale PR">&#x1F4A4;</span>}
            <span aria-label={`Updated ${timeAgo}`}>{timeAgo}</span>
          </span>
        </div>

        {pr.deployment?.url && pr.deployment.status === 'success' && (
          <div className="ml-[30px] mt-1 flex items-center gap-1">
            <a
              href={pr.deployment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-radar-400 hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Deployment preview: ${pr.deployment.url.replace(/^https?:\/\//, '')}`}
            >
              <span aria-hidden="true">&#x1F517;</span> {pr.deployment.url.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}
      </a>

      {description && (
        <div className="ml-[30px] mt-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide PR description' : 'Show PR description'}
          >
            <span aria-hidden="true">{expanded ? '\u25BE' : '\u25B8'}</span> {expanded ? 'Hide description' : 'Show description'}
          </button>
          {expanded && (
            <div className="mt-1 text-[11px] text-gray-400 leading-relaxed whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto pr-2">
              {description.length > 500 ? `${description.slice(0, 500)}…` : description}
            </div>
          )}
        </div>
      )}
    </div>
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
