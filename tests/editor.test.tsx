// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RangeControls } from "../src/web/editor/RangeControls";
import { PresetPanel } from "../src/web/editor/PresetPanel";
import { SubtitlePanel, parseSrtText, exportSrtText } from "../src/web/editor/SubtitlePanel";
import { SuggestionPanel } from "../src/web/editor/SuggestionPanel";
import { OutputTimeline } from "../src/web/editor/OutputTimeline";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../src/components/ui/tabs";
import { makeDefaultEdit, toFrame, type Asset, type Caption, type Effect } from "../src/shared/edit";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const source: Asset = { id: "source", kind: "video", name: "Gameplay", durationFrames: 7560, width: 1920, height: 1080, hasAudio: true, previewReady: true };
const edit = makeDefaultEdit("project", source, { startFrame: 2400, endFrame: 3300, momentFrame: 2952 });
const rangeProps = { durationFrames: source.durationFrames, startFrame: edit.startFrame, endFrame: edit.endFrame, momentFrame: edit.momentFrame, onChangeRange: vi.fn() };
const subtitleProps = { captions: [], onChangeCaptions: vi.fn(), onTriggerAiTranscribe: vi.fn(), isTranscribing: false, startFrame: 2400, endFrame: 3300 };

describe("range input drafts", () => {
  it("converts 80s and 98.4s to canonical frames and displays shared timecode", () => {
    expect(toFrame(80)).toBe(2400);
    expect(toFrame(98.4)).toBe(2952);
    render(<RangeControls {...rangeProps} />);
    expect(screen.getByRole("textbox", { name: "Awal (timecode)" })).toHaveValue("01:20.00");
    expect(screen.getByRole("textbox", { name: "Titik Lucu (timecode)" })).toHaveValue("01:38.40");
    expect(screen.getByText(/30.0 detik/)).toBeInTheDocument();
  });

  it("retains partial timecode without writing zero; invalid blur blocks render until Escape restores", () => {
    const change = vi.fn();
    const validity = vi.fn();
    render(<RangeControls {...rangeProps} onChangeRange={change} onValidityChange={validity} />);
    const start = screen.getByRole("textbox", { name: "Awal (timecode)" });
    fireEvent.change(start, { target: { value: "01:" } });
    expect(start).toHaveValue("01:");
    fireEvent.blur(start);
    expect(change).not.toHaveBeenCalled();
    expect(validity).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("alert")).toHaveTextContent("detik 00–59");
    fireEvent.keyDown(start, { key: "Escape" });
    expect(start).toHaveValue("01:20.00");
    expect(validity).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("commits valid timecode only on Enter or blur using the full asset duration", () => {
    const change = vi.fn();
    render(<RangeControls {...rangeProps} onChangeRange={change} />);
    const end = screen.getByRole("textbox", { name: "Akhir (timecode)" });
    fireEvent.change(end, { target: { value: "03:00.5" } });
    expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(end, { key: "Enter" });
    expect(change).toHaveBeenLastCalledWith(2400, 5415, 2952);
    const moment = screen.getByRole("textbox", { name: "Titik Lucu (timecode)" });
    fireEvent.change(moment, { target: { value: "01:38.500" } });
    fireEvent.blur(moment);
    expect(change).toHaveBeenLastCalledWith(2400, 3300, 2955);
  });

  it.each(["04:13.00", "01:60.00"])("rejects out-of-duration or invalid seconds %s", (value) => {
    const change = vi.fn();
    render(<RangeControls {...rangeProps} onChangeRange={change} />);
    const end = screen.getByRole("textbox", { name: "Akhir (timecode)" });
    fireEvent.change(end, { target: { value } });
    fireEvent.blur(end);
    expect(change).not.toHaveBeenCalled();
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("rejects moment at the exclusive end frame and reports invalid external ranges", () => {
    const change = vi.fn();
    const { rerender } = render(<RangeControls {...rangeProps} onChangeRange={change} />);
    const moment = screen.getByRole("textbox", { name: "Titik Lucu (timecode)" });
    fireEvent.change(moment, { target: { value: "01:50.00" } });
    fireEvent.keyDown(moment, { key: "Enter" });
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("tidak boleh sama dengan akhir");
    fireEvent.keyDown(moment, { key: "Escape" });
    rerender(<RangeControls {...rangeProps} momentFrame={3400} onChangeRange={change} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Titik lucu harus berada di antara awal dan akhir");
  });

  it("provides precise integer-frame editing without coercing blanks or fractions", () => {
    const change = vi.fn();
    render(<RangeControls {...rangeProps} onChangeRange={change} />);
    fireEvent.click(screen.getByRole("radio", { name: "Presisi frame" }));
    const start = screen.getByRole("textbox", { name: "Awal (frame)" });
    fireEvent.change(start, { target: { value: "2401.5" } });
    fireEvent.blur(start);
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(start, { target: { value: "" } });
    fireEvent.blur(start);
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(start, { target: { value: "2401" } });
    expect(change).not.toHaveBeenCalled();
    fireEvent.blur(start);
    expect(change).toHaveBeenCalledWith(2401, 3300, 2952);
  });
});

describe("named panel controls", () => {
  it("exposes selected preset/layout radios, labelled sliders and switches", () => {
    const change = vi.fn();
    render(<PresetPanel edit={edit} onChange={change} />);
    expect(screen.getByRole("radio", { name: "Light (Halus)" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Contain + Blur" })).toBeChecked();
    expect(screen.getByRole("slider", { name: "Fokus Horizontal (X)" })).toHaveValue("0.5");
    expect(screen.getByRole("slider", { name: "Fokus Vertikal (Y)" })).toHaveValue("0.5");
    expect(screen.getByRole("slider", { name: "Posisi Vertikal Subtitle" })).toHaveValue("0.72");
    fireEvent.click(screen.getByRole("switch", { name: "Freeze Frame di Titik Lucu" }));
    expect(change).toHaveBeenLastCalledWith({ freezeFrames: 12 });
    fireEvent.click(screen.getByRole("switch", { name: "Instant Replay Momen" }));
    expect(change).toHaveBeenLastCalledWith({ replayFrames: 36 });
    fireEvent.click(screen.getByRole("radio", { name: "Meme (Lucu/Ekspresif)" }));
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ preset: "meme", freezeFrames: 12 }));
  });

  it("names freeze/replay length sliders when enabled", () => {
    render(<PresetPanel edit={{ ...edit, freezeFrames: 12, replayFrames: 36 }} onChange={vi.fn()} />);
    expect(screen.getByRole("slider", { name: /Durasi freeze/ })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Durasi replay/ })).toBeInTheDocument();
  });

  it("names subtitle text, import/export and delete actions; upload trigger is keyboard reachable", async () => {
    render(<SubtitlePanel {...subtitleProps} captions={[{ id: "caption", startFrame: 2400, endFrame: 2430, text: "Halo", speaker: null }]} />);
    expect(screen.getByRole("textbox", { name: "Pembicara (opsional)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Teks subtitle baru" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Teks subtitle 1" })).toHaveValue("Halo");
    expect(screen.getByRole("button", { name: "Ekspor SRT" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Hapus subtitle 1" })).toBeInTheDocument();
    const input = screen.getByLabelText("Berkas SRT");
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    const trigger = screen.getByRole("button", { name: "Impor SRT" });
    trigger.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(click).toHaveBeenCalledOnce();
  });

  it("shows inline SRT import errors without changing captions", async () => {
    const change = vi.fn();
    render(<SubtitlePanel {...subtitleProps} onChangeCaptions={change} />);
    fireEvent.change(screen.getByLabelText("Berkas SRT"), { target: { files: [new File(["not SRT"], "bad.srt")] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Gagal mengimpor SRT"));
    expect(change).not.toHaveBeenCalled();
  });

  it("uses parent configuration status for AI availability, not an assumed provider state", () => {
    const { rerender } = render(<SubtitlePanel {...subtitleProps} aiStatusLabel="Kunci AI belum dikonfigurasi" />);
    expect(screen.getByRole("button", { name: "AI STT" })).toBeDisabled();
    expect(screen.getByText("Kunci AI belum dikonfigurasi")).toBeInTheDocument();
    rerender(<SubtitlePanel {...subtitleProps} aiEnabled aiStatusLabel="AI siap" />);
    expect(screen.getByRole("button", { name: "AI STT" })).toBeEnabled();
  });

  it("keeps unavailable suggestions compact and names dismiss/apply actions", () => {
    const props = { suggestions: [], onApplySuggestion: vi.fn(), onDismissSuggestion: vi.fn(), onTriggerSuggestions: vi.fn(), isLoading: false };
    const { rerender } = render(<SuggestionPanel {...props} aiStatusLabel="AI belum dikonfigurasi" />);
    expect(screen.getByRole("button", { name: "Minta Saran AI" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("AI belum dikonfigurasi");
    const suggestion = { id: "suggestion", kind: "reaction" as const, startFrame: 2952, endFrame: 2982, text: "WOW", strength: 1, reason: "Momen lucu" };
    rerender(<SuggestionPanel {...props} aiEnabled suggestions={[suggestion]} />);
    fireEvent.click(screen.getByRole("button", { name: "Terapkan saran 1" }));
    expect(props.onApplySuggestion).toHaveBeenCalledWith(suggestion);
    fireEvent.click(screen.getByRole("button", { name: "Abaikan saran 1" }));
    expect(props.onDismissSuggestion).toHaveBeenCalledWith("suggestion");
  });

  it("existing Base UI tools tabs support arrows and Home/End with selected-state announcements", async () => {
    render(<Tabs defaultValue="preset"><TabsList aria-label="Alat editor"><TabsTrigger value="preset">Preset</TabsTrigger><TabsTrigger value="subtitle">Subtitle</TabsTrigger><TabsTrigger value="asset">Stiker</TabsTrigger></TabsList><TabsContent value="preset">Preset tools</TabsContent><TabsContent value="subtitle">Subtitle tools</TabsContent><TabsContent value="asset">Stiker tools</TabsContent></Tabs>);
    const user = userEvent.setup();
    act(() => screen.getByRole("tab", { name: "Preset" }).focus());
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Subtitle" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tab", { name: "Subtitle" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}{Enter}");
    expect(screen.getByRole("tab", { name: "Stiker" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}{Enter}");
    expect(screen.getByRole("tab", { name: "Preset" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("output timeline", () => {
  it("clamps keyboard seek to output 0..duration-1 and shows compiler source mapping", () => {
    const seek = vi.fn();
    const timelineEdit = { ...edit, freezeFrames: 12, replayFrames: 36 };
    const { rerender } = render(<OutputTimeline edit={timelineEdit} currentFrame={552} onSeek={seek} />);
    const slider = screen.getByRole("slider", { name: "Posisi hasil video" });
    expect(slider).toHaveAttribute("max", "947");
    expect(screen.getByText(/Posisi Sumber:/)).toHaveTextContent("01:38.40 (2952 f)");
    fireEvent.keyDown(slider, { key: "End" });
    expect(seek).toHaveBeenLastCalledWith(947);
    rerender(<OutputTimeline edit={timelineEdit} currentFrame={947} onSeek={seek} />);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(seek).toHaveBeenLastCalledWith(947);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(seek).toHaveBeenLastCalledWith(0);
    expect(screen.getByLabelText("Track Video")).toBeInTheDocument();
    expect(screen.getByLabelText("Track Subtitle")).toBeInTheDocument();
    expect(screen.getByLabelText("Track Efek")).toBeInTheDocument();
    expect(screen.getByLabelText("Marker momen")).toBeInTheDocument();
  });

  it("uses the unpadded track width and never seeks to duration itself", () => {
    const seek = vi.fn();
    render(<OutputTimeline edit={edit} currentFrame={0} onSeek={seek} />);
    const trackArea = screen.getByLabelText("Track Video").parentElement!;
    vi.spyOn(trackArea, "getBoundingClientRect").mockReturnValue({ left: 100, width: 900, top: 0, right: 1000, bottom: 100, height: 100, x: 100, y: 0, toJSON: () => ({}) });
    fireEvent.click(trackArea, { clientX: 550 });
    expect(seek).toHaveBeenLastCalledWith(450);
    fireEvent.click(trackArea, { clientX: 1000 });
    expect(seek).toHaveBeenLastCalledWith(899);
    fireEvent.click(trackArea, { clientX: 0 });
    expect(seek).toHaveBeenLastCalledWith(0);
  });
});

it("SRT timestamp fractions reuse canonical parsing and export source time", () => {
  const captions = parseSrtText("1\n00:00:00,5 --> 00:00:01,50\nHalo\n\n2\n00:00:60,000 --> 00:01:01,000\nInvalid", 2400);
  expect(captions).toHaveLength(1);
  expect(captions[0]).toMatchObject({ startFrame: 2415, endFrame: 2445, text: "Halo" });
  expect(exportSrtText(captions)).toContain("00:01:20,500 --> 00:01:21,500");
});

function deferSrtRead() {
  const read = vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(() => {});
  return async (text = "1\n00:00:00,000 --> 00:00:01,000\nImported") => {
    const pending = read.mock.contexts[0];
    if (!(pending instanceof FileReader)) throw new Error("No pending SRT read");
    await act(async () => {
      Object.defineProperty(pending, "result", { configurable: true, value: text });
      pending.dispatchEvent(new ProgressEvent("load"));
    });
  };
}
const importFile = () => fireEvent.change(screen.getByLabelText("Berkas SRT"), { target: { files: [new File(["SRT"], "pending.srt")] } });
const existingCue: Caption = { id: "existing", startFrame: 2500, endFrame: 2530, text: "Original", speaker: null };

describe("SRT import lifetime", () => {
  it("locks affected subtitle editing and AI while FileReader is pending", async () => {
    const finish = deferSrtRead();
    const change = vi.fn();
    render(<SubtitlePanel {...subtitleProps} captions={[existingCue]} aiEnabled onChangeCaptions={change} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Teks subtitle baru" }), { target: { value: "Manual cue" } });
    importFile();
    expect(screen.getByRole("textbox", { name: "Teks subtitle baru" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Pembicara (opsional)" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Teks subtitle 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hapus subtitle 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tambah Cue Subtitle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "AI STT" })).toBeDisabled();
    await finish();
    expect(change).toHaveBeenCalledWith([existingCue, expect.objectContaining({ text: "Imported", startFrame: 2400, endFrame: 2430 })]);
    expect(screen.getByRole("textbox", { name: "Teks subtitle baru" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Teks subtitle baru" })).toHaveValue("Manual cue");
  });

  it("merges imported cues with the latest parent captions without losing edits or resurrecting deleted cues", async () => {
    const finish = deferSrtRead();
    const oldCallback = vi.fn();
    const currentCallback = vi.fn();
    const deleted = { ...existingCue, id: "deleted", startFrame: 2540, endFrame: 2570 };
    const { rerender } = render(<SubtitlePanel {...subtitleProps} captions={[existingCue, deleted]} onChangeCaptions={oldCallback} />);
    importFile();
    const current: Caption[] = [
      { ...existingCue, text: "Edited while import pending" },
      { ...existingCue, id: "added", startFrame: 2580, endFrame: 2610, text: "New parent cue" },
    ];
    rerender(<SubtitlePanel {...subtitleProps} captions={current} onChangeCaptions={currentCallback} />);
    await finish();
    expect(oldCallback).not.toHaveBeenCalled();
    expect(currentCallback).toHaveBeenCalledWith([...current, expect.objectContaining({ text: "Imported" })]);
    expect(currentCallback.mock.calls[0][0].some((caption: Caption) => caption.id === "deleted")).toBe(false);
  });

  it("rejects an import after the range changes, even if it changes back before reading completes", async () => {
    const finish = deferSrtRead();
    const change = vi.fn();
    const { rerender } = render(<SubtitlePanel {...subtitleProps} onChangeCaptions={change} />);
    importFile();
    rerender(<SubtitlePanel {...subtitleProps} startFrame={2430} onChangeCaptions={change} />);
    rerender(<SubtitlePanel {...subtitleProps} onChangeCaptions={change} />);
    await finish();
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/rentang.*berubah/i);
    expect(screen.getByRole("button", { name: "Impor SRT" })).toBeEnabled();
  });

  it("rejects completion from a previous project scope with identical timing", async () => {
    const finish = deferSrtRead();
    const change = vi.fn();
    const { rerender } = render(<SubtitlePanel {...subtitleProps} importScopeKey="project-a" onChangeCaptions={change} />);
    importFile();
    rerender(<SubtitlePanel {...subtitleProps} importScopeKey="project-b" onChangeCaptions={change} />);
    await finish();
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/proyek.*berubah/i);
  });

  it("discards a late FileReader completion after unmount", async () => {
    const finish = deferSrtRead();
    const change = vi.fn();
    const { unmount } = render(<SubtitlePanel {...subtitleProps} onChangeCaptions={change} />);
    importFile();
    unmount();
    await finish();
    expect(change).not.toHaveBeenCalled();
  });
});

it("visibly rejects an overflowing preset switch without dropping custom effects, then accepts the exact boundary", () => {
  const change = vi.fn();
  const custom: Effect[] = Array.from({ length: 100 }, (_, index) => ({ id: `custom-${index}`, kind: "reaction", startFrame: 2952, endFrame: 3000, text: `Custom ${index}`, assetId: null, strength: 1 }));
  const original = { ...edit, effects: custom };
  const { rerender } = render(<PresetPanel edit={original} onChange={change} />);
  fireEvent.click(screen.getByRole("radio", { name: "Meme (Lucu/Ekspresif)" }));
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("100");
  expect(screen.getByRole("radio", { name: "Light (Halus)" })).toBeChecked();
  expect(original.effects).toHaveLength(100);
  expect(original.effects).toEqual(custom);
  rerender(<PresetPanel edit={{ ...edit, effects: custom.slice(0, 98) }} onChange={change} />);
  fireEvent.click(screen.getByRole("radio", { name: "Meme (Lucu/Ekspresif)" }));
  expect(change).toHaveBeenCalledOnce();
  expect(change.mock.calls[0][0].effects).toHaveLength(100);
  expect(change.mock.calls[0][0].effects.slice(0, 98)).toEqual(custom.slice(0, 98));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
