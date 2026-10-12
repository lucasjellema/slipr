# PDF.js 4.10.38 (vendored)

- Source: npm package `pdfjs-dist@4.10.38` (https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-4.10.38.tgz), npm integrity (sha512) verified
- Tarball SHA-256: `1011b38553532d7078c59f26b15a471f8dae00f101b60e2add9b8511737a1ce0`
- Contents, copied unmodified from the package: `build/pdf.min.mjs`, `build/pdf.worker.min.mjs`, `cmaps/` (CJK and other character maps), `standard_fonts/` (the 14 standard PDF fonts), `package.json`, `LICENSE`
- License: Apache-2.0 (see LICENSE)
- Vendored: 2026-10-12 (I-072, approved in D-011)

Do not edit these files. To upgrade, add a new `vendor/pdfjs-<version>/` folder,
switch the paths in `shared/embeds/pdf.js`, remove the old folder, and log it in CHANGELOG.md.

Slipr uses: `build/pdf.min.mjs` (lazy-loaded when a PDF is present), its worker, and the
`cmaps/` and `standard_fonts/` folders (passed as `cMapUrl` / `standardFontDataUrl`, so
PDFs without embedded fonts render offline).
