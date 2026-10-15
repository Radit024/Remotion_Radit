import { NextResponse } from "next/server";
import { guardRead, guardMutation, apiErrorResponse, ApiError } from "@/server/guard";
import { importAssetFromRequest, listAssets, materializeEmojiAssets, toPublicAsset } from "@/server/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    guardRead(request);
    await materializeEmojiAssets();
    const assets = listAssets().map(toPublicAsset);
    return NextResponse.json({ assets }, { headers: { "Cache-Control": "no-store" } });
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
    const { asset } = await importAssetFromRequest(request);
    return NextResponse.json(
      { asset: toPublicAsset(asset) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return NextResponse.json(
      { error: { code: "VALIDATION", message: String(error) } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
