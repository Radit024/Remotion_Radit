"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilm, faSpinner, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import type { ProjectSummary } from "@/web/api";

export type ProjectCardProject = Omit<ProjectSummary, "sourceStatus"> & {
  sourceStatus?: "metadata-missing" | "file-missing" | "available";
};

interface ProjectCardProps {
  project: ProjectCardProject;
  onOpenProject: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  deleting?: boolean;
  deleteDisabled?: boolean;
}

const sourceLabels = {
  "metadata-missing": "Metadata sumber hilang",
  "file-missing": "Berkas sumber hilang",
  available: "Sumber tersedia",
};

export function ProjectCard({ project, onOpenProject, onDelete, deleting = false, deleteDisabled = false }: ProjectCardProps) {
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const thumbnail = project.sourceStatus === "available" && project.assetId
    ? `/api/assets/${encodeURIComponent(project.assetId)}/content?proxy=true#t=0.5`
    : null;
  const date = new Date(project.updatedAt);
  const validDate = Number.isFinite(date.getTime());
  const sourceMissing = project.sourceStatus === "metadata-missing" || project.sourceStatus === "file-missing";
  const sourceLabel = project.sourceStatus ? sourceLabels[project.sourceStatus] : "Status sumber belum diketahui";

  return (
    <article className="group min-w-0 overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50 focus-within:border-primary/70">
      <Link
        href={`/?project=${encodeURIComponent(project.id)}`}
        prefetch={false}
        aria-label={`Buka proyek ${project.name}`}
        onClick={(event) => {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onOpenProject(project.id);
        }}
        className="block rounded-t-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <div className="flex aspect-video items-center justify-center overflow-hidden border-b border-border bg-background">
          {thumbnail && failedThumbnail !== thumbnail ? (
            <video
              key={thumbnail}
              src={thumbnail}
              preload="metadata"
              muted
              playsInline
              aria-hidden="true"
              onError={() => setFailedThumbnail(thumbnail)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 p-4 text-muted-foreground">
              <FontAwesomeIcon icon={faFilm} aria-hidden="true" className="size-6" />
              <span className="text-center text-xs leading-4">
                {sourceMissing ? "Sumber tidak tersedia" : "Pratinjau tidak tersedia"}
              </span>
            </div>
          )}
        </div>
        <div className="space-y-1.5 p-4">
          <h3 className="truncate font-heading text-sm font-semibold leading-5 text-foreground group-hover:text-primary" title={project.name}>
            {project.name}
          </h3>
          <p className="truncate text-xs leading-4 text-muted-foreground" title={project.sourceName}>
            {project.sourceName || "Nama sumber tidak diketahui"}
          </p>
          <p className={`text-xs leading-4 ${sourceMissing ? "text-destructive" : "text-muted-foreground"}`}>
            {sourceLabel}
          </p>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2">
        <p className="min-w-0 text-xs leading-4 text-muted-foreground">
          {validDate ? (
            <>Diperbarui <time dateTime={project.updatedAt} title={date.toLocaleString("id-ID")}>
              {date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
            </time></>
          ) : "Tanggal tidak diketahui"}
        </p>
        <Button
          type="button"
          variant="ghost"
          aria-label={`${deleting ? "Menghapus" : "Hapus"} proyek ${project.name}`}
          disabled={deleting || deleteDisabled}
          onClick={() => onDelete(project.id, project.name)}
          className="size-11 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <FontAwesomeIcon icon={deleting ? faSpinner : faTrashCan} aria-hidden="true" className={`size-4 ${deleting ? "animate-spin motion-reduce:animate-none" : ""}`} />
        </Button>
      </div>
    </article>
  );
}
