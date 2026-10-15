"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Edit } from "@/shared/edit";
import { normalizeProjectId, useProjectSession } from "./ProjectSession";

export function useProject(projectId: string | null) {
  const session = useProjectSession();
  const id = projectId === null ? null : normalizeProjectId(projectId);
  const getSnapshot = useCallback(() => session.getSnapshot(id), [session, id]);
  const getServerSnapshot = useCallback(() => session.getServerSnapshot(id), [session, id]);
  const state = useSyncExternalStore(session.subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (id) return session.retain(id);
  }, [session, id]);

  const actions = useMemo(() => ({
    updateDraft: (updater: (previous: Edit) => Edit) => session.updateDraft(id, updater),
    save: () => session.save(id),
    resetDraft: () => session.resetDraft(id),
    reload: () => session.reload(id),
  }), [session, id]);

  return {
    ...state,
    // Loading must never render another project's draft (or a reload's old draft).
    project: state.isLoading ? null : state.project,
    draft: state.isLoading ? null : state.draft,
    ...actions,
  };
}
