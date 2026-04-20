# PR Radar

**All your PRs in one place.** CI status, unresolved comments, deployments, and sound alerts — right from your browser toolbar. No tab required.

<img width="1119" height="623" alt="image" src="https://github.com/user-attachments/assets/f70cbb13-89d3-4f20-adf4-0c22e21f5fb4" />

Free, by [DeployHQ](https://www.deployhq.com/?utm_source=pr-radar&utm_medium=github&utm_campaign=readme). [Learn more →](https://www.deployhq.com/features/pr-radar)

## Features

- **Unified PR dashboard** — See all open PRs across your repos in one popup
- **Multi-platform** — GitHub, GitLab, and Bitbucket support
- **CI status at a glance** — Know instantly if your checks passed, failed, or are running
- **Unresolved comments** — Accurate count of unresolved review threads
- **Deployment previews** — See deployment status and click through to environment URLs
- **Sound & desktop notifications** — Get alerted when CI finishes, no tab required
- **Review tracking** — See which PRs need your review, and which you've already reviewed
- **Merge from dashboard** — Merge PRs directly with a confirm step (all platforms)
- **Pinned repos** — Star your favorite repos so their PRs always appear at the top
- **Stale PR detection** — Old PRs are dimmed with a nudge to close them (configurable)
- **Background polling** — Works without any tab open, using a personal access token
- **Toolbar badge** — Icon shows pass/fail/running count at a glance
- **Instant load** — Cached data shown immediately, refreshes in background
- **Keyboard shortcuts** — Navigate PRs with `j`/`k`, open with `o`, switch tabs with `1`/`2`/`3`, search with `/`, press `?` for the full list
- **Privacy-first** — Your token stays on your device. No backend, no tracking

## Install

### Chrome Web Store

[Install PR Radar](https://chromewebstore.google.com/detail/hkombgibegjffiadmekpiabdakkoidmh) — free, no account required.

### Manual install (development)

```bash
git clone https://github.com/deployhq/pr-radar.git
cd pr-radar
npm install
npm run build
```

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Setup

1. Click the PR Radar icon in your toolbar
2. Choose a platform to connect (GitHub, GitLab, or Bitbucket)
3. Create a token using the link provided — required scopes are listed in the connect form
4. Paste the token and connect — you're taken straight to the dashboard
5. Go to **Watched Repos** and select the repos you want to monitor
6. Done — your PRs appear instantly

### GitHub

- Create a **classic** personal access token (fine-grained tokens may miss org repos)
- Required scopes: `repo` + `read:org` (pre-filled via the setup link)
- If your org uses SSO, authorize the token for that org after creating it

### GitLab

- Create a personal access token
- Required scopes: `api` + `read_user` (pre-filled via the setup link)

### Bitbucket

- Create an Atlassian API token and enter your email + token
- Required scopes: `read:user:bitbucket`, `read:workspace:bitbucket`, `read:repository:bitbucket`, `read:pullrequest:bitbucket`, `write:pullrequest:bitbucket`

## For Teams

PR Radar works best when your whole team uses it. Share the install link so everyone sees the same review inbox, CI status, and comment threads.

[Install PR Radar →](https://chromewebstore.google.com/detail/hkombgibegjffiadmekpiabdakkoidmh)

## How it works

PR Radar polls platform APIs in the background at a configurable interval (default: 60 seconds). When it detects a CI status change on one of your PRs, it sends a desktop notification and plays a sound.

The popup shows cached data instantly and refreshes in the background — no loading spinners.

### What you see per PR

| Info | GitHub | GitLab | Bitbucket |
|------|--------|--------|-----------|
| CI status | Check Runs + Commit Status | Pipeline status | Pipelines API |
| Unresolved comments | GraphQL `reviewThreads` | Discussion notes | Inline comments |
| Review state | Reviews API | Approvals + discussions | Participants |
| Deployment | Deployments API | Deployments by SHA | — |
| Conflicts | GraphQL mergeable | API field | — |
| Draft detection | API field | API field | — |

### Toolbar badge

| Badge | Meaning |
|-------|---------|
| Green number | PRs with CI passed |
| Red number | PRs with CI failed |
| Blue `...` | CI running |
| Clear | No active PRs |
| Gray `?` | Polling error |

Stale PRs are excluded from the badge count.

## Settings

- **Desktop notifications** — Toggle on/off
- **Sound alerts** — Choose from Ding, Bell, or Chime
- **Poll interval** — 30s, 1m, 2m, or 5m
- **Stale PR threshold** — Dim PRs older than 14/30/45/60/90 days (or never)
- **Test button** — Verify notifications and sound work

## Tech stack

- TypeScript, React 18, Tailwind CSS 3
- Vite 5 with [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin)
- Chrome Manifest V3
- GitHub REST + GraphQL, GitLab REST, Bitbucket REST APIs

## Development

```bash
npm run dev          # Build in watch mode
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```

## Accessibility

PR Radar is built with accessibility in mind:

- **Keyboard navigation** — All interactive elements are reachable and operable via keyboard
- **Screen reader support** — ARIA labels, roles, and live regions throughout the UI
- **Semantic HTML** — Proper tab, switch, and checkbox roles; `aria-expanded` for collapsible sections
- **Status announcements** — Loading states, refresh status, and error messages use `aria-live` regions
- **Descriptive labels** — All form inputs, icon-only buttons, and status badges have accessible names
- **Decorative icons hidden** — Emoji and unicode icons are marked `aria-hidden` with text alternatives provided

## Privacy

- Your personal access tokens are stored locally in `chrome.storage.local`
- Tokens are never synced across devices or sent to any server
- All API calls go directly from your browser to the platform APIs
- No analytics, no tracking, no backend

## License

MIT

---

Made with <3 by [DeployHQ](https://www.deployhq.com/?utm_source=pr-radar&utm_medium=github&utm_campaign=readme) — automated deployments made simple.
