import "server-only";
import { NextResponse } from "next/server";

export interface ErrorBody {
    error: string;
    requestId: string;
    message?: string;
    [key: string]: unknown;
}

export function jsonError(
    status: number,
    requestId: string,
    error: string,
    extra?: Record<string, unknown>,
): NextResponse {
    const body: ErrorBody = { error, requestId, ...extra };
    return NextResponse.json(body, {
        status,
        headers: { "X-Request-Id": requestId },
    });
}

export function jsonOk(
    requestId: string,
    body: Record<string, unknown>,
): NextResponse {
    return NextResponse.json(
        { requestId, ...body },
        { headers: { "X-Request-Id": requestId } },
    );
}

export function newRequestId(): string {
    return crypto.randomUUID();
}
