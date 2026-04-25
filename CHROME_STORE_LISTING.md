# Chrome Web Store Listing Copy

Exact copy to paste into the CWS developer dashboard. Each section matches a field in the dashboard.

## Title (max 75 chars)

```
PR Radar – Pull Request Dashboard for GitHub, GitLab & Bitbucket
```

66 characters.

## Short Description (max 132 chars)

```
Track PRs, CI status, code reviews & deployments across GitHub, GitLab and Bitbucket. No backend, free forever. By DeployHQ.
```

124 characters.

## Long Description (max 16,000 chars)

```
PR Radar gives you a single dashboard for every open pull request across GitHub, GitLab, and Bitbucket — right from your browser toolbar. No more juggling tabs between three platforms to check CI status, find unresolved comments, or see who's waiting on your review.

Perfect for:
- Full-stack developers working across multiple Git providers
- DevOps and platform engineers monitoring CI/CD status across repos
- Engineering managers tracking code review progress for their team
- Open-source maintainers managing contributions from multiple sources
- Teams using GitHub for code, GitLab CI for pipelines, or Bitbucket for enterprise repos

Features:

- Unified PR dashboard with Mine / Review / All tabs
- Multi-platform support for GitHub, GitLab, and Bitbucket
- CI/CD status at a glance — GitHub Actions check runs, GitLab CI pipelines, and Bitbucket Pipelines all shown as color-coded badges
- Unresolved comment count from GitHub GraphQL, GitLab discussions, and Bitbucket comments
- Deployment status and environment URLs from GitHub Deployments and GitLab Deployments APIs
- Pull request notifications — desktop alerts and sound when CI finishes (ding, bell, or chime)
- Code review tracking — see which PRs need your review, which you've reviewed, and who approved
- Merge from the dashboard — merge pull requests and merge requests directly with a confirm step
- Pinned repos — star your most important repos so their PRs always sort to the top
- Stale PR detection — old PRs are dimmed with a configurable threshold
- Toolbar badge — green/red/blue icon shows pass/fail/running count without opening the popup
- Keyboard shortcuts — j/k to navigate, o to open, 1/2/3 to switch tabs, / to search, ? for the cheat sheet
- Diff stats — additions and deletions shown per PR
- PR description preview — expandable inline preview without leaving the dashboard
- Pending reviewers — see who hasn't reviewed yet
- Who broke the build — CI failure tooltips show the PR author
- Merge request dashboard — GitLab MRs shown alongside GitHub and Bitbucket PRs in one view
- DeployHQ integration (optional) — deploy directly from the dashboard with server selection, see deployment status badges

Why PR Radar:

- Multi-provider — GitHub, GitLab, and Bitbucket in one view. No switching between platforms.
- No backend — your personal access tokens stay in your browser's local storage. All API calls go directly from your browser to the platform APIs. Nothing passes through our servers.
- Privacy-first — no analytics, no tracking, no accounts, no registration. Just install and connect.
- Free and open source — MIT licensed. No premium tier, no feature gates, no ads. Free forever.
- Background polling — works without any tab open. Configurable interval from 30 seconds to 5 minutes.
- Instant load — cached PR data shown immediately when you open the popup; refreshes in the background.
- Accessible — full keyboard navigation, screen reader support, ARIA labels throughout.

How it works:

1. Install PR Radar from the Chrome Web Store
2. Click the icon and connect your GitHub, GitLab, or Bitbucket account with a personal access token
3. Select the repos you want to monitor
4. Your PRs appear instantly — CI status, reviews, comments, and deployments all in one place

PR Radar polls platform APIs in the background at a configurable interval. When it detects a CI status change on one of your pull requests, it sends a desktop notification and plays a sound alert. No tab required.

Built and maintained by DeployHQ (https://www.deployhq.com) — automated deployments made simple.
```

## Category

```
Developer Tools
```

## Screenshot Brief (1280x800 each)

The following 5 screenshots should be produced for the store listing. Each has a bold text overlay on a dark (#0d0d1a) background with the extension popup centered.

1. **"All your PRs in one place"**
   Show the Dashboard on the "All" tab with 5-6 PRs from mixed platforms (GitHub, GitLab, Bitbucket). PR items should show a mix of CI badges (green passed, red failed, blue running), approval counts, unresolved comments, and diff stats. The "by author" text should be visible on each PR.

2. **"CI status at a glance"**
   Show the Dashboard on the "Mine" tab with 3-4 authored PRs. One PR should have a red CI failed badge with the tooltip expanded showing "CI failed: lint — broken by @dev". Another should show green passed with approvals. Toolbar badge should show a red count.

3. **"GitHub, GitLab & Bitbucket"**
   Show the Repos page with repos from all three platforms visible. The platform filter chips should be visible at the top. Some repos should have the pinned star active. Include a mix of org repos and personal repos.

4. **"Desktop notifications & sound alerts"**
   Show the Settings page with notifications enabled, sound set to "Ding", and the poll interval visible. Overlay a macOS notification toast in the top-right corner showing "CI passed — deployhq/api #42".

5. **"Deploy from your toolbar"**
   Show a PR item with the DeployHQ deploy button expanded, showing the server selector dropdown with "Production" and "Staging" options, and the confirm/cancel buttons. A deployed PR below it should show the rocket badge linking to DeployHQ.

## Promo Tile Brief

### Small promo tile (440x280)

Dark background (#0d0d1a). PR Radar icon (white radar dish on #5740cf circle) centered-left. To the right: "PR Radar" in white, "GitHub + GitLab + Bitbucket" in gray below. Three small platform icons (GitHub, GitLab, Bitbucket) in a row at the bottom. Clean, minimal.

### Marquee promo tile (1400x560)

Dark background (#0d0d1a). Left half: "One dashboard for every pull request" as headline in white, "GitHub, GitLab & Bitbucket" as subhead in #a78bfa (radar purple), "Free, by DeployHQ" in gray below. Right half: screenshot of the dashboard popup at ~70% scale showing mixed-platform PRs with CI badges. PR Radar icon in the top-left corner.

## Pre-launch Checklist

- [ ] Domain verification: verify `deployhq.com` in CWS developer dashboard
- [ ] Manifest V3: confirmed (`"manifest_version": 3`)
- [ ] Privacy policy URL: host at `https://www.deployhq.com/privacy` or `https://www.deployhq.com/extensions/pr-radar/privacy`
- [ ] Support email: `support@deployhq.com`
- [ ] Support URL: `https://github.com/deployhq/pr-radar/issues`
- [ ] All screenshots at 1280x800 PNG
- [ ] Small promo tile at 440x280 PNG
- [ ] Marquee promo tile at 1400x560 PNG (optional but recommended for featuring)
- [ ] Category set to "Developer Tools"
- [ ] Language set to English
- [ ] Single purpose description matches manifest description
