#!/usr/bin/env node
/**
 * Convert assets/logo-mark.svg into the icon files electron-builder needs:
 *   apps/desktop/build/icon.png   (512×512, used by linux & fallback)
 *   apps/desktop/build/icon.ico   (multi-size, win)
 *
 * Run:  node scripts/build-icons.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico").default;

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "assets", "logo-mark.svg");
const OUT_DIR = path.join(ROOT, "apps", "desktop", "build");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`source missing: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const svg = fs.readFileSync(SRC);

  // 512×512 master PNG (electron-builder will pick this as default; linux uses it directly)
  const png512 = await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, "icon.png"), png512);
  console.log(`wrote ${path.join(OUT_DIR, "icon.png")} (${png512.length} bytes)`);

  // 1024 master also for macOS retina (electron-builder makes the .icns from a single big PNG)
  const png1024 = await sharp(svg, { density: 768 }).resize(1024, 1024).png().toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, "icon@1024.png"), png1024);

  // Multi-size .ico for Windows
  const sizedPngs = await Promise.all(
    ICO_SIZES.map((s) =>
      sharp(svg, { density: Math.max(96, s * 6) }).resize(s, s).png().toBuffer(),
    ),
  );
  const ico = await pngToIco(sizedPngs);
  fs.writeFileSync(path.join(OUT_DIR, "icon.ico"), ico);
  console.log(
    `wrote ${path.join(OUT_DIR, "icon.ico")} (${ico.length} bytes, sizes: ${ICO_SIZES.join("/")})`,
  );

  // Also drop the 256 PNG to assets/ so README can reference it without rendering SVG twice
  const png256 = await sharp(svg, { density: 192 }).resize(256, 256).png().toBuffer();
  fs.writeFileSync(path.join(ROOT, "assets", "logo-mark-256.png"), png256);
  console.log("wrote assets/logo-mark-256.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
