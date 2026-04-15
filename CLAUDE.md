# CLAUDE.md

## Overview

PR Radar - a free Chrome extension (Manifest V3) that provides a unified PR dashboard for GitHub (GitLab and Bitbucket coming soon). Shows CI status, unresolved comments, review state, deployment status, and sound/desktop notifications. No tab required — works in the background. Free, by DeployHQ.

## Commands

```bash
npm run dev          # Build in watch mode (development)
npm run build        # Production build (typecheck + vite build)
npm run typecheck    # TypeScript check only
npm run lint         # ESLint
```

### Loading locally

1. `npm run build`
2. Chrome > `chrome://extensions/` > Developer mode > Load unpacked > select `dist/`
3. To update: rebuild, then click refresh on the extension card (or remove + re-add for icon changes)

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
      Setup.tsx                  # GitHub connection (PAT auth, auto-navigates on connect)
      Dashboard.tsx              # PR list with tabs (Mine/Review/All), cache-first rendering
      Settings.tsx               # Notifications, sound, polling, stale PR config, accounts, test button
      Repos.tsx                  # Watched repo selector with select all, token scope callout
    components/
      Header.tsx                 # Navigation header with extension icon + "by DeployHQ"
      PRItem.tsx                 # PR row: badges, deployment URL, stale/reviewed dimming
      CIBadge.tsx                # CI status badge component
      PlatformIcon.tsx           # SVG icons for GitHub, GitLab, Bitbucket
    index.css                    # Tailwind imports + dark scrollbar styles
  shared/
    types.ts                     # TypeScript types (PullRequest, Platform, Message, etc.)
    constants.ts                 # Status colors, platform labels, sound options
    storage.ts                   # Chrome storage wrapper (accounts, settings, repos, PR cache, CI statuses)
    api/
      github.ts                  # GitHub REST + GraphQL API (PRs, CI, reviews, threads, deployments, orgs)
      gitlab.ts                  # GitLab REST API (coming soon)
      bitbucket.ts               # Bitbucket REST API (coming soon)
public/
  offscreen.html                 # Offscreen document for audio playback (references offscreen.js)
  offscreen.js                   # Audio player (separate file required by MV3 CSP - no inline scripts)
  sounds/                        # Notification sounds: ding.mp3, bell.mp3, chime.mp3
icons/                           # Extension icons: 16/32/48/128px (radar dish on DeployHQ purple)
```

## API Integration

Uses PATs (Personal Access Tokens) — no backend needed. Setup page links pre-fill scopes.

### GitHub (active)

- **Auth**: Classic PAT with `repo` + `read:org` scopes (fine-grained tokens may miss org repos)
- **REST endpoints**: `/user`, `/user/repos`, `/user/orgs`, `/orgs/{org}/repos`, `/repos/{owner}/{repo}/pulls`, `/pulls/{n}/reviews`, `/commits/{sha}/status`, `/commits/{sha}/check-runs`, `/deployments`, `/deployments/{id}/statuses`
- **GraphQL**: `reviewThreads.isResolved` for accurate unresolved comment counts
- **Org repos**: Fetches via `/user/orgs` then `/orgs/{org}/repos?type=member` + `type=all`

### GitLab / Bitbucket (coming soon)

API clients exist but are disabled in the Setup UI. Platform cards show "Coming soon".

## Key Design Decisions

- **No backend** — PATs stored in `chrome.storage.local`, all API calls direct from browser
- **No tab required** — Background polling via service worker + `chrome.alarms`
- **Cache-first rendering** — PR data cached in `chrome.storage`; popup shows cache instantly, refreshes in background with "Updating..." indicator
- **Persisted CI statuses** — Stored in `chrome.storage` (not in-memory) so status change detection survives service worker restarts
- **Offscreen API for audio** — MV3 service workers can't play audio; uses `public/offscreen.html` + `public/offscreen.js` (no inline scripts due to CSP)
- **GraphQL for comments** — REST API doesn't expose thread resolution; GraphQL `reviewThreads.isResolved` is accurate
- **Classic tokens recommended** — Fine-grained tokens may not show org repos; setup/callout links pre-fill correct scopes
- **Stale PR exclusion** — Configurable threshold; stale PRs are dimmed in UI, excluded from badge count and notifications

## Features

- **Unified PR dashboard** — Mine/Review/All tabs
- **CI status** — Via check-runs + combined status API per PR head SHA
- **Unresolved comments** — Via GitHub GraphQL API (accurate resolved/unresolved)
- **Deployment status** — Environment name badge + clickable preview URL
- **Review tracking** — Author/Review/Reviewed badges; reviewed PRs dimmed
- **Stale PR detection** — Configurable threshold (default 45 days), dimmed with 💤 tooltip
- **Desktop notifications** — On CI status changes (persisted across SW restarts)
- **Sound alerts** — Via offscreen document (ding/bell/chime)
- **Badge states** — Failed (red count), Running (blue ...), Passed (green count), OK (clear), Error (gray ?)
- **PR caching** — Instant popup load, background refresh
- **Manual refresh** — ↻ button in dashboard
- **Last updated** — Timestamp shown below search bar
- **Select all/deselect all** — In watched repo selector (entire row clickable)
- **Token guidance** — Pre-filled classic token links, "Missing repos?" callout
- **Dark scrollbar** — Themed to match dark UI
- **Branding** — "Made with love by DeployHQ" footer with UTM tracking

## Publishing

- **CI**: GitHub Actions runs lint + typecheck + build on push/PR
- **CWS publish**: Triggered on `v*` tags via `chrome-webstore-upload-cli`
- **Secrets needed**: `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`

## Icon

Radar dish (white) on DeployHQ purple (#5740cf) with rounded corners. Source SVG generated programmatically from radar-2-svgrepo-com.svg reference. Icons at 16/32/48/128px in `icons/` directory.
