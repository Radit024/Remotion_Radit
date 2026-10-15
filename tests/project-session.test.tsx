// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { makeDefaultEdit } from "@/shared/edit";
import type { StoredProject } from "@/server/projects";
import { ClientApiError } from "@/web/api";
import { ProjectSession } from "@/web/editor/ProjectSession";
import { useProject } from "@/web/editor/useProject";

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock("@/web/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/web/api")>(),
  fetchProject: api.fetch,
  saveProject: api.save,
}));

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
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function Wrapper({ children }: { children: ReactNode }) {
  return <ProjectSession>{children}</ProjectSession>;
}

function mount(id: string | null = A) {
  return renderHook(({ id }) => useProject(id), { initialProps: { id }, wrapper: Wrapper });
}

async function loaded(result: { current: ReturnType<typeof useProject> }, id = A) {
  await waitFor(() => expect(result.current.project?.id).toBe(id));
}

beforeEach(() => {
  api.fetch.mockReset().mockImplementation(async (id: string) => project(id));
  api.save.mockReset().mockImplementation(async (id, draft, revision) => ({
    ...project(id), ...draft, revision: revision + 1,
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ProjectSession", () => {
  it("has no project or network work for a null selection", async () => {
    const { result } = mount(null);
    expect(result.current).toMatchObject({ project: null, draft: null, isLoading: false, isDirty: false });
    act(() => { result.current.updateDraft((draft) => draft); result.current.resetDraft(); });
    await act(async () => {
      expect(await result.current.save()).toBeNull();
      expect(await result.current.reload()).toBeNull();
    });
    expect(api.fetch).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("shares one request and one draft between consumers", async () => {
    const { result } = renderHook(() => [useProject(A), useProject(A)], { wrapper: Wrapper });
    await waitFor(() => expect(result.current[0].draft?.name).toBe("A"));
    expect(api.fetch).toHaveBeenCalledTimes(1);
    act(() => result.current[0].updateDraft((draft) => ({ ...draft, name: "shared" })));
    expect(result.current[1].draft?.name).toBe("shared");
    expect(result.current[1].isDirty).toBe(true);
  });

  it("shares a canonical UUID cache and request between uppercase and lowercase consumers", async () => {
    api.fetch.mockResolvedValue(project(CASE_ID, "C"));
    const { result } = renderHook(() => [useProject(CASE_ID.toUpperCase()), useProject(CASE_ID)], { wrapper: Wrapper });
    await waitFor(() => expect(result.current[0].project?.id).toBe(CASE_ID));
    expect(api.fetch).toHaveBeenCalledTimes(1);
    expect(api.fetch).toHaveBeenCalledWith(CASE_ID, expect.any(AbortSignal));
    act(() => result.current[0].updateDraft((draft) => ({ ...draft, name: "shared C" })));
    expect(result.current[1].draft?.name).toBe("shared C");
    expect(result.current[1].isDirty).toBe(true);
  });

  it("keeps UUID case-only changes from aborting loads or changing actions and preserves the dirty cache", async () => {
    const pending = deferred<StoredProject>();
    api.fetch.mockImplementation((id: string) => id.toLowerCase() === CASE_ID ? pending.promise : Promise.resolve(project(id)));
    const { result, rerender } = mount(CASE_ID.toUpperCase());
    const signal = api.fetch.mock.calls[0][1] as AbortSignal;
    const save = result.current.save;
    expect(api.fetch).toHaveBeenCalledWith(CASE_ID, expect.any(AbortSignal));
    rerender({ id: CASE_ID });
    expect(signal.aborted).toBe(false);
    expect(api.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.save).toBe(save);
    await act(async () => pending.resolve(project(CASE_ID, "C")));
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "dirty C" })));
    rerender({ id: B });
    await loaded(result, B);
    rerender({ id: CASE_ID.toUpperCase() });
    expect(result.current.project?.id).toBe(CASE_ID);
    expect(result.current.draft).toMatchObject({ id: CASE_ID, name: "dirty C" });
    expect(result.current.isDirty).toBe(true);
    expect(api.fetch).toHaveBeenCalledTimes(2);
    await act(async () => { await result.current.save(); });
    expect(api.save).toHaveBeenCalledWith(CASE_ID, expect.objectContaining({ id: CASE_ID, name: "dirty C" }), 1);
  });

  it("normalizes UUID identity in fetch and save responses without accepting another project", async () => {
    api.fetch.mockResolvedValue(project(CASE_ID.toUpperCase(), "C"));
    api.save.mockResolvedValue(project(CASE_ID.toUpperCase(), "saved C", 2));
    const { result } = mount(CASE_ID);
    await loaded(result, CASE_ID);
    expect(result.current.draft?.id).toBe(CASE_ID);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "saved C" })));
    await act(async () => expect((await result.current.save())?.id).toBe(CASE_ID));
    expect(result.current.project?.id).toBe(CASE_ID);
    expect(result.current.draft).toMatchObject({ id: CASE_ID, name: "saved C", revision: 2 });
    expect(result.current.isDirty).toBe(false);
  });

  it("retains a dirty A draft and baseline across A → B → home → A without autosave", async () => {
    const { result, rerender } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "draft A" })));
    rerender({ id: B });
    await loaded(result, B);
    expect(result.current.draft?.name).toBe("B");
    rerender({ id: null });
    expect(result.current.draft).toBeNull();
    rerender({ id: A });
    expect(result.current).toMatchObject({ isDirty: true, isLoading: false });
    expect(result.current.draft?.name).toBe("draft A");
    expect(result.current.project).toEqual(project(A));
    expect(api.fetch).toHaveBeenCalledTimes(2);
    expect(api.save).not.toHaveBeenCalled();
  });

  it("is loading on the first B render and never exposes A while B loads", async () => {
    const pending = deferred<StoredProject>();
    api.fetch.mockImplementation((id) => id === B ? pending.promise : Promise.resolve(project(id)));
    const renders: ReturnType<typeof useProject>[] = [];
    const { result, rerender } = renderHook(({ id }) => {
      const state = useProject(id);
      renders.push(state);
      return state;
    }, { initialProps: { id: A }, wrapper: Wrapper });
    await loaded(result);
    renders.length = 0;
    rerender({ id: B });
    expect(renders[0]).toMatchObject({ isLoading: true, project: null, draft: null });
    expect(result.current.draft).toBeNull();
    await act(async () => pending.resolve(project(B)));
    expect(result.current.draft?.name).toBe("B");
  });

  it("aborts A and ignores its late response even when the transport ignores the signal", async () => {
    const a = deferred<StoredProject>();
    const b = deferred<StoredProject>();
    api.fetch.mockImplementation((id) => id === A ? a.promise : b.promise);
    const { result, rerender } = mount();
    const signal = api.fetch.mock.calls[0][1] as AbortSignal;
    rerender({ id: B });
    expect(signal.aborted).toBe(true);
    await act(async () => b.resolve(project(B)));
    await act(async () => a.resolve(project(A, "late A")));
    expect(result.current.project?.id).toBe(B);
    expect(result.current.draft?.name).toBe("B");
  });

  it("uses generation as well as ID when A is requested again before the old A resolves", async () => {
    const oldA = deferred<StoredProject>();
    const newA = deferred<StoredProject>();
    api.fetch.mockImplementationOnce(() => oldA.promise)
      .mockResolvedValueOnce(project(B))
      .mockImplementationOnce(() => newA.promise);
    const { result, rerender } = mount();
    rerender({ id: B });
    await loaded(result, B);
    rerender({ id: A });
    await act(async () => newA.resolve(project(A, "new A", 3)));
    await act(async () => oldA.resolve(project(A, "old A", 1)));
    expect(result.current.draft?.name).toBe("new A");
    expect(result.current.project?.revision).toBe(3);
  });

  it("cancels requests on provider unmount, without retaining an unload listener", async () => {
    const pending = deferred<StoredProject>();
    api.fetch.mockReturnValue(pending.promise);
    const { unmount } = mount();
    const signal = api.fetch.mock.calls[0][1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.reject(new Error("late failure")));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("survives StrictMode effect replay and ignores the cancelled generation", async () => {
    const old = deferred<StoredProject>();
    api.fetch.mockReturnValueOnce(old.promise).mockResolvedValue(project(A, "strict"));
    const { result } = renderHook(() => useProject(A), {
      wrapper: Wrapper,
      reactStrictMode: true,
    });
    expect(api.fetch).toHaveBeenCalledTimes(2);
    expect(api.fetch.mock.calls[1][1].aborted).toBe(false);
    await loaded(result);
    await act(async () => old.resolve(project(A, "stale")));
    expect(result.current.draft?.name).toBe("strict");
    expect(api.fetch.mock.calls[0][1].aborted).toBe(true);
  });

  it("keeps action identities stable while state changes and detects reverted/no-op edits", async () => {
    const { result } = mount();
    await loaded(result);
    const actions = {
      updateDraft: result.current.updateDraft, save: result.current.save,
      resetDraft: result.current.resetDraft, reload: result.current.reload,
    };
    act(() => result.current.updateDraft((draft) => ({ ...draft })));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "changed" })));
    expect(result.current.isDirty).toBe(true);
    for (const key of Object.keys(actions) as (keyof typeof actions)[]) {
      expect(result.current[key]).toBe(actions[key]);
    }
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "A" })));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.updateDraft((draft) => { draft.name = "mutated"; return draft; }));
    expect(result.current.project?.name).toBe("A");
    act(() => result.current.resetDraft());
    expect(result.current.draft?.name).toBe("A");
    expect(result.current.isDirty).toBe(false);
  });

  it("returns the clean baseline with no PUT and excludes server metadata from drafts", async () => {
    const { result } = mount();
    await loaded(result);
    const baseline = result.current.project;
    expect(result.current.draft).not.toHaveProperty("createdAt");
    expect(result.current.draft).not.toHaveProperty("updatedAt");
    expect(result.current.draft).not.toHaveProperty("sourceStatus");
    await act(async () => expect(await result.current.save()).toBe(baseline));
    expect(api.save).not.toHaveBeenCalled();
  });

  it("coalesces concurrent saves and atomically advances the baseline and draft revision", async () => {
    const pending = deferred<StoredProject>();
    api.save.mockReturnValue(pending.promise);
    const { result } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "saved" })));
    let first!: Promise<StoredProject | null>;
    let second!: Promise<StoredProject | null>;
    act(() => { first = result.current.save(); second = result.current.save(); });
    expect(first).toBe(second);
    expect(result.current.isSaving).toBe(true);
    await act(async () => { pending.resolve(project(A, "saved", 2)); await first; });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(A, expect.objectContaining({ name: "saved", revision: 1 }), 1);
    expect(result.current).toMatchObject({ isDirty: false, isSaving: false });
    expect(result.current.project?.revision).toBe(2);
    expect(result.current.draft?.revision).toBe(2);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "next" })));
    api.save.mockResolvedValue(project(A, "next", 3));
    await act(async () => { await result.current.save(); });
    expect(api.save).toHaveBeenLastCalledWith(A, expect.objectContaining({ name: "next", revision: 2 }), 2);
  });

  it("preserves newer edits made while saving and uses the acknowledged revision for the next save", async () => {
    const pending = deferred<StoredProject>();
    api.save.mockReturnValueOnce(pending.promise);
    const { result } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "submitted" })));
    let saving!: Promise<StoredProject | null>;
    act(() => { saving = result.current.save(); });
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "newer", freezeFrames: 15 })));
    await act(async () => { pending.resolve(project(A, "submitted", 2)); await saving; });
    expect(result.current.project).toMatchObject({ name: "submitted", revision: 2 });
    expect(result.current.draft).toMatchObject({ name: "newer", freezeFrames: 15, revision: 2 });
    expect(result.current.isDirty).toBe(true);
    await act(async () => { await result.current.save(); });
    expect(api.save).toHaveBeenLastCalledWith(A, expect.objectContaining({ name: "newer", freezeFrames: 15 }), 2);
    expect(result.current.isDirty).toBe(false);
  });

  it("applies an in-flight A save only to A's cache after switching to B", async () => {
    const pending = deferred<StoredProject>();
    api.save.mockReturnValue(pending.promise);
    const { result, rerender } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "saved A" })));
    let saving!: Promise<StoredProject | null>;
    act(() => { saving = result.current.save(); });
    rerender({ id: B });
    await loaded(result, B);
    await act(async () => { pending.resolve(project(A, "saved A", 2)); await saving; });
    expect(result.current.project).toEqual(project(B));
    expect(result.current.draft?.name).toBe("B");
    rerender({ id: A });
    expect(result.current.draft?.name).toBe("saved A");
    expect(result.current.project?.revision).toBe(2);
    expect(result.current.isDirty).toBe(false);
  });

  it.each(["BUSY", "UNKNOWN", "VALIDATION"])(
    "keeps %s HTTP 409 retryable with the dirty draft and baseline intact, without reload", async (code) => {
      const confirm = vi.spyOn(window, "confirm");
      api.save.mockRejectedValueOnce(new ClientApiError(code, code, 409));
      const { result } = mount();
      await loaded(result);
      act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
      await act(async () => expect(await result.current.save()).toBeNull());
      expect(result.current).toMatchObject({ error: code, isConflict: false, isDirty: true, isSaving: false });
      expect(result.current.draft?.name).toBe("local");
      expect(result.current.project?.revision).toBe(1);
      expect(api.fetch).toHaveBeenCalledTimes(1);
      await act(async () => expect((await result.current.save())?.revision).toBe(2));
      expect(api.save).toHaveBeenLastCalledWith(A, expect.objectContaining({ name: "local", revision: 1 }), 1);
      expect(result.current).toMatchObject({ error: null, isConflict: false, isDirty: false });
      expect(api.fetch).toHaveBeenCalledTimes(1);
      expect(confirm).not.toHaveBeenCalled();
    },
  );

  it("sets conflict only from its structured code and retains a known conflict after BUSY", async () => {
    api.save.mockRejectedValueOnce(new ClientApiError("REVISION_CONFLICT", "Revisi berubah", 412))
      .mockRejectedValueOnce(new ClientApiError("BUSY", "Coba lagi", 409));
    const { result } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
    await act(async () => { await result.current.save(); });
    expect(result.current.isConflict).toBe(true);
    await act(async () => { await result.current.save(); });
    expect(result.current).toMatchObject({ isConflict: true, isDirty: true, error: "Coba lagi" });
    expect(result.current.draft?.name).toBe("local");
    expect(result.current.project?.revision).toBe(1);
    expect(api.fetch).toHaveBeenCalledTimes(1);
  });

  it("retains conflict, baseline and dirty draft across edits and cache navigation", async () => {
    api.save.mockRejectedValue(new ClientApiError("REVISION_CONFLICT", "Revisi berubah", 409));
    const { result, rerender } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
    await act(async () => expect(await result.current.save()).toBeNull());
    expect(result.current).toMatchObject({ error: "Revisi berubah", isConflict: true, isDirty: true, isSaving: false });
    expect(result.current.project?.revision).toBe(1);
    act(() => result.current.updateDraft((draft) => ({ ...draft, freezeFrames: 10 })));
    rerender({ id: B });
    await loaded(result, B);
    rerender({ id: A });
    expect(result.current).toMatchObject({ error: "Revisi berubah", isConflict: true, isDirty: true });
    expect(result.current.draft?.name).toBe("local");
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("requires dirty reload confirmation and discards only after a successful confirmed reload", async () => {
    api.save.mockRejectedValue(new ClientApiError("REVISION_CONFLICT", "Konflik", 409));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
    await act(async () => { await result.current.save(); });
    await act(async () => expect(await result.current.reload()).toBeNull());
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("akan dibuang"));
    expect(api.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.draft?.name).toBe("local");
    expect(result.current.isConflict).toBe(true);

    confirm.mockReturnValue(true);
    const pending = deferred<StoredProject>();
    api.fetch.mockReturnValue(pending.promise);
    let reloading!: Promise<StoredProject | null>;
    act(() => { reloading = result.current.reload(); });
    expect(result.current).toMatchObject({ isLoading: true, project: null, draft: null, isDirty: true, isConflict: true });
    await act(async () => { pending.resolve(project(A, "server", 8)); await reloading; });
    expect(result.current).toMatchObject({ isDirty: false, isConflict: false, error: null, isLoading: false });
    expect(result.current.draft).toMatchObject({ name: "server", revision: 8 });
  });

  it("keeps the local draft on a failed confirmed reload, retaining the conflict", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.save.mockRejectedValue(new ClientApiError("REVISION_CONFLICT", "Konflik", 409));
    const { result } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
    await act(async () => { await result.current.save(); });
    api.fetch.mockRejectedValue(new Error("Offline"));
    await act(async () => expect(await result.current.reload()).toBeNull());
    expect(result.current).toMatchObject({ isDirty: true, isConflict: true, error: "Offline", isLoading: false });
    expect(result.current.draft?.name).toBe("local");
    expect(result.current.project?.revision).toBe(1);
  });

  it("keeps dirty A if a confirmed reload is cancelled by switching projects", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const pending = deferred<StoredProject>();
    const { result, rerender } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
    api.fetch.mockReturnValueOnce(pending.promise);
    let reloading!: Promise<StoredProject | null>;
    act(() => { reloading = result.current.reload(); });
    const signal = api.fetch.mock.calls[1][1] as AbortSignal;
    rerender({ id: B });
    await loaded(result, B);
    expect(signal.aborted).toBe(true);
    rerender({ id: A });
    expect(result.current.draft?.name).toBe("local");
    await act(async () => { pending.resolve(project(A, "server", 7)); await reloading; });
    expect(result.current.draft?.name).toBe("local");
    expect(result.current.isDirty).toBe(true);
    expect(result.current.project?.revision).toBe(1);
  });

  it("strips server metadata returned by an updater and pins draft identity/revision", async () => {
    const { result } = mount();
    await loaded(result);
    act(() => result.current.updateDraft(() => project(B, "local", 99)));
    expect(result.current.draft).toMatchObject({ id: A, revision: 1, name: "local" });
    expect(result.current.draft).not.toHaveProperty("createdAt");
    expect(result.current.draft).not.toHaveProperty("sourceStatus");
    await act(async () => { await result.current.save(); });
    expect(api.save.mock.calls[0][1]).not.toHaveProperty("updatedAt");
    expect(api.save.mock.calls[0][1]).not.toHaveProperty("sourceStatus");
    expect(api.save).toHaveBeenCalledWith(A, expect.objectContaining({ id: A, revision: 1 }), 1);
  });

  it("can retry a failed initial load without confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm");
    api.fetch.mockRejectedValueOnce(new Error("Offline"));
    const { result } = mount();
    await waitFor(() => expect(result.current.error).toBe("Offline"));
    expect(result.current.isLoading).toBe(false);
    await act(async () => { await result.current.reload(); });
    expect(result.current.draft?.name).toBe("A");
    expect(result.current.error).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not reload/discard a draft while its save is in flight", async () => {
    const pending = deferred<StoredProject>();
    api.save.mockReturnValue(pending.promise);
    const confirm = vi.spyOn(window, "confirm");
    const { result } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
    let saving!: Promise<StoredProject | null>;
    act(() => { saving = result.current.save(); });
    await act(async () => expect(await result.current.reload()).toBeNull());
    expect(api.fetch).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(project(A, "local", 2)); await saving; });
  });

  it("retains a draft and general save error without treating it as a conflict", async () => {
    api.save.mockRejectedValue(new Error("Offline"));
    const { result } = mount();
    await loaded(result);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
    await act(async () => expect(await result.current.save()).toBeNull());
    expect(result.current).toMatchObject({ isDirty: true, isSaving: false, error: "Offline", isConflict: false });
    expect(result.current.draft?.name).toBe("local");
    act(() => result.current.resetDraft());
    expect(result.current.draft?.name).toBe("A");
    expect(result.current.error).toBe("Offline");
  });

  it("rejects fetch and save responses carrying the wrong project ID", async () => {
    api.fetch.mockResolvedValueOnce(project(B));
    const { result } = mount();
    await waitFor(() => expect(result.current.error).toContain("tidak sesuai"));
    expect(result.current.project).toBeNull();
    await act(async () => { await result.current.reload(); });
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
    api.save.mockResolvedValue(project(B, "wrong", 9));
    await act(async () => expect(await result.current.save()).toBeNull());
    expect(result.current.project?.id).toBe(A);
    expect(result.current.draft?.name).toBe("local");
    expect(result.current.isDirty).toBe(true);
  });

  it("warns on native unload for any cached dirty project, including while on home", async () => {
    const { result, rerender, unmount } = mount();
    await loaded(result);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "local" })));
    rerender({ id: null });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    rerender({ id: A });
    act(() => result.current.resetDraft());
    const reset = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(reset);
    expect(reset.defaultPrevented).toBe(false);
    act(() => result.current.updateDraft((draft) => ({ ...draft, name: "dirty again" })));
    unmount();
    const closed = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(closed);
    expect(closed.defaultPrevented).toBe(false);
  });
});
