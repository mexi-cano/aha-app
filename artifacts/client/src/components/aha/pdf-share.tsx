import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";

import type { AhaPdfRecord } from "@/data/database";
import { downloadPdf, shareOrDownloadPdf } from "@/pdf";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";

type PdfShareState = "idle" | "opening" | "slow" | "downloaded" | "failed";

export interface PdfShareController {
  state: PdfShareState;
  isBusy: boolean;
  share: () => Promise<void>;
  download: () => void;
}

export function usePdfShare(record: AhaPdfRecord | null): PdfShareController {
  const [state, setState] = useState<PdfShareState>("idle");
  const timerRef = useRef<number | null>(null);
  const operationRef = useRef(0);

  const clearSlowTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    operationRef.current += 1;
    setState("idle");
    return () => {
      operationRef.current += 1;
      clearSlowTimer();
    };
  }, [clearSlowTimer, record?.ahaId, record?.generatedAt]);

  const share = useCallback(async () => {
    if (!record || state === "opening" || state === "slow") return;
    const operation = ++operationRef.current;
    clearSlowTimer();
    setState("opening");
    timerRef.current = window.setTimeout(() => {
      if (operationRef.current === operation) setState("slow");
    }, 1_500);

    const result = await shareOrDownloadPdf(record);
    if (operationRef.current !== operation) return;
    clearSlowTimer();
    if (result.status === "downloaded") {
      setState("downloaded");
    } else if (result.status === "failed") {
      setState("failed");
    } else {
      // Native cancellation is intentionally silent. A resolved share request
      // only means the operating-system sheet was available, not delivery.
      setState("idle");
    }
  }, [clearSlowTimer, record, state]);

  const download = useCallback(() => {
    if (!record) return;
    operationRef.current += 1;
    clearSlowTimer();
    downloadPdf(record);
    setState("downloaded");
  }, [clearSlowTimer, record]);

  return {
    state,
    isBusy: state === "opening" || state === "slow",
    share,
    download,
  };
}

export function PdfShareButton({
  controller,
  disabled,
  responsiveLabel = false,
  className,
}: {
  controller: PdfShareController;
  disabled?: boolean;
  responsiveLabel?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("min-h-12 min-w-12", className)}
      disabled={disabled || controller.isBusy}
      aria-label="Share PDF"
      aria-busy={controller.isBusy}
      onClick={() => void controller.share()}
    >
      <Share2
        className={cn("size-5", responsiveLabel ? "sm:mr-2" : "mr-2")}
        aria-hidden="true"
      />
      <span className={responsiveLabel ? "hidden sm:inline" : undefined}>
        {controller.isBusy ? "Opening…" : "Share PDF"}
      </span>
    </Button>
  );
}

export function PdfShareFeedback({
  controller,
  className,
}: {
  controller: PdfShareController;
  className?: string;
}) {
  if (controller.state === "idle" || controller.state === "opening") {
    return null;
  }

  if (controller.state === "downloaded") {
    return (
      <p
        className={cn(
          "rounded-xl border border-card-border bg-card px-4 py-3 text-center text-sm font-semibold text-muted-foreground",
          className,
        )}
        role="status"
      >
        File sharing is not available here, so the PDF download was started.
      </p>
    );
  }

  return (
    <div
      className={cn(
        controller.state === "failed"
          ? "border-warning/30 bg-warning/10"
          : "border-card-border bg-card",
        "rounded-xl border p-4",
        className,
      )}
      role={controller.state === "failed" ? "alert" : "status"}
    >
      <p
        className={cn(
          "text-sm font-semibold",
          controller.state === "failed"
            ? "text-warning-foreground"
            : "text-muted-foreground",
        )}
      >
        {controller.state === "failed"
          ? "We couldn't open the native share sheet. The completed AHA and PDF remain saved."
          : "The native share sheet is taking longer than expected. If it does not open, download the saved PDF instead."}
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3 min-h-12 w-full"
        onClick={controller.download}
      >
        <Download className="mr-2 size-5" aria-hidden="true" /> Download PDF
      </Button>
    </div>
  );
}
