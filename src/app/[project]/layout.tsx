import { findProjectBySlug } from "@/db/queries";
import { brandingStyle, parseBranding } from "@/branding/types";

/**
 * Per-project layout. Injects branding CSS variables on a wrapper so the
 * `[project]/page` and `[project]/[doc]/page` trees can theme themselves
 * via `var(--brand-*)`. Each CSS rule that consumes a brand var carries
 * its own fallback (`var(--brand-primary, #2563eb)` etc.) — so a project
 * with no branding renders identically to before, and partial branding
 * only overrides the fields that are set.
 */
export default async function ProjectLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ project: string }>;
}) {
    const { project: slug } = await params;
    const project = await findProjectBySlug(slug);
    const branding = project?.branding ? parseBranding(project.branding) : null;
    const isBranded =
        !!branding && (!!branding.primary || !!branding.accent || !!branding.bg || !!branding.text);
    return (
        <div
            data-project={slug}
            data-branded={isBranded ? "true" : "false"}
            style={brandingStyle(branding)}
        >
            {children}
        </div>
    );
}
