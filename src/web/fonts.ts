import { Sora, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";

export const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const barlowCondensed = Barlow_Condensed({
  weight: "800",
  subsets: ["latin"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});
