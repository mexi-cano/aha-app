import { useRef, useState, type ReactNode } from "react";
import {
  WORKER_ACKNOWLEDGMENT,
  type Aha,
  type Job,
} from "@workspace/aha-domain";

import { AhaSummary } from "@/components/aha/aha-summary";
import { ForemanBadge } from "@/components/aha/foreman-badge";
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from "@/components/aha/signature-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatLongDate } from "@/lib/date-format";

interface WorkerNameInput {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  helper: string;
}

interface WorkerReviewAndSignProps {
  aha: Aha;
  job: Job;
  signerName: string;
  isForeman?: boolean;
  nameInput?: WorkerNameInput;
  disabled?: boolean;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  feedback?: ReactNode;
  onInkChange?: (hasInk: boolean) => void;
  onConfirm: (signaturePng: string) => void | Promise<void>;
}

export function WorkerReviewAndSign({
  aha,
  job,
  signerName,
  isForeman = false,
  nameInput,
  disabled = false,
  confirmDisabled = false,
  confirmLabel = "CONFIRM SIGNATURE",
  feedback,
  onInkChange,
  onConfirm,
}: WorkerReviewAndSignProps) {
  const signatureRef = useRef<SignatureCanvasHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const normalizedSignerName = signerName.trim();

  const updateInk = (value: boolean) => {
    setHasInk(value);
    onInkChange?.(value);
  };

  const clear = () => {
    signatureRef.current?.clear();
    updateInk(false);
  };

  const confirm = () => {
    if (disabled || confirmDisabled) return;
    const signaturePng = signatureRef.current?.toPng();
    if (!signaturePng) return;
    void onConfirm(signaturePng);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold sm:text-3xl">
            {normalizedSignerName || "Add worker & sign"}
          </h1>
          {isForeman ? <ForemanBadge /> : null}
          <span className="inline-flex min-h-8 items-center rounded-lg border-[1.5px] border-[#C6CDE8] px-3 text-[13px] font-bold tracking-[0.08em] text-primary">
            READ ONLY
          </span>
        </div>
        <p className="text-[17px] font-medium text-muted-foreground">
          Signing for {formatLongDate(aha.date)}
        </p>
      </header>

      {nameInput ? (
        <label className="flex flex-col gap-2 text-base font-bold">
          <span>
            Worker name{" "}
            <span className="font-medium text-muted-foreground">
              — {nameInput.helper}
            </span>
          </span>
          <Input
            value={nameInput.value}
            required
            className="min-h-14 text-xl font-semibold"
            placeholder="First and last name"
            autoComplete="name"
            disabled={disabled || nameInput.disabled}
            onChange={(event) => nameInput.onChange(event.target.value)}
          />
        </label>
      ) : null}

      <p className="rounded-xl border border-[#C6CDE8] bg-secondary px-5 py-4 text-base font-semibold leading-relaxed text-secondary-foreground">
        Read today's AHA below. Ask the Person in charge about anything unclear
        before signing.
      </p>

      <AhaSummary aha={aha} job={job} mode="signing" showCrew={false} />

      <section
        className="flex flex-col gap-4 rounded-[14px] border border-card-border bg-card px-5 py-5 sm:px-6"
        aria-labelledby="acknowledgment-signature-heading"
      >
        <div>
          <h2
            id="acknowledgment-signature-heading"
            className="text-xl font-bold"
          >
            Acknowledgment and signature
          </h2>
          <p className="mt-1 text-base font-medium text-muted-foreground">
            Review the statement, then sign below.
          </p>
        </div>

        <p className="rounded-xl border border-[#C6CDE8] bg-secondary px-5 py-[18px] text-[17px] font-medium leading-[1.5]">
          {WORKER_ACKNOWLEDGMENT}
        </p>

        <h3 className="text-lg font-bold">
          Sign as {normalizedSignerName || "this worker"}
        </h3>
        <SignatureCanvas
          ref={signatureRef}
          disabled={disabled}
          onInkChange={updateInk}
        />
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-16 px-6 text-[17px] text-primary"
            disabled={!hasInk || disabled}
            onClick={clear}
          >
            Clear
          </Button>
          <Button
            type="button"
            className="min-h-16 flex-1 text-[19px] font-bold tracking-wide"
            disabled={!hasInk || disabled || confirmDisabled}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </div>
        {feedback}
      </section>
    </div>
  );
}
