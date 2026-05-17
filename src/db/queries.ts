import "server-only";
import { and, eq, desc, sql } from "drizzle-orm";
import { db, ensureFts, schema } from "./index";

const { projects, documents, userProjects, users } = schema;

/**
 * Build a safe FTS5 MATCH query from raw user input.
 *  - Trim, split on whitespace
 *  - Cap at 16 terms
 *  - Quote each term to avoid FTS5 operator injection
 *  - Append `*` for prefix match
 * Returns null if the input has no usable terms.
 */
function buildFtsQuery(input: string): string | null {
    const tokens = input
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0)
        .slice(0, 16);
    if (tokens.length === 0) return null;
    return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" ");
}

export async function projectsForUser(userId: string) {
    return db
        .select({
            id: projects.id,
            slug: projects.slug,
            name: projects.name,
            description: projects.description,
            updatedAt: projects.updatedAt,
        })
        .from(userProjects)
        .innerJoin(projects, eq(projects.id, userProjects.projectId))
        .where(eq(userProjects.userId, userId))
        .orderBy(projects.name);
}

export async function documentsForUserInProject(userId: string, projectSlug: string) {
    return db
        .select({
            siyuanId: documents.siyuanId,
            slug: documents.slug,
            title: documents.title,
            excerpt: documents.excerpt,
            publishedAt: documents.publishedAt,
            updatedAt: documents.updatedAt,
        })
        .from(documents)
        .innerJoin(projects, eq(projects.id, documents.projectId))
        .innerJoin(
            userProjects,
            and(eq(userProjects.projectId, projects.id), eq(userProjects.userId, userId)),
        )
        .where(eq(projects.slug, projectSlug))
        .orderBy(desc(documents.updatedAt));
}

export async function documentForUser(userId: string, projectSlug: string, docSlug: string) {
    const rows = await db
        .select({
            doc: documents,
            project: projects,
        })
        .from(documents)
        .innerJoin(projects, eq(projects.id, documents.projectId))
        .innerJoin(
            userProjects,
            and(eq(userProjects.projectId, projects.id), eq(userProjects.userId, userId)),
        )
        .where(and(eq(projects.slug, projectSlug), eq(documents.slug, docSlug)))
        .limit(1);
    return rows[0] ?? null;
}

export async function findUserByEmail(email: string) {
    return db.query.users.findFirst({ where: eq(users.email, email) });
}

export async function findProjectBySlug(slug: string) {
    return db.query.projects.findFirst({ where: eq(projects.slug, slug) });
}

export interface SearchHit {
    siyuanId: string;
    slug: string;
    title: string;
    excerpt: string | null;
    publishedAt: Date;
    updatedAt: Date;
    rank: number;
}

/**
 * Full-text search restricted to documents the user can see in a given project.
 * Returns hits ordered by FTS5 BM25 rank (best match first).
 */
export async function searchDocumentsForUserInProject(
    userId: string,
    projectSlug: string,
    rawQuery: string,
): Promise<SearchHit[]> {
    const ftsQuery = buildFtsQuery(rawQuery);
    if (!ftsQuery) return [];
    await ensureFts();
    const rows = await db.all<{
        siyuan_id: string;
        slug: string;
        title: string;
        excerpt: string | null;
        published_at: number;
        updated_at: number;
        rank: number;
    }>(sql`
        SELECT
            d.siyuan_id     AS siyuan_id,
            d.slug          AS slug,
            d.title         AS title,
            d.excerpt       AS excerpt,
            d.published_at  AS published_at,
            d.updated_at    AS updated_at,
            ft.rank         AS rank
        FROM documents_fts ft
        INNER JOIN documents d  ON d.id = ft.document_id
        INNER JOIN projects  p  ON p.id = d.project_id
        INNER JOIN user_projects up ON up.project_id = p.id AND up.user_id = ${userId}
        WHERE p.slug = ${projectSlug} AND documents_fts MATCH ${ftsQuery}
        ORDER BY rank
        LIMIT 50
    `);
    return rows.map((r) => ({
        siyuanId: r.siyuan_id,
        slug: r.slug,
        title: r.title,
        excerpt: r.excerpt,
        publishedAt: new Date(r.published_at),
        updatedAt: new Date(r.updated_at),
        rank: r.rank,
    }));
}
