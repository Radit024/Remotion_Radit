import localFont from "next/font/local";

export const barlow = localFont({
  src: [
    { path: "../../public/fonts/barlow-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/barlow-500.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/barlow-600.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/barlow-700.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/barlow-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-barlow",
  display: "swap",
  preload: true,
});

export const barlowCondensed = localFont({
  src: [
    { path: "../../public/fonts/barlow-condensed-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
  preload: false,
});

export const ibmPlexMono = localFont({
  src: [
    { path: "../../public/fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-ibm-plex-mono",
  display: "swap",
  preload: true,
});
