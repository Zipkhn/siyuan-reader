import "server-only";
import { NextRequest } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, ensureFts } from "@/db";
import { assets, documents, projects } from "@/db/schema";
import { verifyBearer } from "@/ingest/auth";
import { jsonError, jsonOk, newRequestId } from "@/ingest/errors";
import { IngestDocPayload } from "@/ingest/schemas";

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
    const parsed = IngestDocPayload.safeParse(raw);
    if (!parsed.success) {
        return jsonError(400, requestId, "validation_failed", {
            issues: parsed.error.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
            })),
        });
    }
    const payload = parsed.data;

    const projectRow = await db.query.projects.findFirst({
        where: eq(projects.slug, payload.doc.project),
    });
    if (!projectRow) {
        return jsonError(404, requestId, "project_not_found", {
            project: payload.doc.project,
        });
    }

    const existing = await db.query.documents.findFirst({
        where: and(
            eq(documents.projectId, projectRow.id),
            eq(documents.siyuanId, payload.doc.id),
        ),
    });
    if (
        existing &&
        existing.contentHash === payload.content_hash &&
        existing.version === payload.doc.version
    ) {
        return jsonOk(requestId, { status: "unchanged" });
    }

    if (payload.assets.length > 0) {
        const referenced = payload.assets.map((a) => a.sha256);
        const found = await db
            .select({ sha256: assets.sha256 })
            .from(assets)
            .where(
                and(
                    eq(assets.projectId, projectRow.id),
                    inArray(assets.sha256, referenced),
                ),
            );
        const foundSet = new Set(found.map((r) => r.sha256));
        const missing = referenced.filter((s) => !foundSet.has(s));
        if (missing.length > 0) {
            return jsonError(409, requestId, "missing_asset", {
                project: payload.doc.project,
                missing,
            });
        }
    }

    await ensureFts();

    const snapshotJson = JSON.stringify({
        schema: payload.schema,
        doc: payload.doc,
        content: payload.content,
        content_hash: payload.content_hash,
        assets: payload.assets,
        outbound_refs: payload.outbound_refs,
        search_text: payload.search_text,
    });
    const publishedAt = new Date(payload.doc.published_at);
    const updatedAt = new Date(payload.doc.updated_at);

    let docRowId: string;
    if (existing) {
        await db
            .update(documents)
            .set({
                slug: payload.doc.slug,
                title: payload.doc.title,
                excerpt: payload.doc.excerpt,
                contentHash: payload.content_hash,
                snapshotJson,
                html: payload.html,
                version: payload.doc.version,
                publishedAt,
                updatedAt,
            })
            .where(eq(documents.id, existing.id));
        docRowId = existing.id;
    } else {
        const [inserted] = await db
            .insert(documents)
            .values({
                projectId: projectRow.id,
                siyuanId: payload.doc.id,
                slug: payload.doc.slug,
                title: payload.doc.title,
                excerpt: payload.doc.excerpt,
                contentHash: payload.content_hash,
                snapshotJson,
                html: payload.html,
                version: payload.doc.version,
                publishedAt,
                updatedAt,
            })
            .returning({ id: documents.id });
        docRowId = inserted.id;
    }

    await db.run(sql`DELETE FROM documents_fts WHERE document_id = ${docRowId}`);
    await db.run(
        sql`INSERT INTO documents_fts (document_id, title, excerpt, search_text) VALUES (${docRowId}, ${payload.doc.title}, ${payload.doc.excerpt}, ${payload.search_text})`,
    );

    return jsonOk(requestId, { status: "ingested" });
}
