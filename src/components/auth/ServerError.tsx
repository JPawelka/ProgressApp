import { CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServerErrorProps {
  message?: string | null;
  variant?: "error" | "info";
}

export function ServerError({ message, variant = "error" }: ServerErrorProps) {
  if (!message) return null;

  const Icon = variant === "info" ? Info : CircleAlert;

  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        variant === "info"
          ? "border-blue-400/30 bg-blue-900/30 text-blue-200"
          : "border-red-500/30 bg-red-900/30 text-red-300",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {message}
    </p>
  );
}
