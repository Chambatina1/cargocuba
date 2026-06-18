import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Servicios de Chambatina — Paginas Web, Apps, LLC, Automatizaciones y Logistica",
  description:
    "Chambatina ofrece: creacion de paginas web profesionales, desarrollo de apps, formacion de LLC/Corp en EE.UU., automatizaciones para negocios, marketing digital y servicio de logistica con recogida de paquetes para la comunidad cubana en Florida.",
  openGraph: {
    title: "Servicios de Chambatina — Web, Apps, LLC, Automatizaciones, Logistica",
    description: "Soluciones completas para tu negocio: paginas web, apps, LLC, automatizaciones y logistica Cuba-Florida.",
    url: "https://cargocuba.onrender.com/servicios",
    images: [{ url: "/logo-chambita-sm.png", width: 200, height: 200, alt: "Chambatina Servicios" }],
  },
};

const servicios = [
  {
    icon: "🌐",
    titulo: "Pagina Web Profesional",
    precio: "Desde $299",
    descripcion: "Sitio web moderno, rapido y optimizado para Google. Responsive, con SEO incluido y formulario de contacto. Tu negocio en internet en menos de 48 horas.",
    features: ["Diseno responsive", "SEO optimizado", "Formulario de contacto", "Google Analytics", "Entrega en 48h"],
    popular: true,
  },
  {
    icon: "📱",
    titulo: "Aplicacion Movil",
    precio: "Desde $799",
    descripcion: "App nativa o hibrida para iOS y Android. Ideal para gestionar pedidos, entregas o cualquier servicio que necesites automatizar desde el celular.",
    features: ["iOS y Android", "Notificaciones push", "Panel de administracion", "GPS integrado", "Soporte incluido"],
    popular: false,
  },
  {
    icon: "🏢",
    titulo: "Formacion LLC / Corp",
    precio: "Desde $199",
    descripcion: "Formamos tu compania LLC o Corporation en Estados Unidos. EIN, cuenta bancaria, registro estatal. Todo incluido para que operes legal desde el primer dia.",
    features: ["LLC o Corporation", "EIN del IRS", "Cuenta bancaria", "Registro estatal", "Asesoria fiscal basica"],
    popular: true,
  },
  {
    icon: "🤖",
    titulo: "Automatizaciones",
    precio: "Desde $149",
    descripcion: "Automatiza tu negocio con WhatsApp, correo, CRM y formularios. Respuestas automaticas, seguimiento de clientes, recordatorios y flujos de trabajo inteligentes.",
    features: ["WhatsApp Business API", "CRM automatico", "Email marketing", "Formularios inteligentes", "Recordatorios"],
    popular: false,
  },
  {
    icon: "📦",
    titulo: "Logistica y Paqueteria",
    precio: "Variable",
    descripcion: "Recogida de paquetes puerta a puerta con seguimiento en tiempo real. Rutas optimizadas, choferes comunitarios y entregas confiables entre Florida y Cuba.",
    features: ["Recogida a domicilio", "Seguimiento en vivo", "Ruta optimizada", "Choferes comunitarios", "Seguro basico"],
    popular: true,
  },
  {
    icon: "📣",
    titulo: "Marketing Digital",
    precio: "Desde $99/mes",
    descripcion: "Gestion de redes sociales, anuncios en Facebook/Instagram/Google, creacion de contenido y estrategias para atraer clientes a tu negocio.",
    features: ["Redes sociales", "Anuncios Facebook/Google", "Contenido mensual", "Analisis de resultados", "Estrategia personalizada"],
    popular: false,
  },
];

export default function ServiciosPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      {/* Hero */}
      <header className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
            <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
            Soluciones para tu negocio
          </div>
          <h1 className="text-3xl md:text-4xl font-black mb-3 leading-tight">
            Servicios de Chambatina
          </h1>
          <p className="text-emerald-100 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Desde paginas web y formacion de LLC hasta logistica con seguimiento en tiempo real. 
            Todo lo que necesitas para hacer crecer tu negocio, con la confianza de la comunidad.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-white text-emerald-700 font-bold px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all shadow-lg"
            >
              🗺️ Ir al Mapa de Recogidas
            </Link>
            <a
              href="https://wa.me/14070000000?text=Hola%20Chambatina%2C%20quiero%20informacion%20sobre%20sus%20servicios"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 bg-green-500 text-white font-bold px-6 py-3 rounded-xl hover:bg-green-600 transition-all shadow-lg"
            >
              💬 WhatsApp
            </a>
          </div>
        </div>
      </header>

      {/* Trust bar */}
      <div className="bg-white border-b border-zinc-100 py-4 px-4">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-6 text-center">
          <div>
            <p className="text-2xl font-black text-emerald-600">500+</p>
            <p className="text-xs text-zinc-500 font-semibold">Recogidas completadas</p>
          </div>
          <div className="w-px bg-zinc-200" />
          <div>
            <p className="text-2xl font-black text-emerald-600">98%</p>
            <p className="text-xs text-zinc-500 font-semibold">Clientes satisfechos</p>
          </div>
          <div className="w-px bg-zinc-200" />
          <div>
            <p className="text-2xl font-black text-emerald-600">24h</p>
            <p className="text-xs text-zinc-500 font-semibold">Tiempo de respuesta</p>
          </div>
          <div className="w-px bg-zinc-200" />
          <div>
            <p className="text-2xl font-black text-emerald-600">100%</p>
            <p className="text-xs text-zinc-500 font-semibold">Confiable</p>
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {servicios.map((s, i) => (
            <div
              key={i}
              className={`relative bg-white rounded-2xl border p-5 transition-all hover:shadow-xl ${
                s.popular ? 'border-emerald-300 shadow-lg' : 'border-zinc-200 shadow-sm'
              }`}
            >
              {s.popular && (
                <span className="absolute -top-2.5 left-4 bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                  Popular
                </span>
              )}
              <div className="text-3xl mb-3">{s.icon}</div>
              <h3 className="text-lg font-bold text-zinc-900 mb-1">{s.titulo}</h3>
              <p className="text-emerald-600 font-bold text-sm mb-2">{s.precio}</p>
              <p className="text-sm text-zinc-600 leading-relaxed mb-4">{s.descripcion}</p>
              <ul className="space-y-1.5 mb-5">
                {s.features.map((f, j) => (
                  <li key={j} className="flex items-center gap-2 text-xs text-zinc-700">
                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={`https://wa.me/14070000000?text=Hola%20Chambatina%2C%20quiero%20info%20sobre%20${encodeURIComponent(s.titulo)}`}
                target="_blank"
                rel="noopener"
                className={`block w-full text-center py-2.5 rounded-xl font-bold text-sm transition-all ${
                  s.popular
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'
                    : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                }`}
              >
                Solicitar Informacion
              </a>
            </div>
          ))}
        </div>
      </main>

      {/* CTA Final */}
      <section className="bg-gradient-to-r from-orange-500 to-amber-500 text-white py-10 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-black mb-2">Necesitas algo diferente?</h2>
          <p className="text-orange-100 mb-5">
            Cada negocio es unico. Cuentanos que necesitas y te damos una solucion a medida, rapida y al mejor precio.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="https://wa.me/14070000000?text=Hola%20Chambatina%2C%20necesito%20una%20cotizacion%20personalizada"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 bg-white text-orange-700 font-bold px-6 py-3 rounded-xl hover:bg-orange-50 transition-all shadow-lg"
            >
              💬 Pedir Cotizacion por WhatsApp
            </a>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-orange-700 text-white font-bold px-6 py-3 rounded-xl hover:bg-orange-800 transition-all"
            >
              🗺️ Ver Mapa de Recogidas
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-10">
        <h2 className="text-xl font-bold text-zinc-900 text-center mb-6">Preguntas Frecuentes</h2>
        <div className="space-y-4">
          {[
            { q: "Cuanto tiempo tarda en estar lista mi pagina web?", a: "Entre 24 y 72 horas dependiendo de la complejidad. Las paginas basicas estan listas en 48h con contenido, SEO y formulario de contacto." },
            { q: "La formacion de LLC incluye todo lo necesario?", a: "Si. Incluye el registro en el estado, numero EIN del IRS, asesoramiento para abrir cuenta bancaria y los documentos legales basicos." },
            { q: "Como funciona el servicio de recogida?", a: "Entras al mapa, presionas 'Pedir', pones tu direccion y nombre. Tu punto se enciende VERDE y el chofer te recoge. Puedes seguirlo en tiempo real." },
            { q: "Aceptan pagos a plazos?", a: "Si, ofrecemos planes de pago para servicios grandes. Pregunta por WhatsApp y te armamos un plan que se ajuste a tu presupuesto." },
          ].map((faq, i) => (
            <details key={i} className="bg-white border border-zinc-200 rounded-xl p-4 group">
              <summary className="font-bold text-sm text-zinc-800 cursor-pointer list-none flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">?</span>
                {faq.q}
              </summary>
              <p className="mt-3 text-sm text-zinc-600 leading-relaxed pl-7">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-zinc-900 text-zinc-400 py-8 px-4 text-center text-xs">
        <p className="font-semibold text-zinc-300 mb-1">Chambatina</p>
        <p>Logistica, tecnologia y servicios para la comunidad cubana en Florida.</p>
        <p className="mt-2">Orlando, FL · 2025</p>
      </footer>
    </div>
  );
}