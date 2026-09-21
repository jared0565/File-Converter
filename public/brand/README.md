# File Converter brand assets

The conversion emblem combines two opposing folded-arrow shapes, suggesting documents moving between formats. Forest green and sage inherit the application palette. The Inter SemiBold wordmark is converted to vector outlines so it displays consistently without external fonts.

- `logo-light.svg` / `logo-dark.svg`: primary horizontal logos for light/dark backgrounds.
- `logo-light.png` / `logo-dark.png`: transparent 4× raster exports (1348 × 256).
- `mark.svg`: standalone emblem, suitable for avatars and compact placements.
- `icon-192.png` / `icon-512.png`: application icon exports.
- Root assets: SVG favicon, multi-resolution ICO, 16/32/48px PNG favicons, and 180px Apple touch icon.

Leave clear space around the mark of at least one-quarter its height. Do not stretch, add effects, or invert colors. Use the dark wordmark on dark backgrounds; its lighter emblem and text preserve contrast. At small sizes, use the emblem alone.

Rebuild the final vector assets and raster exports with `node scripts/build-brand.mjs` using the pinned fontkit and Playwright dependencies and installed Chrome. The script authors the SVG geometry and outlines text, then renders those SVGs for PNG/ICO exports. `FONT-LICENSE.txt` accompanies the Inter-derived lettering.

Provenance: an AI-generated draft informed the two-document conversion direction; the production emblem uses authored vector geometry and outlined font glyphs. Production PNGs are browser renderings of those SVG assets. No generated raster image is shipped as the production logo.
