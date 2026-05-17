import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, userHasProjectAccess } from "@/auth/guards";
import {
    documentsForUserInProject,
    findProjectBySlug,
    searchDocumentsForUserInProject,
} from "@/db/queries";
import { parseBranding } from "@/branding/types";

interface DocItem {
    siyuanId: string;
    slug: string;
    title: string;
    excerpt: string | null;
    publishedAt: Date;
    updatedAt: Date;
}

export default async function ProjectPage({
    params,
    searchParams,
}: {
    params: Promise<{ project: string }>;
    searchParams: Promise<{ q?: string }>;
}) {
    const { project: projectSlug } = await params;
    const { q: rawQuery } = await searchParams;
    const user = await requireUser();
    if (!(await userHasProjectAccess(user.id, projectSlug))) {
        notFound();
    }

    const trimmedQuery = (rawQuery ?? "").trim();
    const isSearching = trimmedQuery.length > 0;

    const [project, docs] = await Promise.all([
        findProjectBySlug(projectSlug),
        isSearching
            ? searchDocumentsForUserInProject(user.id, projectSlug, trimmedQuery)
            : documentsForUserInProject(user.id, projectSlug),
    ]);
    const items: DocItem[] = docs.map((d) => ({
        siyuanId: d.siyuanId,
        slug: d.slug,
        title: d.title,
        excerpt: d.excerpt,
        publishedAt: d.publishedAt,
        updatedAt: d.updatedAt,
    }));

    const branding = project?.branding ? parseBranding(project.branding) : null;
    const displayName = branding?.display_name ?? project?.name ?? projectSlug;
    const logoSrc = branding?.logo_path ? `/branding/${project!.id}/logo` : null;

    return (
        <main className="max-w-3xl mx-auto py-12 px-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
                ← Tous les espaces
            </Link>
            <header className="mt-3 mb-6 flex items-center gap-4">
                {logoSrc && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={logoSrc}
                        alt={`${displayName} logo`}
                        className="h-12 w-12 rounded object-contain"
                    />
                )}
                <div>
                    <h1 className="text-2xl font-semibold">{displayName}</h1>
                    {project?.description && (
                        <p className="text-zinc-500 mt-1">{project.description}</p>
                    )}
                </div>
            </header>

            <form method="GET" className="mb-6 flex items-center gap-2">
                <input
                    type="search"
                    name="q"
                    defaultValue={trimmedQuery}
                    placeholder="Rechercher dans les documents…"
                    className="block w-full rounded border border-zinc-300 px-3 py-2 focus:outline-none focus:border-[var(--brand-primary)]"
                />
                <button
                    type="submit"
                    className="rounded px-4 py-2 text-sm text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-accent)]"
                >
                    Chercher
                </button>
                {isSearching && (
                    <Link
                        href={`/${projectSlug}`}
                        className="text-sm text-zinc-500 hover:text-zinc-900"
                    >
                        Effacer
                    </Link>
                )}
            </form>

            {isSearching && (
                <p className="text-sm text-zinc-500 mb-3">
                    {items.length === 0
                        ? `Aucun résultat pour « ${trimmedQuery} »`
                        : `${items.length} résultat(s) pour « ${trimmedQuery} »`}
                </p>
            )}

            {items.length === 0 && !isSearching ? (
                <p className="text-zinc-500">Aucun document publié pour le moment.</p>
            ) : (
                <ul className="space-y-2">
                    {items.map((d) => (
                        <li key={d.siyuanId}>
                            <Link
                                href={`/${projectSlug}/${d.slug}`}
                                className="block rounded border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400"
                            >
                                <span className="block font-medium">{d.title}</span>
                                {d.excerpt && (
                                    <p className="text-sm text-zinc-500 mt-1 line-clamp-2">
                                        {d.excerpt}
                                    </p>
                                )}
                                <p className="text-xs text-zinc-400 mt-2">
                                    Mis à jour le {new Date(d.updatedAt).toLocaleDateString("fr-FR")}
                                </p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
