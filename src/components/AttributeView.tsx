"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface AvColumn {
    id: string;
    name: string;
    type: string;
}

export interface AvRow {
    id: string;
    cells: string[];
}

export interface AvView {
    id: string;
    name: string;
    type: "table" | "gallery" | "kanban" | "unknown";
    columns: AvColumn[];
    rows: AvRow[];
    group_key_id?: string | null;
}

export interface AttributeViewProps {
    nodeId: string;
    avName: string;
    defaultViewId: string;
    views: AvView[];
}

/**
 * Hydrates an <av-placeholder> from the extractor into an interactive
 * Notion-like AV: tabs across views (table / kanban / gallery), persisted
 * in the URL as `?av-<nodeId>=<viewId>` so links can target a specific view.
 *
 * Falls back to the first view if the URL points to an unknown viewId.
 * Falls back to TableView if a kanban view has no usable group key
 * (silent — logged to console.warn only).
 */
export function AttributeView({
    nodeId,
    avName,
    defaultViewId,
    views,
}: AttributeViewProps): React.JSX.Element | null {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const urlKey = `av-${nodeId}`;
    const fromUrl = searchParams.get(urlKey);

    const initialId = useMemo(() => {
        const byUrl = views.find((v) => v.id === fromUrl);
        if (byUrl) return byUrl.id;
        const byDefault = views.find((v) => v.id === defaultViewId);
        if (byDefault) return byDefault.id;
        return views[0]?.id ?? "";
    }, [views, fromUrl, defaultViewId]);

    const [activeId, setActiveId] = useState(initialId);
    const active = views.find((v) => v.id === activeId) ?? views[0];
    if (!active) return null;

    const onTab = (vid: string) => {
        if (vid === activeId) return;
        setActiveId(vid);
        const params = new URLSearchParams(searchParams.toString());
        params.set(urlKey, vid);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return (
        <div className="av-block my-4 rounded-lg border border-zinc-200 bg-white">
            <header className="border-b border-zinc-200 px-4 py-2 flex items-center gap-3 flex-wrap">
                <strong className="text-sm">{avName || "Database"}</strong>
                <nav className="flex gap-1 ml-auto">
                    {views.map((v) => {
                        const isActive = v.id === active.id;
                        return (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => onTab(v.id)}
                                className={
                                    isActive
                                        ? "rounded bg-zinc-900 px-3 py-1 text-xs text-white"
                                        : "rounded border border-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                                }
                            >
                                <span aria-hidden="true">{iconFor(v.type)}</span>{" "}
                                {v.name || labelFor(v.type)}
                            </button>
                        );
                    })}
                </nav>
            </header>
            <div className="p-4">
                {active.type === "kanban" ? (
                    <KanbanView view={active} />
                ) : active.type === "gallery" ? (
                    <GalleryView view={active} />
                ) : (
                    <TableView view={active} />
                )}
            </div>
        </div>
    );
}

function iconFor(type: string): string {
    return type === "table"
        ? "📊"
        : type === "gallery"
          ? "🖼️"
          : type === "kanban"
            ? "📋"
            : "•";
}

function labelFor(type: string): string {
    return type === "table"
        ? "Table"
        : type === "gallery"
          ? "Gallery"
          : type === "kanban"
            ? "Kanban"
            : "View";
}

function TableView({ view }: { view: AvView }): React.JSX.Element {
    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                        {view.columns.map((c) => (
                            <th
                                key={c.id}
                                scope="col"
                                className="px-3 py-2 text-left font-medium text-zinc-700"
                            >
                                {c.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {view.rows.map((r) => (
                        <tr key={r.id} className="border-b border-zinc-100">
                            {r.cells.map((cell, i) => (
                                <td key={i} className="px-3 py-2 align-top">
                                    {cell || "—"}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function GalleryView({ view }: { view: AvView }): React.JSX.Element {
    return (
        <div
            className="grid gap-3"
            style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
            }}
        >
            {view.rows.map((r) => (
                <article
                    key={r.id}
                    className="rounded border border-zinc-200 bg-white p-3 shadow-sm"
                >
                    <strong className="block text-sm">{r.cells[0] || "—"}</strong>
                    {view.columns.length > 1 && (
                        <dl className="mt-2 space-y-1 text-xs">
                            {view.columns.slice(1).map((col, i) => (
                                <div key={col.id} className="flex gap-2">
                                    <dt className="font-medium text-zinc-500">
                                        {col.name}:
                                    </dt>
                                    <dd className="text-zinc-800">
                                        {r.cells[i + 1] || "—"}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </article>
            ))}
        </div>
    );
}

function KanbanView({ view }: { view: AvView }): React.JSX.Element {
    // Find the column to group by: prefer the explicit group_key_id if Siyuan
    // surfaced it, otherwise scan for a select/mSelect column. If neither
    // exists, gracefully degrade to a TableView (warn silently).
    const groupColIdx = (() => {
        if (view.group_key_id) {
            const byId = view.columns.findIndex((c) => c.id === view.group_key_id);
            if (byId !== -1) return byId;
        }
        return view.columns.findIndex((c) => c.type === "select" || c.type === "mSelect");
    })();

    if (groupColIdx === -1) {
        if (typeof window !== "undefined") {
            console.warn(
                `[AttributeView] kanban "${view.name}" has no group key; falling back to table`,
            );
        }
        return <TableView view={view} />;
    }

    const groups = new Map<string, AvRow[]>();
    for (const row of view.rows) {
        const key = row.cells[groupColIdx]?.trim() || "—";
        const arr = groups.get(key);
        if (arr) arr.push(row);
        else groups.set(key, [row]);
    }

    return (
        <div className="flex gap-3 overflow-x-auto pb-1">
            {[...groups.entries()].map(([groupName, rows]) => (
                <section
                    key={groupName}
                    className="flex-shrink-0 w-64 rounded bg-zinc-50 p-2"
                >
                    <header className="mb-2 flex items-center justify-between px-1 text-xs">
                        <span className="font-medium text-zinc-700">{groupName}</span>
                        <span className="rounded bg-zinc-200 px-2 text-zinc-600">
                            {rows.length}
                        </span>
                    </header>
                    <div className="space-y-2">
                        {rows.map((r) => (
                            <article
                                key={r.id}
                                className="rounded border border-zinc-200 bg-white p-2 text-sm shadow-sm"
                            >
                                <strong className="block">{r.cells[0] || "—"}</strong>
                                {view.columns.map((col, i) => {
                                    if (i === groupColIdx || i === 0) return null;
                                    const value = r.cells[i];
                                    if (!value) return null;
                                    return (
                                        <div
                                            key={col.id}
                                            className="mt-1 text-xs text-zinc-500"
                                        >
                                            <span className="font-medium">{col.name}:</span>{" "}
                                            <span className="text-zinc-800">{value}</span>
                                        </div>
                                    );
                                })}
                            </article>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
