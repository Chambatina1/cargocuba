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
  title: "Chambita — Tu plataforma de servicios móviles en Cuba",
  description: "Encuentra servicios móviles en Cuba: transporte de pasajeros, carga, comida, barbería, mecánica y limpieza. Conecta con proveedores cercanos.",
  keywords: ["Cuba", "servicios móviles", "transporte", "pasaje", "carga", "comida", "barbería", "mecánica", "limpieza"],
  authors: [{ name: "Chambita" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Chambita — Servicios Móviles en Cuba",
    description: "Tu plataforma de servicios móviles en Cuba",
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
