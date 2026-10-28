# Contributing

This is an independent fork of [HoverTranslate](https://github.com/kozii-d/hover-translate). Please use [this fork's issues](https://github.com/prost0human/hover-translate-dual-subs/issues) for fork-specific behavior; don't send its users or bugs to the original maintainer. Preserve [LICENSE](LICENSE), existing attribution, existing data and the [code of conduct](CODE_OF_CONDUCT.md).

Use Node 24.12.0+ and npm 11.6.2+, install all three packages as in [README](README.md), then:

```bash
npm run lint
npm run typecheck
npm test
npm run setup:chrome && npm run build
npx playwright install chromium   # Linux CI may need --with-deps
npm run test:e2e
```

The Playwright suite uses a local mock YouTube DOM, mock translators and a full Chromium loading the extension, not a live YouTube account. Changes to captions, pause/resume or storage should include focused tests plus the relevant manual checklist in the README. Never commit dictionary exports, API keys, browser profiles, generated distributions or private videos. Add no host permissions, network destinations or dependencies without a clear reason and tests. UI strings go in both English and Russian; existing fallback applies elsewhere. Explain approximate alignment and any migration/identity changes honestly.

Before release, run CI, validate unpacked Chromium builds, perform the real YouTube and Anki checklist, audit third-party notices and provider privacy implications, and review the fork's store identity/listing. Firefox and the inherited upstream site are not release-ready for this fork.
