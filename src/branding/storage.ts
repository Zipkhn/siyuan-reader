import { dirname, join, resolve } from "node:path";
import { mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { env } from "@/env";

/**
 * Logos live alongside the reader DB (same volume) so they're already
 * covered by `reader-db.tar.gz` in the backup pipeline. Layout:
 *
 *   <DATABASE_URL dir>/
 *     reader.db
 *     branding/
 *       <projectId>/
 *         logo.<ext>
 *
 * The DATABASE_URL env var is the path to the SQLite file — we take its
 * dirname as the volume root.
 */
function brandingRoot(): string {
    return join(dirname(env.DATABASE_URL), "branding");
}

const ALLOWED_MIME: Record<string, "png" | "svg" | "webp"> = {
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
};

export const MAX_LOGO_BYTES = 256 * 1024;

/**
 * Validate + write a logo to disk. Returns the relative `logo_path` to
 * store in `projects.branding.logo_path`. Removes any previously stored
 * logo for this project (other extensions) to keep one logo per project.
 *
 * Throws on invalid mime, oversized file, or any IO failure. The caller is
 * responsible for the auth check.
 */
export async function writeProjectLogo(
    projectId: string,
    file: { bytes: Uint8Array; mime: string },
): Promise<string> {
    const ext = ALLOWED_MIME[file.mime];
    if (!ext) {
        throw new Error(
            `Logo type non supporté: ${file.mime}. PNG, SVG ou WebP uniquement.`,
        );
    }
    if (file.bytes.byteLength > MAX_LOGO_BYTES) {
        throw new Error(
            `Logo trop volumineux (${file.bytes.byteLength} octets, max ${MAX_LOGO_BYTES}).`,
        );
    }
    if (!/^[a-zA-Z0-9-]+$/.test(projectId)) {
        // Defense-in-depth: project IDs are UUIDs, but reject anything that
        // could traverse the filesystem.
        throw new Error("projectId invalide");
    }
    const dir = join(brandingRoot(), projectId);
    await mkdir(dir, { recursive: true });
    // Drop any existing logo with a different extension.
    const existing = await readdir(dir).catch(() => [] as string[]);
    for (const name of existing) {
        if (name.startsWith("logo.") && name !== `logo.${ext}`) {
            await unlink(join(dir, name)).catch(() => undefined);
        }
    }
    const dest = join(dir, `logo.${ext}`);
    await writeFile(dest, file.bytes);
    return `branding/${projectId}/logo.${ext}`;
}

/**
 * Read a stored logo by its `logo_path` (the relative path stored in the
 * branding column). Returns null if the file is missing or if the resolved
 * path escapes the branding root.
 */
export async function readProjectLogo(
    logoPath: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
    const root = brandingRoot();
    const absolute = resolve(dirname(env.DATABASE_URL), logoPath);
    if (!absolute.startsWith(root + "/")) {
        // Path traversal attempt.
        return null;
    }
    const ext = absolute.split(".").pop() ?? "";
    const mime =
        ext === "png" ? "image/png" :
        ext === "svg" ? "image/svg+xml" :
        ext === "webp" ? "image/webp" :
        null;
    if (!mime) return null;
    try {
        const bytes = await readFile(absolute);
        return { bytes, mime };
    } catch {
        return null;
    }
}

/** Delete a project's branding directory entirely (used on clearBranding). */
export async function deleteProjectLogos(projectId: string): Promise<void> {
    if (!/^[a-zA-Z0-9-]+$/.test(projectId)) return;
    const dir = join(brandingRoot(), projectId);
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
        await unlink(join(dir, name)).catch(() => undefined);
    }
}
