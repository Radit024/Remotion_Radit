import fs from "node:fs";
import { guardRead, assertUuid, parseRange, apiErrorResponse, ApiError } from "@/server/guard";
import { requireAsset, readAssetFile, mediaStream } from "@/server/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    guardRead(request);
    const { id } = await context.params;
    assertUuid(id, "id aset");

    const url = new URL(request.url);
    const useProxy = url.searchParams.get("proxy") === "true";
    const asset = requireAsset(id);
    const filePath = readAssetFile(asset, { proxy: useProxy });

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const rangeHeader = request.headers.get("range");

    if (!rangeHeader) {
      const stream = mediaStream(filePath, 0, totalSize - 1);
      return new Response(stream as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": asset.mimeType,
          "Content-Length": String(totalSize),
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }

    const range = parseRange(rangeHeader, totalSize);
    if (!range || range === "invalid") {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${totalSize}`,
          "Cache-Control": "no-store",
        },
      });
    }

    const { start, end } = range;
    const contentLength = end - start + 1;
    const stream = mediaStream(filePath, start, end);

    return new Response(stream as unknown as BodyInit, {
      status: 206,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Content-Length": String(contentLength),
        "Accept-Ranges": "bytes",
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
