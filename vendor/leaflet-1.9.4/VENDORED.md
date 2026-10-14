# Leaflet 1.9.4 (vendored)

- Source: npm package `leaflet@1.9.4` (https://registry.npmjs.org/leaflet/-/leaflet-1.9.4.tgz), npm integrity (sha512) verified
- Tarball SHA-256: `84c65a256e50657896f54c33bd857b6849ebe94c817803be818bf32a3dde0b77`
- Contents, copied unmodified from the package: `dist/leaflet-src.esm.js`, `dist/leaflet.css`, `dist/images/*`, `package.json`, `LICENSE`
- License: BSD-2-Clause (see LICENSE)
- Vendored: 2026-10-13 (I-075, approved in D-011)

Do not edit these files. To upgrade, add a new `vendor/leaflet-<version>/` folder,
switch the paths in `shared/embeds/map.js`, remove the old folder, and log it in CHANGELOG.md.

Slipr uses: `dist/leaflet-src.esm.js` (an ES module without imports of its own,
lazy-loaded when a show has a map) and `dist/leaflet.css` (added to the page with it).
The images are only referenced by `leaflet.css` (Slipr draws its own marker pins);
they are kept so the stylesheet is complete. The source map named on the module's
last line is not vendored.
