import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, projects } from "@/db/schema";
import { verifyBearer } from "@/ingest/auth";
import { newRequestId } from "@/ingest/errors";
import { AssetHeadQuery, SHA256_HEX } from "@/ingest/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function empty(status: number, requestId: string): NextResponse {
    return new NextResponse(null, {
        status,
        headers: { "X-Request-Id": requestId },
    });
}

export async function HEAD(
    req: NextRequest,
    ctx: { params: Promise<{ sha256: string }> },
) {
    const requestId = newRequestId();

    if (!verifyBearer(req.headers.get("authorization"))) {
        return empty(401, requestId);
    }

    const { sha256 } = await ctx.params;
    if (!SHA256_HEX.safeParse(sha256).success) {
        return empty(400, requestId);
    }
    const url = new URL(req.url);
    const qParse = AssetHeadQuery.safeParse({
        project: url.searchParams.get("project"),
    });
    if (!qParse.success) {
        return empty(400, requestId);
    }

    const projectRow = await db.query.projects.findFirst({
        where: eq(projects.slug, qParse.data.project),
    });
    if (!projectRow) {
        return empty(404, requestId);
    }

    const row = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.projectId, projectRow.id), eq(assets.sha256, sha256)))
        .limit(1);
    return empty(row.length > 0 ? 200 : 404, requestId);
}
