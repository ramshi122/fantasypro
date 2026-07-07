import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apna Cricket — AI Fantasy Team Generator",
  description: "Generate high-quality fantasy teams, transfer to Dream11/My11Circle, and win more. Apna Cricket — your fantasy sports companion.",
  keywords: ["Apna Cricket", "fantasy cricket", "fantasy football", "Dream11", "My11Circle", "team generator", "fantasy sports"],
  authors: [{ name: "Apna Cricket" }],
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png", sizes: "64x64" },
      { url: "/logo-square.png", type: "image/png", sizes: "256x256" },
    ],
    apple: "/logo-square.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Apna Cricket — AI Fantasy Team Generator",
    description: "Generate high-quality fantasy teams, transfer to Dream11/My11Circle, and win more.",
    siteName: "Apna Cricket",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Apna Cricket",
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <ServiceWorkerRegister />
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
