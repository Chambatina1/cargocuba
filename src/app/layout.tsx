import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Providers from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chambatina — Recogidas con Ruta Optimizada en Florida y Cuba",
  description:
    "Servicio de recogida de paquetes y encomiendas con ruta optimizada en tiempo real. Solicita tu recogida, sigue al chofer en el mapa y recibe tu paquete. Chambatina: logística confiable para la comunidad cubana en Florida.",
  keywords: [
    "recogida de paquetes Florida",
    "envios a Cuba",
    "Chambatina",
    "paqueteria Cuba",
    "logistica Florida Cuba",
    "recogida a domicilio",
    "ruta optimizada",
    "chofer en vivo",
    "envios desde Orlando",
    "encomiendas Cuba",
    "servicio de paquetes",
    "recogida comunidades cubanas",
    "CargoCuba",
    "formacion LLC",
    "creacion de paginas web",
    "automatizaciones para negocios",
  ],
  authors: [{ name: "Chambatina" }],
  creator: "Chambatina",
  publisher: "Chambatina",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: "https://cargocuba.onrender.com",
    siteName: "Chambatina",
    title: "Chambatina — Recogidas con Ruta Optimizada en Florida y Cuba",
    description: "Solicita tu recogida con un toque. Sigue al chofer en el mapa en tiempo real. Logística confiable para la comunidad cubana.",
    images: [{ url: "/logo-chambita-sm.png", width: 200, height: 200, alt: "Chambatina - Recogidas" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chambatina — Recogidas con Ruta Optimizada",
    description: "Solicita tu recogida, sigue al chofer en el mapa. Logística para la comunidad cubana en Florida.",
    images: ["/logo-chambita-sm.png"],
  },
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  alternates: {
    canonical: "https://cargocuba.onrender.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="canonical" href="https://cargocuba.onrender.com" />
        <meta name="geo.region" content="US-FL" />
        <meta name="geo.placename" content="Orlando, Florida" />
        <meta name="language" content="es" />
        <meta name="theme-color" content="#059669" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: "Chambatina",
              description: "Servicio de recogida de paquetes con ruta optimizada en tiempo real para la comunidad cubana en Florida.",
              url: "https://cargocuba.onrender.com",
              telephone: "+1-407-000-0000",
              address: {
                "@type": "PostalAddress",
                streetAddress: "2234 Winter Woods Blvd",
                addressLocality: "Winter Park",
                addressRegion: "FL",
                postalCode: "32792",
                addressCountry: "US",
              },
              geo: { "@type": "GeoCoordinates", latitude: 28.6184, longitude: -81.3153 },
              openingHoursSpecification: {
                "@type": "OpeningHoursSpecification",
                dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                opens: "08:00",
                closes: "20:00",
              },
              priceRange: "$$",
              image: "https://cargocuba.onrender.com/logo-chambita-sm.png",
              sameAs: [],
              serviceType: ["Recogida de paquetes", "Logistica Cuba-Florida", "Paqueteria", "Creacion de paginas web", "Automatizaciones", "Formacion LLC/Corp"],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Como solicito una recogida con Chambatina?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Entra a cargocuba.onrender.com, presiona el boton verde 'Pedir', busca tu direccion o usa GPS, pon tu nombre y envia. Tu punto aparece VERDE en el mapa y el chofer viene a recoger.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Puedo ver al chofer en tiempo real?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Si, cuando el chofer activa su GPS aparece como un punto azul parpadeante en el mapa. Puedes seguirlo en vivo y ver sus instrucciones de recogida.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Cuanto cobra Chambatina por el servicio de recogida?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "El precio del servicio lo indica cada chofer comunitario en el mapa. Al tocar el icono del chofer ves el mensaje, direccion de recogida y precio del servicio.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Que otros servicios ofrece Chambatina?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Ademas de logistica y paqueteria, ofrecemos creacion de paginas web, aplicaciones moviles, automatizaciones para negocios, formacion de companias LLC/Corp en EE.UU. y consultoria de marketing digital.",
                  },
                },
              ],
            }),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}