# PR Radar

**All your PRs in one place.** CI status, unresolved comments, deployments, and sound alerts — right from your browser toolbar.

Free, by [DeployHQ](https://www.deployhq.com/?utm_source=pr-radar&utm_medium=github&utm_campaign=readme).

## Features

- **Unified PR dashboard** — See all open PRs across your repos in one popup
- **CI status at a glance** — Know instantly if your checks passed, failed, or are running
- **Unresolved comments** — See how many review threads still need attention
- **Deployment previews** — View deployment status and environment URLs directly
- **Sound & desktop notifications** — Get alerted when CI finishes (no tab required)
- **Review tracking** — See which PRs need your review, and which you've already reviewed
- **Stale PR detection** — Old PRs are dimmed with a nudge to close them
- **Background polling** — Works without any tab open, using a personal access token
- **Privacy-first** — Your token stays on your device. No backend, no tracking.

### Platforms

- **GitHub** — Full support
- **GitLab** — Coming soon
- **Bitbucket** — Coming soon

## Install

### Chrome Web Store

Coming soon.

### Manual install (development)

```bash
git clone https://github.com/deployhq/prbell.git
cd prbell
npm install
npm run build
```

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Setup

1. Click the PR Radar icon in your toolbar
2. Click **"Create a token"** — it opens GitHub with the right scopes pre-filled (`repo` + `read:org`)
3. Paste the token and connect
4. Go to **Watched Repos** and select the repos you want to monitor
5. Done — your PRs appear instantly

> **Tip:** Use a **classic** token (not fine-grained) for best compatibility with organization repos.

## How it works

PR Radar polls the GitHub API in the background at a configurable interval (default: 60 seconds). When it detects a CI status change on one of your PRs, it sends a desktop notification and plays a sound.

The popup shows cached data instantly and refreshes in the background — no loading spinners.

### What you see per PR

| Info | Source |
|------|--------|
| CI status | GitHub Check Runs + Commit Status API |
| Unresolved comments | GitHub GraphQL API (reviewThreads.isResolved) |
| Review state | Approved / Changes requested / Reviewed by you |
| Deployment | GitHub Deployments API with environment URL |
| Stale indicator | Based on last update time (configurable) |

### Badge states

| Badge | Meaning |
|-------|---------|
| Blue `...` | CI running on your PRs |
| Red number | Count of your PRs with failed CI |
| Clear | All clear |
| Gray `?` | Polling error |

## Settings

- **Desktop notifications** — Toggle on/off
- **Sound alerts** — Choose from Ding, Bell, or Chime
- **Poll interval** — 30s, 1m, 2m, or 5m
- **Stale PR threshold** — Dim PRs older than 14/30/45/60/90 days
- **Test button** — Verify notifications and sound work

## Tech stack

- TypeScript, React 18, Tailwind CSS 3
- Vite 5 with [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin)
- Chrome Manifest V3
- GitHub REST + GraphQL APIs

## Development

```bash
npm run dev          # Build in watch mode
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check
```

## Privacy

- Your personal access token is stored locally in `chrome.storage.local`
- Tokens are never synced across devices or sent to any server
- All API calls go directly from your browser to GitHub's API
- No analytics, no tracking, no backend

## License

MIT

---

Made with love by [DeployHQ](https://www.deployhq.com/?utm_source=pr-radar&utm_medium=github&utm_campaign=readme) — automated deployments made simple.
