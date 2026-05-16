import "server-only";
import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "./index";

const { projects, documents, userProjects, users } = schema;

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
