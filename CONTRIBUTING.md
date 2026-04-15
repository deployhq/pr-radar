# Contributing to PR Radar

Thanks for your interest in contributing! PR Radar is a free Chrome extension by DeployHQ, and we welcome contributions from the community.

## Development setup

```bash
git clone https://github.com/deployhq/pr-radar.git
cd pr-radar
npm install
npm run dev          # Build in watch mode
```

Load the extension locally:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Scripts

```bash
npm run dev          # Build in watch mode (development)
npm run build        # Production build (typecheck + vite build)
npm run typecheck    # TypeScript check only
npm run lint         # ESLint
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```

## Submitting changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure `npm run build`, `npm run lint`, and `npm test` all pass
4. Write tests for new logic where possible
5. Open a pull request with a clear description of what and why

## Code style

- TypeScript strict mode is enabled
- Follow existing patterns in the codebase
- Keep the extension lightweight — no heavy dependencies

## Reporting bugs

Open an issue with:

- Steps to reproduce
- Expected vs actual behavior
- Browser version and OS

## Feature requests

Open an issue describing the use case. We're focused on keeping PR Radar simple and fast, so not every feature will be accepted — but we'd love to hear your ideas.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
