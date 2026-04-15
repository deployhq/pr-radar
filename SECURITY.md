# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in PR Radar, please report it responsibly.

**Email:** security@deployhq.com

Please include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge your report within 48 hours and aim to release a fix promptly.

## Scope

PR Radar is a client-side Chrome extension. The main security-sensitive areas are:

- **Token storage** — Personal access tokens are stored in `chrome.storage.local`
- **API communication** — All requests go directly to provider APIs over HTTPS
- **Extension permissions** — Manifest V3 permissions should be minimal

## Out of scope

- Vulnerabilities in GitHub's API or Chrome itself
- Social engineering attacks
- Issues requiring physical access to the user's machine
