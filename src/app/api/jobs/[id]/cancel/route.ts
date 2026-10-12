import { NextResponse } from "next/server";
import { guardMutation, assertUuid, apiErrorResponse, ApiError } from "@/server/guard";
import { requestCancel, publicJob } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    guardMutation(request);
    const { id } = await context.params;
    assertUuid(id, "id job");

    const job = await requestCancel(id);
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
