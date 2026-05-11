# Self-hosted instance support

Tracks GitHub issue #1: "Support self-hosted instances (GitHub Enterprise, GitLab self-managed, Bitbucket Server)".

## Goal

Allow users to connect accounts on self-hosted GitHub Enterprise, GitLab self-managed, and Bitbucket Data Center deployments — without bloating the UI for the 95% of users who stay on the public services.

## Scope

**In:**
- GitLab self-managed (any version GitLab supports).
- GitHub Enterprise Server (any actively-supported GHES version).
- Bitbucket Data Center (Server is EOL February 2024, DC only).

**Out:**
- GitHub Enterprise *Cloud* — it's just GitHub.com with extra features; uses the same API hostnames. No change needed.
- Per-instance feature gating (e.g., older GHES lacks some GraphQL fields). Detect at runtime and fall back where reasonable.

## Platform asymmetry (important)

The three platforms are **not** equivalent work:

| Platform | API delta vs. cloud | Effort |
|---|---|---|
| GitLab self-managed | URL only — identical API surface | ~1 day |
| GitHub Enterprise Server | URL + REST path (`/api/v3`) + GraphQL endpoint; some GraphQL fields missing on older versions, need REST fallback | ~2–3 days |
| Bitbucket Data Center | **Different API entirely** (`/rest/api/1.0/...`), different auth (HTTP access tokens), different data shapes, different build-status API | ~5–10 days (effectively a new platform) |

Recommendation: ship GitLab → GitHub Enterprise → Bitbucket DC as separate phases.  Reassess Bitbucket DC after the first two ship — if no real demand, defer indefinitely.

## Data model

Single optional field added to the `Account` shape:

```ts
interface Account {
  id: string;
  platform: 'github' | 'gitlab' | 'bitbucket';
  // ... existing fields
  instanceUrl?: string;  // new — absent ⇒ canonical default
}
```

Canonical defaults (used when `instanceUrl` is absent):
- `github` → `https://api.github.com`
- `gitlab` → `https://gitlab.com`
- `bitbucket` → `https://api.bitbucket.org`

No migration required — existing accounts simply lack the field.

## UI changes (minimal)

One toggle, one input, one subtitle line.

**Setup page:**
- Above the token input, add a checkbox: **"Self-hosted instance?"**.
- When toggled on, reveal one input: **"Instance URL"** with platform-specific placeholder (`https://gitlab.example.com` / `https://github.example.com` / `https://bitbucket.example.com`).
- The token-link helper (pre-filled scopes URL) must point at the user's instance URL, not the canonical one.
- Token validation call (e.g. `/user`) goes against the user's instance URL.

**Settings → Accounts list:**
- Show the instance URL as a small subtitle line only when it differs from the canonical default. Otherwise no change.

**Repos / Dashboard / popup / notifications:**
- No visual changes. URLs in PR titles, "open PR" actions, and badges all derive from the per-account instance URL.

That's it. No new tabs, no platform-picker, no extra pages.

## API client changes

The pattern is identical across all three: take `instanceUrl` as a parameter, derive the base URL from it, fall back to the canonical default if absent.

**`api/gitlab.ts`** (Phase 1 — easy):
- Replace hardcoded `https://gitlab.com/api/v4` with `${instanceUrl ?? 'https://gitlab.com'}/api/v4`.
- Everything else identical. Auth, scopes, endpoints, data shapes all match.

**`api/github.ts`** (Phase 2 — medium):
- REST: replace `https://api.github.com` with:
  - Cloud: `https://api.github.com`
  - GHES: `${instanceUrl}/api/v3` (note: instance URL excludes `/api/v3`)
- GraphQL: replace `https://api.github.com/graphql` with:
  - Cloud: `https://api.github.com/graphql`
  - GHES: `${instanceUrl}/api/graphql`
- Add a feature-detection or version-aware fallback for the `reviewThreads.isResolved` GraphQL field in case it's unavailable on older GHES. Fallback path: REST `/pulls/{n}/comments` with manual resolution-state inference (less accurate; flag in tooltip).

**`api/bitbucket.ts`** (Phase 3 — heavy, defer):
- Bitbucket DC has a separate REST API at `/rest/api/1.0/...` with different paths and shapes. Effectively a new client file (`api/bitbucket-dc.ts`) sharing only the `Account` type and result shapes.
- Auth: HTTP access tokens via `Authorization: Bearer <token>` (not Atlassian Cloud's `email:token` Basic).
- Pull request endpoints: `/projects/{projectKey}/repos/{slug}/pull-requests`.
- Build status: separate API at `/rest/build-status/1.0/commits/{sha}`.
- Reviewers, comments, merge: all different endpoints from Cloud.
- Decision routed at the API client entry point based on `account.instanceUrl` presence.

## Cross-cutting concerns

1. **DeployHQ repo matching**: the integration matches PR `repoFullName` against DeployHQ project repository URLs. Self-hosted instances will have different host portions in those URLs — confirm matching still works (it should, since matching is on full URL, but verify with a test case).
2. **Notification click-through**: notifications open the PR URL. Already host-aware (uses the PR's own URL field), but verify after refactor.
3. **Repo discovery**: `/user/repos`, `/projects?membership=true`, `/repositories/{workspace}` calls all need the instance URL. Don't miss any.
4. **Account identity uniqueness**: `accountId` must include instance host so two GitHub accounts on different instances don't collide. Suggest format `github:{instanceHost}:{username}`.
5. **URL normalization**: trim trailing slashes, reject non-HTTPS in the input field unless the user explicitly opts into HTTP for local dev.
6. **CSP / host_permissions**: `manifest.json` currently grants permission for canonical hosts only. Self-hosted requires `<all_urls>` or per-instance `optional_host_permissions` requested at connect time. Latter is more privacy-respectful; do that.

## Tasks (ordered, each verifiable)

### Phase 1 — GitLab self-managed (~1 day)

1. **Account model**: add optional `instanceUrl` field; helper `accountBaseUrl(account)` returning canonical fallback. Verify with unit tests.
2. **Setup UI toggle**: checkbox + URL input + placeholder; only shown when toggled. Verify: form state correctly stores `instanceUrl` only when toggled.
3. **API client refactor** in `api/gitlab.ts`: parameterize base URL. Replace all hardcoded `gitlab.com` references. Verify: existing gitlab.com flow unaffected (regression test).
4. **Connect-time host permission request**: when `instanceUrl` is set, call `chrome.permissions.request({ origins: [`${url}/*`] })`. Block save until granted. Verify: connecting a self-hosted account triggers the permission prompt; canonical accounts don't.
5. **Token-link helper**: pre-filled scopes URL uses instance URL. Verify visually.
6. **Account list subtitle**: show instance URL when it differs from default. Verify.
7. **End-to-end manual test**: connect to a real self-managed GitLab instance (DeployHQ likely has internal access; otherwise spin up GitLab Docker). Confirm PR list, CI, discussions, deployments, merge all work.

### Phase 2 — GitHub Enterprise Server (~2–3 days)

8. **API client refactor** in `api/github.ts`: parameterize REST base (`/api/v3` for GHES, `/api/v3`-less for Cloud) and GraphQL endpoint. Verify: cloud flow unaffected.
9. **GraphQL field fallback**: detect missing `reviewThreads.isResolved` on older GHES (introspection or 422 response handling) and fall back to REST comments path. Surface "approximate count" in the tooltip when fallback is active.
10. **Setup UI**: same toggle reused; placeholder swapped per platform.
11. **Connect-time permission request**: same pattern as Phase 1.
12. **Manual test**: against a real GHES instance (find via DeployHQ, GHES trial, or community contact from Reddit/issue thread).

### Phase 3 — Bitbucket Data Center (~5–10 days, defer)

13. **Spike** (1 day): set up a Bitbucket DC trial, document API differences, identify minimum viable feature set (PR list, build status, comments, reviewers, merge).
14. **New client file** `api/bitbucket-dc.ts`: implement minimum viable feature set against `/rest/api/1.0/...`.
15. **Routing layer**: at the platform client entry point, choose between Cloud and DC clients based on `instanceUrl` presence.
16. **Setup UI**: same toggle reused; placeholder swapped.
17. **Auth**: HTTP access token bearer flow (different from Cloud's Basic).
18. **Manual test**: against the spike instance.
19. **Decision gate before starting Phase 3**: confirm there's measurable demand (issue thumbs-ups, support requests). If none, indefinitely defer and close the issue with a "low demand, can reopen" note.

## Verification

- Unit: `accountBaseUrl()` returns canonical defaults when absent, instance URLs when present.
- Integration (per phase): end-to-end against a real self-hosted instance for that platform.
- Regression: existing canonical-host users see no behavior change; manifest permission changes don't break re-loads.
- UI: form is invisible to canonical users (toggle defaults off).

## Risks / open questions

1. **Permission prompt UX**: Chrome's `permissions.request()` must be called from a user gesture. The "Save account" click counts. Confirm flow doesn't break in popup context.
2. **Older GHES versions**: not all GraphQL fields exist. Fallback path to REST works but is less accurate. Acceptable; document in tooltip.
3. **Bitbucket DC effort vs. demand**: 5–10 days is significant. Worth gating on real signal.
4. **Test access**: GHES and Bitbucket DC are gated trials. Coordinate with DeployHQ infra or via community testers (e.g., the Reddit commenter from the gitlab post).
5. **Manifest changes**: moving from named hosts to `optional_host_permissions` may require store re-review. Verify with Chrome Web Store before submitting.

## Effort summary

| Phase | Effort | Ship-ready? |
|---|---|---|
| 1 — GitLab self-managed | ~1 day | Yes, can ship standalone |
| 2 — GitHub Enterprise | ~2–3 days | Yes, can ship standalone |
| 3 — Bitbucket DC | ~5–10 days | Defer, gate on demand |

Phase 1 alone is a strong reply to the open issue and the Reddit comment. Phase 2 is a natural follow-up once the toggle scaffolding exists. Phase 3 only if demand materializes.

## Origin

GitHub issue #1, opened 2 weeks ago. Re-prompted on r/webdev Showoff Saturday post (2026-05-02) by `ModernOldschool`.
