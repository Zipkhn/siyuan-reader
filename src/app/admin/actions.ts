"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth/guards";
import { db } from "@/db";
import { projects, userProjects, users } from "@/db/schema";
import { findProjectBySlug, findUserByEmail } from "@/db/queries";
import { syncAllProjects, syncProject } from "@/admin/sync";

const slugRe = /^[a-z0-9-]+$/;

const projectSchema = z.object({
    slug: z.string().regex(slugRe, "slug = [a-z0-9-]+"),
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
});

const inviteSchema = z.object({
    email: z.string().email(),
    projectSlug: z.string().regex(slugRe),
});

const syncSchema = z.object({
    projectSlug: z.string().regex(slugRe).or(z.literal("")).optional(),
});

function back(message: string, error = false): never {
    const key = error ? "error" : "message";
    redirect(`/admin?${key}=${encodeURIComponent(message)}`);
}

export async function createProjectAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const parsed = projectSchema.safeParse({
        slug: formData.get("slug"),
        name: formData.get("name"),
        description: formData.get("description") || undefined,
    });
    if (!parsed.success) {
        back(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), true);
    }
    try {
        await db.insert(projects).values(parsed.data);
    } catch (e) {
        back(e instanceof Error ? e.message : "insert failed", true);
    }
    revalidatePath("/admin");
    back(`Projet "${parsed.data.slug}" créé.`);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const slug = String(formData.get("slug") ?? "");
    if (!slugRe.test(slug)) back("slug invalide", true);
    const project = await findProjectBySlug(slug);
    if (!project) back("projet introuvable", true);
    await db.delete(projects).where(eq(projects.id, project!.id));
    revalidatePath("/admin");
    back(`Projet "${slug}" supprimé (et tous les accès / documents associés).`);
}

export async function inviteUserAction(formData: FormData): Promise<void> {
    const admin = await requireAdmin();
    const parsed = inviteSchema.safeParse({
        email: formData.get("email"),
        projectSlug: formData.get("projectSlug"),
    });
    if (!parsed.success) {
        back(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), true);
    }
    const project = await findProjectBySlug(parsed.data.projectSlug);
    if (!project) back(`projet "${parsed.data.projectSlug}" introuvable`, true);
    let user = await findUserByEmail(parsed.data.email);
    if (!user) {
        const created = await db.insert(users).values({ email: parsed.data.email }).returning();
        user = created[0];
    }
    await db
        .insert(userProjects)
        .values({ userId: user.id, projectId: project!.id, grantedBy: admin.id })
        .onConflictDoNothing();
    revalidatePath("/admin");
    back(`${parsed.data.email} invité sur "${parsed.data.projectSlug}".`);
}

export async function revokeAccessAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const projectId = String(formData.get("projectId") ?? "");
    if (!userId || !projectId) back("paramètres manquants", true);
    await db
        .delete(userProjects)
        .where(and(eq(userProjects.userId, userId), eq(userProjects.projectId, projectId)));
    revalidatePath("/admin");
    back("Accès retiré.");
}

export async function syncAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const parsed = syncSchema.safeParse({ projectSlug: formData.get("projectSlug") || undefined });
    if (!parsed.success) {
        back("paramètres invalides", true);
    }
    // Compute the message INSIDE try/catch, redirect OUTSIDE — redirect()
    // throws a NEXT_REDIRECT signal that must propagate to Next.js, not be
    // swallowed by our catch.
    let message: string;
    let isError = false;
    try {
        if (parsed.data.projectSlug) {
            const result = await syncProject(parsed.data.projectSlug);
            message = `Sync ${result.project} — inséré:${result.inserted} mis à jour:${result.updated} supprimé:${result.removed} ré-indexé:${result.skipped}`;
        } else {
            const out = await syncAllProjects();
            const summary = out.results
                .map((r) => `${r.project}(+${r.inserted}/~${r.updated}/-${r.removed}/idx${r.skipped})`)
                .join(" ");
            const orphans = out.fsOnlyProjects.length
                ? ` | snapshots sans projet DB : ${out.fsOnlyProjects.join(", ")}`
                : "";
            message = `Sync global — ${summary || "(rien)"}${orphans}`;
        }
    } catch (e) {
        message = e instanceof Error ? e.message : "sync failed";
        isError = true;
    }
    revalidatePath("/admin");
    back(message, isError);
}
