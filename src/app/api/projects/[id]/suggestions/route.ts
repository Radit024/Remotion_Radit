import { NextResponse } from "next/server";
import { guardMutation, assertUuid, apiErrorResponse, ApiError } from "@/server/guard";
import { createJob, publicJob } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    guardMutation(request);
    const { id } = await context.params;
    assertUuid(id, "id proyek");

    const body = (await request.json()) as { revision?: number };
    if (typeof body.revision !== "number" || !Number.isFinite(body.revision)) {
      throw new ApiError("VALIDATION", "revision harus berupa angka");
    }

    const job = createJob({
      kind: "suggestions",
      projectId: id,
      expectedRevision: body.revision,
    });

    return NextResponse.json(
      { job: publicJob(job) },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return NextResponse.json(
      { error: { code: "VALIDATION", message: String(error) } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
