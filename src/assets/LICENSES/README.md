# Bundled asset provenance

Verified 2026-11-04. Inter Regular is a byte match to
https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.8/files/inter-latin-400-normal.woff.
The four Noto WOFF binaries match their corresponding paths under
https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data/.
No font names or outlines were modified.

Changed 2026-11-08: inter-latin-400-normal.woff and unicode-fonts/font-files/latin/sans-serif.normal.400.woff had their
GSUB chaining-context lookups of formats 1 and 2 removed (three subtables in Inter, two in the Latin fallback): Troika's
font parser cannot read them, ignored them, and printed "unsupported GSUB table LookupType 6" for each in every page's
console. Troika draws the same text. So those two files no longer match the upstream bytes above; names, outlines,
kerning and every other lookup are unchanged. Neither font has a Reserved Font Name.

The shipped jp-83 and symbols-2 font metadata and plane0/2500-25ff codepoint
index are adapted subsets of that dataset; other shipped metadata matches it.
The dataset's MIT license is preserved in unicode-font-resolver-MIT.txt.

Fonts retain SIL OFL 1.1. Original embedded copyright statements are preserved
in the binaries and documented in the root THIRD_PARTY.md. Full upstream texts
are included here and must accompany redistributed assets. Fonts and resolver
data are not relicensed by the root Apache-2.0 license.
