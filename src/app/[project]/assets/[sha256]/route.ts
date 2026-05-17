import "server-only";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, projects } from "@/db/schema";
import { getUser, userHasProjectAccess } from "@/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ project: string; sha256: string }> },
) {
    const { project, sha256 } = await ctx.params;
    if (!/^[a-z0-9-]+$/.test(project) || !/^[a-f0-9]{64}$/.test(sha256)) {
        return new NextResponse("invalid params", { status: 400 });
    }

    const user = await getUser();
    if (!user) {
        return new NextResponse("unauthorized", { status: 401 });
    }
    if (!(await userHasProjectAccess(user.id, project))) {
        return new NextResponse("forbidden", { status: 403 });
    }

    const row = await db
        .select({ bytes: assets.bytes, mime: assets.mime })
        .from(assets)
        .innerJoin(projects, eq(projects.id, assets.projectId))
        .where(and(eq(projects.slug, project), eq(assets.sha256, sha256)))
        .limit(1);
    if (row.length === 0) {
        return new NextResponse("not found", { status: 404 });
    }

    return new NextResponse(new Uint8Array(row[0].bytes), {
        status: 200,
        headers: {
            "Content-Type": row[0].mime,
            "Cache-Control": "public, max-age=31536000, immutable",
            ETag: `"${sha256}"`,
        },
    });
}
