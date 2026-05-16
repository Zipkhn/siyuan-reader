import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, userHasProjectAccess } from "@/auth/guards";
import { documentsForUserInProject, findProjectBySlug } from "@/db/queries";

export default async function ProjectPage({
    params,
}: {
    params: Promise<{ project: string }>;
}) {
    const { project: projectSlug } = await params;
    const user = await requireUser();
    if (!(await userHasProjectAccess(user.id, projectSlug))) {
        notFound();
    }
    const [project, docs] = await Promise.all([
        findProjectBySlug(projectSlug),
        documentsForUserInProject(user.id, projectSlug),
    ]);
    return (
        <main className="max-w-3xl mx-auto py-12 px-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
                ← Tous les espaces
            </Link>
            <header className="mt-3 mb-8">
                <h1 className="text-2xl font-semibold">{project?.name ?? projectSlug}</h1>
                {project?.description && (
                    <p className="text-zinc-500 mt-1">{project.description}</p>
                )}
            </header>
            {docs.length === 0 ? (
                <p className="text-zinc-500">Aucun document publié pour le moment.</p>
            ) : (
                <ul className="space-y-2">
                    {docs.map((d) => (
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
                                    Mis à jour le{" "}
                                    {new Date(d.updatedAt).toLocaleDateString("fr-FR")}
                                </p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
