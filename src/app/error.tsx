"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("moment-lab error boundary:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <h1 className="text-xl font-semibold">Terjadi kesalahan</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "Kesalahan tidak diketahui."}
      </p>
      <Button onClick={reset}>Coba lagi</Button>
    </div>
  );
}
