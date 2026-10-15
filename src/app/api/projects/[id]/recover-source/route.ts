import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation, assertUuid, apiErrorResponse, ApiError } from "@/server/guard";
import { recoverProjectSource } from "@/server/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const recoverySchema = z.strictObject({
  assetId: z.uuid(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    guardMutation(request);
    const { id } = await context.params;
    assertUuid(id, "id proyek");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("VALIDATION", "Body pemulihan harus berupa JSON yang valid");
    }
    const parsed = recoverySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION", "Body harus berisi hanya assetId UUID dan revision integer positif");
    }
    assertUuid(parsed.data.assetId, "assetId");
    const project = await recoverProjectSource(id, parsed.data.assetId, parsed.data.revision);
    return NextResponse.json(
      { project },
      { status: 201, headers: { "Cache-Control": "no-store", ETag: `"${project.revision}"` } },
    );
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return NextResponse.json(
      { error: { code: "DISK_WRITE_FAILED", message: "Gagal membuat salinan proyek; proyek asli tidak diubah" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
