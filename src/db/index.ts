import "server-only";
import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "@/env";
import * as schema from "./schema";

mkdirSync(dirname(env.DATABASE_URL), { recursive: true });

const sqlite = new Database(env.DATABASE_URL);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// FTS5 virtual table for document search. Not modelled in Drizzle since it's
// not a standard table. Drizzle migrations don't manage it — we ensure it
// exists on every boot. Contentless mode: no data duplication, full-text only.
sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        document_id UNINDEXED,
        title,
        excerpt,
        search_text,
        tokenize = 'unicode61 remove_diacritics 2'
    );
`);

export const db = drizzle(sqlite, { schema });
export { schema, sqlite };
