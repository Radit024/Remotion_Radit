"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HomePage } from "@/web/home/HomePage";
import { Editor } from "@/web/editor/Editor";
import { ProjectSession, normalizeProjectId, useProjectSession } from "@/web/editor/ProjectSession";
import { useProject } from "@/web/editor/useProject";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Route =
  | { view: "home" | "projects"; projectId: null }
  | { view: "editor"; projectId: string }
  | { view: "invalid"; projectId: null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readRoute(params: ReturnType<typeof useSearchParams>): Route {
  const projects = params.getAll("project");
  const views = params.getAll("view");
  if (projects.length) {
    return projects.length === 1 && UUID.test(projects[0]) && views.length === 0
      ? { view: "editor", projectId: normalizeProjectId(projects[0]) }
      : { view: "invalid", projectId: null };
  }
  if (views.length === 0) return { view: "home", projectId: null };
  return views.length === 1 && views[0] === "projects"
    ? { view: "projects", projectId: null }
    : { view: "invalid", projectId: null };
}

function ShellView({ route }: { route: Route }) {
  const router = useRouter();
  const session = useProjectSession();
  const { save, isSaving, error } = useProject(route.projectId);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const navigationGeneration = useRef(0);

  useEffect(() => () => { navigationGeneration.current += 1; }, []);

  const cancelNavigation = useCallback(() => {
    navigationGeneration.current += 1;
    setPendingHref(null);
    setIsLeaving(false);
  }, []);

  const requestNavigation = useCallback((href: string) => {
    if (route.projectId && href === `/?project=${route.projectId}`) return;
    if (session.getSnapshot(route.projectId).isDirty) {
      navigationGeneration.current += 1;
      setIsLeaving(false);
      setPendingHref(href);
    } else {
      router.push(href);
    }
  }, [route.projectId, router, session]);

  const selectProject = useCallback((id: string) => {
    // Never forward a selector value as an arbitrary URL to the router.
    requestNavigation(`/?project=${encodeURIComponent(normalizeProjectId(id))}`);
  }, [requestNavigation]);

  const navigateHome = useCallback(() => requestNavigation("/"), [requestNavigation]);

  const saveAndLeave = async () => {
    if (!pendingHref || isLeaving) return;
    const generation = navigationGeneration.current;
    const href = pendingHref;
    setIsLeaving(true);
    const saved = await save();
    if (generation !== navigationGeneration.current) return;
    setIsLeaving(false);
    // Edits made during save still need a decision; a failed save never leaves.
    if (saved && !session.getSnapshot(route.projectId).isDirty) {
      cancelNavigation();
      router.push(href);
    }
  };

  const leaveTemporarily = () => {
    if (!pendingHref) return;
    const href = pendingHref;
    cancelNavigation();
    router.push(href);
  };

  return (
    <>
      {route.view === "invalid" ? (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
          <h1 className="font-heading text-xl font-semibold">Proyek tidak valid</h1>
          <p className="text-sm text-muted-foreground">Periksa tautan proyek atau kembali ke beranda.</p>
          <Link href="/" className="rounded-md text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
            Kembali ke Beranda
          </Link>
        </main>
      ) : route.view === "editor" ? (
        <Editor {...{
          initialProjectId: route.projectId,
          onNavigateHome: navigateHome,
          onSelectProject: selectProject,
        }} />
      ) : (
        <HomePage {...{
          view: route.view,
          onOpenProject: selectProject,
          onNewProject: selectProject,
        }} />
      )}

      <Dialog open={pendingHref !== null} onOpenChange={(open) => { if (!open) cancelNavigation(); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Perubahan belum disimpan</DialogTitle>
            <DialogDescription>
              Simpan sebelum pindah, atau tinggalkan sementara. Draft hanya tersimpan dalam memori tab ini dan dapat hilang saat halaman dimuat ulang atau tab ditutup.
            </DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="flex-wrap">
            <Button type="button" variant="outline" onClick={cancelNavigation}>Batal</Button>
            <Button type="button" variant="secondary" onClick={leaveTemporarily}>Tinggalkan sementara</Button>
            <Button type="button" disabled={isSaving || isLeaving} onClick={() => { void saveAndLeave(); }}>
              {isSaving || isLeaving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoutedShell() {
  const params = useSearchParams();
  const route = readRoute(params);
  // Case-only UUID changes are the same destination, not a new editor/load.
  return <ShellView key={route.projectId ?? route.view} route={route} />;
}

export function AppShell() {
  return (
    <ProjectSession>
      <RoutedShell />
    </ProjectSession>
  );
}
