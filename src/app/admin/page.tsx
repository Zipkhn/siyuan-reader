import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, isAdmin } from "@/auth/guards";
import { db } from "@/db";
import { documents, projects, userProjects, users } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { parseBranding, type Branding } from "@/branding/types";
import {
    clearBrandingAction,
    createProjectAction,
    deleteProjectAction,
    inviteUserAction,
    revokeAccessAction,
    setBrandingAction,
    uploadLogoAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface ProjectRow {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    docCount: number;
    members: { userId: string; email: string }[];
    branding: Branding | null;
}

async function loadAdminData(): Promise<ProjectRow[]> {
    const projectRows = await db.select().from(projects).orderBy(projects.name);
    if (projectRows.length === 0) return [];

    const docCounts = await db
        .select({ projectId: documents.projectId, n: count() })
        .from(documents)
        .groupBy(documents.projectId);
    const countByProject = new Map(docCounts.map((r) => [r.projectId, Number(r.n)]));

    const memberships = await db
        .select({
            userId: userProjects.userId,
            projectId: userProjects.projectId,
            email: users.email,
        })
        .from(userProjects)
        .innerJoin(users, eq(users.id, userProjects.userId));
    const membersByProject = new Map<string, { userId: string; email: string }[]>();
    for (const m of memberships) {
        const arr = membersByProject.get(m.projectId) ?? [];
        arr.push({ userId: m.userId, email: m.email ?? "(no email)" });
        membersByProject.set(m.projectId, arr);
    }

    return projectRows.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        docCount: countByProject.get(p.id) ?? 0,
        members: membersByProject.get(p.id) ?? [],
        branding: parseBranding(p.branding),
    }));
}

export default async function AdminPage({
    searchParams,
}: {
    searchParams: Promise<{ message?: string; error?: string }>;
}) {
    const user = await getUser();
    if (!user) redirect("/login");
    if (!(await isAdmin(user))) redirect("/");

    const { message, error } = await searchParams;
    const rows = await loadAdminData();
    const totalUsers = await db.select({ n: count() }).from(users);

    return (
        <main className="max-w-4xl mx-auto py-10 px-4">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
                        ← Espaces
                    </Link>
                    <h1 className="text-2xl font-semibold mt-2">Administration</h1>
                    <p className="text-sm text-zinc-500">
                        Connecté en tant qu'admin : {user.email} · {totalUsers[0]?.n ?? 0} utilisateurs au total
                    </p>
                </div>
            </header>

            {message && (
                <div className="mb-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                    {message}
                </div>
            )}
            {error && (
                <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <section className="mb-10">
                <h2 className="text-lg font-semibold mb-3">Projets</h2>
                {rows.length === 0 ? (
                    <p className="text-sm text-zinc-500">Aucun projet. Crée-en un ci-dessous.</p>
                ) : (
                    <div className="space-y-3">
                        {rows.map((p) => (
                            <details
                                key={p.id}
                                className="rounded border border-zinc-200 bg-white"
                            >
                                <summary className="cursor-pointer px-4 py-3 flex items-center justify-between">
                                    <span>
                                        <span className="font-medium">{p.name}</span>{" "}
                                        <code className="text-xs text-zinc-500">{p.slug}</code>
                                        <span className="ml-3 text-xs text-zinc-500">
                                            {p.docCount} doc(s) · {p.members.length} membre(s)
                                        </span>
                                    </span>
                                </summary>
                                <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 pt-3">
                                    {p.description && (
                                        <p className="text-sm text-zinc-600">{p.description}</p>
                                    )}
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-zinc-400 mb-2">
                                            Membres
                                        </p>
                                        {p.members.length === 0 ? (
                                            <p className="text-sm text-zinc-500">
                                                Aucun membre. Utilise le formulaire d'invitation.
                                            </p>
                                        ) : (
                                            <ul className="space-y-1">
                                                {p.members.map((m) => (
                                                    <li
                                                        key={m.userId}
                                                        className="flex items-center justify-between text-sm"
                                                    >
                                                        <span>{m.email}</span>
                                                        <form action={revokeAccessAction}>
                                                            <input
                                                                type="hidden"
                                                                name="userId"
                                                                value={m.userId}
                                                            />
                                                            <input
                                                                type="hidden"
                                                                name="projectId"
                                                                value={p.id}
                                                            />
                                                            <button
                                                                type="submit"
                                                                className="text-xs text-red-600 hover:underline"
                                                            >
                                                                retirer
                                                            </button>
                                                        </form>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-zinc-400 mb-2 pt-2 border-t border-zinc-100">
                                            Branding
                                        </p>
                                        <form action={setBrandingAction} className="space-y-2">
                                            <input type="hidden" name="projectId" value={p.id} />
                                            <label className="block">
                                                <span className="text-xs text-zinc-500">
                                                    Nom affiché (optionnel, override de "{p.name}")
                                                </span>
                                                <input
                                                    type="text"
                                                    name="display_name"
                                                    defaultValue={p.branding?.display_name ?? ""}
                                                    maxLength={80}
                                                    placeholder={p.name}
                                                    className="mt-1 block w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                                                />
                                            </label>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                {(
                                                    [
                                                        ["primary", "Primary"],
                                                        ["accent", "Accent"],
                                                        ["bg", "Fond"],
                                                        ["text", "Texte"],
                                                    ] as const
                                                ).map(([key, label]) => (
                                                    <label key={key} className="block">
                                                        <span className="text-xs text-zinc-500">
                                                            {label}
                                                        </span>
                                                        <input
                                                            type="text"
                                                            name={key}
                                                            defaultValue={
                                                                p.branding?.[key] ?? ""
                                                            }
                                                            placeholder="#RRGGBB ou vide"
                                                            pattern="(#[0-9a-fA-F]{6})?"
                                                            className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1 font-mono text-xs"
                                                        />
                                                    </label>
                                                ))}
                                            </div>
                                            <button
                                                type="submit"
                                                className="text-xs rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50"
                                            >
                                                Enregistrer les couleurs
                                            </button>
                                        </form>

                                        <form
                                            action={uploadLogoAction}
                                            encType="multipart/form-data"
                                            className="mt-3 flex items-center gap-2"
                                        >
                                            <input type="hidden" name="projectId" value={p.id} />
                                            <input
                                                type="file"
                                                name="logo"
                                                accept="image/png,image/svg+xml,image/webp"
                                                required
                                                className="text-xs"
                                            />
                                            <button
                                                type="submit"
                                                className="text-xs rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50"
                                            >
                                                Uploader logo
                                            </button>
                                            {p.branding?.logo_path && (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img
                                                    src={`/branding/${p.id}/logo`}
                                                    alt="logo actuel"
                                                    className="h-8 w-8 object-contain rounded"
                                                />
                                            )}
                                        </form>

                                        {p.branding && (
                                            <form
                                                action={clearBrandingAction}
                                                className="mt-2 inline-block"
                                            >
                                                <input
                                                    type="hidden"
                                                    name="projectId"
                                                    value={p.id}
                                                />
                                                <button
                                                    type="submit"
                                                    className="text-xs text-red-600 hover:underline"
                                                >
                                                    réinitialiser le branding au défaut
                                                </button>
                                            </form>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 pt-2 border-t border-zinc-100">
                                        <form action={deleteProjectAction}>
                                            <input type="hidden" name="slug" value={p.slug} />
                                            <button
                                                type="submit"
                                                className="text-xs text-red-600 hover:underline"
                                            >
                                                supprimer le projet
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </details>
                        ))}
                    </div>
                )}
            </section>

            <section className="mb-10">
                <h2 className="text-lg font-semibold mb-3">Créer un projet</h2>
                <form
                    action={createProjectAction}
                    className="space-y-3 rounded border border-zinc-200 bg-white p-4"
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-xs text-zinc-500">Slug</span>
                            <input
                                type="text"
                                name="slug"
                                required
                                pattern="[a-z0-9-]+"
                                placeholder="acme"
                                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-1.5"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs text-zinc-500">Nom affiché</span>
                            <input
                                type="text"
                                name="name"
                                required
                                placeholder="Acme Corp"
                                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-1.5"
                            />
                        </label>
                    </div>
                    <label className="block">
                        <span className="text-xs text-zinc-500">Description (optionnelle)</span>
                        <input
                            type="text"
                            name="description"
                            placeholder="Espace client Acme"
                            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-1.5"
                        />
                    </label>
                    <button
                        type="submit"
                        className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
                    >
                        Créer le projet
                    </button>
                </form>
            </section>

            <section className="mb-10">
                <h2 className="text-lg font-semibold mb-3">Inviter un lecteur</h2>
                <form
                    action={inviteUserAction}
                    className="space-y-3 rounded border border-zinc-200 bg-white p-4"
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-xs text-zinc-500">Email du lecteur</span>
                            <input
                                type="email"
                                name="email"
                                required
                                placeholder="lecteur@exemple.com"
                                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-1.5"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs text-zinc-500">Projet</span>
                            <select
                                name="projectSlug"
                                required
                                disabled={rows.length === 0}
                                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-1.5"
                            >
                                {rows.length === 0 ? (
                                    <option>Aucun projet — crée-en un d'abord</option>
                                ) : (
                                    rows.map((p) => (
                                        <option key={p.slug} value={p.slug}>
                                            {p.name} ({p.slug})
                                        </option>
                                    ))
                                )}
                            </select>
                        </label>
                    </div>
                    <button
                        type="submit"
                        disabled={rows.length === 0}
                        className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-40"
                    >
                        Inviter
                    </button>
                    <p className="text-xs text-zinc-500">
                        L'utilisateur reçoit un email d'invitation avec le lien <code>/login</code>.
                        Sur cette page, il saisit son email et obtient un magic-link.
                        Si l'envoi d'email échoue (Resend mal configuré, etc.), l'ACL reste posée
                        — l'utilisateur peut accéder à <code>/login</code> directement.
                    </p>
                </form>
            </section>

        </main>
    );
}
