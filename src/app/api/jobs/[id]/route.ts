import { NextResponse } from "next/server";
import { guardRead, assertUuid, apiErrorResponse, ApiError } from "@/server/guard";
import { requireJob, publicJob } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    guardRead(request);
    const { id } = await context.params;
    assertUuid(id, "id job");

    const job = requireJob(id);
    return NextResponse.json(
      { job: publicJob(job) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return NextResponse.json(
      { error: { code: "VALIDATION", message: String(error) } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
