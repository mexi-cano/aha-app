import * as React from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FieldFeedback {
  message: string;
  tone: "warning";
  announce?: boolean;
}

export interface FieldAssistiveAction extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> {
  label: string;
}

function AssistiveActionButton({
  label,
  className,
  ...props
}: FieldAssistiveAction) {
  return (
    <Button
      {...props}
      type="button"
      variant="outline"
      className={cn(
        "min-h-12 w-full border-[#C6CDE8] bg-card px-4 text-sm font-bold uppercase tracking-[0.04em] text-primary sm:w-auto sm:self-start",
        className,
      )}
    >
      {label}
    </Button>
  );
}

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: string;
  description?: ReactNode;
  descriptionId?: string;
  feedback?: FieldFeedback;
  feedbackId?: string;
  assistiveAction?: FieldAssistiveAction;
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
  feedback,
  feedbackId,
  assistiveAction,
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
      {assistiveAction ? <AssistiveActionButton {...assistiveAction} /> : null}
      {description ? (
        <div
          id={descriptionId}
          className="text-sm font-medium leading-relaxed text-muted-foreground"
        >
          {description}
        </div>
      ) : null}
      {feedback ? (
        <p
          id={feedbackId}
          aria-live={feedback.announce ? "polite" : undefined}
          className="flex items-start gap-2 text-sm font-semibold leading-relaxed text-warning-foreground"
        >
          <span aria-hidden="true">⚠</span>
          <span>{feedback.message}</span>
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  description,
  feedback,
  assistiveAction,
  requirement,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
  description?: ReactNode;
  feedback?: FieldFeedback;
  assistiveAction?: FieldAssistiveAction;
  requirement?: FieldRequirement;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const feedbackId = feedback ? `${id}-feedback` : undefined;
  const ariaDescribedBy =
    [props["aria-describedby"], descriptionId, feedbackId]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      description={description}
      descriptionId={descriptionId}
      feedback={feedback}
      feedbackId={feedbackId}
      assistiveAction={assistiveAction}
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
  feedback,
  assistiveAction,
  requirement,
  className,
  autoGrow = false,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  hint?: string;
  description?: ReactNode;
  feedback?: FieldFeedback;
  assistiveAction?: FieldAssistiveAction;
  requirement?: FieldRequirement;
  autoGrow?: boolean;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const descriptionId = description ? `${id}-description` : undefined;
  const feedbackId = feedback ? `${id}-feedback` : undefined;
  const ariaDescribedBy =
    [props["aria-describedby"], descriptionId, feedbackId]
      .filter(Boolean)
      .join(" ") || undefined;

  React.useLayoutEffect(() => {
    if (!autoGrow || !textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [autoGrow, props.value]);

  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      description={description}
      descriptionId={descriptionId}
      feedback={feedback}
      feedbackId={feedbackId}
      assistiveAction={assistiveAction}
      requirement={requirement}
    >
      <textarea
        ref={textareaRef}
        id={id}
        aria-required={
          props["aria-required"] ??
          (requirement === "required" ? true : undefined)
        }
        className={cn(
          "w-full resize-none rounded-[10px] border-[1.5px] border-input bg-card px-4 py-3 text-base font-medium leading-relaxed outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-secondary",
          autoGrow && "overflow-hidden",
          className,
        )}
        {...props}
        aria-describedby={ariaDescribedBy}
      />
    </FieldFrame>
  );
}
