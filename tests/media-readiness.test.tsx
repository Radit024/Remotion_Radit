// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SourcePlayer } from "../src/web/editor/SourcePlayer";
import { OutputPreview } from "../src/web/editor/OutputPreview";
import { OutputTimeline } from "../src/web/editor/OutputTimeline";
import { RenderDialog } from "../src/web/editor/RenderDialog";
import { CaptionLayer } from "../src/video/CaptionLayer";
import { AudioLayer } from "../src/video/AudioLayer";
import { EffectLayer } from "../src/video/EffectLayer";
import { compileEdit } from "../src/shared/timeline";
import { loadFonts } from "../src/video/load-fonts";
import { CAPTION_FONT_FAMILY, CAPTION_FONT_STACK } from "../src/shared/typography";
import { Audio, Img, continueRender, delayRender } from "remotion";
import { makeDefaultEdit, type Asset } from "../src/shared/edit";
import { fetchJob, cancelJob, type JobInfo } from "../src/web/api";

const mockVideoFrame = vi.hoisted(() => ({ frame: 1 }));
const mockPlayer = vi.hoisted(() => ({
  frame: 0, mounts: 0, seekTo: vi.fn(), startupError: null as Error | null,
  listeners: new Map<string, Set<(event: { detail: { frame?: number; error?: Error } }) => void>>(),
  inputProps: {} as { assetUrls?: Record<string, string> },
}));
vi.mock("@remotion/player", () => ({
  Player: React.forwardRef(function MockPlayer(props: { inputProps: { assetUrls?: Record<string, string> }; errorFallback?: (info: { error: Error }) => React.ReactNode }, ref) {
    mockPlayer.inputProps = props.inputProps;
    React.useEffect(() => { mockPlayer.frame = 0; mockPlayer.mounts += 1; }, []);
    React.useImperativeHandle(ref, () => ({
      getCurrentFrame: () => mockPlayer.frame,
      seekTo: mockPlayer.seekTo,
      addEventListener: (name: string, listener: (event: { detail: { frame?: number; error?: Error } }) => void) => {
        if (!mockPlayer.listeners.has(name)) mockPlayer.listeners.set(name, new Set());
        mockPlayer.listeners.get(name)!.add(listener);
      },
      removeEventListener: (name: string, listener: (event: { detail: { frame?: number; error?: Error } }) => void) => { mockPlayer.listeners.get(name)?.delete(listener); },
    }), []);
    if (mockPlayer.startupError) return <>{props.errorFallback?.({ error: mockPlayer.startupError })}</>;
    return <div data-testid="mock-player"><video data-testid="preview-video" /><audio data-testid="preview-audio" /></div>;
  }),
}));
vi.mock("remotion", async (importOriginal) => ({
  ...await importOriginal<typeof import("remotion")>(),
  delayRender: vi.fn(() => 1), continueRender: vi.fn(), cancelRender: vi.fn(),
  useCurrentFrame: () => mockVideoFrame.frame,
  Audio: vi.fn(() => null),
  Img: vi.fn(() => null),
  Sequence: ({ children, from, durationInFrames }: { children: React.ReactNode; from: number; durationInFrames: number }) => <div data-testid="audio-sequence" data-from={from} data-duration={durationInFrames}>{children}</div>,
  useVideoConfig: () => ({ width: 1080, height: 1920, durationInFrames: 30, fps: 30 }),
}));
vi.mock("../src/video/FunnyMoment", () => ({ FunnyMoment: () => null }));
vi.mock("../src/web/api", () => ({ fetchJob: vi.fn(), cancelJob: vi.fn() }));

const source: Asset = { id: "source", kind: "video", name: "Gameplay", durationFrames: 7560, width: 1920, height: 1080, hasAudio: true, previewReady: true };
const edit = makeDefaultEdit("project", source, { startFrame: 2400, endFrame: 3300, momentFrame: 2952 });
const sourceProps = { src: "/api/assets/source/preview", durationFrames: 7560, startFrame: 2400, endFrame: 3300, momentFrame: 2952, onSetStart: vi.fn(), onSetEnd: vi.fn(), onSetMoment: vi.fn() };
const job = (overrides: Partial<JobInfo> = {}): JobInfo => ({ id: "render", kind: "render", status: "running", projectId: "project", revision: 1, progress: null, createdAt: "2026-10-14T00:00:00Z", startedAt: null, finishedAt: null, result: null, error: null, outputId: null, ...overrides });
const dialogProps = { isOpen: true, onClose: vi.fn(), jobId: "render", projectName: "Momen" };
const emitFrame = (frame: number) => { mockPlayer.frame = frame; for (const callback of mockPlayer.listeners.get("frameupdate") ?? []) callback({ detail: { frame } }); };

beforeEach(() => {
  vi.clearAllMocks();
  mockVideoFrame.frame = 1;
  mockPlayer.frame = 0;
  mockPlayer.mounts = 0;
  mockPlayer.startupError = null;
  mockPlayer.listeners.clear();
  mockPlayer.seekTo.mockImplementation((frame: number) => emitFrame(frame));
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) { Object.defineProperty(this, "paused", { configurable: true, value: true }); fireEvent.pause(this); });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { Object.defineProperty(this, "paused", { configurable: true, value: false }); fireEvent.play(this); return Promise.resolve(); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("loads the shared Sora caption font locally and retries failed font loading", async () => {
  const families: string[] = [];
  let shouldFail = true;
  const addFont = vi.fn();
  const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
  vi.stubGlobal("FontFace", class {
    constructor(family: string) { families.push(family); }
    load() { return shouldFail ? Promise.reject(new Error("Font not available")) : Promise.resolve(this); }
  });
  Object.defineProperty(document, "fonts", { configurable: true, value: { add: addFont } });
  try {
    await expect(loadFonts()).rejects.toThrow("Font not available");
    shouldFail = false;
    await loadFonts();
    expect(families).toContain(CAPTION_FONT_FAMILY);
    expect(addFont).toHaveBeenCalledTimes(8);
    expect(delayRender).toHaveBeenCalledTimes(2);
    expect(continueRender).toHaveBeenCalledTimes(2);
    render(<CaptionLayer captions={[{ id: "caption", startFrame: 0, endFrame: 30, text: "Shared caption", speaker: null, segmentIndex: 0 }]} captionY={0.72} height={1920} />);
    expect(screen.getByText("Shared caption")).toHaveStyle({ fontFamily: CAPTION_FONT_STACK });
  } finally {
    if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
    else Reflect.deleteProperty(document, "fonts");
  }
});

describe("source media readiness", () => {
  it("names Play/Pause and one-second actions and shares fractional timecode formatting", async () => {
    render(<SourcePlayer {...sourceProps} />);
    const video = screen.getByLabelText("Video sumber gameplay") as HTMLVideoElement;
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    fireEvent.loadedData(video);
    video.currentTime = 0.5;
    fireEvent.timeUpdate(video);
    expect(screen.getByText(/00:00.50 \/ 04:12.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Maju 1 detik" }));
    expect(video.currentTime).toBe(1.5);
    fireEvent.click(screen.getByRole("button", { name: "Mundur 1 detik" }));
    expect(video.currentTime).toBe(0.5);
  });

  it("can seek beyond the trimmed end using full asset duration, but clamps to its last frame", () => {
    render(<SourcePlayer {...sourceProps} />);
    const video = screen.getByLabelText("Video sumber gameplay") as HTMLVideoElement;
    fireEvent.loadedData(video);
    video.currentTime = 110;
    fireEvent.timeUpdate(video);
    fireEvent.click(screen.getByRole("button", { name: "Maju 1 detik" }));
    expect(video.currentTime).toBe(111);
    fireEvent.change(screen.getByRole("slider", { name: "Posisi video sumber" }), { target: { value: "7559" } });
    fireEvent.click(screen.getByRole("button", { name: "Maju 1 detik" }));
    expect(video.currentTime).toBe(7559 / 30);
  });

  it("surfaces rejected play promises and retries media without silently discarding errors", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("Decoder unavailable"));
    const error = vi.fn();
    render(<SourcePlayer {...sourceProps} onMediaError={error} />);
    const video = screen.getByLabelText("Video sumber gameplay");
    fireEvent.loadedData(video);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Decoder unavailable"));
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining("Decoder unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Coba Muat Ulang Video" }));
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledOnce();
    fireEvent.loadedData(video);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(error).toHaveBeenLastCalledWith(null);
  });

  it("reports native media errors and resets playback, frame and errors on source changes", () => {
    const error = vi.fn();
    const { rerender } = render(<SourcePlayer {...sourceProps} onMediaError={error} />);
    const video = screen.getByLabelText("Video sumber gameplay") as HTMLVideoElement;
    fireEvent.loadedData(video);
    video.currentTime = 98.4;
    fireEvent.timeUpdate(video);
    fireEvent.error(video);
    expect(screen.getByRole("alert")).toHaveTextContent("Video sumber gagal dimuat");
    rerender(<SourcePlayer {...sourceProps} src="/api/assets/new/preview" onMediaError={error} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByText(/00:00.00 \/ 04:12.00/)).toBeInTheDocument();
    expect(error).toHaveBeenLastCalledWith(null);
  });

  it("ignores a late play rejection from a replaced source", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const { rerender } = render(<SourcePlayer {...sourceProps} />);
    fireEvent.loadedData(screen.getByLabelText("Video sumber gameplay"));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    rerender(<SourcePlayer {...sourceProps} src="/new-source" />);
    await act(async () => { reject(new Error("Old source failed")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("preview seek and media recovery", () => {
  it("timeline keyboard seek actually calls player.seekTo; playback echoes do not cause feedback seeks", () => {
    const onFrame = vi.fn();
    function PreviewHarness() {
      const [frame, setFrame] = React.useState(0);
      return <><OutputPreview edit={edit} sourceUrl="/source" assetUrls={{ sticker: "/api/assets/sticker/content" }} currentFrame={frame} onFrameUpdate={(value) => { onFrame(value); setFrame(value); }} /><OutputTimeline edit={edit} currentFrame={frame} onSeek={setFrame} /></>;
    }
    render(<PreviewHarness />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Posisi hasil video" }), { key: "ArrowRight" });
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(1);
    expect(mockPlayer.seekTo).toHaveBeenCalledTimes(1);
    act(() => emitFrame(600));
    expect(onFrame).toHaveBeenLastCalledWith(600);
    expect(mockPlayer.seekTo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("slider", { name: "Posisi hasil video" })).toHaveValue("600");
    expect(mockPlayer.inputProps.assetUrls).toEqual({ sticker: "/api/assets/sticker/content" });
  });

  it("clamps external requests at the last compiled frame including freeze/replay", () => {
    render(<OutputPreview edit={{ ...edit, freezeFrames: 12, replayFrames: 36 }} sourceUrl="/source" assetUrls={{}} currentFrame={948} />);
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(947);
  });

  it("reports player errors with an actionable retry and clears on media recovery", () => {
    const error = vi.fn();
    render(<OutputPreview edit={edit} sourceUrl="/source" assetUrls={{}} onMediaError={error} />);
    act(() => { for (const callback of mockPlayer.listeners.get("error") ?? []) callback({ detail: { error: new Error("Missing SFX") } }); });
    expect(screen.getByRole("alert")).toHaveTextContent("Missing SFX");
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining("Missing SFX"));
    fireEvent.click(screen.getByRole("button", { name: "Coba Muat Ulang Preview" }));
    expect(mockPlayer.mounts).toBe(2);
    fireEvent.loadedData(screen.getByTestId("preview-video"));
    expect(error).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports a startup composition failure even before player event subscription", () => {
    const error = vi.fn();
    mockPlayer.startupError = new Error("Startup composition failure");
    render(<OutputPreview edit={edit} sourceUrl="/source" assetUrls={{}} onMediaError={error} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Startup composition failure");
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining("Startup composition failure"));
    mockPlayer.startupError = null;
    fireEvent.click(screen.getByRole("button", { name: "Coba Muat Ulang Preview" }));
    fireEvent.loadedData(screen.getByTestId("preview-video"));
    expect(error).toHaveBeenLastCalledWith(null);
  });

  it("does not clear an SFX failure when unrelated video media becomes ready", () => {
    const error = vi.fn();
    render(<OutputPreview edit={edit} sourceUrl="/source" assetUrls={{}} onMediaError={error} />);
    fireEvent.error(screen.getByTestId("preview-audio"));
    fireEvent.loadedData(screen.getByTestId("preview-video"));
    expect(screen.getByRole("alert")).toHaveTextContent("Media preview gagal dimuat");
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining("Media preview gagal"));
    fireEvent.loadedData(screen.getByTestId("preview-audio"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(error).toHaveBeenLastCalledWith(null);
  });

  it("captures native preview media failures and exposes safe-area selected state", () => {
    const error = vi.fn();
    render(<OutputPreview edit={edit} sourceUrl="/source" assetUrls={{}} onMediaError={error} />);
    fireEvent.error(screen.getByTestId("preview-video"));
    expect(screen.getByRole("alert")).toHaveTextContent("Media preview gagal dimuat");
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining("Media preview gagal"));
    fireEvent.click(screen.getByRole("button", { name: "Panduan Area Aman" }));
    expect(screen.getByRole("button", { name: "Sembunyikan Panduan" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("compiled video layers", () => {
  it("renders SFX fragments at effect-relative offsets with unique segment keys", () => {
    const compiled = compileEdit({ ...edit, freezeFrames: 12, replayFrames: 36, effects: [
      { id: "sound", kind: "sfx", startFrame: 2390, endFrame: 3300, text: "", assetId: "audio", strength: 1 },
    ] });
    const tree = AudioLayer({ effects: compiled.effects, assetUrls: { audio: "/sound.wav" } });
    if (!React.isValidElement<{ children: React.ReactElement[] }>(tree)) throw new Error("AudioLayer must return a fragment");
    const sequences = tree.props.children;
    const keys = sequences.map((sequence) => sequence.key);
    expect(new Set(keys).size).toBe(compiled.effects.length);
    expect(keys).toEqual(compiled.effects.map((effect) => `${effect.id}-${effect.segmentIndex}`));
    render(<AudioLayer effects={compiled.effects} assetUrls={{ audio: "/sound.wav" }} />);
    const audioProps = vi.mocked(Audio).mock.calls.map(([props]) => props);
    expect(audioProps.map((props) => props.trimBefore)).toEqual([10, 562, 562, 550, 586]);
    expect(audioProps.every((props) => props.src === "/sound.wav" && props.volume === 0.35)).toBe(true);
    expect(screen.getAllByTestId("audio-sequence").map((element) => Number(element.dataset.duration))).toEqual(compiled.effects.map((effect) => effect.endFrame - effect.startFrame));
  });

  it("keeps active stickers and reactions visible through the entire frozen source frame", () => {
    const compiled = compileEdit({ ...edit, freezeFrames: 12, replayFrames: 36, effects: [
      { id: "image", kind: "image", startFrame: 2952, endFrame: 2953, text: "", assetId: "sticker", strength: 1 },
      { id: "reaction", kind: "reaction", startFrame: 2952, endFrame: 2953, text: "WOW", assetId: null, strength: 1 },
    ] });
    const freeze = compiled.segments.find((segment) => segment.kind === "freeze")!;
    mockVideoFrame.frame = freeze.outputStart - 1;
    const { rerender } = render(<EffectLayer effects={compiled.effects} assetUrls={{ sticker: "/sticker.png" }} />);
    expect(Img).not.toHaveBeenCalled();
    for (let frame = freeze.outputStart; frame < freeze.outputStart + freeze.durationFrames; frame += 1) {
      vi.mocked(Img).mockClear();
      mockVideoFrame.frame = frame;
      rerender(<EffectLayer effects={compiled.effects} assetUrls={{ sticker: "/sticker.png" }} />);
      expect(Img).toHaveBeenCalledOnce();
      expect(vi.mocked(Img).mock.calls[0][0].src).toBe("/sticker.png");
      expect(screen.getByText("WOW")).toBeInTheDocument();
    }
    vi.mocked(Img).mockClear();
    mockVideoFrame.frame = freeze.outputStart + freeze.durationFrames + 1;
    rerender(<EffectLayer effects={compiled.effects} assetUrls={{ sticker: "/sticker.png" }} />);
    expect(Img).not.toHaveBeenCalled();
    expect(screen.queryByText("WOW")).not.toBeInTheDocument();
  });
});

describe("render lifecycle and request recovery", () => {
  it.each([
    ["queued", "Dalam antrean worker"], ["running", "Sedang merender video"], ["succeeded", "Render Berhasil Selesai!"],
    ["failed", "Render Gagal"], ["cancelled", "Render Dibatalkan"], ["interrupted", "Render Terhenti"],
  ] as const)("explains %s status", async (status, title) => {
    vi.mocked(fetchJob).mockResolvedValue(job({ status, outputId: status === "succeeded" ? "output" : null }));
    render(<RenderDialog {...dialogProps} />);
    expect(await screen.findByText(title)).toBeInTheDocument();
    if (status === "succeeded") expect(screen.getByRole("link", { name: "Unduh MP4 Hasil Render" })).toHaveAttribute("href", "/api/outputs/output");
    if (status === "interrupted") expect(screen.getByText(/Worker berhenti sebelum render selesai/)).toBeInTheDocument();
  });

  it("shows unknown progress as indeterminate rather than zero percent", async () => {
    vi.mocked(fetchJob).mockResolvedValue(job());
    render(<RenderDialog {...dialogProps} />);
    await screen.findByText("Sedang merender video");
    expect(screen.getByRole("progressbar", { name: "Progres render" })).not.toHaveAttribute("value");
    expect(screen.getByText("Menunggu progres…")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows polling failures and retries on demand without inventing a queued status", async () => {
    vi.mocked(fetchJob).mockRejectedValueOnce(new Error("Worker offline")).mockResolvedValueOnce(job({ status: "succeeded", outputId: "output" }));
    render(<RenderDialog {...dialogProps} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Worker offline"));
    expect(screen.queryByText("Dalam antrean worker")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Coba Periksa Status Lagi" }));
    expect(await screen.findByRole("link", { name: "Unduh MP4 Hasil Render" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces cancellation failures and supports retrying cancellation", async () => {
    vi.mocked(fetchJob).mockResolvedValue(job());
    vi.mocked(cancelJob).mockRejectedValueOnce(new Error("Cancel offline")).mockResolvedValueOnce(job({ status: "cancelled" }));
    render(<RenderDialog {...dialogProps} />);
    fireEvent.click(await screen.findByRole("button", { name: "Batalkan Render" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cancel offline"));
    fireEvent.click(screen.getByRole("button", { name: "Coba Batalkan Lagi" }));
    expect(await screen.findByText("Render Dibatalkan")).toBeInTheDocument();
    expect(cancelJob).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not let an in-flight poll overwrite a successful cancellation", async () => {
    vi.useFakeTimers();
    let finishPoll!: (value: JobInfo) => void;
    vi.mocked(fetchJob).mockResolvedValueOnce(job()).mockReturnValueOnce(new Promise((resolve) => { finishPoll = resolve; }));
    vi.mocked(cancelJob).mockResolvedValue(job({ status: "cancelled" }));
    render(<RenderDialog {...dialogProps} />);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Batalkan Render" })); });
    expect(screen.getByText("Render Dibatalkan")).toBeInTheDocument();
    await act(async () => { finishPoll(job({ status: "running", progress: 0.5 })); });
    expect(screen.getByText("Render Dibatalkan")).toBeInTheDocument();
    expect(screen.queryByText("Sedang merender video")).not.toBeInTheDocument();
  });
});
