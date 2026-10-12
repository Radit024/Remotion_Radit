import fs from "node:fs";
import path from "node:path";

const fonts = [
  "public/fonts/barlow-400.woff2",
  "public/fonts/barlow-500.woff2",
  "public/fonts/barlow-600.woff2",
  "public/fonts/barlow-700.woff2",
  "public/fonts/barlow-800.woff2",
  "public/fonts/barlow-condensed-800.woff2",
  "public/fonts/ibm-plex-mono-400.woff2",
  "public/fonts/ibm-plex-mono-500.woff2",
];

let allOk = true;
for (const f of fonts) {
  const p = path.join(process.cwd(), f);
  if (!fs.existsSync(p)) {
    console.error(`[verify:assets] File font hilang: ${f}`);
    allOk = false;
  }
}

if (!allOk) {
  process.exit(1);
}

console.log("[verify:assets] Semua berkas font lokal lengkap dan valid.");
