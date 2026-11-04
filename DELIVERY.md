# Delivering Halo

Halo is Apache-2.0 software distributed as browser-native ES modules. The package
ships source, bundled fonts and notices, documentation, and examples. Third-party
fonts/data retain the terms in [THIRD_PARTY.md](THIRD_PARTY.md).

Run `npm run build`, `npm run test:browser`, `npm run audit:release`, then
`npm run pack:deliverable`. The delivery contains a versioned tarball and a
manifest with SHA-256, exports, files, and peer requirements under `dist/`.
Check the actual contents with `npm pack --dry-run`.

Downloads are attached to GitHub Releases. The package remains `private: true`
to prevent accidental npm-registry publication; this does not restrict the
Apache license or public GitHub downloads. A future registry release is a
separate distribution decision.

Install as described in [docs/quick-start.md](docs/quick-start.md). The application
provides Three.js 0.160.1 and Troika; use a single Three.js instance. Preserve
LICENSE, NOTICE, and bundled-asset licenses when redistributing a delivery.
