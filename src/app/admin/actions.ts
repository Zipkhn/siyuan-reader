"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth/guards";
import { db } from "@/db";
import { projects, userProjects, users } from "@/db/schema";
import { findProjectBySlug, findUserByEmail } from "@/db/queries";
import {
    clearBrandingById,
    patchBrandingById,
    setBrandingById,
} from "@/branding/queries";
import { parseBranding } from "@/branding/types";
import {
    deleteProjectLogos,
    MAX_LOGO_BYTES,
    writeProjectLogo,
} from "@/branding/storage";

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

// ---- Branding actions ----

const hexOrEmpty = z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s === "" || /^#[0-9a-fA-F]{6}$/.test(s), {
        message: "Format attendu: #RRGGBB ou vide",
    });

const brandingFormSchema = z.object({
    projectId: z.string().min(1),
    display_name: z.string().max(80).optional(),
    primary: hexOrEmpty.optional(),
    accent: hexOrEmpty.optional(),
    bg: hexOrEmpty.optional(),
    text: hexOrEmpty.optional(),
});

export async function setBrandingAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const parsed = brandingFormSchema.safeParse({
        projectId: formData.get("projectId"),
        display_name: (formData.get("display_name") as string | null) ?? undefined,
        primary: (formData.get("primary") as string | null) ?? undefined,
        accent: (formData.get("accent") as string | null) ?? undefined,
        bg: (formData.get("bg") as string | null) ?? undefined,
        text: (formData.get("text") as string | null) ?? undefined,
    });
    if (!parsed.success) {
        back(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), true);
    }
    // Empty string = "don't set this field". This lets the admin form leave
    // individual tokens blank without erasing the whole row.
    const branding = {
        ...(parsed.data.display_name && parsed.data.display_name.length > 0
            ? { display_name: parsed.data.display_name }
            : {}),
        ...(parsed.data.primary ? { primary: parsed.data.primary } : {}),
        ...(parsed.data.accent ? { accent: parsed.data.accent } : {}),
        ...(parsed.data.bg ? { bg: parsed.data.bg } : {}),
        ...(parsed.data.text ? { text: parsed.data.text } : {}),
    };

    // Preserve the existing logo_path if set — the colors form doesn't touch
    // the logo, only the dedicated upload form does.
    const existingRow = await db
        .select({ branding: projects.branding })
        .from(projects)
        .where(eq(projects.id, parsed.data.projectId))
        .limit(1);
    const existing = existingRow[0] ? parseBranding(existingRow[0].branding) : null;
    if (existing?.logo_path) {
        (branding as { logo_path?: string }).logo_path = existing.logo_path;
    }

    try {
        await setBrandingById(parsed.data.projectId, branding);
    } catch (e) {
        back(e instanceof Error ? e.message : "branding write failed", true);
    }
    revalidatePath("/admin");
    revalidatePath("/", "layout"); // bust the project layout cache
    back("Branding mis à jour.");
}

export async function uploadLogoAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const projectId = String(formData.get("projectId") ?? "");
    if (!projectId) back("projectId manquant", true);
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
        back("aucun fichier sélectionné", true);
    }
    const f = file as File;
    if (f.size > MAX_LOGO_BYTES) {
        back(`Logo trop volumineux (${f.size} octets, max ${MAX_LOGO_BYTES})`, true);
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    let logoPath: string;
    try {
        logoPath = await writeProjectLogo(projectId, { bytes, mime: f.type });
    } catch (e) {
        back(e instanceof Error ? e.message : "upload failed", true);
    }
    await patchBrandingById(projectId, { logo_path: logoPath });
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    back("Logo uploadé.");
}

export async function clearBrandingAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const projectId = String(formData.get("projectId") ?? "");
    if (!projectId) back("projectId manquant", true);
    await clearBrandingById(projectId);
    await deleteProjectLogos(projectId);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    back("Branding réinitialisé au défaut.");
}

