import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flota de Autos — Flota de autos en tiempo real",
  description:
    "Encuentra conductores en Florida y el Caribe. Flota de autos con geolocalización en tiempo real. Transporte, carga, servicios móviles.",
  keywords: [
    "flota de autos",
    "conductores",
    "Florida",
    "Caribe",
    "transporte",
    "geolocalización",
    "tiempo real",
    "mapa",
  ],
  authors: [{ name: "Flota de Autos" }],
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  openGraph: {
    title: "Flota de Autos — Conductores en tiempo real",
    description:
      "Tu plataforma de flota de autos con geolocalización en tiempo real en Florida y el Caribe",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
