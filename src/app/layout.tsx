import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FantasyPro — AI Fantasy Team Generator",
  description: "Generate high-quality fantasy teams, transfer to Dream11/My11Circle, and win more. Modern fantasy sports companion.",
  keywords: ["FantasyPro", "fantasy cricket", "fantasy football", "Dream11", "team generator", "fantasy sports"],
  authors: [{ name: "FantasyPro" }],
  icons: {
    icon: "/logo.svg",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "FantasyPro — AI Fantasy Team Generator",
    description: "Generate high-quality fantasy teams, transfer to Dream11/My11Circle, and win more.",
    siteName: "FantasyPro",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FantasyPro",
    description: "AI Fantasy Team Generator",
  },
};

export const viewport: Viewport = {
  themeColor: "#7C3AED",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
