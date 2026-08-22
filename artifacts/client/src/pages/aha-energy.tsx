import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useSearchParams } from "react-router";
import {
  ENERGY_CATEGORIES,
  ENERGY_CATEGORY_NAMES,
  SAFETY_GATE_INSTRUCTION,
  SAFETY_GATE_QUESTION,
  toggleEnergyCategory,
  toggleEnergyExample,
  type EnergyCategoryName,
} from "@workspace/aha-domain";

import { EditorContinue } from "@/components/aha/editor-continue";
import { EditorShell } from "@/components/aha/editor-shell";
import { EnergyCategoryToggle } from "@/components/aha/energy-category-toggle";
import { EnergyWheel } from "@/components/aha/energy-wheel";
import { FieldRequirementBadge } from "@/components/aha/form-field";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { scrollToAndFocus } from "@/features/aha-editor/editor-navigation";
import { cn } from "@/lib/utils";

export default function AhaEnergy() {
  const { aha, updateAha, navigateSafely, editorBasePath } = useAhaEditor();
  const [expanded, setExpanded] = useState<EnergyCategoryName | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("focus") === "safety-check") {
      scrollToAndFocus("safety-check");
    }
  }, [searchParams]);

  const selectedCategories = aha.energySelections.map(
    ({ category }) => category,
  );

  return (
    <EditorShell>
      <div className="flex flex-col gap-[18px]">
        <header>
          <h1 className="text-[28px] font-bold">Energy</h1>
          <p className="mt-1 text-base font-medium text-muted-foreground sm:text-[17px]">
            Mark every energy type in today's work
          </p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            Choose only the energy sources and examples present in today&apos;s
            work.
          </p>
        </header>

        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_244px]">
          <div className="grid gap-3 sm:grid-cols-2">
            {ENERGY_CATEGORIES.map(({ category, examples }) => {
              const selection = aha.energySelections.find(
                (candidate) => candidate.category === category,
              );
              const isSelected = Boolean(selection);
              const isExpanded = expanded === category;
              const markedCount = selection?.examples.length ?? 0;
              const panelId = `energy-examples-${category
                .toLowerCase()
                .replaceAll(" ", "-")}`;

              return (
                <article
                  key={category}
                  className={cn(
                    "overflow-hidden rounded-[14px] border-2 bg-card",
                    isSelected
                      ? "border-primary bg-secondary"
                      : "border-border",
                    category ===
                      ENERGY_CATEGORY_NAMES[ENERGY_CATEGORY_NAMES.length - 1] &&
                      "sm:col-span-2",
                  )}
                >
                  <EnergyCategoryToggle
                    category={category}
                    selected={isSelected}
                    markedCount={!isExpanded ? markedCount : undefined}
                    onToggle={() =>
                      updateAha((current) =>
                        toggleEnergyCategory(current, category),
                      )
                    }
                  />

                  <div
                    className={cn(
                      "mx-4 h-px",
                      isSelected ? "bg-[#C6CDE8]" : "bg-border",
                    )}
                  />
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center justify-between px-[18px] text-left text-[15px] font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    onClick={() =>
                      setExpanded((current) =>
                        current === category ? null : category,
                      )
                    }
                  >
                    {isExpanded ? "Hide examples" : "See examples"}
                    {isExpanded ? (
                      <ChevronUp className="size-5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-5" aria-hidden="true" />
                    )}
                  </button>

                  {isExpanded ? (
                    <div
                      id={panelId}
                      className="flex flex-col gap-2.5 px-4 pb-4 pt-0.5"
                    >
                      <p className="text-sm font-medium text-muted-foreground">
                        Tap any that apply — marking one selects this category
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {examples.map((example) => {
                          const marked = selection?.examples.includes(example);
                          return (
                            <button
                              key={example}
                              type="button"
                              className={cn(
                                "min-h-12 rounded-full border-[1.5px] px-[18px] py-2.5 text-left text-[15px] font-semibold leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                marked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-[#C6CDE8] bg-card text-foreground",
                              )}
                              aria-pressed={marked}
                              onClick={() =>
                                updateAha((current) =>
                                  toggleEnergyExample(
                                    current,
                                    category,
                                    example,
                                  ),
                                )
                              }
                            >
                              {example}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <aside className="order-first md:order-none md:sticky md:top-[156px]">
            <EnergyWheel selectedCategories={selectedCategories} />
          </aside>
        </div>

        <section
          id="safety-check-section"
          className="rounded-2xl border-2 border-primary bg-card px-5 py-6 sm:px-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold tracking-[0.1em] text-primary">
              SAFETY CHECK
            </p>
            <FieldRequirementBadge
              requirement="required"
              label="Required for signing"
            />
          </div>
          <h2
            id="safety-check-question"
            className="mt-3 text-xl font-bold leading-7"
          >
            {SAFETY_GATE_QUESTION}
          </h2>
          <div
            className="mt-4 grid grid-cols-2 gap-3"
            role="group"
            aria-labelledby="safety-check-question"
            aria-required="true"
          >
            <button
              id="safety-check"
              type="button"
              className={cn(
                "min-h-16 rounded-xl border-2 text-xl font-bold tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring",
                aha.safetyCheck === "yes"
                  ? "border-success bg-success text-white"
                  : "border-[#C6CDE8] bg-card",
              )}
              aria-pressed={aha.safetyCheck === "yes"}
              onClick={() =>
                updateAha((current) => ({ ...current, safetyCheck: "yes" }))
              }
            >
              {aha.safetyCheck === "yes" ? "✓ YES" : "YES"}
            </button>
            <button
              type="button"
              className={cn(
                "min-h-16 rounded-xl border-2 text-xl font-bold tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring",
                aha.safetyCheck === "no"
                  ? "border-foreground bg-foreground text-background"
                  : "border-[#C6CDE8] bg-card",
              )}
              aria-pressed={aha.safetyCheck === "no"}
              onClick={() =>
                updateAha((current) => ({ ...current, safetyCheck: "no" }))
              }
            >
              {aha.safetyCheck === "no" ? "✓ NO" : "NO"}
            </button>
          </div>
          <p className="mt-3 text-[15px] font-medium text-muted-foreground">
            {SAFETY_GATE_INSTRUCTION}.
          </p>
        </section>

        <EditorContinue
          next="4 Review"
          onContinue={() => void navigateSafely(`${editorBasePath}/review`)}
        />
      </div>
    </EditorShell>
  );
}
