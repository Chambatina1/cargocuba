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
  title: "Chambita — Tu plataforma de servicios móviles",
  description: "Encuentra servicios móviles cerca de ti: transporte de pasajeros, carga, comida, barbería, mecánica y limpieza. Conecta con proveedores en tu zona.",
  keywords: ["servicios móviles", "transporte", "pasaje", "carga", "comida", "barbería", "mecánica", "limpieza", "mapa", "geolocalización"],
  authors: [{ name: "Chambita" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Chambita — Servicios Móviles",
    description: "Tu plataforma de servicios móviles con geolocalización en tiempo real",
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
