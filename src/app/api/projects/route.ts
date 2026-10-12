import { NextResponse } from "next/server";
import { guardRead, guardMutation, apiErrorResponse, ApiError } from "@/server/guard";
import { createProject, listProjects } from "@/server/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    guardRead(request);
    const projects = listProjects();
    return NextResponse.json({ projects }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return NextResponse.json(
      { error: { code: "VALIDATION", message: String(error) } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  try {
    guardMutation(request);
    const body = (await request.json()) as { assetId?: string; name?: string };
    if (!body || typeof body.assetId !== "string") {
      throw new ApiError("VALIDATION", "assetId harus diisi");
    }
    const project = createProject(body.assetId, body.name);
    return NextResponse.json({ project }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return NextResponse.json(
      { error: { code: "VALIDATION", message: String(error) } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
