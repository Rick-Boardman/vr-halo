# Third-party components

The project's original code and documentation use Apache-2.0. Third-party
components retain their own licenses; the root LICENSE does not relicense them.

| Component | Locked version | License | Distribution |
| --- | --- | --- | --- |
| Three.js | 0.185.1 | MIT | Installed dependency; provided by the application |
| troika-three-text | 0.52.4 | MIT | Installed dependency |
| troika-three-utils | 0.52.4 | MIT | Transitive dependency |
| troika-worker-utils | 0.52.0 | MIT | Transitive dependency |
| webgl-sdf-generator | 1.1.1 | MIT | Transitive dependency |
| bidi-js | 1.0.3 | MIT | Transitive dependency |
| require-from-string | 2.0.2 | MIT | Transitive dependency |

Exact dependency provenance and integrity are recorded in package-lock.json.
Dependency license texts remain in the installed packages. Applications that
bundle dependencies must preserve their applicable copyright and license notices.
Browser-test tooling is a development dependency and is excluded from the
library tarball.

## Bundled fonts and resolver data

Fonts are shipped byte for byte from the existing upstream-derived assets;
the release does not alter their names or outlines. The embedded font metadata
identifies the following copyright holders:

| Asset | Copyright / upstream | License |
| --- | --- | --- |
| Inter Regular 4.001 | Copyright 2016 The Inter Project Authors, https://github.com/rsms/inter | OFL-1.1 |
| Noto Sans 2.007 | Copyright 2015-2021 Google LLC | OFL-1.1 |
| Noto Sans JP 2.004-H2 | Copyright 2014-2021 Adobe; Reserved Font Name Source | OFL-1.1 |
| Noto Sans Math 2.001 | Copyright 2018 Google LLC | OFL-1.1 |
| Noto Sans Symbols 2 2.005 | Copyright 2022 The Noto Project Authors, https://github.com/notofonts/symbols | OFL-1.1 |
| unicode-font-resolver metadata and codepoint indexes | Jason Johnston, https://github.com/lojjic/unicode-font-resolver | MIT |

Full upstream notices accompany the assets in [src/assets/LICENSES](src/assets/LICENSES/).
The font licenses permit redistribution with software subject to their terms;
they do not become Apache-licensed. Preserve all notices when copying assets.

## Documentation artwork

The hero illustration in docs/assets was supplied by the project owner and is
included as project documentation under Apache-2.0. It is illustrative artwork,
not a promise of a particular application, hardware capability, or bundled asset.
