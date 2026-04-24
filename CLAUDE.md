# CLAUDE.md

## Overview

PR Radar - a free browser extension (Manifest V3, Chrome + Firefox + Edge) that provides a unified PR dashboard for GitHub, GitLab, and Bitbucket. Shows CI status, unresolved comments, review state, deployment status, and sound/desktop notifications. No tab required — works in the background. Free, by DeployHQ.

## Commands

```bash
npm run dev              # Chrome dev (watch mode)
npm run dev:firefox      # Firefox dev (watch mode)
npm run build            # Chrome production build (typecheck + vite build)
npm run build:chrome     # Chrome production build (explicit)
npm run build:firefox    # Firefox production build
npm run build:edge       # Edge production build
npm run typecheck        # TypeScript check only
npm run lint             # ESLint
```

### Loading locally

**Chrome**:
1. `npm run build`
2. Chrome > `chrome://extensions/` > Developer mode > Load unpacked > select `dist/`

**Firefox**:
1. `npm run build:firefox`
2. Firefox > `about:debugging#/runtime/this-firefox` > Load Temporary Add-on > select `dist-firefox/manifest.json`

**Edge**:
1. `npm run build:edge`
2. Edge > `edge://extensions/` > Developer mode > Load unpacked > select `dist-edge/`

To update: rebuild, then click refresh on the extension card (or remove + re-add for icon changes)

## Tech Stack

- **TypeScript**, **React 18**, **Tailwind CSS 3**
- **Vite 5** with `@crxjs/vite-plugin` for Chrome extension bundling
- **Manifest V3** (required for Chrome Web Store)

## Architecture

```
src/
  background/
    service-worker.ts            # Polling, badge updates, notifications, sound trigger
  popup/
    App.tsx                      # Main app shell with routing
    pages/
      Setup.tsx                  # Multi-platform connection (GitHub/GitLab/Bitbucket PAT auth, scope guide, connected state)
      Dashboard.tsx              # PR list with tabs (Mine/Review/All), cache-first rendering
      Settings.tsx               # Notifications, sound, polling, stale PR config, accounts, test button
      Repos.tsx                  # Watched repo selector with platform filter, select all, pin/fav stars, token scope callouts
    components/
      Header.tsx                 # Navigation header with extension icon + "by DeployHQ"
      PRItem.tsx                 # PR row: badges, diff stats, description preview, deployment URL, pinned star, stale/reviewed dimming
      CIBadge.tsx                # CI status badge (icon-only, tooltip with details + "broken by" on failure)
      PlatformIcon.tsx           # SVG icons for GitHub, GitLab, Bitbucket
      KeyboardShortcuts.tsx     # ? cheat sheet overlay (j/k nav, o open, 1-3 tabs, / search, r refresh)
      TriageSummary.tsx          # Urgency filter chip bar (icon+count chips with tooltips)
    utils/
      urgency.ts                 # Urgency classification, filter predicate, count computation, display metadata
    index.css                    # Tailwind imports + dark scrollbar styles
  shared/
    types.ts                     # TypeScript types (PullRequest, Platform, Message, UrgencyCategory, etc.)
    constants.ts                 # Status colors, platform labels, sound options
    storage.ts                   # Chrome storage wrapper (accounts, settings, repos, PR cache, CI statuses)
    api/
      github.ts                  # GitHub REST + GraphQL API (PRs, CI, reviews, threads, deployments, orgs, merge)
      gitlab.ts                  # GitLab REST API (MRs, CI pipelines, discussions, approvals, deployments, merge)
      bitbucket.ts               # Bitbucket REST API (PRs, pipelines, comments, participants, merge, workspaces)
      deployhq.ts                # DeployHQ REST API (projects, servers, deployments — opt-in integration)
public/
  offscreen.html                 # Offscreen document for audio playback (references offscreen.js)
  offscreen.js                   # Audio player (separate file required by MV3 CSP - no inline scripts)
  sounds/                        # Notification sounds: ding.mp3, bell.mp3, chime.mp3
icons/                           # Extension icons: 16/32/48/128px (radar dish on DeployHQ purple)
```

## API Integration

Uses PATs (Personal Access Tokens) — no backend needed. Setup page links pre-fill scopes.

### GitHub

- **Auth**: Classic PAT with `repo` + `read:org` scopes (fine-grained tokens may miss org repos)
- **REST endpoints**: `/user`, `/user/repos`, `/user/orgs`, `/orgs/{org}/repos`, `/repos/{owner}/{repo}/pulls`, `/pulls/{n}/reviews`, `/pulls/{n}/merge`, `/commits/{sha}/status`, `/commits/{sha}/check-runs`, `/deployments`, `/deployments/{id}/statuses`
- **GraphQL**: `reviewThreads.isResolved` for accurate unresolved comment counts; `additions`/`deletions` for diff stats (zero extra API calls)
- **Org repos**: Fetches via `/user/orgs` then `/orgs/{org}/repos?type=member` + `type=all`
- **SSO**: Token must be authorized for SSO-enabled orgs after creation

### GitLab

- **Auth**: PAT with `api` + `read_user` scopes (classic token; setup link pre-fills scopes)
- **REST endpoints**: `/user`, `/projects?membership=true`, `/projects/{id}/merge_requests`, `/merge_requests/{iid}/discussions`, `/merge_requests/{iid}/approvals`, `/merge_requests/{iid}/merge`, `/deployments`
- **CI status**: From `head_pipeline.status` on MR response
- **Unresolved comments**: Counted from discussion notes with `resolvable && !resolved`
- **Diff stats**: Via `/merge_requests/{iid}/changes` endpoint; checks `overflow` flag to suppress inaccurate counts on large MRs
- **Review tracking**: `hasReviewed` derived from user's resolvable notes in discussions

### Bitbucket

- **Auth**: Atlassian API token with Basic auth (`email:token` base64-encoded). Required scopes: `read:user:bitbucket`, `read:workspace:bitbucket`, `read:repository:bitbucket`, `read:pullrequest:bitbucket`, `write:pullrequest:bitbucket`
- **REST endpoints**: `/user`, `/user/workspaces`, `/repositories/{workspace}`, `/repositories/{repo}/pullrequests`, `/pullrequests/{id}/comments`, `/pullrequests/{id}/merge`, `/pullrequests/{id}/diffstat`
- **Workspaces**: Uses `/2.0/user/workspaces` (CHANGE-2770 replacement for deprecated `/workspaces`)
- **CI status**: From pipelines API filtered by source branch
- **Review tracking**: `hasReviewed` derived from participant state
- **Limitations**: No draft PR detection (Bitbucket doesn't support drafts), no conflict detection via API

### DeployHQ (opt-in)

The extension works fully without DeployHQ. This integration is entirely opt-in — configured in Settings > Accounts > DeployHQ.

- **Auth**: HTTP Basic auth (`email:apiKey` base64-encoded) against `https://{slug}.deployhq.com`
- **REST endpoints**: `/account` (test connection), `/projects` + `/projects/{permalink}` (list projects with repo URLs), `/projects/{permalink}/servers` + `/server_groups` (deployment targets), `/projects/{permalink}/deployments` (create deployment)
- **Repo matching**: During polling, fetches DeployHQ projects and matches their repository URLs against PR `repoFullName`. Mapping cached in `chrome.storage.local`
- **Deployment status**: Checks each server's `last_revision` against PR `headSha` to show persistent deployment badges
- **Deploy from dashboard**: Deploy button on subtitle row for matched PRs; inline server/group selector with confirm/cancel flow
- **Deployment badge**: Shown in badge row as clickable `🚀 ServerName` linking to the DeployHQ dashboard

## Key Design Decisions

- **No backend** — PATs stored in `chrome.storage.local`, all API calls direct from browser
- **No tab required** — Background polling via service worker + `chrome.alarms`
- **Cache-first rendering** — PR data cached in `chrome.storage`; popup shows cache instantly, refreshes in background with "Updating..." indicator
- **Persisted CI statuses** — Stored in `chrome.storage` (not in-memory) so status change detection survives service worker restarts
- **Offscreen API for audio** — MV3 service workers can't play audio; uses `public/offscreen.html` + `public/offscreen.js` (no inline scripts due to CSP)
- **GraphQL for comments** — REST API doesn't expose thread resolution; GraphQL `reviewThreads.isResolved` is accurate
- **Classic tokens recommended (GitHub)** — Fine-grained tokens may not show org repos; setup/callout links pre-fill correct scopes
- **Basic auth for Bitbucket** — Atlassian API tokens use `email:token` base64-encoded as Basic auth (not Bearer)
- **Workspace API (Bitbucket)** — Uses `/2.0/user/workspaces` (CHANGE-2770 replacement, old `/workspaces` is sunset)
- **Pinned repos** — `WatchedRepo.pinned` boolean; Dashboard sorts pinned-repo PRs first, PRItem shows ★ with combined tooltips
- **Stale PR exclusion** — Configurable threshold; stale PRs are dimmed in UI, excluded from badge count and notifications
- **Merge from dashboard** — Merge button in PR title row for all platforms; disabled when CI failing, conflicts, or draft; confirm step prevents accidental merges; respects branch protection rules; shows Merged (purple) state until poll refreshes
- **Urgency filters as chips, not tabs** — Compact icon+count chips in a triage bar (not a new tab) keep the UI lightweight; single-select toggle; counts computed from tab-filtered list so summary always shows full picture; stale is exclusive (no other urgency flags); filter state is ephemeral (resets on tab switch, no persistence)

## Features

- **Unified PR dashboard** — Mine/Review/All tabs
- **Multi-platform** — GitHub, GitLab, and Bitbucket with platform filter in Repos page
- **CI status** — GitHub: check-runs + combined status; GitLab: head pipeline; Bitbucket: pipelines API
- **Unresolved comments** — GitHub: GraphQL reviewThreads; GitLab: discussion notes; Bitbucket: inline comments
- **Deployment status** — GitHub: deployments API; GitLab: deployments by SHA
- **Review tracking** — Author/Review/Reviewed badges; reviewed PRs dimmed
- **Pinned repos** — Star toggle in Repos page; pinned repo PRs sort to top of Dashboard with ★ indicator
- **Stale PR detection** — Configurable threshold (default 45 days), dimmed with 💤 tooltip
- **Desktop notifications** — On CI status changes (persisted across SW restarts)
- **Sound alerts** — Via offscreen document (ding/bell/chime)
- **Badge states** — Failed (red count), Running (blue ...), Passed (green count), OK (clear), Error (gray ?)
- **PR caching** — Instant popup load, background refresh
- **Manual refresh** — ↻ button in dashboard
- **Last updated** — Timestamp shown below search bar
- **Select all/deselect all** — In watched repo selector (entire row clickable)
- **Token guidance** — Pre-filled token links, required scopes panel, platform-specific "Missing repos?" callouts
- **Dark scrollbar** — Themed to match dark UI
- **Merge PRs** — Merge button with confirm/cancel for GitHub, GitLab, and Bitbucket; disabled for drafts, conflicts, CI failures
- **Urgency filters** — Triage chip bar above PR list with icon+count chips (CI failing, Changes requested, Review requested, Conflicts, Stale) plus All chip; single-select toggle filters the list; counts scoped to active tab; resets on tab switch
- **Diff stats** — Shows `+N -N` additions/deletions per PR; GitHub via GraphQL, GitLab via changes endpoint (with overflow detection), Bitbucket via paginated diffstat API
- **PR description preview** — Expandable "Show description" toggle below each PR row; truncated at 500 chars with scrollable container; whitespace-only descriptions are hidden
- **Pending reviewers** — Badge showing count of reviewers who haven't submitted a review yet
- **Who broke the build** — CI failure tooltip includes PR author attribution (e.g., "CI failed: lint — broken by @john")
- **Compact badges** — Icon-only CI status, icon+count for approvals (👤), unresolved comments (💬), pending reviewers (⏳), changes requested (↻); full details in tooltips
- **Keyboard shortcuts** — `j`/`k` or arrows navigate PR list with visual focus ring, `o`/`Enter` opens PR, `1`/`2`/`3` switch tabs, `/` focuses search, `r` refreshes, `Escape` clears search/filter/focus, `?` toggles cheat sheet overlay; all shortcuts disabled when search input is focused (except Escape); "Press ? for shortcuts" hint in footer
- **Accessibility** — ARIA labels/roles on all interactive elements, `role="tab"`/`role="switch"`/`role="checkbox"` semantics, `aria-live` regions for status updates, `aria-expanded` on collapsible sections, decorative icons hidden from screen readers, form inputs labeled
- **DeployHQ integration (opt-in)** — Connect your DeployHQ account in Settings to deploy directly from the dashboard; select server/group with confirm step; persistent deployment badge (`🚀 ServerName`) links to DeployHQ dashboard; works for deployments made inside or outside PR Radar; the extension works fully without enabling this
- **Branding** — "Made with love by DeployHQ" footer with UTM tracking

## Publishing

- **CI**: GitHub Actions runs lint + typecheck + build on push/PR
- **CWS publish**: Triggered on `v*` tags via `chrome-webstore-upload-cli`
- **Firefox publish**: Triggered on `v*` tags via `web-ext-submit`
- **Edge publish**: Triggered on `v*` tags via `edge-webstore-upload`
- **Secrets needed (Chrome)**: `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`
- **Secrets needed (Firefox)**: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`
- **Secrets needed (Edge)**: `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`

## Icon

Radar dish (white) on DeployHQ purple (#5740cf) with rounded corners. Source SVG generated programmatically from radar-2-svgrepo-com.svg reference. Icons at 16/32/48/128px in `icons/` directory.
