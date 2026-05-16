import "server-only";
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { env } from "@/env";

export interface ProjectIndexEntry {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    published_at: string;
    updated_at: string;
}

export interface ProjectIndex {
    project: string;
    name: string;
    updated_at: string;
    docs: ProjectIndexEntry[];
}

export interface SnapshotDoc {
    id: string;
    project: string;
    slug: string;
    title: string;
    published_at: string;
    updated_at: string;
    version: number;
    excerpt: string;
}

export interface Snapshot {
    schema: string;
    doc: SnapshotDoc;
    content_hash: string;
    content: { blocks: unknown[] };
    assets: {
        original_path: string;
        stored_path: string;
        sha256: string;
        mime: string;
        size_bytes: number;
    }[];
    outbound_refs: unknown[];
    search_text: string;
}

/**
 * Build an absolute path under SNAPSHOTS_DIR and refuse path traversal.
 * Components must be simple file/dir names. Throws if a `..` segment slips in.
 */
function safeJoin(...parts: string[]): string {
    for (const p of parts) {
        if (p.includes("..") || p.includes("/") || p.includes("\\")) {
            throw new Error(`Unsafe path component: ${p}`);
        }
    }
    const target = normalize(join(env.SNAPSHOTS_DIR, ...parts));
    const root = normalize(env.SNAPSHOTS_DIR);
    if (!target.startsWith(root + sep) && target !== root) {
        throw new Error("Path escapes SNAPSHOTS_DIR");
    }
    return target;
}

export async function readProjectIndex(projectSlug: string): Promise<ProjectIndex | null> {
    try {
        const raw = await readFile(safeJoin(projectSlug, "index.json"), "utf8");
        return JSON.parse(raw) as ProjectIndex;
    } catch {
        return null;
    }
}

export async function readSnapshot(projectSlug: string, docId: string): Promise<Snapshot | null> {
    try {
        const raw = await readFile(safeJoin(projectSlug, "docs", `${docId}.json`), "utf8");
        return JSON.parse(raw) as Snapshot;
    } catch {
        return null;
    }
}

export async function readSnapshotHtml(
    projectSlug: string,
    docId: string,
): Promise<string | null> {
    try {
        return await readFile(safeJoin(projectSlug, "docs", `${docId}.html`), "utf8");
    } catch {
        return null;
    }
}
