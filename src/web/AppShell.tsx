"use client";

import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HomePage } from "@/web/home/HomePage";
import { Editor } from "@/web/editor/Editor";

export const AppShell: React.FC = () => {
  const [view, setView] = useState<"home" | "editor">("home");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const projectId = params.get("project");
      if (projectId) {
        setSelectedProjectId(projectId);
        setView("editor");
      }
    }
  }, []);

  const handleOpenProject = (id: string) => {
    setSelectedProjectId(id);
    setView("editor");
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", `?project=${id}`);
    }
  };

  const handleNewProject = (id: string) => {
    setSelectedProjectId(id);
    setView("editor");
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", `?project=${id}`);
    }
  };

  const handleNavigateHome = () => {
    setView("home");
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", window.location.pathname);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {view === "editor" ? (
        <motion.div
          key="editor"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="h-full w-full"
        >
          <Editor
            initialProjectId={selectedProjectId}
            onNavigateHome={handleNavigateHome}
          />
        </motion.div>
      ) : (
        <motion.div
          key="home"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="h-full w-full"
        >
          <HomePage
            onOpenProject={handleOpenProject}
            onNewProject={handleNewProject}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
