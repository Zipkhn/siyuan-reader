import Link from "next/link";
import { requireUser } from "@/auth/guards";
import { projectsForUser } from "@/db/queries";
import { signOut } from "@/auth/config";

export default async function HomePage() {
    const user = await requireUser();
    const projects = await projectsForUser(user.id);
    return (
        <main className="max-w-2xl mx-auto py-12 px-4">
            <header className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-semibold">Vos espaces</h1>
                <form
                    action={async () => {
                        "use server";
                        await signOut({ redirectTo: "/login" });
                    }}
                >
                    <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-900">
                        Se déconnecter ({user.email})
                    </button>
                </form>
            </header>
            {projects.length === 0 ? (
                <p className="text-zinc-500">
                    Aucun projet ne vous a été partagé. Contactez l'administrateur.
                </p>
            ) : (
                <ul className="space-y-2">
                    {projects.map((p) => (
                        <li key={p.id}>
                            <Link
                                href={`/${p.slug}`}
                                className="block rounded border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400"
                            >
                                <span className="block font-medium">{p.name}</span>
                                {p.description && (
                                    <p className="text-sm text-zinc-500 mt-1">{p.description}</p>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
