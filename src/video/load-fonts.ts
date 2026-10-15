import { continueRender, delayRender } from "remotion";
import { CAPTION_FONT_FAMILY, REACTION_FONT_FAMILY, TIMECODE_FONT_FAMILY } from "../shared/typography";
import sora400 from "@fontsource/sora/files/sora-latin-400-normal.woff2";
import sora500 from "@fontsource/sora/files/sora-latin-500-normal.woff2";
import sora600 from "@fontsource/sora/files/sora-latin-600-normal.woff2";
import sora700 from "@fontsource/sora/files/sora-latin-700-normal.woff2";
import sora800 from "@fontsource/sora/files/sora-latin-800-normal.woff2";
import barlowCondensed800 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2";
import ibmPlexMono400 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2";
import ibmPlexMono500 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2";

export type FontSpec = {
  family: string;
  url: string;
  weight: number;
  style?: string;
};

const FONTS: FontSpec[] = [
  { family: CAPTION_FONT_FAMILY, url: sora400, weight: 400 },
  { family: CAPTION_FONT_FAMILY, url: sora500, weight: 500 },
  { family: CAPTION_FONT_FAMILY, url: sora600, weight: 600 },
  { family: CAPTION_FONT_FAMILY, url: sora700, weight: 700 },
  { family: CAPTION_FONT_FAMILY, url: sora800, weight: 800 },
  { family: REACTION_FONT_FAMILY, url: barlowCondensed800, weight: 800 },
  { family: TIMECODE_FONT_FAMILY, url: ibmPlexMono400, weight: 400 },
  { family: TIMECODE_FONT_FAMILY, url: ibmPlexMono500, weight: 500 },
];

let loaded = false;
let promise: Promise<void> | null = null;

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
      const face = new FontFace(font.family, `url(${font.url})`, {
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
      loaded = true;
    } catch (error) {
      promise = null;
      throw error;
    } finally {
      continueRender(handle);
    }
  })();
  return promise;
}