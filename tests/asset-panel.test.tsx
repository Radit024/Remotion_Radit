// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetPanel } from "../src/web/editor/AssetPanel";
import { fetchAssets, uploadAsset } from "../src/web/api";
import type { Asset, Effect } from "../src/shared/edit";

vi.mock("../src/web/api", () => ({ uploadAsset: vi.fn(), fetchAssets: vi.fn() }));
const sticker: Asset = { id: "sticker", kind: "image", name: "Kucing.png", durationFrames: 999, width: 800, height: 800, hasAudio: false, previewReady: true };
const sfx: Asset = { ...sticker, id: "sfx", kind: "audio", name: "Bruh.wav", durationFrames: 120, hasAudio: true };
const reaction: Asset = { ...sticker, id: "reaction", name: "Reaksi: Terkejut" };
const props = { assets: [sticker, sfx, reaction], effects: [], onChangeEffects: vi.fn(), momentFrame: 2952, endFrame: 3300, durationFrames: 7560 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: true });
    fireEvent.pause(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    fireEvent.play(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("parent-owned asset catalog", () => {
  it("does not fetch its own list; renders local thumbnails and searchable categories", () => {
    render(<AssetPanel {...props} />);
    expect(fetchAssets).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Pratinjau Kucing.png" })).toHaveAttribute("src", "/api/assets/sticker/content");
    fireEvent.click(screen.getByRole("tab", { name: "Reaksi" }));
    expect(screen.getByRole("tab", { name: "Reaksi" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Pasang Reaksi: Terkejut" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pasang Kucing.png" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Semua" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Cari aset" }), { target: { value: "bruh" } });
    expect(screen.getByRole("button", { name: "Pasang Bruh.wav" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pasang Kucing.png" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Cari aset" }), { target: { value: "not found" } });
    expect(screen.getByText(/Tidak ada aset yang cocok/)).toBeInTheDocument();
  });

  it("category tabs support keyboard arrows, Home/End and selected states", async () => {
    render(<AssetPanel {...props} />);
    const user = userEvent.setup();
    act(() => screen.getByRole("tab", { name: "Semua" }).focus());
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Stiker" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tab", { name: "Stiker" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}{Enter}");
    expect(screen.getByRole("tab", { name: "Reaksi" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}{Enter}");
    expect(screen.getByRole("tab", { name: "Semua" })).toHaveAttribute("aria-selected", "true");
  });

  it("distinguishes loading, empty and failed catalogs and delegates retry", () => {
    const retry = vi.fn();
    const { rerender } = render(<AssetPanel {...props} assets={[]} isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Memuat katalog aset");
    expect(screen.queryByText(/Belum ada stiker/)).not.toBeInTheDocument();
    rerender(<AssetPanel {...props} assets={[]} error="Offline" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Offline");
    fireEvent.click(screen.getByRole("button", { name: "Coba Muat Ulang Aset" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<AssetPanel {...props} assets={[]} />);
    expect(screen.getByText(/Belum ada stiker atau SFX/)).toBeInTheDocument();
  });

  it("shows a visible named fallback for a broken thumbnail", () => {
    render(<AssetPanel {...props} />);
    fireEvent.error(screen.getByRole("img", { name: "Pratinjau Kucing.png" }));
    expect(screen.getByRole("status")).toHaveTextContent("Pratinjau gambar tidak tersedia: Kucing.png");
    expect(screen.getByRole("button", { name: "Pasang Kucing.png" })).toBeInTheDocument();
  });
});

describe("asset installation is draft-only and bounded", () => {
  it("uses 45 frames for images, not image metadata", () => {
    const change = vi.fn();
    render(<AssetPanel {...props} onChangeEffects={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Pasang Kucing.png" }));
    expect(change).toHaveBeenCalledWith([expect.objectContaining({ kind: "image", assetId: "sticker", startFrame: 2952, endFrame: 2997 })]);
  });

  it("uses audio duration metadata and clips at the selected end and full source duration", () => {
    const change = vi.fn();
    const { rerender } = render(<AssetPanel {...props} endFrame={3000} onChangeEffects={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Pasang Bruh.wav" }));
    expect(change).toHaveBeenLastCalledWith([expect.objectContaining({ kind: "sfx", startFrame: 2952, endFrame: 3000 })]);
    rerender(<AssetPanel {...props} durationFrames={2980} onChangeEffects={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Pasang Bruh.wav" }));
    expect(change).toHaveBeenLastCalledWith([expect.objectContaining({ endFrame: 2980 })]);
  });

  it("rejects no-room placement and missing audio duration rather than creating invalid effects", () => {
    const change = vi.fn();
    const { rerender } = render(<AssetPanel {...props} momentFrame={3300} onChangeEffects={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Pasang Kucing.png" }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Tidak ada ruang untuk efek");
    rerender(<AssetPanel {...props} assets={[{ ...sfx, durationFrames: 0 }]} onChangeEffects={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Pasang Bruh.wav" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Durasi SFX Bruh.wav belum tersedia");
    expect(change).not.toHaveBeenCalled();
  });

  it("shows installed names and timing and removes only draft effects, not physical assets", () => {
    const change = vi.fn();
    const effects: Effect[] = [{ id: "installed", kind: "image", startFrame: 2952, endFrame: 2997, text: "", assetId: "sticker", strength: 1 }];
    render(<AssetPanel {...props} effects={effects} onChangeEffects={change} />);
    expect(screen.getByText("Awal 01:38.40 · Akhir 01:39.90")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hapus efek Kucing.png 1" }));
    expect(change).toHaveBeenCalledWith([]);
    expect(uploadAsset).not.toHaveBeenCalled();
    expect(fetchAssets).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pasang Kucing.png" })).toBeInTheDocument();
  });
});

describe("uploads and SFX preview", () => {
  it("has a keyboard-accessible upload button and guards duplicate pending uploads", async () => {
    let finish!: (asset: Asset) => void;
    vi.mocked(uploadAsset).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const uploaded = vi.fn();
    render(<AssetPanel {...props} onAssetUploaded={uploaded} />);
    const input = screen.getByLabelText("Berkas aset stiker atau SFX");
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    screen.getByRole("button", { name: "Unggah Aset" }).focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(click).toHaveBeenCalledOnce();
    const file = new File(["image"], "new.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole("button", { name: "Mengunggah…" })).toBeDisabled();
    expect(uploadAsset).toHaveBeenCalledOnce();
    finish(sticker);
    await waitFor(() => expect(uploaded).toHaveBeenCalledWith(sticker));
    expect(screen.getByRole("button", { name: "Unggah Aset" })).toBeEnabled();
    expect(fetchAssets).not.toHaveBeenCalled();
  });

  it("reports upload failure inline and lets the same file be retried", async () => {
    vi.mocked(uploadAsset).mockRejectedValueOnce(new Error("Berkas ditolak")).mockResolvedValueOnce(sticker);
    const uploaded = vi.fn();
    render(<AssetPanel {...props} onAssetUploaded={uploaded} />);
    const input = screen.getByLabelText("Berkas aset stiker atau SFX");
    const file = new File(["image"], "bad.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Berkas ditolak"));
    expect(input).toHaveValue("");
    expect(uploaded).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(uploaded).toHaveBeenCalledWith(sticker));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("provides named SFX playback controls with inline rejection recovery", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("Autoplay blocked"));
    const { container } = render(<AssetPanel {...props} />);
    expect(container.querySelector("audio")).toHaveAttribute("src", "/api/assets/sfx/content");
    fireEvent.click(screen.getByRole("button", { name: "Dengarkan SFX Bruh.wav" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Autoplay blocked"));
    fireEvent.click(screen.getByRole("button", { name: "Dengarkan SFX Bruh.wav" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Hentikan SFX Bruh.wav" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Hentikan SFX Bruh.wav" }));
    expect(screen.getByRole("button", { name: "Dengarkan SFX Bruh.wav" })).toBeInTheDocument();
  });
});
