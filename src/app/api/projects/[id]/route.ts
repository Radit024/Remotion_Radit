import { NextResponse } from "next/server";
import type { Edit } from "@/shared/edit";
import { guardRead, guardMutation, assertUuid, apiErrorResponse, ApiError } from "@/server/guard";
import { readProject, saveProject } from "@/server/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    guardRead(request);
    const { id } = await context.params;
    assertUuid(id, "id proyek");
    const project = readProject(id);
    return NextResponse.json({ project }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return NextResponse.json(
      { error: { code: "VALIDATION", message: String(error) } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    guardMutation(request);
    const { id } = await context.params;
    assertUuid(id, "id proyek");

    const ifMatch = request.headers.get("if-match");
    const body = (await request.json()) as Edit & { revision?: number };

    let expectedRevision: number;
    if (ifMatch) {
      const parsedMatch = Number(ifMatch.replace(/["']/g, "").trim());
      if (!Number.isFinite(parsedMatch)) {
        throw new ApiError("VALIDATION", "Header If-Match tidak valid");
      }
      expectedRevision = parsedMatch;
    } else if (typeof body.revision === "number" && Number.isFinite(body.revision)) {
      expectedRevision = body.revision;
    } else {
      throw new ApiError("VALIDATION", "Revisi wajib disertakan melalui header If-Match atau bidang revision");
    }

    const saved = await saveProject(id, body, expectedRevision);
    return NextResponse.json(
      { project: saved },
      {
        headers: {
          "Cache-Control": "no-store",
          ETag: `"${saved.revision}"`,
        },
      },
    );
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return NextResponse.json(
      { error: { code: "VALIDATION", message: String(error) } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
