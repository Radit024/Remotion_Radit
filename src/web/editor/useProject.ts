"use client";

import { useState, useCallback, useEffect } from "react";
import type { Edit } from "@/shared/edit";
import type { StoredProject } from "@/server/projects";
import { fetchProject, saveProject as apiSaveProject } from "@/web/api";

export function useProject(projectId: string | null) {
  const [project, setProject] = useState<StoredProject | null>(null);
  const [draft, setDraft] = useState<Edit | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setDraft(null);
      setIsDirty(false);
      return;
    }
    try {
      setError(null);
      const data = await fetchProject(projectId);
      setProject(data);
      setDraft(JSON.parse(JSON.stringify(data)));
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = useCallback((updater: (prev: Edit) => Edit) => {
    setDraft((prev) => {
      if (!prev) return null;
      const next = updater(prev);
      setIsDirty(true);
      return next;
    });
  }, []);

  const save = useCallback(async (): Promise<StoredProject | null> => {
    if (!draft || !project) return null;
    try {
      setIsSaving(true);
      setError(null);
      const saved = await apiSaveProject(project.id, draft, project.revision);
      setProject(saved);
      setDraft(JSON.parse(JSON.stringify(saved)));
      setIsDirty(false);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [draft, project]);

  const resetDraft = useCallback(() => {
    if (project) {
      setDraft(JSON.parse(JSON.stringify(project)));
      setIsDirty(false);
    }
  }, [project]);

  return {
    project,
    draft,
    isDirty,
    isSaving,
    error,
    updateDraft,
    save,
    resetDraft,
    reload: load,
  };
}
