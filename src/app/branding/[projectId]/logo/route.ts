import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { parseBranding } from "@/branding/types";
import { readProjectLogo } from "@/branding/storage";

/**
 * Serve a project's branded logo. Public route (logos aren't sensitive).
 * Returns 404 if the project has no logo configured or if the file is
 * missing. Caches for 5 minutes — quick enough that a logo swap shows up
 * fast in dev but cuts the rebuild traffic on busy pages.
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ projectId: string }> },
) {
    const { projectId } = await params;
    if (!/^[a-zA-Z0-9-]+$/.test(projectId)) {
        return new NextResponse("invalid project id", { status: 400 });
    }
    const row = await db
        .select({ branding: projects.branding })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
    const branding = row[0] ? parseBranding(row[0].branding) : null;
    if (!branding?.logo_path) {
        return new NextResponse("no logo", { status: 404 });
    }
    const file = await readProjectLogo(branding.logo_path);
    if (!file) {
        return new NextResponse("logo missing on disk", { status: 404 });
    }
    return new NextResponse(new Uint8Array(file.bytes), {
        status: 200,
        headers: {
            "Content-Type": file.mime,
            "Cache-Control": "public, max-age=300",
        },
    });
}
