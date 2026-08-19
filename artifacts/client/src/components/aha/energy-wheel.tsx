import {
  ENERGY_CATEGORY_NAMES,
  type EnergyCategoryName,
} from "@workspace/aha-domain";

import wheelImage from "../../../../../assets/aha-energy-wheel-recolored.png";

const HUMAN_FACTORS_CATEGORY =
  ENERGY_CATEGORY_NAMES[ENERGY_CATEGORY_NAMES.length - 1]!;
const WHEEL_CATEGORIES: readonly EnergyCategoryName[] =
  ENERGY_CATEGORY_NAMES.slice(0, -1);

function point(radius: number, angle: number): [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [50 + radius * Math.sin(radians), 50 - radius * Math.cos(radians)];
}

function formattedPoint([x, y]: [number, number]): string {
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

function getWheelSectorPath(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStart = point(outerRadius, startAngle);
  const outerEnd = point(outerRadius, endAngle);
  const innerEnd = point(innerRadius, endAngle);
  const innerStart = point(innerRadius, startAngle);
  return `M ${formattedPoint(outerStart)} A ${outerRadius} ${outerRadius} 0 0 1 ${formattedPoint(outerEnd)} L ${formattedPoint(innerEnd)} A ${innerRadius} ${innerRadius} 0 0 0 ${formattedPoint(innerStart)} Z`;
}

export function EnergyWheel({
  selectedCategories,
}: {
  selectedCategories: readonly EnergyCategoryName[];
}) {
  const selected = new Set(selectedCategories);
  const humanFactorsSelected = selected.has(HUMAN_FACTORS_CATEGORY);

  return (
    <div className="rounded-[14px] border border-card-border bg-card p-4">
      <p className="text-xs font-bold tracking-[0.1em] text-muted-foreground">
        ENERGY WHEEL
      </p>
      <div
        className="relative mx-auto mt-2 aspect-square w-full max-w-[210px]"
        role="img"
        aria-label={`${selected.size} of ${ENERGY_CATEGORY_NAMES.length} energy categories selected`}
      >
        <img src={wheelImage} alt="" className="size-full" aria-hidden="true" />
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          {WHEEL_CATEGORIES.map((category, index) => {
            const isSelected = selected.has(category);
            const startAngle = index * 36 - 18;
            const endAngle = index * 36 + 18;
            return (
              <path
                key={category}
                d={getWheelSectorPath(
                  13.8,
                  isSelected ? 40.3 : 48.2,
                  startAngle,
                  endAngle,
                )}
                fill={isSelected ? "none" : "rgba(245,246,249,0.86)"}
                stroke={isSelected ? "#374B96" : "none"}
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            );
          })}
          <circle
            cx="50"
            cy="50"
            r="13.5"
            fill={humanFactorsSelected ? "none" : "rgba(245,246,249,0.86)"}
            stroke={humanFactorsSelected ? "#374B96" : "none"}
            strokeWidth="1.4"
          />
        </svg>
      </div>
      <p className="mt-2 text-center text-sm font-medium leading-5 text-muted-foreground">
        {selected.size} of {ENERGY_CATEGORY_NAMES.length} selected
        <br />
        Mirrors your selections
      </p>
    </div>
  );
}
