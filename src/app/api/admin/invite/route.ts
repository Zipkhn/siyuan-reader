import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth/guards";
import { db } from "@/db";
import { users, userProjects } from "@/db/schema";
import { findProjectBySlug, findUserByEmail } from "@/db/queries";

const inputSchema = z.object({
    email: z.string().email(),
    projectSlug: z.string().regex(/^[a-z0-9-]+$/, "slug must match [a-z0-9-]+"),
});

export async function POST(request: Request) {
    let admin;
    try {
        admin = await requireAdmin();
    } catch (e) {
        if (e instanceof Error && e.name === "AdminRequiredError") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        throw e;
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Validation failed", issues: parsed.error.issues },
            { status: 400 },
        );
    }
    const { email, projectSlug } = parsed.data;

    const project = await findProjectBySlug(projectSlug);
    if (!project) {
        return NextResponse.json(
            { error: `Project "${projectSlug}" not found. Create it first.` },
            { status: 404 },
        );
    }

    let user = await findUserByEmail(email);
    if (!user) {
        const created = await db.insert(users).values({ email }).returning();
        user = created[0];
    }

    await db
        .insert(userProjects)
        .values({ userId: user.id, projectId: project.id, grantedBy: admin.id })
        .onConflictDoNothing();

    return NextResponse.json({
        ok: true,
        userId: user.id,
        projectId: project.id,
        message: `Invited ${email} to ${projectSlug}. They can now sign in with magic-link.`,
    });
}
