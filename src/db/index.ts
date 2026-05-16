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

export const db = drizzle(sqlite, { schema });
export { schema };
