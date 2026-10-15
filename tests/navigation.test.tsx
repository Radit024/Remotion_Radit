// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { makeDefaultEdit } from "@/shared/edit";
import type { StoredProject } from "@/server/projects";
import { ClientApiError } from "@/web/api";
import { AppShell } from "@/web/AppShell";
import Page from "@/app/page";

const navigation = vi.hoisted(() => ({
  query: "",
  history: [""],
  index: 0,
  listeners: new Set<() => void>(),
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn() },
}));
const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));

vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  return {
    useRouter: () => navigation.router,
    useSearchParams: () => {
      const query = useSyncExternalStore(
        (listener) => { navigation.listeners.add(listener); return () => { navigation.listeners.delete(listener); }; },
        () => navigation.query,
        () => "",
      );
      return useMemo(() => new URLSearchParams(query), [query]);
    },
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a {...props} href={href} onClick={(event) => { event.preventDefault(); navigation.router.push(href); }}>
      {children}
    </a>
  ),
}));
vi.mock("@/web/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/web/api")>(),
  fetchProject: api.fetch,
  saveProject: api.save,
}));
vi.mock("@/web/home/HomePage", () => ({
  HomePage: ({ view, onOpenProject, onNewProject }: {
    view: "home" | "projects"; onOpenProject: (id: string) => void; onNewProject: (id: string) => void;
  }) => (
    <section data-testid="home" data-view={view}>
      <h1>{view === "projects" ? "Semua proyek" : "Beranda"}</h1>
      <button onClick={() => onOpenProject("11111111-1111-4111-8111-111111111111")}>Buka A</button>
      <button onClick={() => onNewProject("22222222-2222-4222-8222-222222222222")}>Proyek baru B</button>
      <button onClick={() => onOpenProject(CASE_ID.toUpperCase())}>Buka C uppercase</button>
      <button onClick={() => onNewProject(CASE_ID.toUpperCase())}>Proyek baru C uppercase</button>
    </section>
  ),
}));
vi.mock("@/web/editor/Editor", async () => {
  const { useProject } = await import("@/web/editor/useProject");
  return {
    Editor: ({ initialProjectId, onNavigateHome, onSelectProject }: {
      initialProjectId: string; onNavigateHome: () => void; onSelectProject: (id: string) => void;
    }) => {
      const state = useProject(initialProjectId);
      return (
        <section data-testid="editor" data-project={initialProjectId}>
          <button onClick={onNavigateHome}>Beranda</button>
          <select aria-label="Pilih proyek" value={initialProjectId} onChange={(event) => onSelectProject(event.target.value.toUpperCase())}>
            <option value="11111111-1111-4111-8111-111111111111">A</option>
            <option value="22222222-2222-4222-8222-222222222222">B</option>
            <option value={CASE_ID}>C</option>
          </select>
          <button onClick={() => onSelectProject("22222222-2222-4222-8222-222222222222")}>Buat proyek B</button>
          {state.isLoading ? <p role="status">Memuat proyek…</p> : null}
          {state.draft ? (
            <input aria-label="Nama proyek" data-testid="editor-name" value={state.draft.name}
              onChange={(event) => state.updateDraft((draft) => ({ ...draft, name: event.target.value }))} />
          ) : null}
          <output data-testid="dirty">{String(state.isDirty)}</output>
          <output data-testid="conflict">{String(state.isConflict)}</output>
          <output data-testid="revision">{state.project?.revision}</output>
          {state.error ? <p data-testid="project-error">{state.error}</p> : null}
        </section>
      );
    },
  };
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const CASE_ID = "abcdefab-cdef-4abc-8def-abcdefabcdef";
function project(id: string, name = id === A ? "A" : "B", revision = 1): StoredProject {
  return {
    ...makeDefaultEdit(id, {
      id: "source", kind: "video", name, durationFrames: 300,
      width: 1920, height: 1080, hasAudio: true, previewReady: true,
    }, { name }),
    revision,
    sourceStatus: "available",
    createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z",
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function publish(query: string) {
  navigation.query = query;
  navigation.listeners.forEach((listener) => listener());
}
function start(query = "") {
  navigation.query = query;
  navigation.history = [query];
  navigation.index = 0;
  return render(<AppShell />);
}
async function loaded(name = "A") {
  await waitFor(() => expect(screen.getByTestId("editor-name")).toHaveValue(name));
}
function edit(name = "dirty A") {
  fireEvent.change(screen.getByTestId("editor-name"), { target: { value: name } });
}
function select(id = B) {
  fireEvent.change(screen.getByRole("combobox", { name: "Pilih proyek" }), { target: { value: id } });
}
function back() {
  act(() => { navigation.router.back(); window.dispatchEvent(new PopStateEvent("popstate")); });
}
function forward() {
  act(() => { navigation.router.forward(); window.dispatchEvent(new PopStateEvent("popstate")); });
}

beforeEach(() => {
  navigation.query = "";
  navigation.history = [""];
  navigation.index = 0;
  navigation.listeners.clear();
  navigation.router.push.mockReset().mockImplementation((href: string) => {
    const query = new URL(href, "http://localhost").search.slice(1);
    navigation.history = [...navigation.history.slice(0, navigation.index + 1), query];
    navigation.index += 1;
    publish(query);
  });
  navigation.router.replace.mockReset();
  navigation.router.back.mockReset().mockImplementation(() => {
    navigation.index = Math.max(0, navigation.index - 1);
    publish(navigation.history[navigation.index]);
  });
  navigation.router.forward.mockReset().mockImplementation(() => {
    navigation.index = Math.min(navigation.history.length - 1, navigation.index + 1);
    publish(navigation.history[navigation.index]);
  });
  api.fetch.mockReset().mockImplementation(async (id: string) => project(id));
  api.save.mockReset().mockImplementation(async (id, draft, revision) => ({ ...project(id), ...draft, revision: revision + 1 }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AppShell URL navigation", () => {
  it("wraps the search-param consumer in the page Suspense boundary", () => {
    expect(Page().type).toBe(React.Suspense);
    expect(Page().props.fallback.props.role).toBe("status");
  });

  it.each([["", "home", "Beranda"], ["view=projects", "projects", "Semua proyek"]])(
    "derives %s directly from query and passes the Home view contract", (query, view, heading) => {
      start(query);
      expect(screen.getByTestId("home")).toHaveAttribute("data-view", view);
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(api.fetch).not.toHaveBeenCalled();
      expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
    },
  );

  it("opens an existing project deep link without silently choosing another project", async () => {
    start(`project=${B}`);
    await loaded("B");
    expect(screen.getByTestId("editor")).toHaveAttribute("data-project", B);
    expect(screen.getByRole("combobox")).toHaveValue(B);
    expect(api.fetch).toHaveBeenCalledTimes(1);
    expect(api.fetch).toHaveBeenCalledWith(B, expect.any(AbortSignal));
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it("normalizes an uppercase UUID deep link before fetching and keeps case-only Back/Forward on one cache", async () => {
    const pending = deferred<StoredProject>();
    api.fetch.mockReturnValue(pending.promise);
    start(`project=${CASE_ID.toUpperCase()}`);
    const signal = api.fetch.mock.calls[0][1] as AbortSignal;
    expect(screen.getByTestId("editor")).toHaveAttribute("data-project", CASE_ID);
    expect(api.fetch).toHaveBeenCalledWith(CASE_ID, expect.any(AbortSignal));
    act(() => navigation.router.push(`/?project=${CASE_ID}`));
    expect(signal.aborted).toBe(false);
    expect(api.fetch).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(project(CASE_ID, "C")));
    await loaded("C");
    expect(screen.getByRole("combobox")).toHaveValue(CASE_ID);
    edit("dirty C");
    back();
    await loaded("dirty C");
    expect(screen.getByTestId("conflict")).toHaveTextContent("false");
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
    forward();
    await loaded("dirty C");
    expect(api.fetch).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
    expect(screen.queryByTestId("project-error")).not.toBeInTheDocument();
  });

  it.each(["Buka C uppercase", "Proyek baru C uppercase"])(
    "normalizes the UUID from Home callback %s", async (button) => {
      api.fetch.mockResolvedValue(project(CASE_ID, "C"));
      start();
      fireEvent.click(screen.getByRole("button", { name: button }));
      await loaded("C");
      expect(navigation.router.push).toHaveBeenLastCalledWith(`/?project=${CASE_ID}`);
      expect(api.fetch).toHaveBeenCalledWith(CASE_ID, expect.any(AbortSignal));
      expect(screen.getByRole("combobox")).toHaveValue(CASE_ID);
    },
  );

  it("normalizes UUID selector callbacks and treats casing aliases of the current dirty project as a no-op", async () => {
    api.fetch.mockImplementation(async (id: string) => project(id.toLowerCase(), id.toLowerCase() === CASE_ID ? "C" : "A"));
    start(`project=${A}`);
    await loaded();
    select(CASE_ID);
    await loaded("C");
    expect(navigation.router.push).toHaveBeenLastCalledWith(`/?project=${CASE_ID}`);
    edit("dirty C");
    select(CASE_ID);
    expect(navigation.router.push).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("editor-name")).toHaveValue("dirty C");
    back();
    await loaded();
    forward();
    await loaded("dirty C");
    expect(api.fetch).toHaveBeenCalledTimes(2);
    expect(api.save).not.toHaveBeenCalled();
  });

  it.each([
    "project=", "project=not-a-uuid", "project=javascript%3Aalert(1)",
    `project=${A}&project=${B}`, `project=${A}&view=projects`,
    "view=unknown", "view=", "view=projects&view=projects",
  ])("rejects invalid or ambiguous query %s with an explicit recovery link", (query) => {
    start(query);
    expect(screen.getByRole("heading", { name: "Proyek tidak valid" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke Beranda" })).toHaveAttribute("href", "/");
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();
    expect(api.fetch).not.toHaveBeenCalled();
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it("uses the recovery Link to return to home", () => {
    start("project=invalid");
    fireEvent.click(screen.getByRole("link", { name: "Kembali ke Beranda" }));
    expect(navigation.router.push).toHaveBeenCalledWith("/");
    expect(screen.getByTestId("home")).toHaveAttribute("data-view", "home");
  });

  it("routes both Home callbacks and synchronizes Back/Forward from router query updates", async () => {
    start("view=projects");
    fireEvent.click(screen.getByRole("button", { name: "Buka A" }));
    await loaded();
    expect(navigation.router.push).toHaveBeenLastCalledWith(`/?project=${A}`);
    back();
    expect(screen.getByTestId("home")).toHaveAttribute("data-view", "projects");
    fireEvent.click(screen.getByRole("button", { name: "Proyek baru B" }));
    await loaded("B");
    expect(navigation.router.push).toHaveBeenLastCalledWith(`/?project=${B}`);
    back();
    expect(screen.getByTestId("home")).toHaveAttribute("data-view", "projects");
    forward();
    await loaded("B");
    expect(screen.getByRole("combobox")).toHaveValue(B);
  });

  it("updates the URL and selected project through the Editor onSelectProject contract", async () => {
    start(`project=${A}`);
    await loaded();
    select();
    await loaded("B");
    expect(navigation.router.push).toHaveBeenLastCalledWith(`/?project=${B}`);
    expect(navigation.query).toBe(`project=${B}`);
    expect(screen.getByRole("combobox")).toHaveValue(B);
    back();
    await loaded();
    expect(screen.getByRole("combobox")).toHaveValue(A);
    forward();
    await loaded("B");
    expect(api.fetch).toHaveBeenCalledTimes(2);
    expect(api.save).not.toHaveBeenCalled();
  });

  it("leaves selection, URL and dirty draft unchanged when selector navigation is cancelled", async () => {
    start(`project=${A}`);
    await loaded();
    edit();
    select();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Perubahan belum disimpan")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Tinggalkan sementara" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("combobox")).toHaveValue(A);
    expect(screen.getByTestId("editor-name")).toHaveValue("dirty A");
    expect(navigation.query).toBe(`project=${A}`);
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("retains dirty A → B → A using temporary leave and browser Back/Forward without PUT", async () => {
    start(`project=${A}`);
    await loaded();
    edit();
    select();
    fireEvent.click(screen.getByRole("button", { name: "Tinggalkan sementara" }));
    await loaded("B");
    back();
    await loaded("dirty A");
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
    forward();
    await loaded("B");
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    expect(api.fetch).toHaveBeenCalledTimes(2);
    expect(api.save).not.toHaveBeenCalled();
  });

  it("guards Home navigation and keeps the draft while visiting the list and returning", async () => {
    start(`project=${A}`);
    await loaded();
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Beranda" }));
    expect(navigation.router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tinggalkan sementara" }));
    expect(navigation.router.push).toHaveBeenCalledWith("/");
    expect(screen.getByTestId("home")).toHaveAttribute("data-view", "home");
    act(() => navigation.router.push("/?view=projects"));
    expect(screen.getByTestId("home")).toHaveAttribute("data-view", "projects");
    fireEvent.click(screen.getByRole("button", { name: "Buka A" }));
    await loaded("dirty A");
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
    expect(api.fetch).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
  });

  it("uses the same guard for newly created projects selected from the Editor", async () => {
    start(`project=${A}`);
    await loaded();
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Buat proyek B" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(navigation.router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tinggalkan sementara" }));
    await loaded("B");
    expect(navigation.router.push).toHaveBeenLastCalledWith(`/?project=${B}`);
  });

  it("waits for a successful save before leaving and restores the clean updated cache on Back", async () => {
    const pending = deferred<StoredProject>();
    api.save.mockReturnValue(pending.promise);
    start(`project=${A}`);
    await loaded();
    edit("save A");
    fireEvent.click(screen.getByRole("button", { name: "Beranda" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("button", { name: "Menyimpan…" })).toBeDisabled();
    expect(navigation.router.push).not.toHaveBeenCalled();
    await act(async () => pending.resolve(project(A, "save A", 2)));
    await waitFor(() => expect(screen.getByTestId("home")).toBeInTheDocument());
    expect(navigation.router.push).toHaveBeenCalledWith("/");
    back();
    await loaded("save A");
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    expect(screen.getByTestId("revision")).toHaveTextContent("2");
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("keeps the decision dialog open on conflict and never silently navigates or overwrites", async () => {
    api.save.mockRejectedValue(new ClientApiError("REVISION_CONFLICT", "Proyek sudah berubah", 409));
    start(`project=${A}`);
    await loaded();
    edit();
    select();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Proyek sudah berubah"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(screen.getByTestId("editor-name")).toHaveValue("dirty A");
    expect(screen.getByTestId("revision")).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.getByTestId("project-error")).toHaveTextContent("Proyek sudah berubah");
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("keeps BUSY HTTP 409 retryable in the leave dialog without revision conflict or destructive reload", async () => {
    const confirm = vi.spyOn(window, "confirm");
    api.save.mockRejectedValueOnce(new ClientApiError("BUSY", "Proyek sedang digunakan; coba lagi", 409));
    start(`project=${A}`);
    await loaded();
    edit();
    select();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("coba lagi"));
    expect(screen.getByTestId("conflict")).toHaveTextContent("false");
    expect(screen.getByTestId("editor-name")).toHaveValue("dirty A");
    expect(screen.getByTestId("revision")).toHaveTextContent("1");
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(api.fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await loaded("B");
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save).toHaveBeenLastCalledWith(A, expect.objectContaining({ name: "dirty A", revision: 1 }), 1);
    back();
    await loaded("dirty A");
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    expect(screen.getByTestId("revision")).toHaveTextContent("2");
    expect(api.fetch).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not leave if a newer edit is made while save-and-leave is pending", async () => {
    const pending = deferred<StoredProject>();
    api.save.mockReturnValue(pending.promise);
    start(`project=${A}`);
    await loaded();
    edit("submitted");
    select();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    edit("newer");
    await act(async () => pending.resolve(project(A, "submitted", 2)));
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("editor-name")).toHaveValue("newer");
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
    expect(screen.getByTestId("revision")).toHaveTextContent("2");
  });

  it("cancels only navigation if Batal is clicked during save, not the acknowledged save", async () => {
    const pending = deferred<StoredProject>();
    api.save.mockReturnValue(pending.promise);
    start(`project=${A}`);
    await loaded();
    edit();
    select();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    await act(async () => pending.resolve(project(A, "dirty A", 2)));
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(navigation.query).toBe(`project=${A}`);
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("allows a fresh decision when another guarded callback replaces a save's navigation target", async () => {
    const pending = deferred<StoredProject>();
    api.save.mockReturnValue(pending.promise);
    start(`project=${A}`);
    await loaded();
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Beranda" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    fireEvent.click(within(screen.getByTestId("editor")).getByText("Buat proyek B"));
    await act(async () => pending.resolve(project(A, "dirty A", 2)));
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await loaded("B");
    expect(navigation.router.push).toHaveBeenLastCalledWith(`/?project=${B}`);
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("ignores a pending save's navigation target if Back changes the URL before it resolves", async () => {
    const pending = deferred<StoredProject>();
    api.save.mockReturnValue(pending.promise);
    start();
    fireEvent.click(screen.getByRole("button", { name: "Buka A" }));
    await loaded();
    edit();
    select();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    back();
    expect(screen.getByTestId("home")).toBeInTheDocument();
    await act(async () => pending.resolve(project(A, "dirty A", 2)));
    expect(navigation.query).toBe("");
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(navigation.router.push).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    forward();
    await loaded("dirty A");
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("does not show A or accept its late response after an external URL change to B", async () => {
    const a = deferred<StoredProject>();
    const b = deferred<StoredProject>();
    api.fetch.mockImplementation((id) => id === A ? a.promise : b.promise);
    start(`project=${A}`);
    const signal = api.fetch.mock.calls[0][1] as AbortSignal;
    act(() => navigation.router.push(`/?project=${B}`));
    expect(signal.aborted).toBe(true);
    expect(screen.getByTestId("editor")).toHaveAttribute("data-project", B);
    expect(screen.getByText("Memuat proyek…")).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("editor-name")).not.toBeInTheDocument();
    await act(async () => b.resolve(project(B)));
    await loaded("B");
    await act(async () => a.resolve(project(A, "late A")));
    expect(screen.getByTestId("editor-name")).toHaveValue("B");
    expect(screen.getByRole("combobox")).toHaveValue(B);
  });
});
