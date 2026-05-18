import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/auth/guards";
import { documentForUser } from "@/db/queries";
import {
    AttributeView,
    type AttributeViewProps,
    type AvView,
} from "@/components/AttributeView";

interface RawAvBlock {
    id?: string;
    type?: string;
    av_name?: string;
    default_view_id?: string;
    views?: unknown;
    // Legacy V1.0 shape (single view inlined at block root):
    view_type?: string;
    view_name?: string;
    columns?: unknown;
    rows?: unknown;
    children?: RawAvBlock[];
}

/**
 * Walk every block in the snapshot and collect AttributeView ones into a
 * Map keyed by their editor block id. Handles the legacy single-view shape
 * (columns/rows at block root) by synthesizing a 1-element views[].
 */
function collectAvBlocks(blocks: RawAvBlock[]): Map<string, AttributeViewProps> {
    const result = new Map<string, AttributeViewProps>();
    const walk = (arr: RawAvBlock[] | undefined): void => {
        if (!Array.isArray(arr)) return;
        for (const b of arr) {
            if (b?.type === "NodeAttributeView" && typeof b.id === "string") {
                const normalized = normalizeAvBlock(b);
                if (normalized) result.set(b.id, normalized);
            }
            walk(b?.children);
        }
    };
    walk(blocks);
    return result;
}

function normalizeAvBlock(block: RawAvBlock): AttributeViewProps | null {
    const nodeId = block.id;
    if (!nodeId) return null;
    const avName = block.av_name ?? "";

    if (Array.isArray(block.views) && block.views.length > 0) {
        const views = block.views.filter(isAvView);
        if (views.length === 0) return null;
        const defaultViewId = block.default_view_id ?? views[0].id;
        return { nodeId, avName, defaultViewId, views };
    }

    // Legacy V1.0 shape: synthesize one view.
    const legacyType = block.view_type;
    if (
        legacyType === "table" ||
        legacyType === "gallery" ||
        legacyType === "kanban" ||
        legacyType === "unknown"
    ) {
        const columns = Array.isArray(block.columns) ? (block.columns as AvView["columns"]) : [];
        const rows = Array.isArray(block.rows) ? (block.rows as AvView["rows"]) : [];
        const synthView: AvView = {
            id: "legacy",
            name: block.view_name ?? labelFor(legacyType),
            type: legacyType,
            columns,
            rows,
        };
        return { nodeId, avName, defaultViewId: "legacy", views: [synthView] };
    }
    return null;
}

function isAvView(v: unknown): v is AvView {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    return (
        typeof o.id === "string" &&
        typeof o.name === "string" &&
        (o.type === "table" || o.type === "gallery" || o.type === "kanban" || o.type === "unknown") &&
        Array.isArray(o.columns) &&
        Array.isArray(o.rows)
    );
}

function labelFor(type: string): string {
    return type === "kanban" ? "Kanban" : type === "gallery" ? "Gallery" : "Table";
}

/**
 * Split the sanitized doc HTML around every <av-placeholder>. Each placeholder
 * becomes a typed segment carrying the nodeId; everything else stays as raw
 * HTML strings to be rendered via dangerouslySetInnerHTML.
 */
type Segment = { kind: "html"; html: string } | { kind: "av"; nodeId: string };

function splitOnAvPlaceholders(html: string): Segment[] {
    const re = /<av-placeholder\s+data-node-id="([^"]+)">[\s\S]*?<\/av-placeholder>/g;
    const out: Segment[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        if (m.index > last) {
            out.push({ kind: "html", html: html.slice(last, m.index) });
        }
        out.push({ kind: "av", nodeId: m[1] });
        last = re.lastIndex;
    }
    if (last < html.length) {
        out.push({ kind: "html", html: html.slice(last) });
    }
    return out;
}

export default async function DocPage({
    params,
}: {
    params: Promise<{ project: string; doc: string }>;
}) {
    const { project: projectSlug, doc: docSlug } = await params;
    const user = await requireUser();
    const row = await documentForUser(user.id, projectSlug, docSlug);
    if (!row) notFound();
    const html = row.doc.html;
    if (html === null) notFound();

    // Parse snapshot_json to recover the typed AV blocks. If parsing fails (or
    // the doc somehow has no JSON), the page still renders — AV blocks just
    // show their <table> fallback inside the <av-placeholder>.
    let avBlocks = new Map<string, AttributeViewProps>();
    try {
        const snapshot = JSON.parse(row.doc.snapshotJson) as {
            content?: { blocks?: RawAvBlock[] };
        };
        avBlocks = collectAvBlocks(snapshot.content?.blocks ?? []);
    } catch (e) {
        // Defensive: never crash a doc page on bad JSON. Console-only.
        console.warn("[doc] failed to parse snapshot_json; AV blocks will render as fallback tables", e);
    }

    const segments = splitOnAvPlaceholders(html);

    return (
        <main className="max-w-3xl mx-auto py-12 px-4">
            <Link
                href={`/${projectSlug}`}
                className="text-sm text-zinc-500 hover:text-zinc-900"
            >
                ← Retour à {row.project.name}
            </Link>
            <header className="mt-3 mb-6 pb-6 border-b border-zinc-200">
                <h1 className="text-3xl font-semibold">{row.doc.title}</h1>
                <p className="text-xs text-zinc-400 mt-2">
                    Mis à jour le {new Date(row.doc.updatedAt).toLocaleDateString("fr-FR")} —
                    version {row.doc.version}
                </p>
            </header>
            <article className="doc-html">
                {segments.map((seg, i) => {
                    if (seg.kind === "html") {
                        return <div key={i} dangerouslySetInnerHTML={{ __html: seg.html }} />;
                    }
                    const av = avBlocks.get(seg.nodeId);
                    if (!av) {
                        // No matching block in snapshot_json — render nothing
                        // for this segment (the fallback <table> already lived
                        // inside the placeholder; the regex consumed it).
                        return null;
                    }
                    return (
                        <Suspense key={i} fallback={null}>
                            <AttributeView {...av} />
                        </Suspense>
                    );
                })}
            </article>
        </main>
    );
}
