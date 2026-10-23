import type { ReactNode } from "react";

export function Banner({ kind = "info", children }: { kind?: "info" | "warn" | "error"; children: ReactNode }) {
  return (
    <div className={`banner ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
