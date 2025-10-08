import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// next-auth v4 export pattern for App Router
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };