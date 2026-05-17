import { z } from "zod";

const schema = z.object({
    DATABASE_URL: z.string().min(1).default("./data/reader.db"),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)"),
    AUTH_URL: z.string().url().optional(),
    AUTH_TRUST_HOST: z.string().optional(),
    RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
    AUTH_EMAIL_FROM: z.string().email("AUTH_EMAIL_FROM must be a valid email"),
    SNAPSHOTS_DIR: z.string().min(1).default("/data/snapshots"),
    ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be a valid email"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    const issues = parsed.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
    console.error(`Invalid environment variables:\n${issues}`);
    throw new Error(`Environment validation failed:\n${issues}`);
}

export const env = parsed.data;
