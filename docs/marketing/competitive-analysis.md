# Competitive Analysis — PR Radar

Last updated: 2026-04-19

## Overview

PR Radar is a free, open-source Chrome extension (Manifest V3) that provides a unified PR dashboard for GitHub, GitLab, and Bitbucket. This document tracks competing tools and PR Radar's positioning.

## Competitors

### Tier 1: Direct Competitors (Multi-Platform PR Dashboards)

**GitKraken Launchpad** — The closest competitor. Supports GitHub, GitLab, Bitbucket, and Azure DevOps. The browser extension is free but the full Launchpad dashboard requires a Teams plan at $8.95/user/month. Does not offer sound/desktop notifications from the extension, CI badge status in the popup, or unresolved comment counts.

**Pullwalla** — Supports GitHub and Bitbucket (no GitLab). Native macOS/iOS app, not a Chrome extension. Notifications are a paid feature. No CI status display, no unresolved comment counts, no deployment status.

**CatLight** — Supports GitHub, GitLab, and Azure DevOps (no Bitbucket). Desktop tray app. Free for small teams, paid for larger ones. Focused on CI/build monitoring with a "who broke the build" feature. No unresolved comments, deployment status, or PR triage features.

### Tier 2: GitHub-Only PR Tools

**PR Monitor** — Free, open source Chrome extension. Closest UX match (popup with PR list) but GitHub-only. No CI status badges, no unresolved comment counts, no deployment status, no sound alerts.

**PR Hub** — Free Chrome extension. Similar tab-based UI but GitHub-only. Has CI status and comment counts but lacks multi-platform support, deployment status, sound alerts, and merge capability.

**Notifier for GitHub** — By Sindre Sorhus. Free, open source. Shows unread notification count badge only — no PR dashboard.

**Refined GitHub** — Free, open source. Enhances GitHub's own web UI with 200+ improvements. Complementary tool, not a competitor — users could use both.

**Graphite** — GitHub-only. Focused on stacked PRs, AI code review, and merge queues. Free tier is limited; paid plans start at $20/user/month. Web app + CLI + VS Code extension, not a Chrome extension. Different use case entirely.

### Tier 3: Notification & Monitoring Tools

**Gitify** — Free, open source. Desktop menu bar app for GitHub notifications. Not a PR dashboard.

**DevHub** — GitHub-only. TweetDeck-like multi-column layout for notifications, issues, and activity. Different UX paradigm.

**Octobox** — GitHub-only web app. Enhanced notification inbox. Free for open source, paid for private repos.

### Tier 4: Engineering Metrics Platforms

**LinearB / Haystack / Swarmia / Axolo** — Enterprise engineering metrics platforms. Team/manager focused. Paid. Much broader scope than PR monitoring.

## Feature Comparison

| Feature | PR Radar | GitKraken Launchpad | PR Monitor | PR Hub | Pullwalla | CatLight | Gitify | Graphite | CodeStream |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Platform Support** | | | | | | | | | |
| GitHub | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| GitLab | Y | Y | - | - | - | Y | - | - | Y |
| Bitbucket | Y | Y | - | - | Y | - | - | - | Y |
| Azure DevOps | - | Y | - | - | - | Y | - | - | - |
| Self-hosted instances | - | Y | - | - | - | Y | Y | - | Y |
| **Form Factor** | | | | | | | | | |
| Chrome extension popup | Y | Y | Y | Y | - | - | - | - | - |
| Web app | - | Y | - | - | - | - | - | Y | - |
| Desktop app | - | Y | - | - | Y | Y | Y | - | - |
| Mobile app | - | - | - | - | Y | - | Y | Y | - |
| IDE extension | - | Y | - | - | - | - | - | Y | Y |
| **Pricing** | | | | | | | | | |
| Fully free | Y | - | Y | Y | - | - | Y | - | Y |
| Open source | Y | - | Y | - | - | - | Y | - | - |
| **PR Management** | | | | | | | | | |
| My PRs / Review / All tabs | Y | Y | Y | Y | Y | - | - | Y | - |
| Merge from dashboard | Y | - | - | - | $ | - | - | Y | Y |
| Draft PR indicator | Y | Y | - | - | - | - | - | Y | - |
| Conflict detection | Y | - | - | - | - | - | - | Y | - |
| Stale PR detection | Y | - | - | - | - | - | - | - | - |
| Pinned/favorite repos | Y | Y | - | - | - | - | - | - | - |
| Search/filter PRs | Y | Y | - | - | Y | - | Y | Y | - |
| Urgency triage chips | Y | - | - | - | - | - | - | - | - |
| PR description preview | Y | Y | - | - | Y | - | - | Y | Y |
| Diff stats (+/- lines) | Y | Y | Y | - | - | - | - | Y | Y |
| Pending reviewers badge | Y | - | - | - | - | - | - | - | - |
| Stacked PRs | - | - | - | - | - | - | - | Y | - |
| In-app code review | - | - | - | - | $ | - | - | Y | Y |
| Merge queue | - | - | - | - | - | - | - | Y | - |
| AI code review | - | - | - | - | - | - | - | Y | - |
| **CI & Status** | | | | | | | | | |
| CI status badges | Y | Y | Y | Y | - | Y | - | Y | - |
| Unresolved comment count | Y | - | - | - | - | - | - | - | Y |
| Deployment status | Y | - | - | - | - | - | - | - | - |
| Review state tracking | Y | Y | Y | Y | - | - | - | Y | Y |
| Who broke the build | Y | - | - | - | - | Y | - | - | - |
| **Notifications** | | | | | | | | | |
| Desktop notifications | Y | - | Y | - | $ | Y | Y | Y | - |
| Sound alerts | Y | - | - | - | - | - | - | - | - |
| Badge count (extension) | Y | - | Y | - | - | - | Y | - | - |
| Slack integration | - | Y | - | - | - | - | - | Y | Y |
| Email digest | - | - | - | - | - | - | - | Y | - |
| **Integrations** | | | | | | | | | |
| Jira / issue tracker | - | Y | - | - | - | - | - | Y | Y |
| Open in IDE | - | Y | - | - | - | - | - | Y | Y |
| Team/org management | - | Y | Y | - | - | Y | - | Y | Y |
| **Privacy & Architecture** | | | | | | | | | |
| No backend required | Y | - | Y | Y | - | - | Y | - | - |
| PAT-only (no OAuth) | Y | - | - | - | - | - | - | - | - |
| Data stays local | Y | - | Y | Y | - | - | Y | - | - |

`Y` = supported, `-` = not supported, `$` = paid feature

## Scorecard

| Tool | Features | Notable Gaps |
|---|---|---|
| **PR Radar** | 28 | Self-hosted, Azure DevOps, Slack, IDE, Jira |
| **GitKraken** | 20 | Paid, no merge, no unresolved counts, no deployment status |
| **Graphite** | 18 | GitHub-only, paid, no extension popup |
| **CodeStream** | 14 | No popup, no notifications, no badge count |
| **PR Monitor** | 10 | GitHub-only |
| **Gitify** | 9 | GitHub-only, notifications only |
| **CatLight** | 8 | Paid, no Bitbucket |
| **Pullwalla** | 6 | No GitLab, key features are paid |
| **PR Hub** | 5 | GitHub-only, minimal features |

## PR Radar's Unique Positioning

PR Radar is the only tool that combines all of these in a **free, open-source Chrome extension**:

1. **All 3 major platforms** (GitHub + GitLab + Bitbucket)
2. **Unresolved comment counts** via GitHub GraphQL
3. **Deployment status** tracking
4. **Sound alerts**
5. **Urgency triage chips**
6. **Merge from popup** across all platforms
7. **Zero backend / PAT-only** — data stays local
8. **Pending reviewers** badge
9. **Who broke the build** in CI failure tooltip

## Planned Features

Tracked as GitHub issues:

- [#1](https://github.com/deployhq/pr-radar/issues/1) — Self-hosted instance support (GHE, GitLab self-managed, Bitbucket Server)
- [#2](https://github.com/deployhq/pr-radar/issues/2) — Slack integration for PR notifications
- [#3](https://github.com/deployhq/pr-radar/issues/3) — Azure DevOps support
- [#4](https://github.com/deployhq/pr-radar/issues/4) — Open in IDE (VS Code / JetBrains)
- [#5](https://github.com/deployhq/pr-radar/issues/5) — Jira / issue tracker link detection
