'use client';
// SessionProvider de NextAuth - cliente. Envuelve la app para que useSession()
// y signIn() esten disponibles en cualquier pagina cliente.
import { SessionProvider } from 'next-auth/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
