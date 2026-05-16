import "server-only";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
    }),
    secret: env.AUTH_SECRET,
    providers: [
        Resend({
            apiKey: env.RESEND_API_KEY,
            from: env.AUTH_EMAIL_FROM,
        }),
    ],
    session: { strategy: "database" },
    pages: {
        signIn: "/login",
        verifyRequest: "/login/verify",
        error: "/login",
    },
    callbacks: {
        async signIn({ user, email }) {
            // Invite-only flow: requesting a magic-link with an unknown email
            // is rejected. The user must have been pre-created via the admin
            // invite endpoint, OR be the ADMIN_EMAIL (bootstrap).
            if (email?.verificationRequest) {
                if (!user.email) return false;
                if (user.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()) {
                    return true; // bootstrap admin
                }
                const existing = await db.query.users.findFirst({
                    where: eq(users.email, user.email),
                });
                return !!existing;
            }
            return true;
        },
        async session({ session, user }) {
            // Expose the user id in the session.
            if (session.user) {
                session.user.id = user.id;
            }
            return session;
        },
    },
});
