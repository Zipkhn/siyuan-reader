import { z } from "zod";

/**
 * Per-project branding. Every field is optional and falls back to the
 * default theme independently — a project can override just `primary` and
 * keep the rest neutral. NULL or empty JSON means "fully default UI".
 *
 * Color tokens are strict 6-digit hex (`#RRGGBB`) to avoid CSS injection
 * via free-form values like `rgba(0,0,0,1); }` etc.
 */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const hexColor = z
    .string()
    .regex(HEX_COLOR_RE, "Must be a hex color like #2563eb");

const LOGO_PATH_RE = /^branding\/[a-zA-Z0-9-]+\/logo\.(png|svg|webp)$/;

export const brandingSchema = z
    .object({
        /** Optional override of `projects.name` displayed in the reader header. */
        display_name: z.string().min(1).max(80).optional(),
        /** Path relative to the reader-db volume root. Set by the upload action. */
        logo_path: z.string().regex(LOGO_PATH_RE).optional(),
        primary: hexColor.optional(),
        accent: hexColor.optional(),
        bg: hexColor.optional(),
        text: hexColor.optional(),
    })
    .strict();

export type Branding = z.infer<typeof brandingSchema>;

/**
 * Parse the raw JSON column from the DB. Bad/missing data falls back to
 * "no branding" so a corrupted row never breaks the project page.
 */
export function parseBranding(raw: string | null | undefined): Branding | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        const result = brandingSchema.safeParse(parsed);
        return result.success ? result.data : null;
    } catch {
        return null;
    }
}

/**
 * Build the inline style for the project layout wrapper. Only writes CSS
 * variables for fields explicitly set on the branding row — missing fields
 * leave the var unset, which lets each CSS rule fall back to its own
 * default (`var(--brand-primary, #2563eb)` for links etc.). Also applies
 * `background` and `color` directly when bg/text are set, so those tokens
 * take effect on the wrapper without each consumer having to repeat the
 * fallback. This keeps the UI byte-equivalent for projects with no
 * branding (the wrapper has no inline style at all).
 */
export function brandingStyle(branding: Branding | null): React.CSSProperties {
    if (!branding) return {};
    const style: Record<string, string> = {};
    if (branding.primary) style["--brand-primary"] = branding.primary;
    if (branding.accent) style["--brand-accent"] = branding.accent;
    if (branding.bg) {
        style["--brand-bg"] = branding.bg;
        style.background = branding.bg;
        style.minHeight = "100vh";
    }
    if (branding.text) {
        style["--brand-text"] = branding.text;
        style.color = branding.text;
    }
    return style as React.CSSProperties;
}
