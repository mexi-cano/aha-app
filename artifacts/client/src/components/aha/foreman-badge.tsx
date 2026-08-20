import { cn } from "@/lib/utils";

export function ForemanBadge({
  className,
  label = "FOREMAN",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-primary",
        className,
      )}
    >
      {label}
    </span>
  );
}
