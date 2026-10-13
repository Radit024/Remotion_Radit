import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { dirs } from "@/server/env";
import { guardRead, assertUuid, apiErrorResponse, ApiError } from "@/server/guard";
import { safeFileNameForDownload } from "@/server/storage";
import { getAsset } from "@/server/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    guardRead(request);
    const { id } = await context.params;
    assertUuid(id, "id output");

    const filePath = path.join(dirs().outputs, `${id}.mp4`);
    if (!fs.existsSync(filePath)) {
      throw new ApiError("NOT_FOUND", `Berkas output ${id} tidak ditemukan`);
    }

    const stat = fs.statSync(filePath);
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    const safeName = safeFileNameForDownload(`takefield-studio-${id.slice(0, 8)}`);

    return new Response(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return new Response(
      JSON.stringify({ error: { code: "VALIDATION", message: String(error) } }),
      { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  }
}
