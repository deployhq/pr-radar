# CLAUDE.md

## Overview

PR Radar - a free Chrome extension (Manifest V3) that provides a unified PR dashboard across GitHub, GitLab, and Bitbucket. Shows CI status, unresolved comments, review state, and sound notifications. Free, by DeployHQ.

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
    service-worker.ts        # Polling, badge updates, notifications, sound trigger
    offscreen.ts             # Audio playback (MV3 service workers can't play audio)
  popup/
    App.tsx                  # Main app shell with routing
    pages/
      Setup.tsx              # Platform connection (PAT-based auth)
      Dashboard.tsx          # Unified PR list with tabs (Mine/Review/All)
      Settings.tsx           # Notifications, sound, polling, accounts
      Repos.tsx              # Watched repo selector
    components/
      Header.tsx             # Navigation header
      PRItem.tsx             # Individual PR row
      CIBadge.tsx            # CI status badge
  shared/
    types.ts                 # TypeScript types
    constants.ts             # Status colors, platform labels, sound options
    storage.ts               # Chrome storage wrapper (accounts, settings, repos)
    api/
      github.ts              # GitHub REST API client (PAT auth)
      gitlab.ts              # GitLab REST API client (PAT auth)
      bitbucket.ts           # Bitbucket REST API client (App Password auth)
```

## API Integration

Uses PATs (Personal Access Tokens) for all platforms - no backend needed.

- **GitHub**: Bearer token, `api.github.com` - needs `repo` scope
- **GitLab**: PRIVATE-TOKEN header, `gitlab.com/api/v4` - needs `read_api` scope
- **Bitbucket**: Bearer token, `api.bitbucket.org/2.0` - needs read permissions

## Key Design Decisions

- **No backend** - All auth via PATs stored locally in `chrome.storage.local`
- **No tab required** - Background polling via service worker + chrome.alarms
- **Offscreen API for audio** - MV3 service workers can't play audio directly
- **Explicit repo selection** - Users choose which repos to watch (avoids rate limits)
- **Cross-platform PR model** - Normalized `PullRequest` type across all 3 platforms

## Sound Notifications

Service worker detects CI status changes -> triggers offscreen document -> plays audio.
Sound files go in `public/sounds/` (ding.mp3, bell.mp3, chime.mp3).

## Badge States

- Running (blue "...") - CI running on your PRs
- Failed (red count) - Number of your PRs with failed CI
- OK (clear) - All clear
- Error (gray "?") - Polling error
