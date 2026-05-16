import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth/guards";
import { syncAllProjects, syncProject } from "@/admin/sync";

const inputSchema = z.object({
    project: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .optional(),
});

export async function POST(request: Request) {
    try {
        await requireAdmin();
    } catch (e) {
        if (e instanceof Error && e.name === "AdminRequiredError") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        throw e;
    }

    let body: unknown = {};
    try {
        const text = await request.text();
        body = text ? JSON.parse(text) : {};
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

    try {
        if (parsed.data.project) {
            const result = await syncProject(parsed.data.project);
            return NextResponse.json({ ok: true, result });
        }
        const result = await syncAllProjects();
        return NextResponse.json({ ok: true, ...result });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Server error" },
            { status: 500 },
        );
    }
}
