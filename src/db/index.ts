import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "@/env";
import * as schema from "./schema";

// In local file mode ("file:..."), libSQL creates the DB file but not its
// parent directory — pre-create it so first boot doesn't fail. Skipped for
// remote URLs (libsql://, http://, https://) where the path isn't a real fs path.
if (env.DATABASE_URL.startsWith("file:")) {
    const fsPath = env.DATABASE_URL.slice("file:".length);
    mkdirSync(dirname(fsPath), { recursive: true });
}

export const client: Client = createClient({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

// FTS5 virtual table for document search. Not modelled in Drizzle since it's
// not a standard table. Lazily created on first use to avoid an extra
// roundtrip on every serverless cold start. Idempotent thanks to IF NOT EXISTS.
let ftsReady: Promise<void> | null = null;
export function ensureFts(): Promise<void> {
    if (!ftsReady) {
        ftsReady = client
            .execute(`
                CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                    document_id UNINDEXED,
                    title,
                    excerpt,
                    search_text,
                    tokenize = 'unicode61 remove_diacritics 2'
                );
            `)
            .then(() => undefined);
    }
    return ftsReady;
}

export { schema };
