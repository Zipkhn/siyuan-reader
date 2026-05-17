import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, userHasProjectAccess } from "@/auth/guards";
import {
    documentsForUserInProject,
    findProjectBySlug,
    searchDocumentsForUserInProject,
} from "@/db/queries";

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

    return (
        <main className="max-w-3xl mx-auto py-12 px-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
                ← Tous les espaces
            </Link>
            <header className="mt-3 mb-6">
                <h1 className="text-2xl font-semibold">{project?.name ?? projectSlug}</h1>
                {project?.description && (
                    <p className="text-zinc-500 mt-1">{project.description}</p>
                )}
            </header>

            <form method="GET" className="mb-6 flex items-center gap-2">
                <input
                    type="search"
                    name="q"
                    defaultValue={trimmedQuery}
                    placeholder="Rechercher dans les documents…"
                    className="block w-full rounded border border-zinc-300 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                />
                <button
                    type="submit"
                    className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
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
