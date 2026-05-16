import "server-only";
import { readdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, projects } from "@/db/schema";
import { readProjectIndex } from "@/snapshots/fs";
import { env } from "@/env";

export interface SyncResult {
    project: string;
    inserted: number;
    updated: number;
    removed: number;
    skipped: number;
}

/**
 * Sync snapshots/<project>/index.json into the documents table for a single
 * project. Idempotent: existing docs are updated, missing ones inserted,
 * stale ones removed. Project must already exist in the DB.
 */
export async function syncProject(projectSlug: string): Promise<SyncResult> {
    const project = await db.query.projects.findFirst({
        where: eq(projects.slug, projectSlug),
    });
    if (!project) {
        throw new Error(`Project not found: ${projectSlug}`);
    }
    const index = await readProjectIndex(projectSlug);
    if (!index) {
        // Project exists in DB but no snapshots yet: clear any stale rows.
        await db.delete(documents).where(eq(documents.projectId, project.id));
        return { project: projectSlug, inserted: 0, updated: 0, removed: 0, skipped: 0 };
    }

    const result: SyncResult = {
        project: projectSlug,
        inserted: 0,
        updated: 0,
        removed: 0,
        skipped: 0,
    };

    const existingRows = await db
        .select()
        .from(documents)
        .where(eq(documents.projectId, project.id));
    const existing = new Map(existingRows.map((row) => [row.siyuanId, row]));
    const seen = new Set<string>();

    for (const entry of index.docs) {
        seen.add(entry.id);
        const prev = existing.get(entry.id);
        const snapshotPath = `${projectSlug}/docs/${entry.id}.json`;
        const publishedAt = new Date(entry.published_at);
        const updatedAt = new Date(entry.updated_at);

        // We don't have version in index.json — read the snapshot file for it.
        // For V1 simplicity, default to 0 and rely on the snapshot for actual version.
        // (Could be optimized later by also storing version in index.json.)
        const version = prev?.version ?? 0;

        if (!prev) {
            await db.insert(documents).values({
                projectId: project.id,
                siyuanId: entry.id,
                slug: entry.slug,
                title: entry.title,
                excerpt: entry.excerpt,
                snapshotPath,
                version,
                publishedAt,
                updatedAt,
            });
            result.inserted += 1;
        } else if (
            prev.slug !== entry.slug ||
            prev.title !== entry.title ||
            prev.excerpt !== entry.excerpt ||
            prev.updatedAt.getTime() !== updatedAt.getTime()
        ) {
            await db
                .update(documents)
                .set({
                    slug: entry.slug,
                    title: entry.title,
                    excerpt: entry.excerpt,
                    snapshotPath,
                    publishedAt,
                    updatedAt,
                })
                .where(eq(documents.id, prev.id));
            result.updated += 1;
        } else {
            result.skipped += 1;
        }
    }

    for (const row of existingRows) {
        if (!seen.has(row.siyuanId)) {
            await db.delete(documents).where(eq(documents.id, row.id));
            result.removed += 1;
        }
    }

    return result;
}

/**
 * Sync every project we know about (those that exist as directories under
 * SNAPSHOTS_DIR AND are present in the projects table). Projects in the
 * filesystem but not in the DB are reported but not auto-created — admin
 * must create them explicitly first.
 */
export async function syncAllProjects(): Promise<{
    results: SyncResult[];
    fsOnlyProjects: string[];
}> {
    let entries: string[] = [];
    try {
        entries = await readdir(env.SNAPSHOTS_DIR);
    } catch {
        return { results: [], fsOnlyProjects: [] };
    }
    const allProjects = await db.select({ slug: projects.slug }).from(projects);
    const known = new Set(allProjects.map((p) => p.slug));
    const results: SyncResult[] = [];
    const fsOnlyProjects: string[] = [];
    for (const entry of entries) {
        if (entry.startsWith(".") || entry.includes("/")) continue;
        if (!known.has(entry)) {
            fsOnlyProjects.push(entry);
            continue;
        }
        results.push(await syncProject(entry));
    }
    return { results, fsOnlyProjects };
}
