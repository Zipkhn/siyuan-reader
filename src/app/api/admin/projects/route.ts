import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth/guards";
import { db } from "@/db";
import { projects } from "@/db/schema";

const createSchema = z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/, "slug must match [a-z0-9-]+"),
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
});

async function adminOrFail() {
    try {
        return { admin: await requireAdmin() };
    } catch (e) {
        if (e instanceof Error && e.name === "AdminRequiredError") {
            return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
        }
        throw e;
    }
}

export async function GET() {
    const guard = await adminOrFail();
    if ("response" in guard) return guard.response;
    const rows = await db.select().from(projects).orderBy(projects.name);
    return NextResponse.json({ projects: rows });
}

export async function POST(request: Request) {
    const guard = await adminOrFail();
    if ("response" in guard) return guard.response;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Validation failed", issues: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const [created] = await db
            .insert(projects)
            .values({
                slug: parsed.data.slug,
                name: parsed.data.name,
                description: parsed.data.description,
            })
            .returning();
        return NextResponse.json({ ok: true, project: created });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Server error" },
            { status: 409 },
        );
    }
}
