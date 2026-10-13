import type { Metadata } from "next";
import "./globals.css";
import {
  sora,
  plusJakartaSans,
  barlowCondensed,
  ibmPlexMono,
} from "@/web/fonts";

export const metadata: Metadata = {
  title: "Takefield Studio — editor momen lucu gameplay",
  description:
    "Pilih momen dari video gameplay 3–5 menit, tinjau subtitle dan saran AI, lalu render MP4 9:16 secara lokal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${sora.variable} ${plusJakartaSans.variable} ${barlowCondensed.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
