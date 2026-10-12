"use client";

import React, { useState, useEffect } from "react";
import { Upload, Music, Image as ImageIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Asset, Effect } from "@/shared/edit";
import { fetchAssets, uploadAsset } from "@/web/api";

type AssetPanelProps = {
  effects: Effect[];
  onChangeEffects: (effects: Effect[]) => void;
  momentFrame: number;
};

export const AssetPanel: React.FC<AssetPanelProps> = ({
  effects,
  onChangeEffects,
  momentFrame,
}) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    void fetchAssets().then(setAssets).catch(() => {});
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const newAsset = await uploadAsset(file);
      setAssets((prev) => [...prev, newAsset]);
    } catch (err) {
      alert(`Gagal mengunggah aset: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const addEffectWithAsset = (asset: Asset) => {
    const kind: Effect["kind"] = asset.kind === "audio" ? "sfx" : "image";
    const newEffect: Effect = {
      id: `eff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      startFrame: momentFrame,
      endFrame: momentFrame + (asset.durationFrames > 0 ? asset.durationFrames : 45),
      text: "",
      assetId: asset.id,
      strength: 1,
    };
    onChangeEffects([...effects, newEffect]);
  };

  const memeAssets = assets.filter((a) => a.kind === "image" || a.kind === "audio");

  return (
    <div className="flex flex-col gap-3 text-xs text-[#EDF1EE]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[#A9B4B1]">Aset Stiker & SFX</span>
        <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-[#30383c] bg-[#111416] px-3 py-1.5 text-xs text-[#EDF1EE] hover:bg-[#30383c]">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,audio/mp3,audio/wav,audio/m4a"
            className="hidden"
            onChange={handleUpload}
            disabled={isUploading}
          />
          <Upload className="mr-1 h-3.5 w-3.5" />
          {isUploading ? "Mengunggah..." : "Unggah Aset"}
        </label>
      </div>

      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
        {memeAssets.length === 0 ? (
          <div className="rounded border border-dashed border-[#30383c] p-4 text-center text-[#A9B4B1]">
            Belum ada aset gambar atau SFX yang diunggah.
          </div>
        ) : (
          memeAssets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between rounded border border-[#30383c] bg-[#111416] p-2"
            >
              <div className="flex items-center gap-2 truncate">
                {asset.kind === "audio" ? (
                  <Music className="h-4 w-4 shrink-0 text-[#79CDD0]" />
                ) : (
                  <ImageIcon className="h-4 w-4 shrink-0 text-[#FFC879]" />
                )}
                <span className="truncate">{asset.name}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => addEffectWithAsset(asset)}
                className="h-7 text-xs text-[#D4F77C] hover:bg-[#30383c]"
              >
                <Plus className="mr-1 h-3 w-3" /> Pasang
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
