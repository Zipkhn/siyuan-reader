import { sqliteTable, text, integer, blob, primaryKey, unique } from "drizzle-orm/sqlite-core";

// --- Auth.js tables (managed by @auth/drizzle-adapter) ---

export const users = sqliteTable("users", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
    image: text("image"),
});

export const accounts = sqliteTable(
    "accounts",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        type: text("type").notNull(),
        provider: text("provider").notNull(),
        providerAccountId: text("provider_account_id").notNull(),
        refresh_token: text("refresh_token"),
        access_token: text("access_token"),
        expires_at: integer("expires_at"),
        token_type: text("token_type"),
        scope: text("scope"),
        id_token: text("id_token"),
        session_state: text("session_state"),
    },
    (account) => ({
        pk: primaryKey({ columns: [account.provider, account.providerAccountId] }),
    }),
);

export const sessions = sqliteTable("sessions", {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
    "verification_tokens",
    {
        identifier: text("identifier").notNull(),
        token: text("token").notNull(),
        expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
    },
    (vt) => ({
        pk: primaryKey({ columns: [vt.identifier, vt.token] }),
    }),
);

// --- Application tables ---

export const projects = sqliteTable("projects", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    // Per-project branding (logo + 4 color tokens + optional display name).
    // NULL or any missing field falls back to the default UI. See
    // src/branding/types.ts for the parsed shape and validation rules.
    branding: text("branding"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .$defaultFn(() => new Date())
        .notNull(),
});

export const documents = sqliteTable(
    "documents",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        projectId: text("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        siyuanId: text("siyuan_id").notNull(),
        slug: text("slug").notNull(),
        title: text("title").notNull(),
        excerpt: text("excerpt"),
        notebookName: text("notebook_name"),
        contentHash: text("content_hash").notNull(),
        snapshotJson: text("snapshot_json").notNull(),
        html: text("html"),
        version: integer("version").notNull(),
        publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    },
    (t) => ({
        uniqProjectSiyuan: unique().on(t.projectId, t.siyuanId),
        uniqProjectSlug: unique().on(t.projectId, t.slug),
    }),
);

export const assets = sqliteTable(
    "assets",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        projectId: text("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        sha256: text("sha256").notNull(),
        mime: text("mime").notNull(),
        sizeBytes: integer("size_bytes").notNull(),
        bytes: blob("bytes", { mode: "buffer" }).notNull(),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .$defaultFn(() => new Date())
            .notNull(),
    },
    (t) => ({
        uniqProjectSha: unique().on(t.projectId, t.sha256),
    }),
);

export const userProjects = sqliteTable(
    "user_projects",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        projectId: text("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        role: text("role").notNull().default("viewer"),
        grantedAt: integer("granted_at", { mode: "timestamp_ms" })
            .$defaultFn(() => new Date())
            .notNull(),
        grantedBy: text("granted_by").references(() => users.id),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.userId, t.projectId] }),
    }),
);
