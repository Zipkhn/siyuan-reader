import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { brandingSchema, parseBranding, type Branding } from "./types.js";

/** Read the branding column for a project slug. Returns null if absent. */
export async function getBrandingBySlug(slug: string): Promise<Branding | null> {
    const row = await db
        .select({ branding: projects.branding })
        .from(projects)
        .where(eq(projects.slug, slug))
        .limit(1);
    return row[0] ? parseBranding(row[0].branding) : null;
}

/**
 * Replace the branding for a project. The input is fully validated against
 * `brandingSchema` before being JSON-serialized into the column — any
 * invalid field aborts the write.
 */
export async function setBrandingById(
    projectId: string,
    branding: Branding,
): Promise<void> {
    const validated = brandingSchema.parse(branding);
    await db
        .update(projects)
        .set({ branding: JSON.stringify(validated), updatedAt: new Date() })
        .where(eq(projects.id, projectId));
}

/** Drop the branding entirely — the project reverts to the default theme. */
export async function clearBrandingById(projectId: string): Promise<void> {
    await db
        .update(projects)
        .set({ branding: null, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
}

/**
 * Read+merge: convenience for the project layout. Returns current branding
 * patched with the new partial fields (preserving the others). Useful when
 * the admin form only edits a subset.
 */
export async function patchBrandingById(
    projectId: string,
    patch: Partial<Branding>,
): Promise<void> {
    const row = await db
        .select({ branding: projects.branding })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
    const current = row[0] ? parseBranding(row[0].branding) ?? {} : {};
    const merged = { ...current, ...patch };
    await setBrandingById(projectId, merged);
}
