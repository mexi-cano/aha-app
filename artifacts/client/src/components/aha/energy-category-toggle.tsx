import type { EnergyCategoryName } from "@workspace/aha-domain";

import { cn } from "@/lib/utils";

export function EnergyCategoryToggle({
  category,
  selected,
  markedCount,
  onToggle,
  className,
}: {
  category: EnergyCategoryName;
  selected: boolean;
  markedCount?: number;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-[76px] w-full items-center gap-3.5 rounded-xl px-[18px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <span
        className={cn(
          "flex size-[26px] shrink-0 items-center justify-center rounded-[7px] border-2 text-base font-bold",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-[#8A93AC] bg-card text-transparent",
        )}
        aria-hidden="true"
      >
        ✓
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold">{category}</span>
        {markedCount ? (
          <span className="mt-0.5 block text-sm font-semibold text-primary">
            {markedCount}{" "}
            {markedCount === 1 ? "example marked" : "examples marked"}
          </span>
        ) : null}
      </span>
    </button>
  );
}
