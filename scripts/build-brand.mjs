import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { chromium } from "@playwright/test";

await mkdir("public/brand", { recursive: true });
const font = fontkit.create(
  new Uint8Array(
    await readFile(
      "node_modules/@fontsource/inter/files/inter-latin-600-normal.woff",
    ),
  ),
);
const run = font.layout("File Converter");
const scale = 38 / font.unitsPerEm;
let cursor = 0;
const letters = run.glyphs
  .map((glyph, index) => {
    const position = run.positions[index];
    const path = `<path transform="translate(${(cursor + position.xOffset).toFixed(2)} ${position.yOffset})" d="${glyph.path.toSVG()}"/>`;
    cursor += position.xAdvance - 22;
    return path;
  })
  .join("");
const width = Math.ceil(82 + cursor * scale + 2);
const emblem = (background, primary, secondary) =>
  `<rect width="64" height="64" rx="14" fill="${background}"/><path d="M13 13H34L45 24L34 35V28H21V36H13Z" fill="${primary}"/><path d="M51 51H30L19 40L30 29V36H43V28H51Z" fill="${secondary}"/>`;
const svg = (width, height, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;
const mark = emblem("#174c3c", "#ffffff", "#9ed9b9");
await writeFile(
  "public/brand/mark.svg",
  svg(64, 64, mark, "File Converter symbol"),
);
await writeFile("public/favicon.svg", svg(64, 64, mark, "File Converter"));
for (const [variant, background, primary, secondary, ink] of [
  ["light", "#174c3c", "#ffffff", "#9ed9b9", "#174c3c"],
  ["dark", "#9ed9b9", "#174c3c", "#397155", "#e6eee8"],
]) {
  const content = svg(
    width,
    64,
    emblem(background, primary, secondary) +
      `<g fill="${ink}" transform="translate(82 45) scale(${scale} ${-scale})">${letters}</g>`,
    "File Converter",
  );
  await writeFile(`public/brand/logo-${variant}.svg`, content);
}
await copyFile(
  "node_modules/@fontsource/inter/LICENSE",
  "public/brand/FONT-LICENSE.txt",
);
// Raster exports are rendered from our authored vector assets, not resized AI imagery.
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  async function render(source, out, width, height) {
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<html><head><style>html,body{margin:0;background:transparent}img{display:block;width:100%;height:100%}</style></head><body><img src="data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}"></body></html>`,
    );
    await page.locator("img").evaluate((image) => image.decode());
    await page.screenshot({ path: out, omitBackground: true });
  }
  const icon = await readFile("public/brand/mark.svg", "utf8");
  for (const size of [16, 32, 48, 180, 192, 512])
    await render(
      icon,
      size === 180
        ? "public/apple-touch-icon.png"
        : size >= 192
          ? `public/brand/icon-${size}.png`
          : `public/favicon-${size}x${size}.png`,
      size,
      size,
    );
  for (const variant of ["light", "dark"])
    await render(
      await readFile(`public/brand/logo-${variant}.svg`, "utf8"),
      `public/brand/logo-${variant}.png`,
      width * 4,
      256,
    );
  // Standard ICO directory containing PNG images at three resolutions.
  const sizes = [16, 32, 48];
  const images = await Promise.all(
    sizes.map((size) => readFile(`public/favicon-${size}x${size}.png`)),
  );
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const start = 6 + i * 16;
    header[start] = size;
    header[start + 1] = size;
    header.writeUInt16LE(1, start + 4);
    header.writeUInt16LE(32, start + 6);
    header.writeUInt32LE(images[i].length, start + 8);
    header.writeUInt32LE(offset, start + 12);
    offset += images[i].length;
  });
  await writeFile("public/favicon.ico", Buffer.concat([header, ...images]));
} finally {
  await browser.close();
}
console.log(
  `Brand assets generated: ${width} × 64 SVG wordmarks, PNGs, favicon and touch icon.`,
);
