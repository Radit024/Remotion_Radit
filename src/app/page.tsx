import { Suspense } from "react";
import { AppShell } from "@/web/AppShell";

export default function Page() {
  return (
    <Suspense fallback={<div role="status" className="p-6 text-sm text-muted-foreground">Memuat ruang kerja…</div>}>
      <AppShell />
    </Suspense>
  );
}
