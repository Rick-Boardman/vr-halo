# Contributing to Halo

Developers and AI coding agents are welcome. Start with [README.md](README.md)
and [AGENTS.md](AGENTS.md). Contributions intentionally submitted for inclusion
are licensed under Apache-2.0, as described by section 5 of [LICENSE](LICENSE).
Only submit work you have the right to contribute; preserve third-party notices.

## Pull requests

Fork the repository and create a focused branch in your fork. For substantial API
or behavior changes, open an issue first. Explain the problem, public API impact,
implementation, tests run, and any remaining device-validation limits. Include
reproduction steps for fixes. Keep unrelated formatting and dependency upgrades
out of the change. Update affected documentation and examples in the same PR.

## Coding standards

Use browser-native ES modules and the existing JavaScript style. Prefer small,
domain-focused functions with explicit inputs and cleanup. Keep application
business rules, endpoints, authentication, credentials, and persistence in the
consuming application. Reuse shared primitives rather than duplicating them.
Do not change HUD/input/navigation behavior without explaining the effect on
desktop, touch, and immersive XR. Never commit credentials or private data.

## Testing

Use Node.js 24 and npm 11. Run `npm ci`, `npm run build`,
`npm run test:browser`, and `npm run audit:release`. Install the browser once
with `npx playwright install chromium`. Test the affected behavior in the
included example. Changes to immersive input also need physical-device checks;
report explicitly when a headset check has not been performed. Inspect
`npm pack --dry-run` before changing package contents. Before a release tag, run
`npm run gate`: it loads every consumer beside this checkout with this working copy
in place of its pinned Halo and reports which would break when they move their pin.

## AI-assisted contributions

AI-generated and AI-assisted code, documentation, tests, and examples are welcome
under the same review standards. Briefly disclose material AI assistance in the
PR and describe your own verification. You remain responsible for correctness,
security, originality, licensing, and understanding every submitted change.
Do not send secrets, customer information, or other confidential material to a
model. Do not copy code of uncertain origin or introduce unexplained dependencies.
AI claims of test success are not evidence: run the checks and report results.
