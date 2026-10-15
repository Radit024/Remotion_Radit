import { NextResponse } from "next/server";
import { aiConfig, ensureDataDirs } from "@/server/env";
import { guardRead, apiErrorResponse, ApiError } from "@/server/guard";
import { runTool } from "@/server/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    guardRead(request);
    ensureDataDirs();

    let ffmpegOk = false;
    try {
      await runTool("ffmpeg", ["-version"], { timeoutMs: 3000 });
      ffmpegOk = true;
    } catch {
      ffmpegOk = false;
    }

    const ai = aiConfig();

    return NextResponse.json(
      {
        status: "ok",
        ffmpeg: ffmpegOk,
        ai: {
          enabled: ai.enabled,
          configured: Object.values(ai.capabilities).every(
            (capability) => capability.enabled && capability.credentialPresent && capability.modelConfigured && capability.issues.length === 0,
          ),
          capabilities: ai.capabilities,
          suggestionModel: ai.suggestionModel,
          transcriptionModel: ai.transcriptionModel,
          sttProvider: ai.sttProvider,
          issues: ai.issues,
        },
      },
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
