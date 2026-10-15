"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload, faMusic, faPlus, faTrashCan, faPlay, faPause } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Asset, Effect } from "@/shared/edit";
import { LIMITS, formatTimecode } from "@/shared/edit";
import { uploadAsset } from "@/web/api";

type AssetPanelProps = {
  assets: Asset[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onAssetUploaded?: (asset: Asset) => void;
  effects: Effect[];
  onChangeEffects: (effects: Effect[]) => void;
  momentFrame: number;
  endFrame: number;
  durationFrames: number;
};

type Category = "all" | "image" | "sfx" | "reaction";
const categories: { value: Category; label: string }[] = [
  { value: "all", label: "Semua" }, { value: "image", label: "Stiker" }, { value: "sfx", label: "SFX" }, { value: "reaction", label: "Reaksi" },
];
const contentUrl = (asset: Asset) => `/api/assets/${encodeURIComponent(asset.id)}/content`;
const categoryOf = (asset: Asset): Category => asset.name.startsWith("Reaksi: ") ? "reaction" : asset.kind === "audio" ? "sfx" : "image";

export const AssetPanel: React.FC<AssetPanelProps> = ({
  assets, isLoading = false, error = null, onRetry, onAssetUploaded, effects, onChangeEffects, momentFrame, endFrame, durationFrames,
}) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadPending = useRef(false);
  const live = useRef(true);
  const uploadCallback = useRef(onAssetUploaded);
  useEffect(() => { uploadCallback.current = onAssetUploaded; }, [onAssetUploaded]);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || uploadPending.current) return;
    uploadPending.current = true;
    setIsUploading(true);
    setUploadError(null);
    setUploadedName(null);
    try {
      const asset = await uploadAsset(file);
      // The parent owns the catalog, even if the user switches tool tabs mid-upload.
      uploadCallback.current?.(asset);
      if (live.current) setUploadedName(asset.name);
    } catch (error) {
      if (live.current) setUploadError(`Gagal mengunggah aset: ${error instanceof Error ? error.message : String(error)}. Pilih berkas lagi untuk mencoba ulang.`);
    } finally {
      uploadPending.current = false;
      if (live.current) setIsUploading(false);
      input.value = "";
    }
  };
  const addEffectWithAsset = (asset: Asset) => {
    const limit = Math.min(endFrame, durationFrames);
    const length = asset.kind === "audio" ? asset.durationFrames : 45;
    if (!Number.isSafeInteger(momentFrame) || momentFrame < 0 || !Number.isSafeInteger(limit) || momentFrame >= limit) {
      setInstallError("Tidak ada ruang untuk efek setelah titik lucu. Geser momen sebelum akhir rentang dan durasi sumber.");
      return;
    }
    if (!Number.isSafeInteger(length) || length <= 0) {
      setInstallError(`Durasi SFX ${asset.name} belum tersedia. Muat ulang katalog atau unggah ulang audio.`);
      return;
    }
    if (effects.length >= LIMITS.effectsMax) {
      setInstallError(`Maksimum ${LIMITS.effectsMax} efek. Hapus satu efek dari draft sebelum memasang aset baru.`);
      return;
    }
    setInstallError(null);
    onChangeEffects([...effects, {
      id: `eff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: asset.kind === "audio" ? "sfx" : "image", startFrame: momentFrame,
      endFrame: Math.min(limit, momentFrame + length), text: "", assetId: asset.id, strength: 1,
    }]);
  };
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const catalog = assets.filter((asset) => asset.kind === "image" || asset.kind === "audio");
  const filtered = catalog.filter((asset) => (category === "all" || categoryOf(asset) === category) && asset.name.toLocaleLowerCase().includes(normalizedSearch));
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const effectName = (effect: Effect) => effect.assetId
    ? byId.get(effect.assetId)?.name ?? `Aset tidak tersedia (${effect.assetId})`
    : effect.kind === "reaction" ? `Reaksi: ${effect.text}` : effect.kind === "zoom" ? "Zoom" : "Shake";

  return (
    <section aria-labelledby={`${id}-title`} className="editor-panel flex min-w-0 flex-col gap-3 type-control text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="type-panel-title">Aset Stiker & SFX</h2>
        <input id={`${id}-upload`} ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a" aria-label="Berkas aset stiker atau SFX" className="hidden" onChange={(event) => void handleUpload(event)} disabled={isUploading} />
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={isUploading} aria-controls={`${id}-upload`} className="type-control">
          <FontAwesomeIcon aria-hidden="true" icon={faUpload} /> {isUploading ? "Mengunggah…" : "Unggah Aset"}
        </Button>
      </div>
      {isUploading && <p role="status" className="type-help text-muted-foreground">Mengunggah aset. Tunggu sampai selesai sebelum memilih berkas berikutnya.</p>}
      {uploadedName && <p role="status" className="type-help text-primary">{uploadedName} berhasil diunggah.{!onAssetUploaded ? " Muat ulang katalog untuk melihat aset." : ""}</p>}
      {uploadError && <p role="alert" className="type-help text-rose-400">{uploadError}</p>}
      <label htmlFor={`${id}-search`} className="type-control text-muted-foreground">Cari aset</label>
      <Input id={`${id}-search`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama stiker, reaksi atau SFX" className="h-9 border-border bg-background text-sm" />
      <Tabs value={category} onValueChange={(value) => setCategory(value as Category)} className="min-w-0">
        <TabsList aria-label="Kategori aset" className="grid w-full grid-cols-2 gap-1 group-data-horizontal/tabs:h-auto sm:grid-cols-4">
          {categories.map(({ value, label }) => <TabsTrigger key={value} value={value} className="min-h-9 type-control">{label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value={category} className="min-w-0">
          {isLoading && <p role="status" className="py-2 type-help text-muted-foreground">Memuat katalog aset…</p>}
          {error && <div role="alert" className="flex flex-col gap-2 py-2 type-help text-rose-400"><p>Gagal memuat katalog aset: {error}</p>{onRetry && <Button type="button" size="sm" variant="outline" onClick={onRetry} className="w-fit type-control">Coba Muat Ulang Aset</Button>}</div>}
          <div className="panel-scroll flex max-h-80 flex-col gap-3 pr-1">
            {filtered.length === 0 ? (!isLoading && !error ? <p className="rounded border border-dashed border-border p-4 type-help text-muted-foreground">{catalog.length === 0 ? "Belum ada stiker atau SFX. Unggah aset untuk memulai." : "Tidak ada aset yang cocok. Ubah pencarian atau kategori."}</p> : null) : filtered.map((asset) => <div key={asset.id} className="flex min-w-0 flex-col gap-2 rounded border border-border bg-background p-3">
              <div className="flex min-w-0 items-center gap-3">
                {asset.kind === "image" ? <AssetThumbnail asset={asset} /> : <FontAwesomeIcon aria-hidden="true" icon={faMusic} className="h-6 w-6 shrink-0 text-track-subtitle" />}
                <div className="min-w-0 flex-1"><p className="break-words">{asset.name}</p><p className="type-metadata text-muted-foreground">{categoryOf(asset) === "reaction" ? "Reaksi" : asset.kind === "audio" ? `SFX · ${formatTimecode(asset.durationFrames)}` : "Stiker · default 45 frame"}</p></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {asset.kind === "audio" && <SfxPreview asset={asset} />}
                <Button type="button" size="sm" variant="outline" onClick={() => addEffectWithAsset(asset)} aria-label={`Pasang ${asset.name}`} className="type-control text-primary"><FontAwesomeIcon aria-hidden="true" icon={faPlus} /> Pasang</Button>
              </div>
            </div>)}
          </div>
        </TabsContent>
      </Tabs>
      {installError && <p role="alert" className="type-help text-rose-400">{installError}</p>}
      <h3 className="type-panel-title">Efek terpasang ({effects.length})</h3>
      <p className="type-help text-muted-foreground">Pemasangan dan penghapusan hanya mengubah draft sampai Simpan. Menghapus efek tidak menghapus berkas aset.</p>
      <div className="panel-scroll flex max-h-64 flex-col gap-2 pr-1">
        {effects.length === 0 ? <p className="type-help text-muted-foreground">Belum ada efek terpasang.</p> : effects.map((effect, index) => <div key={effect.id} className="flex min-w-0 items-center justify-between gap-2 rounded border border-border bg-background p-3">
          <div className="min-w-0"><p className="break-words">{effectName(effect)}</p><p className="type-timecode text-muted-foreground">Awal {formatTimecode(effect.startFrame)} · Akhir {formatTimecode(effect.endFrame)}</p></div>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChangeEffects(effects.filter((item) => item.id !== effect.id))} aria-label={`Hapus efek ${effectName(effect)} ${index + 1}`} title="Hapus dari draft" className="shrink-0 text-muted-foreground hover:text-rose-400"><FontAwesomeIcon aria-hidden="true" icon={faTrashCan} /></Button>
        </div>)}
      </div>
    </section>
  );
};

const AssetThumbnail: React.FC<{ asset: Asset }> = ({ asset }) => {
  const [broken, setBroken] = useState(false);
  return broken ? <span role="status" className="max-w-28 break-words type-metadata text-track-moment">Pratinjau gambar tidak tersedia: {asset.name}</span> : (
    // Asset content is a local authenticated API response, not an optimized Next image source.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={contentUrl(asset)} alt={`Pratinjau ${asset.name}`} loading="lazy" onError={() => setBroken(true)} className="h-14 w-14 shrink-0 rounded border border-border object-contain" />
  );
};

const SfxPreview: React.FC<{ asset: Asset }> = ({ asset }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const live = useRef(true);
  const pending = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  useEffect(() => {
    live.current = true;
    const audio = audioRef.current;
    return () => { live.current = false; audio?.pause(); };
  }, []);
  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || pending.current) return;
    if (!audio.paused) { audio.pause(); return; }
    pending.current = true;
    try {
      if (audioError) audio.load();
      setAudioError(null);
      await audio.play();
    } catch (error) {
      if (live.current) setAudioError(`Preview SFX ${asset.name} gagal: ${error instanceof Error ? error.message : String(error)}. Tekan Dengarkan untuk mencoba ulang.`);
    } finally { pending.current = false; }
  };
  return <div className="flex min-w-0 flex-col gap-2">
    <audio ref={audioRef} src={contentUrl(asset)} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); setAudioError(`Preview SFX ${asset.name} tidak tersedia. Periksa berkas audio lalu coba Dengarkan lagi.`); }} />
    <Button type="button" size="sm" variant="ghost" onClick={() => void toggle()} aria-label={`${playing ? "Hentikan" : "Dengarkan"} SFX ${asset.name}`} className="w-fit type-control"><FontAwesomeIcon aria-hidden="true" icon={playing ? faPause : faPlay} /> {playing ? "Hentikan" : "Dengarkan"}</Button>
    {audioError && <p role="alert" className="type-help text-rose-400">{audioError}</p>}
  </div>;
};
