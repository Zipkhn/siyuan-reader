import "server-only";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "./config";
import { db } from "@/db";
import { projects, userProjects } from "@/db/schema";
import { env } from "@/env";

export interface SessionUser {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
}

export async function getUser(): Promise<SessionUser | null> {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) return null;
    return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
    };
}

export async function requireUser(): Promise<SessionUser> {
    const user = await getUser();
    if (!user) {
        redirect("/login");
    }
    return user;
}

export async function isAdmin(user: SessionUser): boolean | Promise<boolean> {
    return user.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
}

export async function requireAdmin(): Promise<SessionUser> {
    const user = await requireUser();
    if (!(await isAdmin(user))) {
        const err = new Error("Admin access required");
        err.name = "AdminRequiredError";
        throw err;
    }
    return user;
}

export async function userHasProjectAccess(userId: string, projectSlug: string): Promise<boolean> {
    const rows = await db
        .select({ id: projects.id })
        .from(userProjects)
        .innerJoin(projects, eq(projects.id, userProjects.projectId))
        .where(and(eq(userProjects.userId, userId), eq(projects.slug, projectSlug)))
        .limit(1);
    return rows.length > 0;
}
