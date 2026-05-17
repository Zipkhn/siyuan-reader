import "server-only";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, projects } from "@/db/schema";
import { verifyBearer } from "@/ingest/auth";
import { jsonError, jsonOk, newRequestId } from "@/ingest/errors";
import { ASSET_MAX_BYTES, IngestAssetQuery } from "@/ingest/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const requestId = newRequestId();

    if (!verifyBearer(req.headers.get("authorization"))) {
        return jsonError(401, requestId, "unauthorized");
    }

    const url = new URL(req.url);
    const parsed = IngestAssetQuery.safeParse({
        project: url.searchParams.get("project"),
        sha256: url.searchParams.get("sha256"),
        mime: url.searchParams.get("mime"),
    });
    if (!parsed.success) {
        return jsonError(400, requestId, "validation_failed", {
            issues: parsed.error.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
            })),
        });
    }
    const q = parsed.data;

    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (declaredLength > ASSET_MAX_BYTES) {
        return jsonError(413, requestId, "payload_too_large", {
            limitBytes: ASSET_MAX_BYTES,
            actualBytes: declaredLength,
        });
    }

    const ab = await req.arrayBuffer();
    if (ab.byteLength > ASSET_MAX_BYTES) {
        return jsonError(413, requestId, "payload_too_large", {
            limitBytes: ASSET_MAX_BYTES,
            actualBytes: ab.byteLength,
        });
    }
    const bytes = Buffer.from(ab);

    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (actualSha !== q.sha256) {
        return jsonError(400, requestId, "sha256_mismatch", {
            expected: q.sha256,
            actual: actualSha,
        });
    }

    const projectRow = await db.query.projects.findFirst({
        where: eq(projects.slug, q.project),
    });
    if (!projectRow) {
        return jsonError(404, requestId, "project_not_found", { project: q.project });
    }

    const existing = await db.query.assets.findFirst({
        where: and(
            eq(assets.projectId, projectRow.id),
            eq(assets.sha256, q.sha256),
        ),
    });
    if (existing) {
        return jsonOk(requestId, { status: "exists", sha256: q.sha256 });
    }

    await db.insert(assets).values({
        projectId: projectRow.id,
        sha256: q.sha256,
        mime: q.mime,
        sizeBytes: bytes.byteLength,
        bytes,
    });
    return jsonOk(requestId, {
        status: "ingested",
        sha256: q.sha256,
        sizeBytes: bytes.byteLength,
    });
}
