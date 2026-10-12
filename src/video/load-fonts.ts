import { continueRender, delayRender } from "remotion";

export type FontSpec = {
  family: string;
  url: string;
  weight: number;
  style?: string;
};

const FONTS: FontSpec[] = [
  { family: "Barlow", url: "/fonts/barlow-400.woff2", weight: 400 },
  { family: "Barlow", url: "/fonts/barlow-500.woff2", weight: 500 },
  { family: "Barlow", url: "/fonts/barlow-600.woff2", weight: 600 },
  { family: "Barlow", url: "/fonts/barlow-700.woff2", weight: 700 },
  { family: "Barlow", url: "/fonts/barlow-800.woff2", weight: 800 },
  { family: "Barlow Condensed", url: "/fonts/barlow-condensed-800.woff2", weight: 800 },
  { family: "IBM Plex Mono", url: "/fonts/ibm-plex-mono-400.woff2", weight: 400 },
  { family: "IBM Plex Mono", url: "/fonts/ibm-plex-mono-500.woff2", weight: 500 },
];

let loaded = false;
let promise: Promise<void> | null = null;

function resolveUrl(url: string): string {
  if (/^https?:|^file:/.test(url)) return url;
  if (typeof window !== "undefined") return url;
  return `file://${process.cwd()}/public${url}`;
}

export function loadFonts(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (promise) return promise;
  const handle = delayRender("Memuat font lokal");
  promise = (async () => {
    if (typeof document === "undefined" || typeof FontFace === "undefined") {
      continueRender(handle);
      loaded = true;
      return;
    }
    const faces = FONTS.map((font) => {
      const face = new FontFace(font.family, `url(${resolveUrl(font.url)})`, {
        weight: String(font.weight),
        style: font.style ?? "normal",
      });
      return face;
    });
    try {
      await Promise.all(
        faces.map(async (face) => {
          await face.load();
          document.fonts.add(face);
        }),
      );
    } finally {
      loaded = true;
      continueRender(handle);
    }
  })();
  return promise;
}