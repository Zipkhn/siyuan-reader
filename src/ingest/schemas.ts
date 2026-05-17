import "server-only";
import { z } from "zod";

export const PROJECT_SLUG = z.string().regex(/^[a-z0-9-]+$/, "Invalid project slug");
export const DOC_SLUG = z.string().regex(/^[a-z0-9-]+$/, "Invalid doc slug");
export const SIYUAN_DOC_ID = z
    .string()
    .regex(/^[0-9]{14}-[a-z0-9]{7}$/, "Invalid Siyuan doc id");
export const SHA256_HEX = z.string().regex(/^[a-f0-9]{64}$/, "Invalid sha256 (lowercase hex)");
export const ISO_DATE = z.string().datetime({ offset: true });

// Asset reference inside a doc payload (no bytes here — only metadata).
// .strict() refuses extra fields like the obsolete `stored_path`.
export const AssetRef = z
    .object({
        original_path: z.string().min(1),
        sha256: SHA256_HEX,
        mime: z.string().min(1).max(100),
        size_bytes: z.number().int().nonnegative(),
    })
    .strict();

export const OutboundRef = z
    .object({
        target_doc_id: SIYUAN_DOC_ID,
        target_block_id: z.string().nullable(),
        anchor_text: z.string(),
    })
    .strict();

// SnapshotBlock is a discriminated union with many variants; we don't re-validate
// every block shape here (the extractor already produces valid output, and over-
// validating would couple the reader to every block-coverage change). We accept
// any object with at least { id, type } and pass it through.
export const SnapshotBlock = z
    .object({
        id: z.string(),
        type: z.string(),
    })
    .passthrough();

export const SnapshotDoc = z
    .object({
        id: SIYUAN_DOC_ID,
        project: PROJECT_SLUG,
        slug: DOC_SLUG,
        title: z.string().min(1),
        excerpt: z.string(),
        version: z.number().int().nonnegative(),
        published_at: ISO_DATE,
        updated_at: ISO_DATE,
    })
    .strict();

export const IngestDocPayload = z
    .object({
        schema: z.literal("siyuan-snapshot/v1"),
        doc: SnapshotDoc,
        content: z
            .object({
                blocks: z.array(SnapshotBlock),
            })
            .strict(),
        content_hash: z.string().regex(/^[a-f0-9]{64}$/, "content_hash must be sha256 hex"),
        assets: z.array(AssetRef),
        outbound_refs: z.array(OutboundRef),
        search_text: z.string(),
        html: z.string().nullable(),
        // Optional V1.x extension: the name of the Siyuan notebook this doc
        // belongs to. Used by the reader UI to group docs by notebook.
        // Older extractor payloads omit it; reader falls back to ungrouped.
        notebook_name: z.string().optional(),
    })
    .strict();
export type IngestDocPayload = z.infer<typeof IngestDocPayload>;

export const IngestUnpublishPayload = z
    .object({
        project: PROJECT_SLUG,
        docId: SIYUAN_DOC_ID,
    })
    .strict();
export type IngestUnpublishPayload = z.infer<typeof IngestUnpublishPayload>;

export const IngestAssetQuery = z
    .object({
        project: PROJECT_SLUG,
        sha256: SHA256_HEX,
        mime: z.string().min(1).max(100),
    })
    .strict();
export type IngestAssetQuery = z.infer<typeof IngestAssetQuery>;

export const AssetHeadQuery = z
    .object({
        project: PROJECT_SLUG,
    })
    .strict();

export const ASSET_MAX_BYTES = 4 * 1024 * 1024;
