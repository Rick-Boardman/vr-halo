# Public release audit — 0.2.0

Reviewed 2026-11-04 for the initial Apache-2.0 public release.

## Scope

The candidate includes source code and comments, documentation, examples, tests,
package manifests and lockfile, release scripts, license notices, and owner-supplied
hero artwork. Git history and local configuration are excluded from the new
public repository. Builds, screenshots, credentials, node_modules, and local
configuration are excluded from source control.

## Findings and disposition

- Replaced restrictive original licensing with the complete Apache 2.0 text.
- Identified Richard Boardman in NOTICE; preserved separate upstream terms.
- Reviewed dependencies and bundled assets; see [THIRD_PARTY.md](../THIRD_PARTY.md).
- Identified five bundled Inter/Noto font binaries from their name tables and retained upstream OFL 1.1 texts, copyrights, and resolver-data MIT terms. No fonts were modified.
- Removed private-workspace setup, obsolete private-repository statements, and
  deployment-only registry details from the public contributor path.
- Replaced the marketing folder with public documentation and preserved the hero
  image. PNG inspection found no embedded metadata fields.
- Checked candidate text for known credential patterns, private network addresses,
  machine-specific paths, obsolete license claims, and broken local documentation
  links. No unresolved findings remain in those checks.
- No private customer datasets or customer credentials are included. Examples use
  synthetic graph or chat records. Public project names and public URLs are
  documentation references, not credentials.
- Added contributor and AI-agent guidance, private security reporting instructions,
  package allowlists, and local-configuration exclusions.

## Validation

An isolated source snapshot passed `npm ci`, `npm run build`,
`npm run test:browser`, and `npm run audit:release`. The full dependency scan
reported zero known vulnerabilities. The actual 0.2.0 tarball installed in a
separate consumer; package exports, utility behavior, and font licenses passed.
Package inspection found no Git metadata, local configuration, dependency tree,
or build-output directories. Browser checks exercised real Chromium/WebGL,
font loading, chat send/redraw, and panel close/reopen. Six existing applications
also passed the hosting project's local consumer gate with Halo and Lattice.

## Limits

Static scanning and source review cannot prove the absence of every secret or
vulnerability. npm metadata and upstream notices establish dependency provenance;
they do not establish authorship of every upstream line. The project owner has
authorized licensing the original project material under Apache-2.0. Third-party
material retains its stated terms. No physical headset test was performed for
this release; immersive behavior still requires device validation.

A source release does not automatically update an independently hosted copy.
