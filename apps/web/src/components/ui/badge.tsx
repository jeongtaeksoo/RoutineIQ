import * as React from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "secondary" | "outline" | "destructive" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        variant === "default" && "bg-bg text-fg",
        variant === "secondary" && "bg-white/70 text-mutedFg",
        variant === "outline" && "bg-transparent text-mutedFg",
        variant === "destructive" && "border-red-200 bg-red-50 text-red-700",
        className
      )}
      {...props}
    />
  );
}
