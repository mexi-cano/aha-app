import * as React from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: string;
  description?: ReactNode;
  descriptionId?: string;
  requirement?: FieldRequirement;
  children: ReactNode;
}

export type FieldRequirement = "required" | "optional";

export function FieldRequirementBadge({
  requirement,
  label,
}: {
  requirement: FieldRequirement;
  label?: string;
}) {
  return (
    <span className="inline-flex min-h-6 shrink-0 items-center rounded-full border border-[#C6CDE8] bg-secondary px-2.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-secondary-foreground">
      {label ?? (requirement === "required" ? "Required" : "Optional")}
    </span>
  );
}

function FieldFrame({
  id,
  label,
  hint,
  description,
  descriptionId,
  requirement,
  children,
}: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold"
      >
        <span>
          {label}
          {hint ? (
            <span className="font-medium text-muted-foreground"> — {hint}</span>
          ) : null}
        </span>
        {requirement ? (
          <FieldRequirementBadge requirement={requirement} />
        ) : null}
      </label>
      {children}
      {description ? (
        <div
          id={descriptionId}
          className="text-sm font-medium leading-relaxed text-muted-foreground"
        >
          {description}
        </div>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  description,
  requirement,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
  description?: ReactNode;
  requirement?: FieldRequirement;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const ariaDescribedBy =
    [props["aria-describedby"], descriptionId].filter(Boolean).join(" ") ||
    undefined;

  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      description={description}
      descriptionId={descriptionId}
      requirement={requirement}
    >
      <input
        id={id}
        aria-required={
          props["aria-required"] ??
          (requirement === "required" ? true : undefined)
        }
        className={cn(
          "min-h-12 w-full rounded-[10px] border-[1.5px] border-input bg-card px-4 py-3 text-base font-medium outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-secondary",
          className,
        )}
        {...props}
        aria-describedby={ariaDescribedBy}
      />
    </FieldFrame>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  description,
  requirement,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  hint?: string;
  description?: ReactNode;
  requirement?: FieldRequirement;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const ariaDescribedBy =
    [props["aria-describedby"], descriptionId].filter(Boolean).join(" ") ||
    undefined;

  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      description={description}
      descriptionId={descriptionId}
      requirement={requirement}
    >
      <textarea
        id={id}
        aria-required={
          props["aria-required"] ??
          (requirement === "required" ? true : undefined)
        }
        className={cn(
          "w-full resize-none rounded-[10px] border-[1.5px] border-input bg-card px-4 py-3 text-base font-medium leading-relaxed outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-secondary",
          className,
        )}
        {...props}
        aria-describedby={ariaDescribedBy}
      />
    </FieldFrame>
  );
}
