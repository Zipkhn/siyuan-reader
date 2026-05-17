import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/auth/guards";
import { documentForUser } from "@/db/queries";

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
            <article className="doc-html" dangerouslySetInnerHTML={{ __html: html }} />
        </main>
    );
}
