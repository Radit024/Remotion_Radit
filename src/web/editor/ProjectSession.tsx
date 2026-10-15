"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { editSchema, type Edit } from "@/shared/edit";
import type { StoredProject } from "@/server/projects";
import { ClientApiError, fetchProject, saveProject } from "@/web/api";

export function normalizeProjectId(id: string): string {
  return id.toLowerCase();
}

export type ProjectState = {
  project: StoredProject | null;
  draft: Edit | null;
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  isConflict: boolean;
};

const EMPTY: ProjectState = {
  project: null,
  draft: null,
  isDirty: false,
  isSaving: false,
  isLoading: false,
  error: null,
  isConflict: false,
};
const UNLOADED: ProjectState = { ...EMPTY, isLoading: true };

type Entry = {
  state: ProjectState;
  consumers: number;
  generation: number;
  controller: AbortController | null;
  saveGeneration: number;
  savePromise: Promise<StoredProject | null> | null;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const EDIT_KEYS = Object.keys(editSchema.shape) as (keyof Edit)[];

function asDraft(project: Edit): Edit {
  // Server-only metadata (including sourceStatus) must never enter the PUT body.
  return clone(Object.fromEntries(EDIT_KEYS.map((key) => [key, project[key]])) as Edit);
}

function sameDraft(a: Edit, b: Edit): boolean {
  return EDIT_KEYS.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

function createSession() {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();

  function entryFor(projectId: string): Entry {
    const id = normalizeProjectId(projectId);
    let entry = entries.get(id);
    if (!entry) {
      entry = {
        state: UNLOADED,
        consumers: 0,
        generation: 0,
        controller: null,
        saveGeneration: 0,
        savePromise: null,
      };
      entries.set(id, entry);
    }
    return entry;
  }

  function publish(entry: Entry, patch: Partial<ProjectState>) {
    entry.state = { ...entry.state, ...patch };
    listeners.forEach((listener) => listener());
  }

  function cancelLoad(entry: Entry) {
    entry.generation += 1;
    entry.controller?.abort();
    entry.controller = null;
    if (entry.state.isLoading) publish(entry, { isLoading: false });
  }

  async function load(projectId: string): Promise<StoredProject | null> {
    const id = normalizeProjectId(projectId);
    const entry = entryFor(id);
    cancelLoad(entry);
    const generation = entry.generation;
    const controller = new AbortController();
    entry.controller = controller;
    publish(entry, { isLoading: true });
    try {
      const project = await fetchProject(id, controller.signal);
      if (entry.generation !== generation || controller.signal.aborted) return null;
      if (normalizeProjectId(project.id) !== id) throw new Error("Respons proyek tidak sesuai dengan proyek yang diminta");
      const baseline = clone({ ...project, id });
      publish(entry, {
        project: baseline,
        draft: asDraft(baseline),
        isDirty: false,
        error: null,
        isConflict: false,
        isLoading: false,
      });
      return baseline;
    } catch (error) {
      if (entry.generation !== generation || controller.signal.aborted) return null;
      publish(entry, {
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
      return null;
    } finally {
      if (entry.generation === generation) entry.controller = null;
    }
  }

  function save(projectId: string | null): Promise<StoredProject | null> {
    if (!projectId) return Promise.resolve(null);
    const id = normalizeProjectId(projectId);
    const entry = entryFor(id);
    if (entry.savePromise) return entry.savePromise;
    const { project, draft, isDirty, isLoading } = entry.state;
    if (!project || !draft || isLoading) return Promise.resolve(null);
    if (!isDirty) return Promise.resolve(project);

    const submitted = asDraft(draft);
    const generation = entry.saveGeneration;
    publish(entry, { isSaving: true });
    entry.savePromise = Promise.resolve().then(async () => {
      try {
        const saved = await saveProject(id, submitted, project.revision);
        if (entry.saveGeneration !== generation) return null;
        if (normalizeProjectId(saved.id) !== id) throw new Error("Respons simpan tidak sesuai dengan proyek yang diminta");
        const baseline = clone({ ...saved, id });
        const currentDraft = entry.state.draft;
        // A save acknowledges only the submitted snapshot, not newer edits.
        const nextDraft = currentDraft && !sameDraft(currentDraft, submitted)
          ? { ...currentDraft, id: baseline.id, assetId: baseline.assetId, revision: baseline.revision }
          : asDraft(baseline);
        publish(entry, {
          project: baseline,
          draft: nextDraft,
          isDirty: !sameDraft(nextDraft, asDraft(baseline)),
          error: null,
          isConflict: false,
        });
        return baseline;
      } catch (error) {
        if (entry.saveGeneration !== generation) return null;
        publish(entry, {
          error: error instanceof Error ? error.message : String(error),
          // HTTP 409 also signals BUSY; only the structured code proves a stale revision.
          isConflict: entry.state.isConflict || (
            error instanceof ClientApiError && error.code === "REVISION_CONFLICT"
          ),
        });
        return null;
      } finally {
        if (entry.saveGeneration === generation) {
          entry.savePromise = null;
          publish(entry, { isSaving: false });
        }
      }
    });
    return entry.savePromise;
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot(id: string | null): ProjectState {
      if (!id) return EMPTY;
      const state = entries.get(normalizeProjectId(id))?.state;
      // An uncached selection is loading on its very first render, before effects.
      return !state || (!state.project && !state.error && !state.isLoading) ? UNLOADED : state;
    },
    getServerSnapshot(id: string | null): ProjectState {
      return id ? UNLOADED : EMPTY;
    },
    retain(id: string) {
      const entry = entryFor(id);
      entry.consumers += 1;
      if (!entry.state.project && !entry.state.error && !entry.controller) void load(id);
      return () => {
        entry.consumers -= 1;
        if (entry.consumers === 0) cancelLoad(entry);
      };
    },
    updateDraft(id: string | null, updater: (previous: Edit) => Edit) {
      if (!id) return;
      const entry = entryFor(id);
      const { project, draft, isLoading } = entry.state;
      if (!project || !draft || isLoading) return;
      const next = asDraft({ ...updater(clone(draft)), id: project.id, revision: project.revision });
      publish(entry, { draft: next, isDirty: !sameDraft(next, asDraft(project)) });
    },
    save,
    resetDraft(id: string | null) {
      if (!id) return;
      const entry = entryFor(id);
      if (entry.state.project && !entry.state.isLoading) {
        publish(entry, { draft: asDraft(entry.state.project), isDirty: false });
      }
    },
    reload(id: string | null): Promise<StoredProject | null> {
      if (!id) return Promise.resolve(null);
      const entry = entryFor(id);
      if (entry.state.isSaving) return Promise.resolve(null);
      if (entry.state.isDirty && !window.confirm(
        "Muat revisi terbaru? Perubahan yang belum disimpan pada proyek ini akan dibuang.",
      )) return Promise.resolve(null);
      // Keep the old draft internally until reload succeeds, including on failure.
      return load(id);
    },
    hasDirtyProjects() {
      return Array.from(entries.values()).some((entry) => entry.state.isDirty);
    },
    cancelRequests() {
      entries.forEach((entry) => {
        cancelLoad(entry);
        entry.saveGeneration += 1;
        entry.savePromise = null;
        if (entry.state.isSaving) publish(entry, { isSaving: false });
      });
    },
  };
}

const ProjectSessionContext = createContext<ReturnType<typeof createSession> | null>(null);

export function ProjectSession({ children }: { children: ReactNode }) {
  const [session] = useState(createSession);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!session.hasDirtyProjects()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      session.cancelRequests();
    };
  }, [session]);

  return (
    <ProjectSessionContext.Provider value={session}>
      {children}
    </ProjectSessionContext.Provider>
  );
}

export function useProjectSession() {
  const session = useContext(ProjectSessionContext);
  if (!session) throw new Error("useProject harus digunakan di dalam ProjectSession");
  return session;
}
