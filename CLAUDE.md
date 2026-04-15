# CLAUDE.md

## Overview

PR Radar - a free Chrome extension (Manifest V3) that provides a unified PR dashboard across GitHub (GitLab and Bitbucket coming soon). Shows CI status, unresolved comments, review state, deployment status, and sound/desktop notifications. Free, by DeployHQ.

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
      Setup.tsx                  # Platform connection (PAT-based auth)
      Dashboard.tsx              # Unified PR list with tabs (Mine/Review/All)
      Settings.tsx               # Notifications, sound, polling, stale PR config, accounts
      Repos.tsx                  # Watched repo selector with select all
    components/
      Header.tsx                 # Navigation header with "by DeployHQ" branding
      PRItem.tsx                 # Individual PR row with badges and deployment info
      CIBadge.tsx                # CI status badge
      PlatformIcon.tsx           # SVG icons for GitHub, GitLab, Bitbucket
  shared/
    types.ts                     # TypeScript types
    constants.ts                 # Status colors, platform labels, sound options
    storage.ts                   # Chrome storage wrapper (accounts, settings, repos, PR cache)
    api/
      github.ts                  # GitHub REST + GraphQL API client
      gitlab.ts                  # GitLab REST API client (coming soon)
      bitbucket.ts               # Bitbucket REST API client (coming soon)
public/
  offscreen.html                 # Offscreen document for audio playback
  offscreen.js                   # Audio player (separate file, MV3 CSP requires no inline scripts)
  sounds/                        # Notification sound files (ding.mp3, bell.mp3, chime.mp3)
```

## API Integration

Uses PATs (Personal Access Tokens) — no backend needed.

- **GitHub**: Bearer token, `api.github.com` + GraphQL - needs `repo` + `read:org` scopes
- **GitLab**: Coming soon
- **Bitbucket**: Coming soon

### GitHub API endpoints used

- `GET /user` - Authenticated user
- `GET /user/repos` - User's repos
- `GET /user/orgs` - User's organizations
- `GET /orgs/{org}/repos` - Org repos (type=member + type=all)
- `GET /repos/{owner}/{repo}/pulls` - Open PRs
- `GET /repos/{owner}/{repo}/pulls/{number}/reviews` - PR reviews
- `GET /repos/{owner}/{repo}/commits/{sha}/status` - Combined commit status
- `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` - Check runs (GitHub Actions)
- `GET /repos/{owner}/{repo}/deployments` - Deployments for a SHA
- `GET /repos/{owner}/{repo}/deployments/{id}/statuses` - Deployment statuses
- `POST /graphql` - Unresolved review thread count (reviewThreads.isResolved)

## Key Design Decisions

- **No backend** - All auth via PATs stored locally in `chrome.storage.local`
- **No tab required** - Background polling via service worker + chrome.alarms
- **Offscreen API for audio** - MV3 service workers can't play audio directly; uses separate offscreen.html + offscreen.js (no inline scripts due to CSP)
- **Explicit repo selection** - Users choose which repos to watch (avoids rate limits)
- **Cache-first rendering** - PR data cached in chrome.storage; popup shows cached data instantly, refreshes in background
- **Persisted CI statuses** - Stored in chrome.storage (not in-memory) so status change detection survives service worker restarts
- **GraphQL for unresolved comments** - REST API doesn't expose thread resolution state; GraphQL reviewThreads.isResolved is accurate
- **Classic tokens recommended** - Fine-grained tokens may not show all org repos; setup links pre-fill scopes

## Features

- **Unified PR dashboard** with Mine/Review/All tabs
- **CI status** via check-runs + combined status API (per PR head SHA)
- **Unresolved comment count** via GitHub GraphQL API
- **Deployment status** with environment name and preview URL
- **Review state** - Author/Review/Reviewed badges
- **Stale PR detection** - Configurable threshold, dimmed with tooltip
- **Desktop notifications** on CI status changes
- **Sound alerts** via offscreen document (ding/bell/chime)
- **Badge states** - Running (blue), Failed (red count), OK (clear), Error (gray)
- **PR caching** - Instant popup load from cache, background refresh
- **Token scope guidance** - Pre-filled classic token creation links
- **Select all/deselect all** in repo selector
- **Dark themed scrollbar**

## Publishing

- CI: GitHub Actions runs lint + typecheck + build on push/PR
- CWS publish: Triggered on `v*` tags via `chrome-webstore-upload-cli`
- Requires GitHub secrets: `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`
