import { signIn } from "@/auth/config";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error } = await searchParams;
    return (
        <main className="max-w-md mx-auto py-16 px-4">
            <h1 className="text-2xl font-semibold mb-2">Connexion</h1>
            <p className="text-sm text-zinc-500 mb-6">
                Saisissez l'adresse email avec laquelle vous avez été invité. Un lien de connexion
                vous sera envoyé.
            </p>
            {error && (
                <p className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    Aucune invitation trouvée pour cette adresse, ou le lien a expiré. Contactez
                    l'administrateur.
                </p>
            )}
            <form
                action={async (formData) => {
                    "use server";
                    const email = String(formData.get("email") ?? "");
                    await signIn("resend", { email, redirectTo: "/" });
                }}
                className="space-y-3"
            >
                <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    placeholder="adresse@email.com"
                    className="block w-full rounded border border-zinc-300 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                />
                <button
                    type="submit"
                    className="w-full rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700"
                >
                    Recevoir le lien de connexion
                </button>
            </form>
        </main>
    );
}
