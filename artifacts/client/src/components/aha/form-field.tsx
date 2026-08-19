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
  children: ReactNode;
}

function FieldFrame({ id, label, hint, children }: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-base font-bold">
        {label}
        {hint ? (
          <span className="font-medium text-muted-foreground"> — {hint}</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
}) {
  return (
    <FieldFrame id={id} label={label} hint={hint}>
      <input
        id={id}
        className={cn(
          "min-h-12 w-full rounded-[10px] border-[1.5px] border-input bg-card px-4 py-3 text-base font-medium outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-secondary",
          className,
        )}
        {...props}
      />
    </FieldFrame>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  hint?: string;
}) {
  return (
    <FieldFrame id={id} label={label} hint={hint}>
      <textarea
        id={id}
        className={cn(
          "w-full resize-none rounded-[10px] border-[1.5px] border-input bg-card px-4 py-3 text-base font-medium leading-relaxed outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-secondary",
          className,
        )}
        {...props}
      />
    </FieldFrame>
  );
}
