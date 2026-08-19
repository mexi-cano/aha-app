import { cn } from "@/lib/utils";

export function ForemanBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-primary",
        className,
      )}
    >
      FOREMAN
    </span>
  );
}
