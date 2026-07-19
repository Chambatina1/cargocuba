// Route handler de NextAuth. Expone /api/auth/* (signin, signout, session, etc.)
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
