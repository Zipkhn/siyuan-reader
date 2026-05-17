import "server-only";
import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, projects } from "@/db/schema";
import { verifyBearer } from "@/ingest/auth";
import { jsonError, jsonOk, newRequestId } from "@/ingest/errors";
import { IngestUnpublishPayload } from "@/ingest/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const requestId = newRequestId();

    if (!verifyBearer(req.headers.get("authorization"))) {
        return jsonError(401, requestId, "unauthorized");
    }

    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return jsonError(400, requestId, "validation_failed", {
            issues: [{ path: "body", message: "Invalid JSON" }],
        });
    }
    const parsed = IngestUnpublishPayload.safeParse(raw);
    if (!parsed.success) {
        return jsonError(400, requestId, "validation_failed", {
            issues: parsed.error.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
            })),
        });
    }
    const { project, docId } = parsed.data;

    const projectRow = await db.query.projects.findFirst({
        where: eq(projects.slug, project),
    });
    if (!projectRow) {
        return jsonError(404, requestId, "project_not_found", { project });
    }

    const existing = await db.query.documents.findFirst({
        where: and(
            eq(documents.projectId, projectRow.id),
            eq(documents.siyuanId, docId),
        ),
    });
    if (!existing) {
        return jsonOk(requestId, { status: "already_absent" });
    }

    await db.run(sql`DELETE FROM documents_fts WHERE document_id = ${existing.id}`);
    await db.delete(documents).where(eq(documents.id, existing.id));
    return jsonOk(requestId, { status: "removed" });
}
