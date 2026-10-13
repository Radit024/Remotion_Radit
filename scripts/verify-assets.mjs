import fs from "node:fs";
import path from "node:path";

const fonts = [
  "node_modules/@fontsource/sora/files/sora-latin-400-normal.woff2",
  "node_modules/@fontsource/sora/files/sora-latin-500-normal.woff2",
  "node_modules/@fontsource/sora/files/sora-latin-600-normal.woff2",
  "node_modules/@fontsource/sora/files/sora-latin-700-normal.woff2",
  "node_modules/@fontsource/sora/files/sora-latin-800-normal.woff2",
  "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2",
  "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
  "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
];

let allOk = true;
for (const f of fonts) {
  const p = path.join(process.cwd(), f);
  if (!fs.existsSync(p)) {
    console.error(`[verify:assets] File font package hilang: ${f}`);
    allOk = false;
  }
}

if (!allOk) {
  process.exit(1);
}

console.log("[verify:assets] Semua berkas font @fontsource lengkap dan valid (tanpa file di public/).");
