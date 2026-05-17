import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Verify the Bearer token in an incoming Authorization header against
 * env.INGEST_SECRET. Constant-time comparison.
 */
export function verifyBearer(authorizationHeader: string | null): boolean {
    if (!authorizationHeader) return false;
    const prefix = "Bearer ";
    if (!authorizationHeader.startsWith(prefix)) return false;
    const got = authorizationHeader.slice(prefix.length);
    const expected = env.INGEST_SECRET;
    if (got.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
