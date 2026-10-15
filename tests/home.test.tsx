// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomePage } from "@/web/home/HomePage";
import { ProjectCard } from "@/web/home/ProjectCard";
import * as api from "@/web/api";
import { deriveEngineStatus } from "@/web/engine-status";

vi.mock("next/link", () => ({
  default: ({ prefetch, scroll, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    prefetch?: boolean;
    scroll?: boolean;
  }) => {
    void prefetch;
    void scroll;
    return <a {...props} />;
  },
}));

vi.mock("@/web/api", () => ({
  fetchProjects: vi.fn(),
  fetchHealth: vi.fn(),
  uploadAsset: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  triggerTranscribe: vi.fn(),
  triggerSuggestions: vi.fn(),
}));

function project(index: number, overrides: Partial<api.ProjectSummary> = {}): api.ProjectSummary {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Proyek ${String(index).padStart(2, "0")}`,
    sourceName: `rekaman-${index}.mp4`,
    updatedAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
    assetId: `asset-${index}`,
    sourceStatus: "available",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const asset = {
  id: "new-asset", kind: "video" as const, name: "gameplay.mp4", durationFrames: 300,
  width: 1920, height: 1080, hasAudio: true, previewReady: false,
};
const createdProject: Awaited<ReturnType<typeof api.createProject>> = {
  id: "00000000-0000-4000-8000-000000000100", revision: 1, assetId: asset.id,
  name: "gameplay", startFrame: 0, endFrame: 300, momentFrame: 150, preset: "light",
  layout: "contain", focusX: 0.5, focusY: 0.5, captionY: 0.7, freezeFrames: 0,
  replayFrames: 0, captions: [], effects: [], createdAt: "2026-10-14T00:00:00Z",
  updatedAt: "2026-10-14T00:00:00Z", sourceStatus: "available",
};

function renderHome(view?: "home" | "projects") {
  const onOpenProject = vi.fn();
  const onNewProject = vi.fn();
  return { ...render(<HomePage view={view} onOpenProject={onOpenProject} onNewProject={onNewProject} />), onOpenProject, onNewProject };
}

async function loaded() {
  await waitFor(() => expect(screen.queryByText("Memuat proyek…")).not.toBeInTheDocument());
}

function cardNames() {
  return screen.getAllByRole("article").map((card) => within(card).getByRole("heading").textContent);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchProjects).mockResolvedValue([]);
  vi.mocked(api.fetchHealth).mockRejectedValue(new Error("health offline"));
  vi.mocked(api.uploadAsset).mockResolvedValue(asset);
  vi.mocked(api.createProject).mockResolvedValue(createdProject);
  vi.mocked(api.deleteProject).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Home and all projects", () => {
  it("defaults to home, shows only the six newest projects and real navigation links", async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue(Array.from({ length: 30 }, (_, i) => project(i + 1)));
    renderHome();
    await loaded();
    expect(screen.getByRole("heading", { level: 1, name: "Beranda" })).toBeInTheDocument();
    expect(cardNames()).toEqual(["Proyek 30", "Proyek 29", "Proyek 28", "Proyek 27", "Proyek 26", "Proyek 25"]);
    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
    expect(within(nav).getByRole("link", { name: "Beranda" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Beranda" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /Semua Proyek/ })).toHaveAttribute("href", "/?view=projects");
    expect(within(nav).getByRole("link", { name: /Semua Proyek/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Lihat semua proyek" })).toHaveAttribute("href", "/?view=projects");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Podcast|Tambah Alur Kerja|Pengaturan Engine|Antrean Render|AI Creation Studio|Lokal \/ Default/)).not.toBeInTheDocument();
  });

  it("uses the view prop for the heading and active link, not private navigation state", async () => {
    const { rerender, onOpenProject, onNewProject } = renderHome();
    await loaded();
    rerender(<HomePage view="projects" onOpenProject={onOpenProject} onNewProject={onNewProject} />);
    expect(screen.getByRole("heading", { level: 1, name: "Semua Proyek" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    expect(within(nav).getByRole("link", { name: /Semua Proyek/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Beranda" })).not.toHaveAttribute("aria-current");
    expect(api.fetchProjects).toHaveBeenCalledTimes(1);
  });

  it("shows batches of 24, total results and a final partial batch", async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchProjects).mockResolvedValue(Array.from({ length: 50 }, (_, i) => project(i + 1)));
    renderHome("projects");
    await loaded();
    expect(screen.getAllByRole("article")).toHaveLength(24);
    expect(screen.getByText("24 dari 50 proyek")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tampilkan lebih banyak" }));
    expect(screen.getAllByRole("article")).toHaveLength(48);
    await user.click(screen.getByRole("button", { name: "Tampilkan lebih banyak" }));
    expect(screen.getAllByRole("article")).toHaveLength(50);
    expect(screen.queryByRole("button", { name: "Tampilkan lebih banyak" })).not.toBeInTheDocument();
  });

  it("searches name and source case-insensitively, sorts by name/updated and resets the batch", async () => {
    const user = userEvent.setup();
    const projects = Array.from({ length: 30 }, (_, i) => project(i + 1));
    projects[0] = project(1, { name: "Alpha", sourceName: "SPECIAL.MOV" });
    projects[1] = project(2, { name: "Bravo", sourceName: "other.mp4" });
    vi.mocked(api.fetchProjects).mockResolvedValue(projects);
    renderHome("projects");
    await loaded();
    await user.click(screen.getByRole("button", { name: "Tampilkan lebih banyak" }));
    await user.click(screen.getByRole("combobox", { name: "Urutkan proyek" }));
    await user.click(await screen.findByRole("option", { name: "Nama (A–Z)" }));
    expect(cardNames().slice(0, 2)).toEqual(["Alpha", "Bravo"]);
    expect(screen.getAllByRole("article")).toHaveLength(24);
    const search = screen.getByRole("searchbox", { name: "Cari proyek" });
    await user.type(search, "  special  ");
    expect(cardNames()).toEqual(["Alpha"]);
    await user.clear(search);
    await user.type(search, "bRaVo");
    expect(cardNames()).toEqual(["Bravo"]);
    await user.clear(search);
    await user.click(screen.getByRole("combobox", { name: "Urutkan proyek" }));
    await user.click(await screen.findByRole("option", { name: "Terakhir diperbarui" }));
    expect(cardNames()[0]).toBe("Proyek 30");
  });

  it("distinguishes first load, list failure/retry, empty storage and an empty search", async () => {
    const user = userEvent.setup();
    const request = deferred<api.ProjectSummary[]>();
    vi.mocked(api.fetchProjects).mockReturnValueOnce(request.promise);
    renderHome("projects");
    expect(screen.getByText("Memuat proyek…")).toBeInTheDocument();
    expect(screen.queryByText("Belum ada proyek")).not.toBeInTheDocument();
    await act(async () => request.reject(new Error("Daftar offline")));
    expect(screen.getByRole("alert")).toHaveTextContent("Daftar offline");
    expect(screen.queryByText("Belum ada proyek")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Belum ada proyek")).toBeInTheDocument();
    vi.mocked(api.fetchProjects).mockResolvedValue([project(1)]);
    await user.click(screen.getByRole("button", { name: "Perbarui proyek" }));
    await user.type(screen.getByRole("searchbox", { name: "Cari proyek" }), "tidak cocok");
    expect(screen.getByText("Tidak ada proyek yang cocok")).toBeInTheDocument();
    expect(screen.queryByText("Belum ada proyek")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hapus pencarian" }));
    expect(cardNames()).toEqual(["Proyek 01"]);
  });

  it("keeps the last successful list during a refresh and after refresh failure", async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchProjects).mockResolvedValueOnce([project(1)]);
    renderHome();
    await loaded();
    const request = deferred<api.ProjectSummary[]>();
    vi.mocked(api.fetchProjects).mockReturnValueOnce(request.promise);
    await user.click(screen.getByRole("button", { name: "Perbarui proyek" }));
    expect(screen.getByRole("article")).toBeInTheDocument();
    expect(screen.getByText("Memperbarui proyek…")).toBeInTheDocument();
    await act(async () => request.reject(new Error("Refresh offline")));
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh offline");
    expect(cardNames()).toEqual(["Proyek 01"]);
    expect(screen.queryByText("Belum ada proyek")).not.toBeInTheDocument();
    vi.mocked(api.fetchProjects).mockResolvedValue([project(2)]);
    await user.click(screen.getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(cardNames()).toEqual(["Proyek 02"]));
  });

  it("does not wait for health before showing projects or call AI jobs", async () => {
    const request = deferred<api.HealthInfo>();
    vi.mocked(api.fetchHealth).mockReturnValueOnce(request.promise);
    vi.mocked(api.fetchProjects).mockResolvedValue([project(1)]);
    renderHome();
    await loaded();
    const engine = screen.getByRole("region", { name: "Status engine" });
    expect(engine).toHaveTextContent(deriveEngineStatus(null).label);
    expect(engine).not.toHaveTextContent("Lokal / Default");
    expect(api.triggerTranscribe).not.toHaveBeenCalled();
    expect(api.triggerSuggestions).not.toHaveBeenCalled();
  });

  it("renders the helper's overall and individual capability labels read-only", async () => {
    const health: api.HealthInfo = {
      status: "ok", ffmpeg: true,
      ai: { enabled: false, configured: true, suggestionModel: "model", transcriptionModel: "whisper", issues: [] },
    };
    vi.mocked(api.fetchHealth).mockResolvedValue(health);
    renderHome();
    await loaded();
    const derived = deriveEngineStatus(health);
    const engine = screen.getByRole("region", { name: "Status engine" });
    expect(engine).toHaveTextContent(derived.label);
    expect(engine).toHaveTextContent(derived.ffmpeg.label);
    expect(engine).toHaveTextContent(derived.stt.label);
    expect(engine).toHaveTextContent(derived.suggestions.label);
    expect(within(engine).queryByRole("button")).not.toBeInTheDocument();
    expect(within(engine).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("ProjectCard", () => {
  it("opens a named semantic link with Enter and keeps delete outside the link", async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    const onDelete = vi.fn();
    render(<ProjectCard project={project(1)} onOpenProject={onOpenProject} onDelete={onDelete} />);
    const link = screen.getByRole("link", { name: "Buka proyek Proyek 01" });
    expect(link).toHaveAttribute("href", `/?project=${project(1).id}`);
    await user.tab();
    expect(link).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpenProject).toHaveBeenCalledExactlyOnceWith(project(1).id);
    const remove = screen.getByRole("button", { name: "Hapus proyek Proyek 01" });
    expect(link).not.toContainElement(remove);
    await user.tab();
    expect(remove).toHaveFocus();
    await user.keyboard(" ");
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(project(1).id, project(1).name);
    expect(onOpenProject).toHaveBeenCalledTimes(1);
    expect(screen.getByText("rekaman-1.mp4")).toBeInTheDocument();
    expect(screen.getByText("Sumber tersedia")).toBeInTheDocument();
    expect(screen.getByText(/Diperbarui/).querySelector("time")).toHaveAttribute("dateTime", project(1).updatedAt);
  });

  it.each([
    { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 },
  ])("preserves native modified/new-tab clicks %j", (modifiers) => {
    const onOpenProject = vi.fn();
    let preventedByCard = true;
    render(<div onClick={(event) => {
      preventedByCard = event.defaultPrevented;
      event.preventDefault(); // Suppress jsdom navigation only after the card's handler has run.
    }}><ProjectCard project={project(1)} onOpenProject={onOpenProject} onDelete={vi.fn()} /></div>);
    fireEvent.click(screen.getByRole("link"), modifiers);
    expect(onOpenProject).not.toHaveBeenCalled();
    expect(preventedByCard).toBe(false);
  });

  it.each([
    ["metadata-missing", "Metadata sumber hilang"],
    ["file-missing", "Berkas sumber hilang"],
    [undefined, "Status sumber belum diketahui"],
  ] as const)("does not request video for %s sources", (sourceStatus, label) => {
    const { container } = render(<ProjectCard project={{ ...project(1), sourceStatus }} onOpenProject={vi.fn()} onDelete={vi.fn()} />);
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("replaces a failed thumbnail with an explicit film fallback and can preview a changed asset", () => {
    const props = { onOpenProject: vi.fn(), onDelete: vi.fn() };
    const { container, rerender } = render(<ProjectCard project={project(1)} {...props} />);
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("preload", "metadata");
    fireEvent.error(video);
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByText("Pratinjau tidak tersedia")).toBeInTheDocument();
    expect(screen.getByText("Sumber tersedia")).toBeInTheDocument();
    rerender(<ProjectCard project={project(1, { assetId: "replacement" })} {...props} />);
    expect(container.querySelector("video")).toHaveAttribute("src", expect.stringContaining("replacement"));
  });

  it("does not invent a recent date for invalid metadata", () => {
    render(<ProjectCard project={project(1, { updatedAt: "invalid" })} onOpenProject={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Tanggal tidak diketahui")).toBeInTheDocument();
  });
});

describe("Upload and deletion", () => {
  it("the primary CTA starts the one picker instead of opening the first project", async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchProjects).mockResolvedValue([project(1)]);
    const { onOpenProject, container } = renderHome();
    await loaded();
    const input = screen.getByLabelText("Berkas video");
    const picker = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: /Pilih video/ }));
    expect(picker).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(onOpenProject).not.toHaveBeenCalled();
  });

  it.each(["picker", "drop"])("validates unsupported extensions and non-video MIME the same way via %s", async (method) => {
    renderHome();
    await loaded();
    const zone = screen.getByRole("button", { name: /Pilih video/ });
    for (const file of [
      new File(["bad"], "photo.png", { type: "video/mp4" }),
      new File(["bad"], "recording.mp4", { type: "text/plain" }),
      new File(["bad"], "mp4", { type: "video/mp4" }),
      new File(["bad"], "recording.constructor", { type: "application/octet-stream" }),
      new File(["bad"], "recording.mov", { type: "video/webm" }),
    ]) {
      if (method === "picker") fireEvent.change(screen.getByLabelText("Berkas video"), { target: { files: [file] } });
      else fireEvent.drop(zone, { dataTransfer: { files: [file] } });
      expect(screen.getByRole("alert")).toHaveTextContent(/Format video/);
    }
    expect(api.uploadAsset).not.toHaveBeenCalled();
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it.each(["", "application/octet-stream", "video/x-matroska"])("allows a supported MKV with MIME '%s' for authoritative server validation", async (type) => {
    renderHome();
    await loaded();
    const file = new File(["video"], "MATCH.MKV", { type });
    fireEvent.drop(screen.getByRole("button", { name: /Pilih video/ }), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(api.createProject).toHaveBeenCalledExactlyOnceWith(asset.id, "MATCH"));
    expect(api.uploadAsset).toHaveBeenCalledExactlyOnceWith(file);
  });

  it("guards picker/drop synchronously during upload and project creation, without fake progress", async () => {
    const upload = deferred<typeof asset>();
    const creation = deferred<typeof createdProject>();
    vi.mocked(api.uploadAsset).mockReturnValueOnce(upload.promise);
    vi.mocked(api.createProject).mockReturnValueOnce(creation.promise);
    const { onNewProject } = renderHome();
    await loaded();
    const file = new File(["video"], "gameplay.mp4", { type: "video/mp4" });
    const zone = screen.getByRole("button", { name: /Pilih video/ });
    const input = screen.getByLabelText("Berkas video");
    act(() => {
      fireEvent.change(input, { target: { files: [file] } });
      fireEvent.drop(zone, { dataTransfer: { files: [file] } });
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(api.uploadAsset).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
    expect(zone).toBeDisabled();
    expect(screen.getByRole("status", { name: "Status unggahan" })).toHaveTextContent("Mengunggah dan memproses video…");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    await act(async () => upload.resolve(asset));
    expect(screen.getByRole("status", { name: "Status unggahan" })).toHaveTextContent("Membuat proyek…");
    const blockedDrop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(blockedDrop, "dataTransfer", { value: { files: [file] } });
    fireEvent(zone.parentElement!, blockedDrop);
    expect(blockedDrop.defaultPrevented).toBe(true);
    expect(api.uploadAsset).toHaveBeenCalledTimes(1);
    await act(async () => creation.resolve(createdProject));
    expect(onNewProject).toHaveBeenCalledExactlyOnceWith(createdProject.id);
    expect(api.createProject).toHaveBeenCalledTimes(1);
    expect(input).not.toBeDisabled();
  });

  it("rejects multiple files before uploading instead of silently choosing the first", async () => {
    renderHome();
    await loaded();
    const files = [new File(["video"], "a.mp4", { type: "video/mp4" }), new File(["video"], "b.mp4", { type: "video/mp4" })];
    fireEvent.drop(screen.getByRole("button", { name: /Pilih video/ }), { dataTransfer: { files } });
    expect(screen.getByRole("alert")).toHaveTextContent("Pilih satu video");
    expect(api.uploadAsset).not.toHaveBeenCalled();
  });

  it("keeps creation errors inline without navigating and releases the pending guard", async () => {
    vi.mocked(api.createProject).mockRejectedValueOnce(new Error("Proyek gagal dibuat"));
    const { onNewProject } = renderHome();
    await loaded();
    const file = new File(["video"], "gameplay.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Berkas video"), { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Proyek gagal dibuat");
    expect(onNewProject).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Berkas video")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Pilih video/ })).not.toBeDisabled();
  });

  it("shows server errors inline, re-enables upload and permits retrying the same file", async () => {
    vi.mocked(api.uploadAsset).mockRejectedValueOnce(new Error("Codec nonaktif"));
    const { onNewProject } = renderHome();
    await loaded();
    const file = new File(["video"], "gameplay.mp4", { type: "video/mp4" });
    const input = screen.getByLabelText("Berkas video");
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Codec nonaktif");
    expect(input).not.toBeDisabled();
    expect(api.createProject).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onNewProject).toHaveBeenCalledExactlyOnceWith(createdProject.id));
    expect(api.uploadAsset).toHaveBeenCalledTimes(2);
  });

  it("keeps the project when deletion fails and never opens it from the sibling button", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.fetchProjects).mockResolvedValue([project(1)]);
    vi.mocked(api.deleteProject).mockRejectedValueOnce(new Error("Suppression refusée"));
    const { onOpenProject } = renderHome();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Hapus proyek Proyek 01" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Suppression refusée");
    expect(cardNames()).toEqual(["Proyek 01"]);
    expect(onOpenProject).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Hapus proyek Proyek 01" }));
    await waitFor(() => expect(screen.queryByRole("article")).not.toBeInTheDocument());
  });
});

describe("Mobile navigation drawer", () => {
  it("has a named toggle, modal focus trap, Escape dismissal and focus restoration", async () => {
    const user = userEvent.setup();
    renderHome("projects");
    await loaded();
    const toggle = screen.getByRole("button", { name: "Buka navigasi" });
    await user.click(toggle);
    const dialog = await screen.findByRole("dialog", { name: "Navigasi studio" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    const nav = within(dialog).getByRole("navigation", { name: "Navigasi utama" });
    expect(within(nav).getByRole("link", { name: /Semua Proyek/ })).toHaveAttribute("aria-current", "page");
    const focusable = within(dialog).getAllByRole("link").concat(within(dialog).getByRole("button", { name: "Tutup navigasi" }));
    for (let i = 0; i < focusable.length + 2; i += 1) {
      await user.tab();
      await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(toggle).toHaveFocus());
  });
});
